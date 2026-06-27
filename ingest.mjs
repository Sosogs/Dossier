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
  `https://api.io.canada.ca/io-server/gc/news/en/v2?dept=${dept}&sort=publishedDate&orderBy=desc&pick=25&format=atom`;

// Google News feed builder — pull ANY outlet or topic, free, links out to the source.
//   GNEWS("allinurl:reuters.com Canada government")  -> Reuters coverage via Google
//   GNEWS("Carney government Canada")                -> all outlets, by topic
const GNEWS = (query) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-CA&gl=CA&ceid=CA:en`;

const FEEDS = [
  // ---- Official government sources (rewritten into a plain-language summary) ----
  { src: "Immigration, Refugees and Citizenship Canada",
    url: GC("departmentofcitizenshipandimmigration"), kind: "official", type: "Announcement" },

  // ---- News sources (kept as headline + SHORT excerpt + link) ----
  { src: "CBC Politics", url: "https://rss.cbc.ca/lineup/politics.xml", kind: "news", type: "Announcement" },
  { src: "CBC Canada",   url: "https://rss.cbc.ca/lineup/canada.xml",   kind: "news", type: "Announcement" },
  { src: "Reuters (via Google News)", url: GNEWS("allinurl:reuters.com Canada government OR Carney"), kind: "news", type: "Announcement" },

  // ---- Add more by removing the // in front of a line ----
  // { src: "Associated Press (via Google News)", url: GNEWS("allinurl:apnews.com Canada"),          kind:"news", type:"Announcement" },
  // { src: "Topic: Carney government (all outlets)", url: GNEWS("Carney government Canada"),         kind:"news", type:"Announcement" },
  // { src: "Radio-Canada — Politique", url: "https://ici.radio-canada.ca/rss/4159",                 kind:"news", type:"Announcement" }, // confirm current URL

  // La Presse: their RSS terms allow PERSONAL use only and exclude commercial/
  // political/promotional use. Check it's acceptable for your project before
  // enabling. Pattern: https://www.lapresse.ca/[section]/rss
  // { src: "La Presse — Actualités", url: "https://www.lapresse.ca/actualites/rss",                 kind:"news", type:"Announcement" },

  // More official feeds — grab each exact URL from its /news/rss page:
  // { src: "Prime Minister of Canada",  url: "<from https://www.pm.gc.ca/en/connect/rss>",          kind:"official", type:"Announcement" },
  // { src: "Global Affairs Canada",     url: "<from international.canada.ca/.../news/rss>",          kind:"official", type:"Announcement" },
  // { src: "Department of Finance",     url: GC("departmentoffinancecanada"),                       kind:"official", type:"Spending" },
  // { src: "Canada Gazette, Part II",   url: "<from https://gazette.gc.ca/rss/sc-rb-eng.html>",     kind:"official", type:"Regulation" },
];

/* ----------------------------------------------------------------------------
 * 3. SETTINGS
 * --------------------------------------------------------------------------*/
const OUT_FILE = "data.json";
const CUSTOM_FILE = "custom-posts.json";   // your hand-written entries (see README)
const MAX_ITEMS = 500;                     // cap stored records
const NEWS_EXCERPT_CHARS = 220;            // keep news excerpts short by design
const OFFICIAL_SUMMARY_CHARS = 420;
const MODEL = process.env.MODEL || "claude-haiku-4-5-20251001";  // cheapest tier; set MODEL env to "claude-sonnet-4-6" for higher quality
const NO_AI = process.argv.includes("--no-ai");
const TEST = process.argv.includes("--test");
const USE_AI = !NO_AI && !!process.env.ANTHROPIC_API_KEY;

const parser = new Parser({ timeout: 15000 });

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
function normalize(item, feed) {
  const link = item.link || item.guid || "";
  const id = hashId(link || feed.src + (item.title || ""));
  const title = stripHtml(item.title || "Untitled");
  const body = item.contentSnippet || item.content || item.summary || "";
  const base = { id, date: toDate(item), src: feed.src, url: link, type: feed.type, kind: feed.kind };
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
      let added = 0;
      for (const item of parsed.items || []) {
        const rec = normalize(item, s.feed);
        if (seen.has(rec.id)) continue;
        seen.add(rec.id);
        fresh.push(rec);
        added++;
      }
      console.log(`  ${s.feed.src}: ${added} new`);
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

  if (USE_AI) {
    for (const rec of fresh) {
      if (rec.kind !== "official") continue;           // never rewrite news; keep excerpt + link
      try {
        const e = await enrich(`${rec.title}\n\n${rec.sum || ""}`);
        rec.title = e.headline || rec.title;
        rec.sum = e.summary || rec.sum;
        rec.cat = matchCategory(e.category) || rec.cat;
        rec.type = matchType(e.type) || rec.type;
      } catch (err) {
        console.warn(`  enrich failed (${rec.id}): ${err.message}`);
      }
    }
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
