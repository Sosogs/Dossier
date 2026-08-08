// ingest.mjs — DOSSIER ingestion pipeline
// Pulls federal RSS/Atom feeds -> dedupes -> normalizes -> (optional) plain-language
// enrichment via Anthropic -> merges manual custom posts -> writes data.json.
//
// Run:
//   node ingest.mjs                 # pull live feeds; enrich if ANTHROPIC_API_KEY is set
//   node ingest.mjs --no-ai         # pull live feeds; skip AI (keyword categorizer only)
//   node ingest.mjs --test --no-ai  # offline self-test using an embedded sample feed
//
// Requires: Node 20+ (global fetch) and `npm install rss-parser`.

import Parser from "rss-parser";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import crypto from "node:crypto";

/* ----------------------------------------------------------------------------
 * 1. TAXONOMY — read from the shared categories.json file.
 *    To add/remove a category or type: edit categories.json. No code change.
 *    The website reads the same file, so both stay in sync.
 * --------------------------------------------------------------------------*/
const DEFAULT_CATEGORIES = [
  "Foreign affairs", "National defence", "Culture & heritage", "Economy",
  "Intergovernmental affairs", "Healthcare", "Education", "Sustainable development",
  "Infrastructure", "Housing", "Natural resources", "Wildlife", "Animal welfare",
  "Transportation", "Indigenous services", "Justice", "Finance",
  "Innovation, science & industry", "Public safety"
];
const DEFAULT_TYPES = [
  "Bill", "Regulation", "Order in council", "Spending", "Appointment",
  "International agreement", "Commons vote", "Report", "Announcement"
];
function labelOf(x) { return typeof x === "string" ? x : (x && x.en) || ""; }
function loadTaxonomy() {
  try {
    const c = JSON.parse(readFileSync("categories.json", "utf8"));
    const cats = Array.isArray(c.categories) && c.categories.length ? c.categories.map(labelOf).filter(Boolean) : DEFAULT_CATEGORIES;
    const typs = Array.isArray(c.types) && c.types.length ? c.types.map(labelOf).filter(Boolean) : DEFAULT_TYPES;
    return { categories: cats, types: typs };
  } catch {
    return { categories: DEFAULT_CATEGORIES, types: DEFAULT_TYPES };
  }
}
const { categories: CATEGORIES, types: TYPES } = loadTaxonomy();

/* ----------------------------------------------------------------------------
 * 2. SOURCES — each feed declares where it goes in the schema.
 *    kind:'official' -> gets a plain-language summary (we may rewrite it)
 *    kind:'news'     -> stored as headline + SHORT excerpt + link only
 *                       (safe-aggregator posture; never the full article)
 *    Get each department's exact feed URL from its `/news/rss` page. The IRCC
 *    feed below is a verified working example of the api.io.canada.ca pattern;
 *    swap the `dept=` code to point at other departments.
 * --------------------------------------------------------------------------*/
const GC = (dept, lang = "en") =>
  `https://api.io.canada.ca/io-server/gc/news/${lang}/v2?dept=${dept}&sort=publishedDate&orderBy=desc&pick=50&format=atom`;

// All-of-government newsroom (no dept filter) — the whole official record in one
// feed. Also supports publishedDate>=YYYY-MM-DD for the future mandate backfill.
const GC_ALL = (lang = "en") =>
  `https://api.io.canada.ca/io-server/gc/news/${lang}/v2?sort=publishedDate&orderBy=desc&pick=100&format=atom`;

