// Official-records probe (read-only).
// Asks Parliament, the Canada Gazette, the orders-in-council registry and the
// Parliamentary Budget Officer what they will hand to GitHub's servers, and in
// what shape. It writes nothing, changes nothing and uses no API credit.
import Parser from "rss-parser";

const UA = "Mozilla/5.0 (compatible; DossierBot/1.0; +https://thedossier.ca)";
const parser = new Parser();

const CHECKS = [
  ["PARLIAMENT — bills (LEGISinfo)", [
    ["page", "https://www.parl.ca/legisinfo/en/bills?parlsession=45-1"],
    ["data", "https://www.parl.ca/legisinfo/en/bills/json?parlsession=45-1"],
    ["data", "https://www.parl.ca/legisinfo/en/bills/xml?parlsession=45-1"],
    ["data", "https://www.parl.ca/legisinfo/en/bills/rss?parlsession=45-1"],
    ["page", "https://www.parl.ca/legisinfo/en/legislation-at-a-glance"],
    ["data", "https://www.parl.ca/legisinfo/en/legislation-at-a-glance/json?parlsession=45-1"],
    ["data", "https://www.parl.ca/legisinfo/en/bill/45-1/c-5/json"],
    ["data", "https://www.parl.ca/legisinfo/fr/projets-de-loi/json?parlsession=45-1"],
    ["data", "https://www.parl.ca/legisinfo/fr/bills/json?parlsession=45-1"],
  ]],
  ["PARLIAMENT — House votes", [
    ["page", "https://www.ourcommons.ca/Members/en/votes"],
    ["data", "https://www.ourcommons.ca/Members/en/votes/xml"],
    ["data", "https://www.ourcommons.ca/Members/en/votes/xml?parlSession=45-1"],
    ["data", "https://www.ourcommons.ca/Members/fr/votes/xml"],
  ]],
  ["CANADA GAZETTE", [
    ["data", "https://www.gazette.gc.ca/rss/p2-eng.xml"],
    ["data", "https://www.gazette.gc.ca/rss/p2-fra.xml"],
    ["data", "https://www.gazette.gc.ca/rss/en-ls-eng.xml"],
    ["page", "https://gazette.gc.ca/rp-pr/p2/2025/index-eng.html"],
    ["page", "https://gazette.gc.ca/rp-pr/p2/2026/2026-10-07/html/index-eng.html"],
  ]],
  ["ORDERS IN COUNCIL", [
    ["page", "https://orders-in-council.canada.ca/index.php?lang=en"],
    ["page", "https://orders-in-council.canada.ca/results.php?lang=en"],
  ]],
  ["PARLIAMENTARY BUDGET OFFICER", [
    ["page", "https://www.pbo-dpb.ca/en/publications"],
    ["data", "https://www.pbo-dpb.ca/en/rss"],
  ]],
];

