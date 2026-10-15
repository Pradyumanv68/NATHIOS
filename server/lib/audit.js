'use strict';
const crypto = require('crypto');
const cheerio = require('cheerio');
const { fetchUrl } = require('./safe-fetch');

const AREAS = [
  { id: 'technical', name: 'Technical health', weight: 20 },
  { id: 'onpage',    name: 'On-page SEO',      weight: 20 },
  { id: 'content',   name: 'Content',          weight: 15 },
  { id: 'schema',    name: 'Schema',           weight: 10 },
  { id: 'speed',     name: 'Mobile speed',     weight: 15 },
  { id: 'ai',        name: 'AI search readiness', weight: 10 },
  { id: 'images',    name: 'Images',           weight: 10 }
];
const SEV_W = { high: 28, medium: 14, low: 6 };
const SEV_ORDER = { high: 0, medium: 1, low: 2 };
const AI_BOTS = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'CCBot', 'OAI-SearchBot'];
const SKIP_EXT = /\.(jpe?g|png|gif|webp|avif|svg|ico|pdf|zip|rar|7z|mp4|mp3|mov|webm|css|js|mjs|json|xml|txt|docx?|xlsx?|pptx?|woff2?|ttf|eot|apk|dmg|exe)(\?|$)/i;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;

/* ---------- URL helpers ---------- */
function normalizeInput(raw) {
  let s = String(raw || '').trim();
  if (!s) throw Object.assign(new Error('Enter a website address.'), { code: 'EBADURL' });
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  const u = new URL(s);
  u.hash = '';
  return u;
}
const hostKey = h => h.toLowerCase().replace(/^www\./, '');
function keyOf(href) {
  const u = new URL(href); u.hash = '';
  let p = u.pathname.replace(/\/{2,}/g, '/'); if (p.length > 1) p = p.replace(/\/$/, '');
  return u.protocol + '//' + hostKey(u.host) + p + u.search;
}
function absolute(href, base) {
  if (!href) return null;
  href = href.trim();
  if (/^(mailto:|tel:|javascript:|data:|sms:|#)/i.test(href)) return null;
  try { const u = new URL(href, base); if (!/^https?:$/.test(u.protocol)) return null; u.hash = ''; return u.href; } catch { return null; }
}

/* ---------- robots / sitemap parsing ---------- */
function parseRobots(txt) {
  const groups = []; let cur = null; const sitemaps = [];
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim(); if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') { if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); }
    else if (k === 'sitemap') sitemaps.push(v);
    else if ((k === 'disallow' || k === 'allow') && cur) cur.rules.push({ k, v });
  }
  const blocksAll = agent => {
    const g = groups.filter(x => x.agents.includes(agent.toLowerCase()));
    const use = g.length ? g : groups.filter(x => x.agents.includes('*'));
    return use.some(x => x.rules.some(r => r.k === 'disallow' && r.v === '/') && !x.rules.some(r => r.k === 'allow' && r.v === '/'));
  };
  const named = agent => groups.some(x => x.agents.includes(agent.toLowerCase()));
  return { sitemaps, blocksAll, named };
}
const locs = xml => [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\s]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)].map(m => m[1]);

/* ---------- page analysis ---------- */
function syllables(w) { w = w.toLowerCase().replace(/[^a-z]/g, ''); if (!w) return 0; const m = w.replace(/e$/, '').match(/[aeiouy]+/g); return Math.max(1, m ? m.length : 1); }
function flesch(text) {
  const t = text.slice(0, 6000);
  const sents = Math.max(1, (t.match(/[.!?]+(\s|$)/g) || []).length);
  const words = t.split(/\s+/).filter(Boolean); if (words.length < 60) return null;
  const syl = words.reduce((a, w) => a + syllables(w), 0);
  return 206.835 - 1.015 * (words.length / sents) - 84.6 * (syl / words.length);
}
function typesOf(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach(n => typesOf(n, out));
  const t = node['@type']; if (t) (Array.isArray(t) ? t : [t]).forEach(x => out.add(String(x)));
  if (node['@graph']) typesOf(node['@graph'], out);
  if (node.sameAs) out.hasSameAs = true;
}

