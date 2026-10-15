'use strict';
// Load server/.env (KEY=value per line) without needing any extra package. Real environment variables win.
try {
  require('fs').readFileSync(require('path').join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach(l => {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && !l.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
} catch (e) { /* no .env file: fine */ }
/* Nathios SEO audit server
   - serves the static website (one folder up) AND the audit API, so a single `node server.js` runs everything
   - POST /api/audit {url}  -> 202 {id}
   - GET  /api/audit/:id    -> {status, progress, report?, error?}
   Env: PORT, PSI_API_KEY, MAX_PAGES (100), MAX_JOBS (3), IP_LIMIT (6/hour), ALLOWED_ORIGINS (comma list or *),
        TRUST_PROXY=1 (behind nginx/Render/etc), SERVE_STATIC=0 (API only) */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { runAudit } = require('./lib/audit');

const PORT = +process.env.PORT || 3000;
const ROOT = path.resolve(__dirname, '..');
const MAX_PAGES = +process.env.MAX_PAGES || 100;
const MAX_JOBS = +process.env.MAX_JOBS || 3;
const IP_LIMIT = +process.env.IP_LIMIT || 6;
const ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
const SERVE_STATIC = process.env.SERVE_STATIC !== '0';

const jobs = new Map(), hits = new Map();
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };

const clientIp = req => (process.env.TRUST_PROXY === '1' && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';
function cors(req, res) {
  const o = req.headers.origin;
  if (o && (ORIGINS.includes('*') || ORIGINS.includes(o))) { res.setHeader('Access-Control-Allow-Origin', ORIGINS.includes('*') ? '*' : o); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function send(req, res, code, obj) {
  cors(req, res);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readJson(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', c => { n += c.length; if (n > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
const running = () => [...jobs.values()].filter(j => j.status === 'running').length;

async function api(req, res, url) {
  if (req.method === 'OPTIONS') { cors(req, res); res.writeHead(204); return res.end(); }
  if (url.pathname === '/api/health') return send(req, res, 200, { ok: true, running: running() });

  if (url.pathname === '/api/audit' && req.method === 'POST') {
    let body; try { body = await readJson(req); } catch { return send(req, res, 400, { error: 'Invalid request.' }); }
    const input = String(body.url || '').trim();
    if (!input || input.length > 2048) return send(req, res, 400, { error: 'Enter a website address.' });
    const ip = clientIp(req), now = Date.now();
    const list = (hits.get(ip) || []).filter(t => now - t < 3600e3);
    // reuse an audit this visitor already has running for the same address
    for (const j of jobs.values()) if (j.ip === ip && j.status === 'running' && j.input === input) return send(req, res, 202, { id: j.id });
    if (list.length >= IP_LIMIT) return send(req, res, 429, { error: `You've reached the limit of ${IP_LIMIT} audits per hour. Please try again later.` });
    if (running() >= MAX_JOBS) return send(req, res, 503, { error: 'Our audit engine is busy right now. Please try again in a minute.' });
    list.push(now); hits.set(ip, list);

    const job = { id: crypto.randomBytes(9).toString('hex'), ip, input, status: 'running', created: now, progress: { stage: 'discover', pct: 1, message: 'Starting…', pagesCrawled: 0, pagesFound: 0, recent: [] }, report: null, error: null };
    jobs.set(job.id, job);
    runAudit(input, { maxPages: MAX_PAGES, onProgress: p => { job.progress = p; } })
      .then(r => { job.report = r; job.status = 'done'; job.progress = { ...job.progress, stage: 'done', pct: 100, message: 'Done' }; })
      .catch(e => { job.status = 'error'; job.error = e.message || 'Something went wrong.'; console.error('[audit]', input, e.code || e.message); });
    return send(req, res, 202, { id: job.id });
  }

  const m = url.pathname.match(/^\/api\/audit\/([a-f0-9]{18})$/);
  if (m && req.method === 'GET') {
    const j = jobs.get(m[1]); if (!j) return send(req, res, 404, { error: 'This audit has expired. Please run it again.' });
    return send(req, res, 200, { id: j.id, status: j.status, progress: j.progress, error: j.error, report: j.status === 'done' ? j.report : null });
  }
  return send(req, res, 404, { error: 'Not found' });
}

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname); if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(ROOT, p));
  const rel = path.relative(ROOT, file);
  if (rel.startsWith('..') || path.isAbsolute(rel) || rel.split(path.sep).some(s => s.startsWith('.') || s === 'server' || s === 'node_modules')) { res.writeHead(404); return res.end('Not found'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) return api(req, res, url).catch(e => { console.error(e); send(req, res, 500, { error: 'Server error.' }); });
  if (!SERVE_STATIC) { res.writeHead(404); return res.end('Not found'); }
  serveStatic(req, res, url);
});
setInterval(() => { const now = Date.now(); for (const [k, j] of jobs) if (now - j.created > 3600e3) jobs.delete(k); for (const [k, l] of hits) if (!l.some(t => now - t < 3600e3)) hits.delete(k); }, 600e3).unref();

if (require.main === module) server.listen(PORT, () => console.log(`Nathios running → http://localhost:${PORT}  (audit page: /seo-audit.html)`));
module.exports = server;
