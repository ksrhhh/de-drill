# Debate Drill — standalone site

Your burden/mechanism trainer, flashcards, progress tracking, and de-brief reader,
as a real website you can use on your Mac and phone (and add to your home screen).

The 621-argument library is built in — no import step. Progress saves in your browser.
AI grading runs through a tiny secure backend so your API key is never exposed.

---

## What's in here

- `src/` — the app (React)
- `src/library.js` — the full 621-argument library, bundled in
- `api/grade.js` — the serverless function that safely holds your Anthropic API key
- `package.json`, `vite.config.js`, `vercel.json` — build config

---

## Deploy it to Vercel (about 10 minutes, no terminal needed)

### Step 1 — Put this folder on GitHub
1. Go to https://github.com/new and create a new repo (e.g. `debate-drill`). Keep it
   private if you like — Vercel can still deploy it.
2. On the new repo's page, click **uploading an existing file**.
3. Drag in EVERYTHING in this folder EXCEPT the `node_modules` and `dist` folders
   (you only need: `src/`, `api/`, `public/`, `index.html`, `package.json`,
   `vite.config.js`, `vercel.json`, `.gitignore`, `README.md`).
4. Commit.

### Step 2 — Connect Vercel
1. Go to https://vercel.com and sign up with your GitHub account (free).
2. Click **Add New… → Project**.
3. Find your `debate-drill` repo and click **Import**.
4. Vercel auto-detects Vite. Don't change the build settings.
5. **Before clicking Deploy**, open **Environment Variables** and add:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** your Anthropic API key (starts with `sk-ant-…`)
   - Get one at https://console.anthropic.com → API Keys.
6. Click **Deploy**. Wait ~1 minute.

### Step 3 — Use it
- Vercel gives you a URL like `debate-drill-xxxx.vercel.app`. That's your live site.
- On iPhone: open the URL in Safari → Share → **Add to Home Screen**. It now behaves
  like an app.
- On Mac: bookmark it, or in Chrome use **… → Cast, Save, Share → Install page as app**.

---

## Notes

- **Your API key is safe.** It lives only as a Vercel environment variable and is used
  only by `api/grade.js` on Vercel's servers. It is never sent to the browser.
- **AI grading costs money** per use, billed to your Anthropic account. Grading a single
  drill answer is a small Sonnet call (well under a cent typically, but it adds up with use).
- **Progress is per-browser.** Your drill history/flashcards live in that browser's
  localStorage. Using a different device starts fresh (multi-device sync would need accounts —
  a future step).
- **The de-brief tab** reads your public `ksrhhh/de-brief` repo's `briefings/` folder live.
  On this hosted site (unlike inside Claude) the full browsable archive works.

---

## Run it locally first (optional, needs Node.js)

```
npm install
npm run dev
```

Then open the printed `localhost` URL. Note: AI grading won't work in plain `npm run dev`
because there's no serverless function locally — use `vercel dev` (install the Vercel CLI)
if you want to test grading before deploying. Everything else works locally.
