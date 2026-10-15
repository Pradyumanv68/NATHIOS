# Free SEO Audit — setup

The audit page (`seo-audit.html`) needs a small Node server, because a browser can't crawl other websites by itself.
The server crawls up to 100 pages, runs a Google mobile-speed test, scores seven areas and returns the report.

## Run it (2 commands)
```bash
cd server
npm install
node server.js          # → http://localhost:3000  (serves the whole site + the audit API)
```
Open http://localhost:3000/seo-audit.html. Needs Node 18+.

## Put it live
**Option A — one server (simplest).** Deploy this whole folder to any Node host (Render, Railway, Fly, a VPS) with
start command `node server/server.js`. The site and the audit run from the same address. Set `TRUST_PROXY=1` behind a proxy.

**Option B — site stays on static hosting (Netlify etc).** Deploy only the `server/` folder as the API with `SERVE_STATIC=0`,
set `ALLOWED_ORIGINS=https://yourdomain.com`, then in `seo-audit.html` change
`window.NATHIOS_AUDIT_API = ''` to the API address, e.g. `'https://audit.yourdomain.com'`.

## Settings (environment variables)
| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 3000 | Port to listen on |
| `PSI_API_KEY` | – | Free Google PageSpeed API key. Strongly recommended: without it Google rate-limits the speed test |
| `MAX_PAGES` | 100 | Pages crawled per audit |
| `MAX_JOBS` | 3 | Audits running at once (protects your server) |
| `IP_LIMIT` | 6 | Audits per visitor per hour |
| `ALLOWED_ORIGINS` | * | Which sites may call the API (Option B) |
| `TRUST_PROXY` | – | Set to 1 behind a proxy so visitor IPs are read correctly |
| `SERVE_STATIC` | 1 | Set to 0 for API-only |

Your key is already in `server/.env` (loaded automatically; never served to browsers). On a host like Render, set `PSI_API_KEY` in its Environment settings instead of uploading `.env`.

Get a PageSpeed key: Google Cloud Console → enable "PageSpeed Insights API" → create an API key.

## What it checks
Technical health · On-page SEO · Content · Schema · Mobile speed (Google Lighthouse) · AI search readiness · Images.
If Google's speed service is unavailable, the report says so and estimates speed from page weight.

## Safety built in
Private/internal addresses (localhost, 10.x, 192.168.x, cloud metadata) are blocked, including after redirects and at DNS time;
response size and time are capped; per-visitor and global limits apply; reports live in memory for 1 hour and are not stored.

## Test
`cd server && node test/run.js` audits a deliberately broken mini-site and checks the results.

## Where it appears on the site
Side menu on every page ("FREE SEO AUDIT"), the home-page top nav, a banner on the Makeover page before its final call to action,
and a button inside the SEO pillar on the Services page.

## Deploy on Railway (recommended, 5 minutes)
1. Push this folder to a GitHub repo (`.env` is git-ignored, so your key stays private).
2. Railway → New Project → Deploy from GitHub repo. It detects `package.json` and runs `npm start` automatically.
3. In the service → Variables, add `PSI_API_KEY` (your Google key) and `TRUST_PROXY` = `1`.
4. Service → Settings → Networking → Generate Domain. Open `https://<that-domain>/seo-audit.html`: the whole site and the audit run from there.

**Keeping the site on Netlify instead?** Netlify can't run the audit server. Deploy to Railway as above, then in `seo-audit.html`
change `window.NATHIOS_AUDIT_API = ''` to your Railway address, e.g. `'https://nathios-production.up.railway.app'`, and redeploy to Netlify.
