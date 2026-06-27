# Start here — launching your site (no coding)

## The three pieces, in plain words

Think of it like opening a shop:

1. **GitHub repo** = a folder in the cloud that holds your files. (Like the back room
   where your stock lives.)
2. **The host** (Cloudflare Pages, Netlify, or Vercel) = the company that takes those
   files and *shows them to the public as a website*. (Like the storefront and the
   person who keeps the window display current.)
3. **The domain** = the address people type to find you, e.g. `yoursite.ca`.
   (The street address on the door.)

"Pointing your domain at it" just means telling the address (#3) to lead to the
storefront (#2). That's it.

You don't need to type any code. Everything below is done by clicking in a web browser.

---

## What I can and can't do

I write and update the **files** for you (the ones in this folder). I can't log into
your accounts, buy a domain, or click the buttons on these websites for you — those are
yours. So the rhythm is: I hand you files → you upload them → the site updates.

If you'd like me to make changes *directly to your folder later*, that's what **Claude
Code** is for — it's a separate Anthropic app you'd connect to your GitHub repo once,
after which I can edit files in it. Not required to launch; a convenience for later.

---

## Step 1 — Get a domain (15 min)

Buy your address from a **registrar**. Easiest for this setup: **Cloudflare** (cloudflare.com
→ "Register a domain"), because you'll also host there, so steps 1–4 stay in one place.
Other fine options: Namecheap, Porkbun. Pick a name, pay (usually ~CA$10–20/year), done.

## Step 2 — Put the files on GitHub (20 min)

1. Make a free account at **github.com**.
2. Click **New repository** → give it a name (e.g. `dossier`) → **Create**.
3. On the repo page click **Add file → Upload files**, then drag in *all* the files from
   this folder (including the `.github` folder). Click **Commit changes**.

That's your "back room" stocked. No commands, just drag-and-drop.

## Step 3 — Connect the host (10 min)

1. Go to **Cloudflare** → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Pick your `dossier` repo. Leave the build settings empty/default (this is a plain
   site). Click **Save and Deploy**.
3. In under a minute you get a live link like `dossier.pages.dev`. Your site is live.

(Netlify and Vercel work the same way: "Add new site → Import from GitHub.")

## Step 4 — Point your domain (10 min)

In the host's dashboard, open your new site → **Custom domains** → **Set up a domain** →
type `yoursite.ca`. The host shows you exactly what to do; if you bought the domain at
**Cloudflare too, it's basically one click**. If you bought it elsewhere, the host gives
you a couple of values to paste into the registrar's settings. Give it up to an hour to
take effect.

**You're launched.**

---

## How updates work (your "do I take the site down?" question)

No — you never take it down. When you (or I) change a file and upload it to GitHub, the
host *automatically rebuilds and swaps in the new version*. Visitors see no interruption,
and you can undo any change with one click ("rollback") in the host's dashboard.
"The host builds it" simply means the host notices the new files and refreshes the
storefront for you.

---

## Editing categories & filters

Open **`categories.json`** and edit the list of names. Add one, remove one, rename one —
just keep the quotes and commas (and no comma after the last item). Upload the changed
file to GitHub. The website and the data pipeline both read this one file, so they stay
in sync and colors are assigned automatically. No code touched.

---

## Adding news sources

Sources live in the **`FEEDS`** list near the top of **`ingest.mjs`**. To add one, copy
an existing line and change the address. Two easy ways to get sources:

- **Direct feed:** many outlets publish one. CBC's politics feed is already included
  (`https://rss.cbc.ca/lineup/politics.xml`).
- **Google News (works for almost anything):** use the `GNEWS("...")` helper. Put any
  outlet or topic in the quotes:
  - `GNEWS("allinurl:reuters.com Canada government")` → Reuters coverage
  - `GNEWS("allinurl:apnews.com Canada")` → Associated Press
  - `GNEWS("Carney government Canada")` → everything, by topic

  (Reuters and AP stopped offering their own feeds, so Google News is the reliable route.)

A couple of fairness notes so you stay on the right side of each outlet's rules:
the site only ever stores a **headline + short excerpt + link** for news (never the full
article), and some outlets restrict reuse — **La Presse**, in particular, allows its RSS
for personal use only and excludes political/commercial use, so it's left switched off
with a note until you decide. When in doubt, linking out is always safe.

---

## The one genuinely technical part (and how to keep it easy)

Showing the feed is simple. The part that needs a little setup is the **automatic
refresh** — the scheduled job that goes and fetches new items. It needs an Anthropic
**API key** (a paid key, separate from your Claude subscription) stored as a secret in
GitHub, as described in `README.md`. If that feels like too much at first, you have easy
options: run it yourself with one click from GitHub's **Actions** tab whenever you want
fresh data, or start with `--no-ai` (no key needed) and add the plain-language rewriting
later. We can do this part together step by step.