// Google News feed builder — reliable from anywhere; links out to the source.
const GNEWS = (query, lang = "en") =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${lang}-CA&gl=CA&ceid=CA:${lang}`;

// Confirmed-working departments (same dept code for both languages; only the
// /en|fr/ path changes). Each generates an English feed and a French feed.
const DEPTS = [
  { code: "departmentofcitizenshipandimmigration", en: "Immigration, Refugees and Citizenship Canada", fr: "Immigration, Réfugiés et Citoyenneté Canada", type: "Announcement" },
  { code: "publicsafetycanada",       en: "Public Safety Canada",                                 fr: "Sécurité publique Canada",                                 type: "Announcement" },
  { code: "naturalresourcescanada",   en: "Natural Resources Canada",                             fr: "Ressources naturelles Canada",                             type: "Announcement" },
  { code: "departmentofindustry",     en: "Innovation, Science and Economic Development Canada",  fr: "Innovation, Sciences et Développement économique Canada",  type: "Spending" },
  { code: "indigenousservicescanada", en: "Indigenous Services Canada",                           fr: "Services aux Autochtones Canada",                          type: "Announcement" }
];

const FEEDS = [
  // ===== OFFICIAL RECORD — the spine (English + French) =====
  { src: "Government of Canada",   url: GC_ALL("en"), kind: "official", type: "Announcement", lang: "en" },
  { src: "Gouvernement du Canada", url: GC_ALL("fr"), kind: "official", type: "Announcement", lang: "fr" },
  ...DEPTS.flatMap((d) => [
    { src: d.en, url: GC(d.code, "en"), kind: "official", type: d.type, lang: "en" },
    { src: d.fr, url: GC(d.code, "fr"), kind: "official", type: d.type, lang: "fr" }
  ]),

  // Nine mis-coded departments (Finance, Defence, Global Affairs, Health, Justice,
  // Environment, Transport, ESDC, Housing) are still covered by the all-government
  // feed above; add dedicated feeds here once each correct dept code is confirmed.

  // ===== NEWS — thin secondary layer (headline + short excerpt + link) =====
  { src: "Canadian politics (via Google News)",      url: GNEWS("Carney government Canada federal", "en"), kind: "news", type: "Announcement", lang: "en" },
  { src: "Politique canadienne (via Google News)",   url: GNEWS("gouvernement Carney Canada fédéral", "fr"), kind: "news", type: "Announcement", lang: "fr" }
];

/* ----------------------------------------------------------------------------
 * 3. SETTINGS
 * --------------------------------------------------------------------------*/
const OUT_FILE = "data.json";
const CUSTOM_FILE = "custom-posts.json";   // your hand-written entries (see README)
const MAX_ITEMS = 15000;                   // raised for the full mandate archive
const NEWS_EXCERPT_CHARS = 220;            // keep news excerpts short by design
const OFFICIAL_SUMMARY_CHARS = 420;
const MODEL = process.env.MODEL || "claude-haiku-4-5-20251001";  // cheapest tier; set MODEL env to "claude-sonnet-4-6" for higher quality
const NO_AI = process.argv.includes("--no-ai");
const TEST = process.argv.includes("--test");
const USE_AI = !NO_AI && !!process.env.ANTHROPIC_API_KEY;

const parser = new Parser({
  timeout: 20000,
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; DossierBot/1.0; +https://thedossier.ca)",
    "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5"
  }
});

/* ----------------------------------------------------------------------------
 * 4. HELPERS
 * --------------------------------------------------------------------------*/
const hashId = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);
const stripHtml = (s) => (s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const truncate = (s, n) => {
  s = stripHtml(s);
  return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s;
};
const toDate = (item) =>
  (item.isoDate || item.pubDate || new Date().toISOString()).slice(0, 10);

// keyword fallback so categorization works even with AI off
const KEYWORDS = {
  "Healthcare": ["health", "hospital", "doctor", "vaccine", "medic", "patient", "drug"],
  "Housing": ["housing", "rental", "homeless", "mortgage", "tenant", "home build"],
  "Foreign affairs": ["foreign", "diplomat", "embassy", "international", "treaty", "sanction"],
  "National defence": ["defence", "defense", "military", "armed forces", "navy", "nato"],
  "Finance": ["budget", "tax", "fiscal", "deficit", "revenue", "treasury"],
  "Economy": ["economy", "trade", "tariff", "employment", "inflation", "gdp", "business"],
  "Justice": ["justice", "court", "criminal", "judge", "law", "sentencing"],
  "Public safety": ["police", "border", "security", "fraud", "emergency", "crime"],
  "Transportation": ["transit", "airline", "rail", "road", "passenger", "aviation", "transport"],
  "Sustainable development": ["climate", "emission", "carbon", "environment", "green", "pollution"],
  "Natural resources": ["mining", "oil", "gas", "energy", "mineral", "forestry", "pipeline"],
  "Indigenous services": ["indigenous", "first nation", "métis", "metis", "inuit", "reconciliation"],
  "Innovation, science & industry": ["innovation", "science", "research", "ai", "semiconductor", "tech", "patent"],
  "Education": ["student", "school", "university", "tuition", "education", "scholarship"],
  "Infrastructure": ["infrastructure", "bridge", "construction", "broadband", "water system"],
  "Culture & heritage": ["culture", "heritage", "arts", "broadcaster", "museum", "language"],
  "Wildlife": ["wildlife", "species", "habitat", "fisheries", "conservation"],
  "Animal welfare": ["animal", "livestock", "cruelty", "humane"],
  "Intergovernmental affairs": ["provinces", "premier", "first ministers", "federal-provincial"]
};
function guessCategory(text) {
  const t = (text || "").toLowerCase();
  let best = "Economy", score = 0;
  for (const [cat, words] of Object.entries(KEYWORDS)) {
    const n = words.reduce((a, w) => a + (t.includes(w) ? 1 : 0), 0);
    if (n > score) { score = n; best = cat; }
  }
  return best;
}
const matchCategory = (v) =>
  CATEGORIES.find((c) => c.toLowerCase() === String(v || "").toLowerCase()) || null;
const matchType = (v) =>
  TYPES.find((t) => t.toLowerCase() === String(v || "").toLowerCase()) || null;

/* ----------------------------------------------------------------------------
 * 5. PLAIN-LANGUAGE ENRICHMENT (the "desk", server-side)
 *    Same job as the prototype's desk, but here it runs automatically over every
 *    pulled OFFICIAL item, using YOUR key (never exposed to the browser).
 * --------------------------------------------------------------------------*/
async function enrich(rawText, lang = "en") {
  const language = lang === "fr" ? "French" : "English";
  const prompt = `You convert dense Canadian federal government text into a clear, neutral public-facing record entry.
