# DOSSIER — deploy kit

A non-partisan tracker of federal government **actions**. This kit is the back-end
half: a scheduled job that pulls feeds, dedupes, normalizes, optionally rewrites
official items into plain language, merges your hand-written posts, and writes
`data.json` — which the front-end reads.

```
  feeds (RSS/Atom) ──┐
  custom-posts.json ─┼─►  ingest.mjs  ─►  data.json  ─►  index.html (static site)
  Anthropic API ─────┘   (cron job)        (the feed)      (your domain)
```

Nothing here depends on Base44. You own every file.

---

## 1. Run it locally

```bash
npm install
npm run test:offline      # offline self-test, no network, no key — proves it works
node ingest.mjs --no-ai   # pull REAL feeds, skip AI (keyword categorizer only)
ANTHROPIC_API_KEY=sk-... node ingest.mjs   # pull + plain-language enrichment
```

Open `FEEDS` in `ingest.mjs` and add sources. The IRCC feed included is a verified
working example; grab other departments' exact feed URLs from their `/news/rss`
pages and swap the `dept=` code (or paste any standard RSS/Atom URL).

---

## 2. Launch on a domain (recommended: static host + Git)

1. Put this folder (plus your `index.html` front-end) in a **GitHub repo**.
2. Connect the repo to **Cloudflare Pages**, **Netlify**, or **Vercel** (all have a
   free tier). Point your custom domain at it in their dashboard.
3. No build step is needed for a plain static site — it just serves `index.html`
   and `data.json`.

That's the launch. The site is now live at your domain.

---

## 3. Keep it refreshing automatically

`ingest.mjs` is run on a schedule by **GitHub Actions** — see
`.github/workflows/ingest.yml` (every 6 hours by default; change the `cron` line).
It regenerates `data.json` and commits it; your host redeploys automatically.

Add your key once: repo → **Settings → Secrets and variables → Actions → New secret**,
name it `ANTHROPIC_API_KEY`. The key lives only on the server — it is **never** sent
to the browser.

---

## 4. Editing the code once it's live (your question 2)

You do **not** take the site down. The loop is:

1. Edit a file (here, or ask me for an updated version).
2. Commit & push to GitHub.
3. The host builds the new version and **atomically swaps** it in — visitors never
   see downtime, and you can roll back to any previous deploy in one click.

So adding functionality = push a change. I don't have standing access to your live
site; each time, you give me the current file (or we work from our shared baseline),
I return the edited file, you push. If you want me editing the repo directly, connect
it to **Claude Code** and I can make changes against the repo itself.

---

## 5. Editing categories & filters (your question 3)

Categories live in **one list** in `ingest.mjs` (`CATEGORIES`) and a matching list in
the front-end. To add/remove one: edit the array, push. New entries flow through the
categorizer automatically.

Cleaner option for frequent edits: move the list into a shared `categories.json` that
both the pipeline and the front-end read, so changing categories never touches code —
say the word and I'll wire that up.

---

## 6. The plain-language desk — automatic *and* manual (your question 4)

It plays **two roles** in production:

- **Automatic translator.** Inside `ingest.mjs`, every pulled *official* item is run
  through `enrich()` — the same step you saw in the prototype — turning dense source
  text into a plain-language headline + summary and assigning a category/type. This
  runs server-side on every refresh. (News items are *not* rewritten: they keep a
  short excerpt + link, for copyright safety.)

- **Manual custom posts.** For moves you want to log yourself — or your own write-up
  of something complex — add an entry to `custom-posts.json`:

  ```json
  {
    "title": "Your plain-language headline",
    "sum": "One or two clear sentences.",
    "cat": "Housing",
    "type": "Announcement",
    "src": "Editor",
    "url": "https://link-to-source",
    "date": "2026-06-24",
    "kind": "official"
  }
  ```

  Push it and it appears in the feed. (Leave out `cat`/`type` and the pipeline will
  guess them.)

> The interactive desk you clicked in the prototype only works *inside Claude's
> artifact viewer* — that convenience endpoint isn't available on your own domain.
> On your site the same capability lives in two places: automatically in the pipeline
> above, and optionally as a small password-protected "compose" page if you ever want
> a point-and-click way to write custom posts. I can build that admin page when you're
> ready.

---

## 7. Wire the front-end to this data

In the prototype's `<script>`, replace the hard-coded sample with a fetch:

```js
let MOVES = [];
async function boot() {
  try {
    const res = await fetch("data.json", { cache: "no-store" });
    const data = await res.json();
    MOVES = data.items || [];
  } catch (e) {
    console.warn("Could not load data.json", e);
  }
  buildChips(); buildTypes(); render();
}
boot();
```

Drop `data.json` next to `index.html` and the feed renders live. I'll fold this into
the front-end when you send your category/filter edits.

---

## When to graduate from a JSON file

`data.json` is perfect up to a few thousand records. When you want user accounts,
comments, full-text search at scale, or a public API, move `items` into a database
(**Supabase** is the easy next step — Postgres + auto-generated API + auth, free tier).
The record schema stays identical, so it's a swap, not a rewrite.