function analyzeHtml(html, pageUrl, siteHost) {
  const $ = cheerio.load(html);
  const p = {};
  p.title = $('head title').first().text().replace(/\s+/g, ' ').trim();
  p.description = ($('meta[name="description" i]').attr('content') || '').trim();
  p.canonical = ($('link[rel="canonical" i]').attr('href') || '').trim();
  p.robotsMeta = ($('meta[name="robots" i]').attr('content') || '').toLowerCase();
  p.viewport = !!$('meta[name="viewport" i]').length;
  p.lang = ($('html').attr('lang') || '').trim();
  p.og = !!$('meta[property="og:title"]').length && !!$('meta[property="og:description"]').length;
  p.h1 = $('h1').map((_, e) => $(e).text().replace(/\s+/g, ' ').trim()).get().filter(Boolean);
  p.headingLevels = $('h1,h2,h3,h4,h5,h6').map((_, e) => +e.tagName[1]).get();
  p.h2count = $('h2').length;
  p.questionHeadings = $('h1,h2,h3,h4,summary').filter((_, e) => /\?\s*$/.test($(e).text().trim())).length;
  p.detailsCount = $('details').length;

  const $b = cheerio.load($('body').html() || '');
  $b('script,style,noscript,svg,template,iframe').remove();
  const text = $b.root().text().replace(/\s+/g, ' ').trim();
  p.words = text ? text.split(' ').length : 0;
  p.textHash = p.words >= 80 ? crypto.createHash('sha1').update(text.toLowerCase()).digest('hex') : null;
  p.flesch = flesch(text);
  const titleWords = [...new Set(p.title.toLowerCase().match(/[a-z0-9]{4,}/g) || [])].slice(0, 6);
  const low = text.toLowerCase();
  p.titleMatch = titleWords.length >= 2 ? titleWords.filter(w => low.includes(w)).length / titleWords.length : 1;

  const types = new Set(); let invalid = 0, ld = 0;
  $('script[type="application/ld+json"]').each((_, e) => {
    ld++; try { typesOf(JSON.parse($(e).contents().text()), types); } catch { invalid++; }
  });
  p.ld = ld; p.ldInvalid = invalid; p.ldTypes = [...types]; p.ldSameAs = !!types.hasSameAs;

  p.images = $('img').map((_, e) => {
    const src = $(e).attr('src') || $(e).attr('data-src') || ($(e).attr('srcset') || '').split(/\s+/)[0] || '';
    return { src: absolute(src, pageUrl), alt: $(e).attr('alt'), w: $(e).attr('width'), h: $(e).attr('height'), loading: ($(e).attr('loading') || '').toLowerCase() };
  }).get();

  const internal = new Set(), external = new Set();
  $('a[href]').each((_, e) => {
    const a = absolute($(e).attr('href'), pageUrl); if (!a) return;
    try { (hostKey(new URL(a).host) === siteHost ? internal : external).add(a); } catch { }
  });
  p.internalLinks = [...internal]; p.externalLinks = [...external];

  p.blockingScripts = $('head script[src]:not([async]):not([defer]):not([type="module"])').length;
  p.stylesheets = $('link[rel="stylesheet" i]').length;
  p.scriptCount = $('script[src]').length;
  if (pageUrl.startsWith('https:')) {
    p.mixed = $('img[src^="http://"],script[src^="http://"],link[rel="stylesheet"][href^="http://"],iframe[src^="http://"]').length;
  } else p.mixed = 0;
  return p;
}

/* ---------- Google PageSpeed Insights (mobile lab data) ---------- */
async function pagespeed(url, key) {
  const api = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed?strategy=mobile&category=performance&url=' + encodeURIComponent(url) + (key ? '&key=' + key : '');
  const r = await fetchUrl(api, { timeout: 75000, maxBytes: 12_000_000, headers: { accept: 'application/json' } });
  if (r.status !== 200) throw new Error('PSI ' + r.status);
  const j = JSON.parse(r.body.toString('utf8')), lr = j.lighthouseResult; if (!lr) throw new Error('PSI empty');
  const a = lr.audits, num = id => a[id] && a[id].numericValue;
  const opps = Object.values(a).filter(x => x.details && x.details.type === 'opportunity' && x.details.overallSavingsMs > 400)
    .sort((x, y) => y.details.overallSavingsMs - x.details.overallSavingsMs).slice(0, 3).map(x => x.title);
  return {
    source: 'psi', score: Math.round((lr.categories.performance.score || 0) * 100),
    lcp: num('largest-contentful-paint'), cls: num('cumulative-layout-shift'), tbt: num('total-blocking-time'),
    fcp: num('first-contentful-paint'), si: num('speed-index'), opportunities: opps
  };
}