Return ONLY a JSON object, no markdown, with exactly these keys:
"headline": plain-language headline in ${language}, max 12 words, neutral, describing the ACTION (not whether it is good).
"summary": 1-2 plain sentences in ${language} a non-expert understands. Neutral. No opinion, praise, or criticism.
"category": exactly one of these English labels (do not translate): ${CATEGORIES.join(", ")}.
"type": exactly one of these English labels (do not translate): ${TYPES.join(", ")}.

Text:
"""${rawText}"""`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 400, messages: [{ role: "user", content: prompt }] })
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

/* ----------------------------------------------------------------------------
 * 6. NORMALIZE one feed item into the record schema the UI reads
 * --------------------------------------------------------------------------*/
// Common acronyms so a reader searching "IRCC", "RCMP", "CRA" etc. finds the entry.
const SRC_ACRONYMS = {
  "Immigration, Refugees and Citizenship Canada": "IRCC",
  "Department of Finance Canada": "Finance",
  "Department of National Defence": "DND",
  "Global Affairs Canada": "GAC",
  "Health Canada": "HC",
  "Department of Justice Canada": "Justice",
  "Public Safety Canada": "PS",
  "Environment and Climate Change Canada": "ECCC",
  "Natural Resources Canada": "NRCan",
  "Innovation, Science and Economic Development Canada": "ISED",
  "Transport Canada": "TC",
  "Employment and Social Development Canada": "ESDC",
  "Indigenous Services Canada": "ISC",
  "Housing, Infrastructure and Communities Canada": "HICC",
  "Canada Revenue Agency": "CRA",
  "Royal Canadian Mounted Police": "RCMP",
  "Immigration, Réfugiés et Citoyenneté Canada": "IRCC",
  "Sécurité publique Canada": "SP",
  "Ressources naturelles Canada": "RNCan",
  "Innovation, Sciences et Développement économique Canada": "ISDE",
  "Services aux Autochtones Canada": "SAC"
};
function withAcronym(src) {
  const a = SRC_ACRONYMS[src];
  return a && !src.includes(`(${a})`) ? `${src} (${a})` : src;
}

function normalize(item, feed) {
  const link = item.link || item.guid || "";
  const id = hashId(link || feed.src + (item.title || ""));
  const title = stripHtml(item.title || "Untitled");
  const body = item.contentSnippet || item.content || item.summary || "";
  const base = { id, date: toDate(item), src: withAcronym(feed.src), url: link, type: feed.type, kind: feed.kind, lang: feed.lang || "en" };
  if (feed.kind === "news") {
    base.title = title;
    base.excerpt = truncate(body, NEWS_EXCERPT_CHARS);   // short excerpt only
    base.cat = guessCategory(title + " " + base.excerpt);
  } else {
    base.title = title;
    base.sum = truncate(body, OFFICIAL_SUMMARY_CHARS);
    base.cat = guessCategory(title + " " + base.sum);
  }
  return base;
}

/* ----------------------------------------------------------------------------
 * 7. LOAD existing + custom
 * --------------------------------------------------------------------------*/
async function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return fallback; }
}
async function loadCustom() {
  const arr = await readJson(CUSTOM_FILE, []);
  return (Array.isArray(arr) ? arr : []).map((r) => ({
    kind: r.kind || "official",
    type: matchType(r.type) || "Announcement",
    cat: matchCategory(r.cat) || guessCategory(r.title + " " + (r.sum || r.excerpt || "")),
    date: (r.date || new Date().toISOString().slice(0, 10)),
    src: r.src || "Editor",
    url: r.url || "#",
    title: stripHtml(r.title || "Untitled"),
    ...(r.kind === "news" ? { excerpt: truncate(r.excerpt || "", NEWS_EXCERPT_CHARS) } : { sum: r.sum || "" }),
    id: r.id || hashId("custom:" + (r.title || "") + (r.date || ""))
  }));
}

/* ----------------------------------------------------------------------------
 * 8. MAIN
 * --------------------------------------------------------------------------*/
async function pullFresh(seen) {
  const fresh = [];
  const sources = TEST
    ? [{ feed: { src: "Sample department", kind: "official", type: "Announcement" }, xml: SAMPLE_FEED }]
    : FEEDS.filter((f) => f.url && !f.url.startsWith("<")).map((feed) => ({ feed }));

  for (const s of sources) {
    try {
      const parsed = s.xml ? await parser.parseString(s.xml) : await parser.parseURL(s.feed.url);
      const pulled = (parsed.items || []).length;
      let added = 0;
      for (const item of parsed.items || []) {
        const rec = normalize(item, s.feed);
        if (seen.has(rec.id)) continue;
        seen.add(rec.id);
        fresh.push(rec);
        added++;
      }
      console.log(`  ${s.feed.src}: pulled ${pulled}, ${added} new`);
    } catch (e) {
      console.warn(`  ${s.feed.src}: FAILED — ${e.message}`);
    }
  }
  return fresh;
}

async function run() {
  // ---- read-only archive probe: how far back / how much can we pull? ----
  if (process.argv.includes("--probe")) {
    const from = "2025-03-14";
    const probes = [
      { label: "Government of Canada", dept: null },
      { label: "Immigration (IRCC)",   dept: "departmentofcitizenshipandimmigration" }
    ];
    console.log(`ARCHIVE PROBE — asking for everything since ${from} (pick up to 2000, oldest-first)`);
    for (const p of probes) {
      for (const lang of ["en", "fr"]) {
        const url = `https://api.io.canada.ca/io-server/gc/news/${lang}/v2?${p.dept ? `dept=${p.dept}&` : ""}publishedDate>=${from}&sort=publishedDate&orderBy=asc&pick=2000&format=atom`;
        try {
          const parsed = await parser.parseURL(url);
          const items = parsed.items || [];
          const dates = items.map((i) => (i.isoDate || i.pubDate || "").slice(0, 10)).filter(Boolean).sort();
          console.log(`  ${p.label} (${lang}): pulled ${items.length}  |  oldest ${dates[0] || "?"}  newest ${dates[dates.length - 1] || "?"}`);
        } catch (e) {
          console.log(`  ${p.label} (${lang}): FAILED — ${e.message}`);
        }
      }
    }
    console.log("Probe complete. Nothing was written or changed.");
    return;
  }

  // ---- mandate backfill: pull the full official record since a start date ----
  if (process.argv.includes("--backfill")) {
    const from = process.env.BACKFILL_FROM || "2025-03-14";
    console.log(`MANDATE BACKFILL since ${from} (no AI on the pull; plain-language summaries fill in on later refreshes)`);
    const existing = await readJson(OUT_FILE, { items: [] });
    const seen = new Set((existing.items || []).map((i) => i.id));
    const fresh = [];
    const ARCH = (dept, lang, cursor) =>
      `https://api.io.canada.ca/io-server/gc/news/${lang}/v2?${dept ? `dept=${dept}&` : ""}publishedDate>=${cursor}&sort=publishedDate&orderBy=asc&pick=2000&format=atom`;

    async function pullArchive(feed) {
      let cursor = from, total = 0, guard = 0;
      while (guard++ < 12) {
        let parsed;
        try { parsed = await parser.parseURL(ARCH(feed.dept, feed.lang, cursor)); }
        catch (e) { console.log(`  ${feed.src} (${feed.lang}): FAILED at ${cursor} — ${e.message}`); break; }
        const items = parsed.items || [];
        let newest = cursor;
        for (const item of items) {
          const d = (item.isoDate || item.pubDate || "").slice(0, 10);
          if (d > newest) newest = d;
          const rec = normalize(item, feed);
          if (seen.has(rec.id)) continue;
          seen.add(rec.id); fresh.push(rec); total++;
        }
        if (items.length < 2000 || newest <= cursor) break;   // reached the end / no progress
        cursor = newest;
      }
      console.log(`  ${feed.src} (${feed.lang}): ${total} archived`);
    }

    for (const lang of ["en", "fr"]) {
      await pullArchive({ dept: null, src: lang === "en" ? "Government of Canada" : "Gouvernement du Canada", kind: "official", type: "Announcement", lang });
      for (const d of DEPTS) await pullArchive({ dept: d.code, src: d[lang], kind: "official", type: d.type, lang });
    }

    const merged = []; const ids = new Set();
    for (const r of [...fresh, ...(existing.items || [])]) { if (ids.has(r.id)) continue; ids.add(r.id); merged.push(r); }
    merged.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const items = merged.slice(0, MAX_ITEMS);
    for (const it of items) { it.src = withAcronym(it.src); if (!it.lang) it.lang = "en"; }
    await writeFile(OUT_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), count: items.length, categories: CATEGORIES, types: TYPES, items }, null, 2));
    console.log(`Wrote ${OUT_FILE} — ${items.length} items total, ${fresh.length} archived this run.`);
    return;
  }

  console.log(`DOSSIER ingest  (AI: ${USE_AI ? "on" : "off"}${TEST ? ", test mode" : ""})`);
  const existing = await readJson(OUT_FILE, { items: [] });
  const seen = new Set((existing.items || []).map((i) => i.id));

  const fresh = await pullFresh(seen);

  const AI_MAX = 90;                    // cap AI calls per run (cost/time guard)
  let aiCount = 0;
  if (USE_AI) {
    // 1) enrich this run's new official items
    for (const rec of fresh) {
      if (rec.kind !== "official" || rec.ai) continue;   // never rewrite news; keep excerpt + link
      if (aiCount >= AI_MAX) break;
      try {
        const e = await enrich(`${rec.title}\n\n${rec.sum || ""}`, rec.lang);
        rec.title = e.headline || rec.title;
        rec.sum = e.summary || rec.sum;
        rec.cat = matchCategory(e.category) || rec.cat;
        rec.type = matchType(e.type) || rec.type;
        rec.ai = true;
        aiCount++;
      } catch (err) {
        console.warn(`  enrich failed (${rec.id}): ${err.message}`);
      }
    }
    // 2) self-healing backfill: give older official entries still missing a
    //    proper AI summary one now (no data loss), up to the per-run cap.
    let healed = 0;
    for (const rec of (existing.items || [])) {
      if (aiCount >= AI_MAX) break;
      if (rec.kind !== "official" || rec.ai) continue;
      try {
        const e = await enrich(`${rec.title}\n\n${rec.sum || ""}`, rec.lang);
        rec.title = e.headline || rec.title;
        rec.sum = e.summary || rec.sum;
        rec.cat = matchCategory(e.category) || rec.cat;
        rec.type = matchType(e.type) || rec.type;
        rec.ai = true;
        aiCount++; healed++;
      } catch (err) {
        console.warn(`  backfill failed (${rec.id}): ${err.message}`);
      }
    }
    if (healed) console.log(`  backfilled ${healed} older official entr${healed === 1 ? "y" : "ies"}`);
  }

  const custom = await loadCustom();
  const merged = [];
  const ids = new Set();
  for (const r of [...custom, ...fresh, ...(existing.items || [])]) {
    if (ids.has(r.id)) continue;
    ids.add(r.id);
    merged.push(r);
  }
  merged.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const items = merged.slice(0, MAX_ITEMS);
  for (const it of items) { it.src = withAcronym(it.src); if (!it.lang) it.lang = "en"; }   // backfill acronyms + language onto older entries

  const out = {
    generatedAt: new Date().toISOString(),
    count: items.length,
    categories: CATEGORIES,
    types: TYPES,
    items
  };
  await writeFile(OUT_FILE, JSON.stringify(out, null, 2));
  console.log(`Wrote ${OUT_FILE} — ${items.length} items total, ${fresh.length} new this run.`);
}

/* Embedded sample feed for offline --test runs */
const SAMPLE_FEED = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Sample department</title>
  <entry>
    <title>Government introduces legislation to expand rental housing financing</title>
    <link href="https://www.canada.ca/en/news/sample-1.html"/>
    <updated>2026-06-23T14:00:00Z</updated>
    <summary>The Minister tabled a bill that would establish a federal fund to finance the construction of new rental housing, prioritizing units near public transit.</summary>
  </entry>
  <entry>
    <title>New regulations on greenhouse-gas reporting published</title>
    <link href="https://gazette.gc.ca/sample-2.html"/>
    <updated>2026-06-22T09:30:00Z</updated>
    <summary>Regulations require large industrial facilities to report emissions on a stricter schedule beginning in 2027.</summary>
  </entry>
</feed>`;

run();
