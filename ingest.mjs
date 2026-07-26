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
function loadTaxonomy() {
  try {
    const c = JSON.parse(readFileSync("categories.json", "utf8"));
    return {
      categories: Array.isArray(c.categories) && c.categories.length ? c.categories : DEFAULT_CATEGORIES,
      types: Array.isArray(c.types) && c.types.length ? c.types : DEFAULT_TYPES
    };
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
const GC = (dept) =>
  `https://api.io.canada.ca/io-server/gc/news/en/v2?dept=${dept}&sort=publishedDate&orderBy=desc&pick=50&format=atom`;

// All-of-government newsroom (no dept filter) — our best shot at the whole
// official record in one feed. Also supports publishedDate>=YYYY-MM-DD for the
// future mandate backfill.
const GC_ALL =
  "https://api.io.canada.ca/io-server/gc/news/en/v2?sort=publishedDate&orderBy=desc&pick=100&format=atom";

const FEEDS = [
  // ===== OFFICIAL RECORD — the spine =====
  { src: "Government of Canada", url: GC_ALL, kind: "official", type: "Announcement" },

  // Named departments (proper attribution + acronym). The first live run's log
  // shows which dept codes actually return data; we keep the winners.
  { src: "Immigration, Refugees and Citizenship Canada", url: GC("departmentofcitizenshipandimmigration"), kind: "official", type: "Announcement" },
  { src: "Department of Finance Canada",                  url: GC("departmentoffinancecanada"),             kind: "official", type: "Spending" },
  { src: "Department of National Defence",                url: GC("departmentofnationaldefence"),           kind: "official", type: "Announcement" },
  { src: "Global Affairs Canada",                         url: GC("foreignaffairstradeanddevelopmentcanada"), kind: "official", type: "International agreement" },
  { src: "Health Canada",                                 url: GC("healthcanada"),                          kind: "official", type: "Announcement" },
  { src: "Department of Justice Canada",                  url: GC("departmentofjustice"),                   kind: "official", type: "Announcement" },
  { src: "Public Safety Canada",                          url: GC("publicsafetycanada"),                    kind: "official", type: "Announcement" },
  { src: "Environment and Climate Change Canada",         url: GC("environmentandclimatechangecanada"),     kind: "official", type: "Regulation" },
  { src: "Natural Resources Canada",                      url: GC("naturalresourcescanada"),                kind: "official", type: "Announcement" },
  { src: "Innovation, Science and Economic Development Canada", url: GC("departmentofindustry"),            kind: "official", type: "Spending" },
  { src: "Transport Canada",                              url: GC("transportcanada"),                       kind: "official", type: "Regulation" },
  { src: "Employment and Social Development Canada",       url: GC("employmentandsocialdevelopmentcanada"),  kind: "official", type: "Announcement" },
  { src: "Indigenous Services Canada",                    url: GC("indigenousservicescanada"),              kind: "official", type: "Announcement" },
  { src: "Housing, Infrastructure and Communities Canada", url: GC("infrastructurecanada"),                 kind: "official", type: "Spending" },

  // ===== NEWS — thin secondary layer (headline + short excerpt + link) =====
  { src: "CBC Politics", url: "https://rss.cbc.ca/lineup/politics.xml", kind: "news", type: "Announcement" },
];

/* ----------------------------------------------------------------------------
 * 3. SETTINGS
 * --------------------------------------------------------------------------*/
const OUT_FILE = "data.json";
const CUSTOM_FILE = "custom-posts.json";   // your hand-written entries (see README)
const MAX_ITEMS = 2000;                    // cap stored records (paging comes with the full archive)
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
async function enrich(rawText) {
  const prompt = `You convert dense Canadian federal government text into a clear, neutral public-facing record entry.
Return ONLY a JSON object, no markdown, with exactly these keys:
"headline": plain-language headline, max 12 words, neutral, describing the ACTION (not whether it is good).
"summary": 1-2 plain sentences a non-expert understands. Neutral. No opinion, praise, or criticism.
"category": exactly one of: ${CATEGORIES.join(", ")}.
"type": exactly one of: ${TYPES.join(", ")}.

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
  "Royal Canadian Mounted Police": "RCMP"
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
  const base = { id, date: toDate(item), src: withAcronym(feed.src), url: link, type: feed.type, kind: feed.kind };
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
        const e = await enrich(`${rec.title}\n\n${rec.sum || ""}`);
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
        const e = await enrich(`${rec.title}\n\n${rec.sum || ""}`);
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
  for (const it of items) it.src = withAcronym(it.src);   // backfill acronyms onto older entries

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