const cut = (s, n) => (s.length > n ? s.slice(0, n) + "…" : s).replace(/\s+/g, " ");
const dateRange = (t) => {
  const d = (t.match(/(?<!\d)20(2[4-6])-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])(?!\d)/g) || []).sort();
  return d.length ? `${d[0]} → ${d[d.length - 1]} (${d.length} dates seen)` : "no dates found";
};
const topTags = (t) => {
  const f = {};
  for (const m of t.matchAll(/<([A-Za-z][\w:.-]*)[\s>\/]/g)) f[m[1]] = (f[m[1]] || 0) + 1;
  return Object.entries(f).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}×${v}`).join(", ");
};

function describeJson(t) {
  const j = JSON.parse(t);
  if (Array.isArray(j)) {
    return [`JSON list of ${j.length} records`, j[0] ? `first record fields: ${Object.keys(j[0]).join(", ")}` : "", j[0] ? `first record: ${cut(JSON.stringify(j[0]), 700)}` : ""];
  }
  const out = [`JSON object with keys: ${Object.keys(j).slice(0, 20).join(", ")}`];
  for (const [k, v] of Object.entries(j)) {
    if (Array.isArray(v) && v.length) out.push(`  "${k}": list of ${v.length}; first: ${cut(JSON.stringify(v[0]), 500)}`);
  }
  return out;
}

async function describeFeed(t) {
  const f = await parser.parseString(t);
  const items = f.items || [];
  const ds = items.map((i) => (i.isoDate || i.pubDate || "").slice(0, 10)).filter(Boolean).sort();
  return [
    `FEED "${cut(f.title || "", 80)}": ${items.length} items, ${ds[0] || "?"} → ${ds[ds.length - 1] || "?"}`,
    ...items.slice(0, 3).map((i) => `  • ${cut(i.title || "", 110)}  ${i.link || ""}`),
  ];
}

function describePage(t, url) {
  const title = (t.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
  const hrefs = [...t.matchAll(/href="([^"]+)"/gi)].map((m) => m[1].replace(/&amp;/g, "&"));
  const exports = [...new Set(hrefs.filter((h) => /json|xml|rss|csv|export|feed|api/i.test(h)))].slice(0, 15);
  const out = [`PAGE "${cut(title, 90)}" — ${hrefs.length} links`];
  if (exports.length) out.push(`  export/feed links: ${exports.join("  |  ")}`);
  if (/gazette/.test(url)) {
    const issues = [...new Set(hrefs.filter((h) => /\/\d{4}-\d{2}-\d{2}\/html\/index-eng\.html/.test(h)))];
    const regs = [...new Set(hrefs.filter((h) => /sor-dors|si-tr/i.test(h)))];
    out.push(`  issue pages linked: ${issues.length}${issues[0] ? ` (e.g. ${issues[0]})` : ""}`);
    out.push(`  regulation pages linked: ${regs.length}${regs[0] ? ` (e.g. ${regs[0]})` : ""}`);
  }
  if (/orders-in-council/.test(url)) {
    for (const m of t.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
      const attrs = m[1].replace(/\s+/g, " ").trim();
      const fields = [...m[2].matchAll(/<(input|select|textarea)\b[^>]*name="([^"]+)"[^>]*>/gi)].map((x) => x[2]);
      out.push(`  FORM ${attrs} — fields: ${[...new Set(fields)].join(", ")}`);
    }
    const oicLinks = hrefs.filter((h) => /attach|pc=|\.php\?/i.test(h)).slice(0, 6);
    if (oicLinks.length) out.push(`  sample links: ${oicLinks.join("  |  ")}`);
  }
  if (/pbo-dpb/.test(url)) {
    const pubs = [...new Set(hrefs.filter((h) => /\/publications\/[A-Z]/.test(h)))];
    out.push(`  publication links: ${pubs.length}${pubs[0] ? ` (e.g. ${pubs[0]})` : ""}`);
  }
  return out;
}

async function check(kind, url) {
  const lines = [];
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" }, redirect: "follow", signal: AbortSignal.timeout(30000) });
    const t = await res.text();
    const ct = res.headers.get("content-type") || "?";
    lines.push(`HTTP ${res.status} · ${ct} · ${(t.length / 1024).toFixed(0)} KB${res.url !== url ? ` · redirected to ${res.url}` : ""}`);
    if (!res.ok) { lines.push(`  starts with: ${cut(t, 200)}`); return lines; }
    const head = t.trimStart().slice(0, 300);
    if (/json/i.test(ct) || /^[\[{]/.test(head)) lines.push(...describeJson(t));
    else if (/<rss|<feed[\s>]|<rdf:RDF/i.test(t.slice(0, 2000))) lines.push(...(await describeFeed(t)));
    else if (/<html/i.test(t.slice(0, 3000)) || kind === "page") lines.push(...describePage(t, url));
    else lines.push(`XML · most common tags: ${topTags(t)}`, `  starts with: ${cut(t, 400)}`);
    lines.push(`  dates in content: ${dateRange(t)}`);
  } catch (e) {
    lines.push(`FAILED — ${e.name === "TimeoutError" ? "timed out after 30s" : e.message}`);
  }
  return lines;
}

console.log("OFFICIAL RECORDS PROBE — read-only; nothing is written or changed\n");
for (const [group, list] of CHECKS) {
  console.log(`=== ${group} ===`);
  for (const [kind, url] of list) {
    console.log(`\n${url}`);
    for (const l of await check(kind, url)) console.log("  " + l);
  }
  console.log("");
}
console.log("Probe complete.");
