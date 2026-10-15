'use strict';
/* HTTP client for crawling untrusted sites.
   - blocks private / loopback / link-local addresses (SSRF), re-checked on every redirect and at DNS time
   - caps response size and total time, follows redirects manually and records the chain */
const http = require('http'), https = require('https'), dns = require('dns'), net = require('net'), zlib = require('zlib');

const UA = 'Mozilla/5.0 (compatible; NathiosSEOAudit/1.0; +https://nathios.in/seo-audit.html)';
const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE === '1'; // for local testing only

const v4 = ip => ip.split('.').reduce((a, b) => (a << 8) + +b, 0) >>> 0;
function isPrivateIp(ip) {
  if (ALLOW_PRIVATE) return false;
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === '::1' || l === '::') return true;
    if (l.startsWith('::ffff:')) { const t = l.slice(7); return net.isIPv4(t) ? isPrivateIp(t) : true; }
    return /^f[cd]/.test(l) || /^fe[89ab]/.test(l);
  }
  if (!net.isIPv4(ip)) return true;
  const n = v4(ip), r = (a, b) => n >= v4(a) && n <= v4(b);
  return r('0.0.0.0', '0.255.255.255') || r('10.0.0.0', '10.255.255.255') || r('100.64.0.0', '100.127.255.255') ||
    r('127.0.0.0', '127.255.255.255') || r('169.254.0.0', '169.254.255.255') || r('172.16.0.0', '172.31.255.255') ||
    r('192.0.0.0', '192.0.0.255') || r('192.168.0.0', '192.168.255.255') || r('198.18.0.0', '198.19.255.255') ||
    r('224.0.0.0', '255.255.255.255');
}

function guardedLookup(hostname, options, cb) {
  if (typeof options === 'function') { cb = options; options = {}; }
  dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
    if (err) return cb(err);
    const ok = addrs.filter(a => !isPrivateIp(a.address));
    if (!ok.length) return cb(Object.assign(new Error('Address not allowed'), { code: 'EBLOCKED' }));
    if (options.all) return cb(null, ok);
    cb(null, ok[0].address, ok[0].family);
  });
}

function validateUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw Object.assign(new Error('Invalid URL'), { code: 'EBADURL' }); }
  if (!/^https?:$/.test(u.protocol)) throw Object.assign(new Error('Only http(s) URLs are supported'), { code: 'EBADURL' });
  if (u.username || u.password) throw Object.assign(new Error('URLs with credentials are not allowed'), { code: 'EBADURL' });
  const h = u.hostname.toLowerCase();
  if (!ALLOW_PRIVATE) {
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) throw Object.assign(new Error('Address not allowed'), { code: 'EBLOCKED' });
    if (net.isIP(h.replace(/^\[|\]$/g, '')) && isPrivateIp(h.replace(/^\[|\]$/g, ''))) throw Object.assign(new Error('Address not allowed'), { code: 'EBLOCKED' });
    if (u.port && !['80', '443', '8080', '8443'].includes(u.port)) throw Object.assign(new Error('Port not allowed'), { code: 'EBLOCKED' });
  }
  if (!h.includes('.') && !net.isIP(h) && !ALLOW_PRIVATE) throw Object.assign(new Error('Invalid host'), { code: 'EBADURL' });
  return u;
}

function once(u, { method, timeout, maxBytes, headers }) {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === 'https:' ? https : http;
    const t0 = Date.now(); let ttfb = 0, settled = false;
    const done = (fn, v) => { if (settled) return; settled = true; clearTimeout(timer); fn(v); };
    const req = lib.request(u, {
      method, lookup: guardedLookup, timeout,
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5', 'accept-encoding': 'gzip, deflate, br', ...headers }
    }, res => {
      ttfb = Date.now() - t0;
      if (method === 'HEAD') { res.resume(); return done(resolve, { status: res.statusCode, headers: res.headers, body: Buffer.alloc(0), ttfb, truncated: false }); }
      let stream = res; const enc = (res.headers['content-encoding'] || '').toLowerCase();
      try {
        if (enc === 'gzip') stream = res.pipe(zlib.createGunzip());
        else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
        else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());
      } catch (e) { return done(reject, e); }
      const chunks = []; let size = 0, truncated = false;
      const finish = () => done(resolve, { status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), ttfb, truncated });
      stream.on('data', c => {
        size += c.length;
        if (size > maxBytes) { truncated = true; chunks.push(c.subarray(0, c.length - (size - maxBytes))); req.destroy(); res.destroy(); finish(); }
        else chunks.push(c);
      });
      stream.on('end', finish);
      stream.on('error', e => done(reject, e));
      res.on('error', e => done(reject, e));
    });
    const timer = setTimeout(() => { req.destroy(Object.assign(new Error('Timed out'), { code: 'ETIMEDOUT' })); }, timeout + 1000);
    req.on('timeout', () => req.destroy(Object.assign(new Error('Timed out'), { code: 'ETIMEDOUT' })));
    req.on('error', e => done(reject, e));
    req.end();
  });
}

async function fetchUrl(url, { method = 'GET', timeout = 12000, maxBytes = 2_000_000, maxRedirects = 5, headers = {} } = {}) {
  const chain = []; let cur = url; const t0 = Date.now();
  for (let i = 0; i <= maxRedirects; i++) {
    const u = validateUrl(cur);
    const res = await once(u, { method, timeout, maxBytes, headers });
    if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.location) {
      chain.push({ url: cur, status: res.status });
      cur = new URL(res.headers.location, cur).href;
      continue;
    }
    return { ...res, url: cur, requestedUrl: url, chain, ms: Date.now() - t0 };
  }
  throw Object.assign(new Error('Too many redirects'), { code: 'EREDIRECTS' });
}

module.exports = { fetchUrl, validateUrl, isPrivateIp, UA };
