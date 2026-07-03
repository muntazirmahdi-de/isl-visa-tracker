# ISL Visa Tracker — Deployment Guide

This folder is a ready-to-deploy Vercel project:
- `index.html` — the dashboard (static page, served as-is)
- `api/months.js` — serverless function, proxies the ISL months endpoint
- `api/proxy.js` — serverless function, proxies the ISL applicant data endpoint

Both API functions run server-side on Vercel's infrastructure, so there's no
CORS issue and no need to keep a local `proxy_server.py` running.

## Option A — Deploy via the Vercel website (no command line)

1. Go to https://vercel.com and sign up (free) — you can sign in with GitHub,
   GitLab, or email.
2. Put this whole folder into a GitHub repository:
   - Create a new repo on GitHub (e.g. `isl-visa-tracker`)
   - Upload these files: `index.html`, `package.json`, and the `api` folder
     with `months.js` and `proxy.js` inside it
3. In Vercel, click **Add New → Project**, select that GitHub repo, and click
   **Deploy**. No configuration needed — Vercel auto-detects the `api/`
   folder as serverless functions and serves `index.html` as the homepage.
4. After ~30 seconds you'll get a live URL like
   `https://isl-visa-tracker.vercel.app` — that's your public website.

## Option B — Deploy via the Vercel CLI (faster, no GitHub needed)

1. Install Node.js if you don't have it: https://nodejs.org (LTS version)
2. Open a terminal in this folder and run:
   ```
   npm install -g vercel
   vercel login
   vercel
   ```
3. Answer the prompts (accept defaults is fine). It'll give you a live URL
   immediately.
4. For future updates, just run `vercel --prod` again from this folder after
   making changes.

## Testing locally before deploying (optional)

```
npm install -g vercel
vercel dev
```
This runs the exact same setup locally at `http://localhost:3000`, including
the serverless functions — useful to confirm everything works before you
deploy.

## Notes

- Free Vercel projects have generous limits for this kind of low-traffic
  tool — you won't hit any paywall for personal/community use.
- If you ever change your own domain or want a custom domain
  (e.g. `isltracker.com`), Vercel lets you attach one for free (you'd just
  need to buy the domain itself from a registrar).
- The `api/proxy.js` and `api/months.js` files always fetch fresh from
  `isl-waiting-list.waleedashraf9t.com` on every request — there's no
  caching, so the data is always live.