/* ---------- main ---------- */
async function runAudit(input, opts = {}) {
  const { maxPages = 100, concurrency = 5, maxMs = 4 * 60 * 1000, psiKey = process.env.PSI_API_KEY, onProgress = () => { } } = opts;
  const startedAt = Date.now();
  const timeUp = () => Date.now() - startedAt > maxMs;
  const recent = [];
  const prog = (stage, pctVal, message, extra = {}) => onProgress({ stage, pct: Math.min(99, Math.round(pctVal)), message, pagesCrawled: pages.length, pagesFound: seen.size, recent: recent.slice(-6), ...extra });

  const startUrl = normalizeInput(input);
  const pages = [], seen = new Set(), queue = [], inlinks = new Map(), notes = [];
  prog('discover', 2, 'Reaching your website…');

  /* 1. home page (also gives us the canonical host after redirects) */
  let home;
  try { home = await fetchUrl(startUrl.href, { timeout: 15000 }); }
  catch (e) {
    // no scheme typed + HTTPS unavailable → the site may be HTTP-only (we then flag that as an issue)
    if (!/^https?:\/\//i.test(String(input).trim()) && ['EPROTO', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID', 'ERR_SSL_WRONG_VERSION_NUMBER'].includes(e.code)) {
      try { startUrl.protocol = 'http:'; home = await fetchUrl(startUrl.href, { timeout: 15000 }); } catch (e2) { throw friendly(e); }
    } else throw friendly(e);
  }
  if (home.status >= 400) throw Object.assign(new Error(`Your site answered with HTTP ${home.status}, so we couldn't audit it.`), { code: 'EHTTP' });
  const finalHome = new URL(home.url);
  const siteHost = hostKey(finalHome.host), origin = finalHome.origin;
  const isHttps = finalHome.protocol === 'https:';

  /* 2. site files + http→https + soft-404 probe, in parallel */
  prog('discover', 5, 'Reading robots.txt, sitemap and llms.txt…');
  const safe = (u, o) => fetchUrl(u, { timeout: 10000, maxBytes: 1_500_000, ...o }).catch(() => null);
  const [robotsRes, llmsRes, probe404, httpRes] = await Promise.all([
    safe(origin + '/robots.txt'), safe(origin + '/llms.txt'),
    safe(origin + '/nathios-audit-' + crypto.randomBytes(4).toString('hex') + '-not-a-page'),
    isHttps ? safe('http://' + finalHome.host + '/', { maxBytes: 20000 }) : Promise.resolve(null)
  ]);
  const robotsTxt = robotsRes && robotsRes.status === 200 && !/<html/i.test(robotsRes.body.toString('utf8', 0, 400)) ? robotsRes.body.toString('utf8') : null;
  const robots = robotsTxt ? parseRobots(robotsTxt) : null;
  const llms = !!(llmsRes && llmsRes.status === 200 && !/<html/i.test(llmsRes.body.toString('utf8', 0, 300)) && llmsRes.body.length > 20);
  const soft404 = !!(probe404 && probe404.status === 200);
  const httpRedirectsToHttps = httpRes ? httpRes.url.startsWith('https:') : null;

  /* sitemap(s) */
  const sitemapSeeds = []; let sitemapFound = false;
  const smQueue = robots && robots.sitemaps.length ? robots.sitemaps.slice(0, 3) : [origin + '/sitemap.xml'];
  for (let i = 0; i < smQueue.length && i < 6; i++) {
    const r = await safe(smQueue[i], { maxBytes: 3_000_000 }); if (!r || r.status !== 200) continue;
    const xml = r.body.toString('utf8'); if (!/<(urlset|sitemapindex)/i.test(xml)) continue;
    sitemapFound = true;
    const l = locs(xml);
    if (/<sitemapindex/i.test(xml)) l.slice(0, 5).forEach(x => { if (smQueue.length < 6) smQueue.push(x); });
    else sitemapSeeds.push(...l);
  }
  const sitemapSet = new Set(sitemapSeeds.map(u => { try { return keyOf(u); } catch { return null; } }).filter(Boolean));

  /* 3. crawl */
  const homeKey = keyOf(home.url);
  const enqueue = (url, depth, fromSitemap) => {
    let k; try { k = keyOf(url); } catch { return; }
    if (seen.has(k) || seen.size > 3000 || SKIP_EXT.test(new URL(url).pathname)) return;
    if (hostKey(new URL(url).host) !== siteHost) return;
    seen.add(k); queue.push({ url, depth, key: k, fromSitemap });
  };
  seen.add(homeKey); seen.add(keyOf(startUrl.href));

  const speedP = (process.env.PSI_DISABLED === '1' ? Promise.reject(new Error('disabled')) : pagespeed(home.url, psiKey)).catch(e => { notes.push('Google PageSpeed data was unavailable, so mobile speed was estimated from page weight and render-blocking files.'); return null; });

  let started = 0, inflight = 0;
  const handle = async item => {
    let res;
    try { res = item.pre || await fetchUrl(item.url, { timeout: 12000 }); }
    catch (e) { pages.push({ url: item.url, key: item.key, depth: item.depth, status: 0, error: e.code || e.message, chain: [] }); return; }
    const ct = String(res.headers['content-type'] || '');
    const rec = { url: item.url, finalUrl: res.url, key: item.key, depth: item.depth, status: res.status, chain: res.chain, ms: res.ms, ttfb: res.ttfb, bytes: res.body.length, ct, https: res.url.startsWith('https:') };
    pages.push(rec);
    recent.push(new URL(res.url).pathname || '/');
    if (res.status === 200 && /html/i.test(ct) && res.body.length) {
      if (hostKey(new URL(res.url).host) !== siteHost) { rec.offsite = true; return; }
      Object.assign(rec, analyzeHtml(res.body.toString('utf8'), res.url, siteHost), { html: true, truncated: res.truncated });
      for (const l of rec.internalLinks) {
        let k; try { k = keyOf(l); } catch { continue; }
        if (!inlinks.has(k)) inlinks.set(k, new Set()); inlinks.get(k).add(rec.key);
        enqueue(l, item.depth + 1, false);
      }
    }
  };
  const worker = async () => {
    for (;;) {
      if (timeUp() || started >= maxPages) return;
      const item = queue.shift();
      if (!item) { if (!inflight) return; await sleep(40); continue; }
      started++; inflight++;
      try { await handle(item); } catch { } finally { inflight--; }
      prog('crawl', 8 + 60 * Math.min(1, pages.length / Math.min(maxPages, Math.max(seen.size, 1))), `Crawling pages… ${pages.length} done`);
    }
  };
  // homepage already fetched
  queue.push({ url: home.url, depth: 0, key: homeKey, pre: home });
  sitemapSeeds.forEach(u => enqueue(u, 1, true));
  prog('crawl', 8, 'Crawling pages…');
  await Promise.all(Array.from({ length: concurrency }, worker));
  if (timeUp() && started < maxPages) notes.push('The audit hit its time limit, so some pages were not crawled.');
  if (seen.size > pages.length) notes.push(`Crawled ${pages.length} of the ${seen.size} pages we found. Audits are limited to ${maxPages} pages.`);

  const H = pages.filter(p => p.html);
  const total = H.length;
  if (!total) throw Object.assign(new Error("We reached your site but couldn't find any HTML pages to analyse."), { code: 'ENOHTML' });

  /* 4. images (sampled) */
  prog('images', 70, 'Checking image sizes and formats…');
  const imgUrls = [...new Set(H.flatMap(p => p.images.map(i => i.src)).filter(Boolean))].filter(u => !/^data:/i.test(u)).slice(0, 40);
  const imgInfo = new Map();
  await pool(imgUrls, 6, async u => {
    if (timeUp()) return;
    const r = await fetchUrl(u, { method: 'HEAD', timeout: 8000 }).catch(() => null);
    if (r) imgInfo.set(u, { status: r.status, size: +r.headers['content-length'] || 0, type: String(r.headers['content-type'] || '').toLowerCase() });
  });

  /* 5. external links (sampled) */
  prog('links', 78, 'Checking outgoing links…');
  const ext = [...new Set(H.flatMap(p => p.externalLinks.map(l => [l, p.url])).map(x => x[0]))].slice(0, 25);
  const extBroken = [];
  await pool(ext, 5, async u => {
    if (timeUp()) return;
    let r = await fetchUrl(u, { method: 'HEAD', timeout: 7000 }).catch(() => null);
    if (r && (r.status === 405 || r.status === 403 || r.status === 501)) r = await fetchUrl(u, { timeout: 7000, maxBytes: 20000 }).catch(() => null);
    if (r && (r.status === 404 || r.status === 410)) extBroken.push(u);
  });

  /* 6. mobile speed */
  prog('speed', 82, 'Waiting for the mobile speed test…');
  let speed = await Promise.race([speedP, sleep(70000).then(() => { notes.push('Google PageSpeed data was unavailable, so mobile speed was estimated from page weight and render-blocking files.'); return null; })]);

  /* ---------- scoring ---------- */
  prog('analyze', 94, 'Scoring your site…');
  const issues = [];
  const add = (area, id, severity, title, why, fix, o = {}) => {
    const urls = o.urls || [];
    if (!o.site && !urls.length) return;
    issues.push({ area, id, severity, title, why, fix, count: o.site ? (o.count || 1) : urls.length, total: o.site ? null : (o.total || total), site: !!o.site, pages: urls.slice(0, 8).map(u => typeof u === 'string' ? u : u.url), ratio: o.site ? 1 : urls.length / (o.total || total), detail: o.detail || null });
  };
  const where = f => H.filter(f).map(p => p.finalUrl || p.url);
  const homeP = H.find(p => p.key === homeKey) || H[0];

  /* technical */
  if (!isHttps) add('technical', 'no-https', 'high', 'Your site is not served over HTTPS', 'Browsers label HTTP sites “Not secure”, and Google prefers HTTPS pages in rankings.', 'Install an SSL certificate and redirect every http:// address to https://.', { site: true });
  else if (httpRedirectsToHttps === false) add('technical', 'http-no-redirect', 'medium', 'The HTTP version of your site does not redirect to HTTPS', 'Visitors and search engines can reach two copies of your site, which splits ranking signals.', 'Add a permanent (301) redirect from http:// to https:// at your host or CDN.', { site: true });
  const broken = pages.filter(p => p.status >= 400 || p.status === 0);
  add('technical', 'broken-pages', 'high', 'Pages return errors', 'Broken pages waste crawl budget, frustrate visitors and pass no ranking value.', 'Fix or redirect each broken address, and update the links that point to it.', { urls: broken.map(p => p.url), total: pages.length });
  const chains = pages.filter(p => p.chain && p.chain.length >= 2);
  add('technical', 'redirect-chains', 'medium', 'Redirect chains slow down visits', 'Each extra hop adds delay and leaks a little ranking value.', 'Point links and redirects straight at the final address.', { urls: chains.map(p => p.url), total: pages.length });
  add('technical', 'no-canonical', 'medium', 'Pages are missing a canonical tag', 'Without a canonical, duplicate versions of a page can compete with each other.', 'Add <link rel="canonical"> pointing at the preferred address of each page.', { urls: where(p => !p.canonical) });
  add('technical', 'noindex', homeP && homeP.robotsMeta.includes('noindex') ? 'high' : 'medium', 'Pages are set to noindex', 'A noindex tag tells Google to keep the page out of search results.', 'Remove the noindex directive from any page that should rank.', { urls: where(p => p.robotsMeta.includes('noindex')) });
  add('technical', 'no-viewport', 'high', 'Pages are missing the mobile viewport tag', 'Google indexes the mobile version first, and pages without a viewport render badly on phones.', 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the head.', { urls: where(p => !p.viewport) });
  add('technical', 'no-lang', 'low', 'Pages do not declare a language', 'The lang attribute helps search engines and screen readers pick the right language.', 'Add lang="en" (or your language) to the <html> tag.', { urls: where(p => !p.lang) });
  if (!robotsTxt) add('technical', 'no-robots', 'low', 'No robots.txt file found', 'robots.txt tells crawlers what to skip and where your sitemap lives.', 'Add a robots.txt at the root of your site that links to your sitemap.', { site: true });
  else if (robots.blocksAll('*') || robots.blocksAll('Googlebot')) add('technical', 'robots-block', 'high', 'robots.txt blocks search engines from your whole site', 'A “Disallow: /” rule stops Google from crawling any page.', 'Remove the blanket Disallow rule unless this is a private staging site.', { site: true });
  if (!sitemapFound) add('technical', 'no-sitemap', 'medium', 'No XML sitemap found', 'A sitemap helps Google discover every important page quickly.', 'Generate sitemap.xml and reference it in robots.txt and Google Search Console.', { site: true });
  const slow = where(p => p.ms > 1800);
  add('technical', 'slow-server', 'medium', 'Server responds slowly', 'Slow responses delay everything that follows and hurt Core Web Vitals.', 'Enable caching, use a CDN and check hosting and database performance.', { urls: slow });
  add('technical', 'mixed-content', 'medium', 'Pages load insecure (http://) resources', 'Mixed content can be blocked by browsers and triggers security warnings.', 'Change every http:// resource address to https://.', { urls: where(p => p.mixed > 0) });
  if (soft404) add('technical', 'soft-404', 'low', 'Missing pages return a 200 status instead of 404', 'Google may index empty “not found” pages as real content.', 'Make your 404 page return a genuine 404 status code.', { site: true });
  add('technical', 'broken-external', 'low', 'Some outgoing links are broken', 'Dead outbound links make a site look neglected.', 'Update or remove the broken links.', { urls: extBroken, total: Math.max(ext.length, 1), detail: 'Sampled ' + ext.length + ' outgoing links.' });

  /* on-page */
  add('onpage', 'no-title', 'high', 'Pages are missing a title tag', 'The title is the headline Google shows in results and the strongest on-page signal.', 'Write a unique, descriptive title (about 30–60 characters) for every page.', { urls: where(p => !p.title) });
  add('onpage', 'title-length', 'medium', 'Title tags are too short or too long', 'Short titles waste space, long ones get cut off in results.', 'Aim for roughly 30–60 characters and put the main topic first.', { urls: where(p => p.title && (p.title.length < 25 || p.title.length > 65)) });
  const dupe = (key, label) => {
    const m = new Map(); H.forEach(p => { const v = (p[key] || '').toLowerCase(); if (v) (m.get(v) || m.set(v, []).get(v)).push(p); });
    return [...m.values()].filter(a => a.length > 1).flat().map(p => p.finalUrl || p.url);
  };
  add('onpage', 'dup-title', 'medium', 'Several pages share the same title', 'Identical titles make it hard for Google to tell pages apart.', 'Give each page its own title that reflects its unique topic.', { urls: dupe('title') });
  add('onpage', 'no-desc', 'medium', 'Pages are missing a meta description', 'The description is your sales line in search results and affects clicks.', 'Write a unique 70–160 character description that invites the click.', { urls: where(p => !p.description) });
  add('onpage', 'desc-length', 'low', 'Meta descriptions are the wrong length', 'Very short descriptions say little; long ones get truncated.', 'Keep descriptions between about 70 and 160 characters.', { urls: where(p => p.description && (p.description.length < 70 || p.description.length > 165)) });
  add('onpage', 'dup-desc', 'low', 'Several pages share the same meta description', 'Duplicate descriptions reduce the appeal of each result.', 'Write a distinct description for each page.', { urls: dupe('description') });
  add('onpage', 'no-h1', 'high', 'Pages have no H1 heading', 'The H1 tells visitors and search engines what the page is about.', 'Add exactly one clear H1 that matches the page topic.', { urls: where(p => !p.h1.length) });
  add('onpage', 'multi-h1', 'low', 'Pages have more than one H1', 'Multiple H1s blur the main topic of the page.', 'Keep a single H1 and use H2–H3 for sub-sections.', { urls: where(p => p.h1.length > 1) });
  add('onpage', 'heading-order', 'low', 'Heading levels skip steps', 'A logical heading order helps search engines and screen readers follow the page.', 'Use headings in order (H1 → H2 → H3) without skipping levels.', { urls: where(p => p.headingLevels.some((l, i) => i && l - p.headingLevels[i - 1] > 1)) });
  add('onpage', 'no-og', 'low', 'Open Graph tags are missing', 'Without them, links shared on social media and chat apps look plain.', 'Add og:title, og:description and og:image to each page.', { urls: where(p => !p.og) });
  add('onpage', 'bad-url', 'low', 'Some URLs are long or hard to read', 'Short, readable URLs are easier to share and understand.', 'Use lowercase words separated by hyphens, and avoid long parameter strings.', { urls: where(p => { const u = new URL(p.finalUrl || p.url); return (u.pathname + u.search).length > 100 || /[A-Z_]/.test(u.pathname) || (u.search.match(/&/g) || []).length >= 3; }) });
  add('onpage', 'deep-pages', 'low', 'Some pages are buried deep in the site', 'Pages more than three clicks from the home page are crawled less and ranked lower.', 'Link important pages from the menu, home page or hub pages.', { urls: where(p => p.depth > 3) });
  const fullCrawl = pages.length >= seen.size; // only judge orphans when every known page was crawled
  const orphans = fullCrawl ? H.filter(p => sitemapSet.has(p.key) && p.key !== homeKey && !(inlinks.get(p.key) || new Set()).size) : [];
  add('onpage', 'orphans', 'medium', 'Pages in your sitemap have no internal links', 'Pages nobody links to rarely rank and signal low importance to Google.', 'Link to these pages from related pages and navigation.', { urls: orphans.map(p => p.finalUrl || p.url) });

  /* content */
  add('content', 'thin', 'medium', 'Thin pages with very little text', 'Pages with under ~300 words rarely satisfy a search query.', 'Expand these pages with useful detail, or merge/remove the ones that add nothing.', { urls: where(p => p.words < 300) });
  const hashes = new Map(); H.forEach(p => p.textHash && (hashes.get(p.textHash) || hashes.set(p.textHash, []).get(p.textHash)).push(p));
  add('content', 'dup-content', 'high', 'Duplicate page content', 'Identical text on multiple URLs makes Google pick one and ignore the rest.', 'Rewrite the copies, or use canonical tags / redirects to point at the main version.', { urls: [...hashes.values()].filter(a => a.length > 1).flat().map(p => p.finalUrl || p.url) });
  const fl = H.map(p => p.flesch).filter(v => v !== null);
  const avgFlesch = fl.length ? fl.reduce((a, b) => a + b, 0) / fl.length : null;
  if (avgFlesch !== null && avgFlesch < 35) add('content', 'readability', 'low', 'Text is hard to read', `Average reading ease is ${Math.round(avgFlesch)}/100. Dense writing loses visitors.`, 'Use shorter sentences and plainer words.', { site: true });
  add('content', 'title-mismatch', 'medium', 'Titles do not match what the page says', 'When the title promises something the page text does not cover, rankings and clicks suffer.', 'Make the title and H1 reflect the main topic that the copy actually covers.', { urls: where(p => p.title && p.words >= 150 && p.titleMatch < 0.5) });
  add('content', 'no-subheads', 'low', 'Long pages have no sub-headings', 'Walls of text are hard to scan for readers and for search engines.', 'Break long pages into sections with descriptive H2 headings.', { urls: where(p => p.words > 700 && p.h2count === 0) });

  /* schema */
  const withLd = H.filter(p => p.ld > 0);
  if (!withLd.length) add('schema', 'no-schema', 'high', 'No structured data (schema) found', 'Schema is how Google and AI tools learn who you are and what you sell, and it unlocks rich results.', 'Add JSON-LD for your Organization/LocalBusiness, plus page-level types such as Article, Product or FAQ.', { site: true });
  else {
    if (homeP && !homeP.ldTypes.some(t => /^(Organization|LocalBusiness|Corporation|WebSite|Person|ProfessionalService|Store)/i.test(t))) add('schema', 'no-org', 'medium', 'Home page has no Organization or WebSite schema', 'This is the foundation Google uses to understand your brand.', 'Add Organization (or LocalBusiness) and WebSite JSON-LD to the home page.', { site: true });
    add('schema', 'ld-invalid', 'medium', 'Structured data contains errors', 'Broken JSON-LD is ignored completely.', 'Validate the markup with Google’s Rich Results Test and fix the syntax.', { urls: where(p => p.ldInvalid > 0) });
    const inner = H.filter(p => p.key !== homeKey);
    if (inner.length >= 3) add('schema', 'no-breadcrumb', 'low', 'No breadcrumb schema on inner pages', 'Breadcrumb markup gives results a cleaner, clickable path.', 'Add BreadcrumbList JSON-LD to inner pages.', { urls: inner.filter(p => !p.ldTypes.includes('BreadcrumbList')).map(p => p.finalUrl || p.url), total: inner.length });
    const posts = H.filter(p => /\/(blog|news|post|article|insights)\//i.test(p.url));
    add('schema', 'no-article', 'low', 'Blog posts have no Article schema', 'Article markup helps posts qualify for richer search features.', 'Add Article or BlogPosting JSON-LD with author and dates.', { urls: posts.filter(p => !p.ldTypes.some(t => /Article|BlogPosting|NewsArticle/.test(t))).map(p => p.finalUrl || p.url), total: posts.length });
  }
  const schemaCoverage = pct(withLd.length, total);

  /* mobile speed */
  let speedEstimated = false;
  if (!speed) {
    speedEstimated = true;
    const h = homeP, heavy = h.bytes > 500000;
    speed = { source: 'estimate', score: null };
    if (h.blockingScripts > 3) add('speed', 'blocking-js', 'medium', 'Many render-blocking scripts in the head', `${h.blockingScripts} scripts load before the page can paint.`, 'Add defer or async to scripts, or load them at the end of the page.', { site: true, detail: 'Estimated without Google PageSpeed data.' });
    if (heavy) add('speed', 'heavy-html', 'medium', 'The home page HTML is very large', `The HTML alone is about ${Math.round(h.bytes / 1024)} KB.`, 'Remove unused markup and inline data, and enable compression.', { site: true });
    if (h.ttfb > 800) add('speed', 'ttfb', 'medium', 'Slow first response from the server', `The server took about ${h.ttfb} ms to start responding.`, 'Use caching and a CDN, and review hosting performance.', { site: true });
    if (h.stylesheets > 6) add('speed', 'css-files', 'low', 'Many separate stylesheets', `${h.stylesheets} CSS files are requested on the home page.`, 'Combine and minify CSS.', { site: true });
  } else {
    const s = speed, sec = v => (v / 1000).toFixed(1) + ' s';
    if (s.lcp > 4000) add('speed', 'lcp', 'high', 'The main content loads very slowly on mobile', `Largest Contentful Paint is ${sec(s.lcp)} — Google wants under 2.5 s.`, s.opportunities.length ? 'Biggest wins: ' + s.opportunities.join('; ') + '.' : 'Compress and preload the hero image, cut render-blocking files, and use a CDN.', { site: true });
    else if (s.lcp > 2500) add('speed', 'lcp', 'medium', 'The main content loads slowly on mobile', `Largest Contentful Paint is ${sec(s.lcp)} — Google wants under 2.5 s, and slower pages rank lower.`, s.opportunities.length ? 'Biggest wins: ' + s.opportunities.join('; ') + '.' : 'Compress and preload the hero image and cut render-blocking files.', { site: true });
    if (s.cls > 0.25) add('speed', 'cls', 'high', 'Layout jumps around while loading', `Cumulative Layout Shift is ${s.cls.toFixed(2)} (target: under 0.1).`, 'Set width and height on images and embeds, and reserve space for banners.', { site: true });
    else if (s.cls > 0.1) add('speed', 'cls', 'medium', 'Layout shifts while loading', `Cumulative Layout Shift is ${s.cls.toFixed(2)} (target: under 0.1).`, 'Set width and height on images and embeds, and reserve space for banners.', { site: true });
    if (s.tbt > 600) add('speed', 'tbt', 'high', 'The page is blocked by heavy JavaScript', `Total Blocking Time is ${Math.round(s.tbt)} ms (target: under 200 ms).`, 'Defer non-critical scripts, remove unused JavaScript and split bundles.', { site: true });
    else if (s.tbt > 200) add('speed', 'tbt', 'medium', 'JavaScript delays interaction on mobile', `Total Blocking Time is ${Math.round(s.tbt)} ms (target: under 200 ms).`, 'Defer non-critical scripts and remove unused JavaScript.', { site: true });
    if (s.fcp > 3000) add('speed', 'fcp', 'low', 'Slow first paint on mobile', `First Contentful Paint is ${sec(s.fcp)}.`, 'Inline critical CSS and trim blocking resources.', { site: true });
    if (s.score < 50) add('speed', 'psi-score', 'high', 'Overall mobile performance is poor', `Google Lighthouse scores the home page ${s.score}/100 on mobile.`, 'Work through the opportunities above; start with images and JavaScript.', { site: true });
    else if (s.score < 80) add('speed', 'psi-score', 'medium', 'Mobile performance has room to improve', `Google Lighthouse scores the home page ${s.score}/100 on mobile.`, 'Optimise images and defer non-critical JavaScript.', { site: true });
  }

  /* AI search readiness */
  const blocked = robots ? AI_BOTS.filter(b => robots.blocksAll(b) && (robots.named(b) || robots.blocksAll('*'))) : [];
  if (blocked.length >= 3) add('ai', 'ai-blocked', 'high', 'AI crawlers are blocked in robots.txt', `Blocked: ${blocked.join(', ')}. ChatGPT, Perplexity and Google’s AI can’t cite what they can’t read.`, 'Allow the AI crawlers you want to be cited by, or remove the blanket block.', { site: true });
  else if (blocked.length) add('ai', 'ai-blocked', 'medium', 'Some AI crawlers are blocked in robots.txt', `Blocked: ${blocked.join(', ')}.`, 'Allow these crawlers if you want to appear in AI answers.', { site: true });
  if (!llms) add('ai', 'no-llms', 'low', 'No llms.txt file', 'llms.txt gives AI tools a clean summary of your site and its key pages.', 'Add /llms.txt describing your business and linking to your most important pages.', { site: true });
  const hasFaq = H.some(p => p.ldTypes.includes('FAQPage'));
  const hasQ = H.some(p => p.questionHeadings >= 2 || p.detailsCount >= 2);
  if (!hasFaq) add('ai', 'no-faq-schema', hasQ ? 'low' : 'medium', 'No FAQ schema', 'Question-and-answer markup is exactly what AI assistants and rich results pull from.', 'Add an FAQ section with FAQPage JSON-LD to your key service pages.', { site: true });
  if (homeP && homeP.words < 60 && homeP.scriptCount >= 3) add('ai', 'js-only', 'high', 'Your content may need JavaScript to appear', 'Most AI crawlers read only the raw HTML. This page has almost no readable text before scripts run.', 'Server-render or pre-render the important content.', { site: true });
  if (homeP && !homeP.ldSameAs) add('ai', 'no-entity', 'medium', 'No brand entity links (sameAs)', 'AI systems verify who you are by connecting your site to your LinkedIn, Google Business and social profiles.', 'Add Organization schema with sameAs links to your official profiles.', { site: true });
  const longQ = H.filter(p => p.words > 400);
  add('ai', 'no-qa-headings', 'low', 'Few question-style headings', 'Headings phrased as real questions are easy for AI to match to prompts.', 'Add H2/H3 headings that mirror how customers ask, each followed by a direct answer.', { urls: longQ.filter(p => p.questionHeadings === 0).map(p => p.finalUrl || p.url), total: longQ.length });

  /* images */
  const allImgs = H.flatMap(p => p.images.map(i => ({ ...i, page: p.finalUrl || p.url })));
  const noAlt = H.filter(p => p.images.some(i => i.src && i.alt === undefined));
  add('images', 'no-alt', noAlt.length / total > 0.4 ? 'high' : 'medium', 'Images are missing alt text', `${allImgs.filter(i => i.src && i.alt === undefined).length} images have no alt attribute, which hurts accessibility and image search.`, 'Describe each meaningful image in a few words; use alt="" for decorative ones.', { urls: noAlt.map(p => p.finalUrl || p.url) });
  const big = [...imgInfo].filter(([, v]) => v.status < 400 && v.size > 200_000);
  if (big.length) add('images', 'big-images', big.some(([, v]) => v.size > 600_000) ? 'high' : 'medium', 'Oversized images slow every page', `${big.length} of ${imgInfo.size} sampled images are over 200 KB (largest ${Math.round(Math.max(...big.map(b => b[1].size)) / 1024)} KB).`, 'Resize to the displayed size and compress, ideally to WebP or AVIF.', { urls: big.map(b => b[0]), total: imgInfo.size, detail: 'Image files, not pages.' });
  const legacy = [...imgInfo].filter(([, v]) => v.status < 400 && /image\/(jpeg|jpg|png|gif|bmp)/.test(v.type));
  if (legacy.length >= 2 && legacy.length / Math.max(imgInfo.size, 1) > 0.5) add('images', 'legacy-format', 'low', 'Images use older formats', `${legacy.length} of ${imgInfo.size} sampled images are JPEG/PNG/GIF.`, 'Serve modern WebP or AVIF versions; they are typically 25–50% smaller.', { urls: legacy.map(b => b[0]), total: imgInfo.size, detail: 'Image files, not pages.' });
  const brokenImg = [...imgInfo].filter(([, v]) => v.status >= 400);
  add('images', 'broken-images', 'high', 'Some images fail to load', 'Broken images look unprofessional and waste requests.', 'Fix or remove the image addresses.', { urls: brokenImg.map(b => b[0]), total: imgInfo.size, detail: 'Image files, not pages.' });
  add('images', 'no-dimensions', 'low', 'Images have no width/height', 'Without dimensions the page jumps as images load, which hurts the layout-shift score.', 'Add width and height attributes (or CSS aspect-ratio) to every image.', { urls: where(p => p.images.some(i => i.src && (!i.w || !i.h))) });
  add('images', 'no-lazy', 'low', 'Below-the-fold images are not lazy-loaded', 'Loading every image up front delays the first paint.', 'Add loading="lazy" to images that appear below the fold.', { urls: where(p => p.images.length > 6 && !p.images.some(i => i.loading === 'lazy')) });

  /* ---------- roll up ---------- */
  issues.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || b.ratio - a.ratio);
  const areas = AREAS.map(a => {
    const list = issues.filter(i => i.area === a.id);
    let score = 100 - list.reduce((s, i) => s + SEV_W[i.severity] * Math.pow(Math.min(1, i.ratio), 0.6), 0);
    if (a.id === 'speed' && speed && speed.source === 'psi') score = Math.min(score, 100) * 0.4 + speed.score * 0.6;
    score = Math.round(Math.max(0, Math.min(100, score)));
    return { id: a.id, name: a.name, weight: a.weight, score, issues: list.length, high: list.filter(i => i.severity === 'high').length, estimated: a.id === 'speed' && speedEstimated };
  });
  const wsum = areas.reduce((s, a) => s + a.weight, 0);
  const overall = Math.round(areas.reduce((s, a) => s + a.score * a.weight, 0) / wsum);
  const grade = overall >= 90 ? 'Excellent' : overall >= 70 ? 'Good' : overall >= 50 ? 'Needs work' : 'Poor';
  const avg = k => { const v = H.map(p => p[k]).filter(x => typeof x === 'number'); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0; };

  return {
    url: home.url, host: finalHome.host, scannedAt: new Date().toISOString(), durationMs: Date.now() - startedAt,
    pagesCrawled: pages.length, pagesAnalysed: total, pagesFound: seen.size, maxPages,
    score: overall, grade, areas, issues,
    counts: { high: issues.filter(i => i.severity === 'high').length, medium: issues.filter(i => i.severity === 'medium').length, low: issues.filter(i => i.severity === 'low').length },
    stats: { avgWords: avg('words'), avgResponseMs: avg('ms'), schemaCoverage, imagesChecked: imgInfo.size, https: isHttps, sitemap: sitemapFound, robots: !!robotsTxt, llms },
    speed: speed ? { source: speed.source, score: speed.score, lcp: speed.lcp || null, cls: speed.cls ?? null, tbt: speed.tbt ?? null, fcp: speed.fcp || null } : null,
    notes
  };
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const it = items[i++]; try { await fn(it); } catch { } } }));
}
function friendly(e) {
  const m = {
    ENOTFOUND: "We couldn't find that domain. Check the spelling and try again.",
    EAI_AGAIN: "We couldn't look up that domain right now. Please try again.",
    ECONNREFUSED: 'That server refused our connection.',
    ECONNRESET: 'The connection was reset before the page loaded.',
    ETIMEDOUT: 'The site took too long to respond.',
    EBLOCKED: 'That address can’t be audited. Please use a public website address.',
    EBADURL: e.message, EREDIRECTS: 'The site redirects too many times.',
    CERT_HAS_EXPIRED: 'The site’s SSL certificate has expired.', DEPTH_ZERO_SELF_SIGNED_CERT: 'The site’s SSL certificate is not trusted.',
    ERR_TLS_CERT_ALTNAME_INVALID: 'The site’s SSL certificate does not match its domain.', UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'The site’s SSL certificate could not be verified.'
  };
  return Object.assign(new Error(m[e.code] || 'We couldn’t reach that website. Check the address and try again.'), { code: e.code || 'EFETCH' });
}

module.exports = { runAudit, normalizeInput };
