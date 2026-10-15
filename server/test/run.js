'use strict';
// Spins up a small flawed website and audits it. Run: ALLOW_PRIVATE=1 node test/run.js
process.env.ALLOW_PRIVATE = '1';
const http = require('http'), assert = require('assert');
const { runAudit } = require('../lib/audit');
const png = Buffer.alloc(300000, 1);
const page = (title, body, head = '') => `<!doctype html><html><head><meta charset=utf-8>${title ? `<title>${title}</title>` : ''}${head}</head><body>${body}</body></html>`;
const long = 'Our team builds reliable websites for growing businesses and explains every step in plain words. '.repeat(40);
const site = {
  '/': page('Acme Studio – Web design and development agency', `<h1>Acme Studio</h1><p>${long}</p><a href=/about>About</a><a href=/services>Services</a><a href=/blog/post-1>Blog</a><a href=/missing>Old page</a><img src=/hero.png><img src=/b.png alt=x><a href="https://example.invalid/x">ext</a>`, '<meta name=viewport content="width=device-width"><meta name=description content="We design and build fast websites."><link rel=canonical href=/><script src=/a.js></script><script src=/b.js></script><script src=/c.js></script><script src=/d.js></script><script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script>'),
  '/about': page('About', `<h1>About us</h1><h1>Second</h1><p>Short page.</p>`),
  '/services': page('About', `<h1>Services</h1><p>${long}</p><h3>Skipped level</h3>`, '<meta name=viewport content=x><meta name=robots content=noindex>'),
  '/blog/post-1': page('Post one: how to pick a web agency', `<h1>How to pick a web agency?</h1><h2>What should it cost?</h2><h2>How long does it take?</h2><p>${long}</p>`, '<meta name=viewport content=x><meta name=description content="A short guide.">'),
  '/orphan': page('Hidden page for testing orphans in the sitemap', `<h1>Orphan</h1><p>${long} unique orphan text</p>`, '<meta name=viewport content=x>'),
  '/robots.txt': ['text/plain', 'User-agent: GPTBot\nDisallow: /\nUser-agent: *\nAllow: /\nSitemap: http://127.0.0.1:PORT/sitemap.xml'],
  '/sitemap.xml': ['application/xml', '<urlset><url><loc>http://127.0.0.1:PORT/</loc></url><url><loc>http://127.0.0.1:PORT/orphan</loc></url></urlset>'],
  '/hero.png': ['image/png', png], '/b.png': ['image/png', Buffer.alloc(5000, 2)]
};
const srv = http.createServer((req, res) => {
  const v = site[req.url.split('?')[0]];
  if (!v) { res.writeHead(req.url.includes('nathios-audit') ? 200 : 404, { 'content-type': 'text/html' }); return res.end('<html><body>nope</body></html>'); }
  let [type, body] = typeof v === 'string' ? ['text/html', v] : v;
  if (typeof body === 'string') body = body.replace(/PORT/g, srv.address().port);
  res.writeHead(200, { 'content-type': type, 'content-length': Buffer.byteLength(body) });
  res.end(req.method === 'HEAD' ? undefined : body);
});
if (process.argv.includes('--serve')) srv.listen(4010, '127.0.0.1', () => console.log('flawed test site on http://127.0.0.1:4010/'));
else srv.listen(0, '127.0.0.1', async () => {
  const port = srv.address().port, logs = [];
  try {
    const r = await runAudit(`http://127.0.0.1:${port}/`, { maxPages: 20, psiKey: null, onProgress: p => logs.push(p.stage) });
    console.log(`Score ${r.score} (${r.grade}) — ${r.pagesAnalysed} pages analysed, ${r.issues.length} issues, ${r.durationMs} ms`);
    r.areas.forEach(a => console.log('  ', a.name.padEnd(22), String(a.score).padStart(3), `${a.issues} issues`));
    const ids = new Set(r.issues.map(i => i.id));
    console.log('Issues:', [...ids].join(', '));
    ['broken-pages', 'dup-title', 'multi-h1', 'noindex', 'no-breadcrumb', 'ai-blocked', 'no-llms', 'soft-404', 'big-images', 'no-alt', 'thin', 'orphans', 'no-desc', 'no-og', 'blocking-js'].forEach(id => assert(ids.has(id), 'expected issue: ' + id));
    assert(r.pagesAnalysed >= 5, 'crawled pages'); assert(r.stats.robots && r.stats.sitemap, 'robots + sitemap read'); assert(r.score > 0 && r.score < 100);
    assert(['discover', 'crawl', 'images', 'analyze'].every(s => logs.includes(s)), 'progress stages');
    console.log('\nPASS — crawler, scoring and progress work');
  } catch (e) { console.error('FAIL', e); process.exitCode = 1; }
  srv.close();
});
