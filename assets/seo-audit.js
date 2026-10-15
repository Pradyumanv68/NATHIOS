/* NATHIOS — Free SEO audit (front end). Talks to server/server.js:
   POST {API}/api/audit  → {id}      GET {API}/api/audit/:id → {status, progress, report, error} */
(() => {
  const API = (window.NATHIOS_AUDIT_API || '').replace(/\/$/, '');
  const EMAIL = 'nathios.tech@gmail.com', WA = '917701865629';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeHref = u => /^https?:\/\//i.test(u) ? esc(u) : '#';
  const ARW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M8 7h9v9"/></svg>';
  const CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

  /* ---------- scroll reveal, FAQ ---------- */
  const rv = $$('.sa-rv');
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('sa-in'); io.unobserve(e.target); } }), { threshold: .15, rootMargin: '0px 0px -6% 0px' });
    rv.forEach(el => io.observe(el));
  } else rv.forEach(el => el.classList.add('sa-in'));
  $$('.sa-faq-q').forEach(b => b.addEventListener('click', () => {
    const it = b.parentElement, open = !it.classList.contains('open');
    it.classList.toggle('open', open); b.setAttribute('aria-expanded', open);
  }));

  /* ---------- elements ---------- */
  const form = $('#saForm'), input = $('#saUrl'), go = $('#saGo'), err = $('#saError');
  const runEl = $('#saRun'), repEl = $('#saReport'), repBody = $('#saReportBody');
  if (!form) return;
  let token = 0, timer = 0, clock = 0, shown = 0, target = 0, raf = 0;

  const showError = (html) => { err.innerHTML = html; err.hidden = false; };
  const clearError = () => { err.hidden = true; err.textContent = ''; };
  const busy = on => { go.disabled = on; input.readOnly = on; go.firstElementChild.textContent = on ? 'Auditing…' : 'Audit my site'; };
  const fmtTime = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  const scrollTo = el => el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  const hostOf = v => { try { return new URL(/^https?:\/\//i.test(v) ? v : 'https://' + v).host; } catch { return v; } };

  /* ---------- run ---------- */
  form.addEventListener('submit', e => { e.preventDefault(); start(input.value); });
  $('#saCancel').addEventListener('click', () => { token++; stopTimers(); runEl.hidden = true; busy(false); clearError(); input.focus(); });

  function stopTimers() { clearTimeout(timer); clearInterval(clock); cancelAnimationFrame(raf); }

  function setProgress(p) {
    target = p.pct || 0;
    $('#saMsg').textContent = p.message || '';
    $('#saFound').textContent = p.pagesFound || 0; $('#saDone').textContent = p.pagesCrawled || 0;
    const order = ['discover', 'crawl', 'images', 'speed', 'analyze'];
    const cur = Math.max(0, order.indexOf(p.stage === 'links' ? 'images' : p.stage));
    $$('#saSteps li').forEach((li, i) => { li.classList.toggle('done', i < cur || p.stage === 'done'); li.classList.toggle('on', i === cur && p.stage !== 'done'); });
    const t = $('#saTicker'), have = t.children.length, rec = p.recent || [];
    if (rec.length && t.dataset.last !== rec[rec.length - 1]) {
      t.dataset.last = rec[rec.length - 1];
      rec.slice(-3).forEach(u => { const li = document.createElement('li'); li.textContent = u; t.appendChild(li); });
      while (t.children.length > 6) t.removeChild(t.firstChild);
    }
  }
  function tickPct() {
    shown += (target - shown) * .08; if (Math.abs(target - shown) < .05) shown = target;
    $('#saPct').textContent = Math.round(shown);
    $('#saBar').style.setProperty('--p', (shown / 100).toFixed(3));
    $('#saProg').setAttribute('aria-valuenow', Math.round(shown));
    raf = requestAnimationFrame(tickPct);
  }

  async function start(raw) {
    raw = (raw || '').trim(); clearError();
    if (!raw) { showError('Enter your website address, for example <b>yourwebsite.com</b>.'); input.focus(); return; }
    if (/\s/.test(raw) || !/[.:]/.test(raw)) { showError('That doesn’t look like a website address. Try something like <b>yourwebsite.com</b>.'); input.focus(); return; }
    const my = ++token; stopTimers(); busy(true);
    repEl.hidden = true; repBody.innerHTML = '';
    $('#saTicker').innerHTML = ''; delete $('#saTicker').dataset.last;
    shown = 0; target = 1; $('#saRunHost').textContent = hostOf(raw);
    setProgress({ pct: 1, message: 'Starting…', stage: 'discover' });
    runEl.hidden = false; scrollTo(runEl);
    const t0 = Date.now(); $('#saTime').textContent = '0:00';
    clock = setInterval(() => $('#saTime').textContent = fmtTime(Math.round((Date.now() - t0) / 1000)), 1000);
    tickPct();

    let id;
    try {
      const r = await fetch(API + '/api/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: raw }) });
      const j = await r.json().catch(() => ({}));
      if (my !== token) return;
      if (!r.ok) return fail(j.error || 'Something went wrong. Please try again.');
      id = j.id;
    } catch {
      if (my !== token) return;
      return fail(`The audit service isn’t reachable right now. Please try again in a moment, or <a href="mailto:${EMAIL}?subject=${encodeURIComponent('Free SEO audit request: ' + hostOf(raw))}">email us</a> and we’ll run it for you.`);
    }
    let misses = 0;
    const poll = async () => {
      if (my !== token) return;
      try {
        const r = await fetch(API + '/api/audit/' + id, { cache: 'no-store' });
        const j = await r.json(); misses = 0;
        if (my !== token) return;
        if (r.status === 404) return fail(j.error || 'This audit has expired. Please run it again.');
        if (j.status === 'error') return fail(j.error);
        if (j.status === 'done') { setProgress({ ...j.progress, pct: 100 }); target = 100; return setTimeout(() => done(j.report, my), 900); }
        setProgress(j.progress);
      } catch { if (++misses > 6) return fail('We lost the connection to the audit service. Please try again.'); }
      timer = setTimeout(poll, 1100);
    };
    poll();
  }

  function fail(msg) { token++; stopTimers(); runEl.hidden = true; busy(false); showError(msg); scrollTo($('#top')); }

  function done(report, my) {
    if (my !== token) return;
    stopTimers(); busy(false); runEl.hidden = true;
    render(report); repEl.hidden = false; scrollTo(repEl);
    requestAnimationFrame(() => requestAnimationFrame(animateReport));
  }

  /* ---------- report ---------- */
  const gradeClass = s => s >= 90 ? 'g-excellent' : s >= 70 ? 'g-good' : s >= 50 ? 'g-needs' : 'g-poor';
  const barColor = s => s >= 90 ? '#3ddc97' : s >= 70 ? '#5b8bff' : s >= 50 ? '#ffb454' : '#ff6b6b';
  const vital = (v, good, bad, fmt) => v == null ? ['–', ''] : [fmt(v), v <= good ? 'q-good' : v <= bad ? 'q-ok' : 'q-bad'];

  function render(r) {
    const c = r.counts, gc = gradeClass(r.score);
    const summary = c.high ? `We found ${c.high} high-priority issue${c.high > 1 ? 's' : ''} that ${c.high > 1 ? 'are' : 'is'} most likely costing you rankings. Start there.`
      : c.medium ? 'No critical problems. A handful of medium-priority fixes would lift your score.' : 'Your site is in good shape. Only small improvements remain.';
    const when = new Date(r.scannedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    const sp = r.speed && r.speed.source === 'psi' ? r.speed : null;
    const speedHtml = sp ? (() => {
      const l = vital(sp.lcp, 2500, 4000, v => (v / 1000).toFixed(1) + ' s'), cl = vital(sp.cls, .1, .25, v => v.toFixed(2)), t = vital(sp.tbt, 200, 600, v => Math.round(v) + ' ms'), f = vital(sp.fcp, 1800, 3000, v => (v / 1000).toFixed(1) + ' s');
      const sc = sp.score >= 90 ? 'q-good' : sp.score >= 50 ? 'q-ok' : 'q-bad';
      return `<div class="sa-speed" aria-label="Mobile speed details"><div><span>Lighthouse mobile score</span><b class="${sc}">${sp.score}</b><small>Google PageSpeed Insights</small></div><div><span>Largest Contentful Paint</span><b class="${l[1]}">${l[0]}</b><small>Target under 2.5 s</small></div><div><span>Layout shift (CLS)</span><b class="${cl[1]}">${cl[0]}</b><small>Target under 0.1</small></div><div><span>Total Blocking Time</span><b class="${t[1]}">${t[0]}</b><small>Target under 200 ms</small></div></div>`;
    })() : '';
    const areaOpts = r.areas.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
    const topIssues = r.issues.slice(0, 3).map(i => '• ' + i.title).join('\n');
    const msg = `Hi Nathios, I ran the free SEO audit on ${r.host} and scored ${r.score}/100 (${r.grade}). Top issues:\n${topIssues}\n\nCan you help fix these?`;
    repBody.innerHTML = `
    <div class="sa-print-head"><span>NATHIOS · SEO audit</span><span>${esc(r.host)} · ${esc(when)}</span></div>
    <div class="sa-rep">
      <div class="sa-rep-top"><div><span class="sa-kicker">YOUR SEO AUDIT</span><h2>${esc(r.host)}</h2><p>${esc(when)} · ${r.pagesAnalysed} page${r.pagesAnalysed === 1 ? '' : 's'} analysed${r.pagesFound > r.pagesCrawled ? ` of ${r.pagesFound} found` : ''} · ${Math.round(r.durationMs / 1000)} s</p></div>
        <div class="sa-rep-actions"><button type="button" class="sa-btn sa-btn-ghost" id="saPrint">Download PDF</button><button type="button" class="sa-btn sa-btn-ghost" id="saAgain">Audit another site</button></div></div>
      <div class="sa-score ${gc}">
        <div class="sa-ring"><svg viewBox="0 0 200 200" aria-hidden="true"><circle class="t" cx="100" cy="100" r="88"/><circle class="v" cx="100" cy="100" r="88" data-score="${r.score}"/></svg><div class="sa-ring-c"><b id="saScoreNum">0</b><span>OUT OF 100</span></div></div>
        <div class="sa-score-copy"><span class="sa-pill">${esc(r.grade.toUpperCase())}</span><h3>${esc(summary)}</h3><p>Your score blends seven weighted areas. Open any issue below to see why it matters, how to fix it and which pages are affected.</p>
          <div class="sa-counts"><span class="c-high"><b>${c.high}</b>High</span><span class="c-medium"><b>${c.medium}</b>Medium</span><span class="c-low"><b>${c.low}</b>Low</span></div></div>
      </div>
      <div class="sa-areas" role="list">${r.areas.map((a, i) => `<button type="button" class="sa-area" role="listitem" data-area="${a.id}" title="Show ${esc(a.name)} issues"><span class="sa-area-name">${esc(a.name)}${a.estimated ? '<span class="sa-est">ESTIMATED</span>' : ''}</span><span class="sa-area-bar"><i style="--i:${i};--bc:${barColor(a.score)}" data-s="${a.score}"></i></span><span class="sa-area-score" style="color:${barColor(a.score)}">${a.score}</span><span class="sa-area-n">${a.issues} issue${a.issues === 1 ? '' : 's'}</span></button>`).join('')}</div>
      ${speedHtml}
      <div class="sa-issues-head"><h3>Your fix list</h3><div class="sa-filters"><button class="sa-chip on" data-sev="all">All ${r.issues.length}</button><button class="sa-chip" data-sev="high">High ${c.high}</button><button class="sa-chip" data-sev="medium">Medium ${c.medium}</button><button class="sa-chip" data-sev="low">Low ${c.low}</button><select id="saArea" aria-label="Filter by area"><option value="all">All areas</option>${areaOpts}</select></div></div>
      <div id="saIssues"></div>
      ${r.notes.length ? `<div class="sa-notes">${r.notes.map(esc).join('<br>')}</div>` : ''}
      <div class="sa-fix"><div><h3>Want us to fix this for you?</h3><p>Send us this report and our SEO team will turn it into a prioritised plan, with no obligation.</p></div>
        <div class="sa-fix-row"><a class="sa-btn" href="mailto:${EMAIL}?subject=${encodeURIComponent('SEO audit fixes for ' + r.host + ' (score ' + r.score + ')')}&body=${encodeURIComponent(msg)}">Email the team ${ARW}</a><a class="sa-btn sa-btn-ghost" target="_blank" rel="noopener" href="https://wa.me/${WA}?text=${encodeURIComponent(msg)}">WhatsApp us</a></div></div>
    </div>`;

    const state = { sev: 'all', area: 'all' };
    const list = $('#saIssues');
    const draw = () => {
      const items = r.issues.filter(i => (state.sev === 'all' || i.severity === state.sev) && (state.area === 'all' || i.area === state.area));
      const names = Object.fromEntries(r.areas.map(a => [a.id, a.name]));
      list.innerHTML = items.length ? items.map((i, n) => {
        const meta = i.site ? 'Site-wide' : `${i.count} of ${i.total} ${i.detail && /Image/.test(i.detail) ? 'images' : 'pages'}`;
        const pages = i.pages.length ? `<div class="sa-pages"><b>AFFECTED ${/Image/.test(i.detail || '') ? 'FILES' : 'PAGES'}</b><ul>${i.pages.map(u => `<li><a href="${safeHref(u)}" target="_blank" rel="noopener noreferrer">${esc(u.replace(/^https?:\/\//, ''))}</a></li>`).join('')}${i.count > i.pages.length ? `<li><em>+ ${i.count - i.pages.length} more</em></li>` : ''}</ul></div>` : '';
        return `<article class="sa-issue" style="--i:${Math.min(n, 12)}"><button type="button" class="sa-issue-head" aria-expanded="false"><span class="sa-sev sev-${i.severity}">${i.severity}</span><span class="sa-issue-title">${esc(i.title)}</span><span class="sa-issue-meta">${esc(meta)} · ${esc(names[i.area])}</span>${CHEV}</button><div class="sa-issue-body"><div><div class="sa-issue-in"><p><b>WHY IT MATTERS</b>${esc(i.why)}</p><p><b>HOW TO FIX IT</b>${esc(i.fix)}</p>${i.detail && !/^Image/.test(i.detail) ? `<p><b>NOTE</b>${esc(i.detail)}</p>` : ''}${pages}</div></div></div></article>`;
      }).join('') : '<div class="sa-empty">No issues in this view. Nice work.</div>';
    };
    draw();
    list.addEventListener('click', e => { const h = e.target.closest('.sa-issue-head'); if (!h) return; const a = h.parentElement, o = !a.classList.contains('open'); a.classList.toggle('open', o); h.setAttribute('aria-expanded', o); });
    $$('.sa-chip', repBody).forEach(b => b.addEventListener('click', () => { state.sev = b.dataset.sev; $$('.sa-chip', repBody).forEach(x => x.classList.toggle('on', x === b)); draw(); }));
    $('#saArea').addEventListener('change', e => { state.area = e.target.value; draw(); });
    $$('.sa-area', repBody).forEach(b => b.addEventListener('click', () => { state.area = b.dataset.area; $('#saArea').value = state.area; draw(); scrollTo($('.sa-issues-head', repBody)); }));
    $('#saPrint').addEventListener('click', () => {
      $$('.sa-issue', repBody).forEach(a => a.classList.add('open'));
      const t = document.title; document.title = 'SEO audit - ' + r.host; window.print(); document.title = t;
    });
    $('#saAgain').addEventListener('click', () => { repEl.hidden = true; input.value = ''; scrollTo($('#top')); setTimeout(() => input.focus(), 500); });
    repBody._score = r.score;
  }

  function animateReport() {
    const score = repBody._score || 0, circ = 553;
    const v = $('.sa-ring .v', repBody); if (v) v.style.strokeDashoffset = circ - circ * score / 100;
    $$('.sa-area-bar i', repBody).forEach(i => i.style.transform = `scaleX(${i.dataset.s / 100})`);
    const n = $('#saScoreNum'); if (!n) return;
    if (reduce) { n.textContent = score; return; }
    const t0 = performance.now();
    (function step(now) { const p = Math.min(1, (now - t0) / 1800); n.textContent = Math.round(score * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); })(t0);
  }

  /* ---------- deep link: seo-audit.html?url=example.com&run=1 ---------- */
  const q = new URLSearchParams(location.search), pre = q.get('url');
  if (pre) { input.value = pre; if (q.get('run') === '1') setTimeout(() => start(pre), 400); }
})();
