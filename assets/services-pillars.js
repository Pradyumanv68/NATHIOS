(() => {
  const root = document.documentElement;
  root.classList.add('px-js');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---- hero headline: word-by-word rise ---- */
  const h1 = $('.svc-hero h1');
  if (h1 && !reduce) {
    let w = 0;
    const walk = n => [...n.childNodes].forEach(c => {
      if (c.nodeType === 3) {
        const f = document.createDocumentFragment();
        c.textContent.split(/(\s+)/).forEach(t => {
          if (!t) return;
          if (/^\s+$/.test(t)) { f.append(t); return; }
          const o = document.createElement('span'), i = document.createElement('span');
          o.className = 'px-word'; i.textContent = t; i.style.setProperty('--w', w++);
          o.append(i); f.append(o);
        });
        c.replaceWith(f);
      } else if (c.nodeType === 1 && c.tagName !== 'BR') walk(c);
    });
    walk(h1); h1.classList.add('px-split');
  }

  /* ---- scroll reveal ---- */
  const rv = $$('.px-rv');
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('px-in'); io.unobserve(e.target); }
    }), { threshold: .14, rootMargin: '0px 0px -6% 0px' });
    rv.forEach(el => io.observe(el));
  } else rv.forEach(el => el.classList.add('px-in'));

  /* ---- count-up ---- */
  $$('[data-px-count]').forEach(el => {
    const end = +el.dataset.pxCount;
    if (reduce || !('IntersectionObserver' in window)) return;
    el.textContent = '0';
    new IntersectionObserver((es, o) => {
      if (!es[0].isIntersecting) return;
      o.disconnect();
      const t0 = performance.now();
      (function step(now) {
        const p = clamp((now - t0) / 1500, 0, 1);
        el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      })(t0);
    }, { threshold: .6 }).observe(el);
  });

  /* ---- mega panel (tabs, hover, keyboard, auto-cycle) ---- */
  const CYCLE = 6000;
  function initMega(mega, auto) {
    const tabs = $$('.px-tab', mega), panels = $$('.px-panel', mega), ind = $('.px-tab-ind', mega);
    let cur = 0, timer = 0, paused = false, stopped = !auto || reduce, inView = true;
    mega.style.setProperty('--px-cycle', CYCLE + 'ms');
    const moveInd = () => {
      const t = tabs[cur];
      if (!ind || !t) return;
      ind.style.transform = `translateY(${t.offsetTop}px)`; ind.style.height = t.offsetHeight + 'px';
    };
    const schedule = () => {
      clearTimeout(timer);
      tabs.forEach(t => t.classList.remove('px-run'));
      if (stopped) return;
      void tabs[cur].offsetWidth; tabs[cur].classList.add('px-run');
      timer = setTimeout(function tick() {
        if (paused || !inView || document.hidden) { timer = setTimeout(tick, 500); tabs[cur].classList.remove('px-run'); return; }
        set((cur + 1) % tabs.length);
      }, CYCLE);
    };
    function set(i) {
      cur = i;
      tabs.forEach((t, k) => { t.classList.toggle('is-active', k === i); t.setAttribute('aria-selected', k === i); t.tabIndex = k === i ? 0 : -1; });
      panels.forEach((p, k) => { p.hidden = k !== i; });
      moveInd(); schedule();
      if (window.innerWidth <= 980) tabs[i].scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
    const userSet = i => { stopped = true; set(i); };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => userSet(i));
      t.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && i !== cur) userSet(i); });
      t.addEventListener('keydown', e => {
        const k = e.key, n = tabs.length;
        const to = k === 'ArrowDown' || k === 'ArrowRight' ? (i + 1) % n : k === 'ArrowUp' || k === 'ArrowLeft' ? (i - 1 + n) % n : k === 'Home' ? 0 : k === 'End' ? n - 1 : -1;
        if (to < 0) return; e.preventDefault(); userSet(to); tabs[to].focus();
      });
    });
    mega.addEventListener('pointerenter', () => paused = true);
    mega.addEventListener('pointerleave', () => paused = false);
    if (auto && 'IntersectionObserver' in window) {
      new IntersectionObserver(es => { inView = es[0].isIntersecting; if (inView) mega.classList.add('px-on'); }, { threshold: .35 }).observe(mega);
    } else mega.classList.add('px-on');
    addEventListener('resize', moveInd);
    document.fonts && document.fonts.ready.then(moveInd);
    moveInd(); schedule();
    return { sync: moveInd };
  }
  const mainMega = $('.px-mega-main');
  if (mainMega) initMega(mainMega, true);

  /* ---- sticky bar + services dropdown ---- */
  const bar = $('#pxBar'), btn = $('#pxBarSvc'), drop = $('#pxDrop');
  let dropApi = null;
  if (bar && btn && drop && mainMega) {
    const clone = mainMega.cloneNode(true);
    clone.classList.remove('px-mega-main'); clone.classList.add('px-on');
    $$('[data-px-count]', clone).forEach(n => { n.textContent = n.dataset.pxCount; n.removeAttribute('data-px-count'); });
    drop.append(clone);
    dropApi = initMega(clone, false);
    const setOpen = o => {
      drop.classList.toggle('is-open', o); btn.setAttribute('aria-expanded', o); drop.setAttribute('aria-hidden', !o);
      if (o) dropApi.sync();
    };
    btn.addEventListener('click', e => { e.stopPropagation(); setOpen(!drop.classList.contains('is-open')); });
    document.addEventListener('click', e => { if (!bar.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { setOpen(false); btn.focus(); } });
    drop.addEventListener('click', e => { if (e.target.closest('a')) setOpen(false); });
    $('.px-chips', bar).addEventListener('click', () => setOpen(false));
  }

  /* ---- hover spotlight on rows + magnetic buttons ---- */
  if (fine) {
    $$('.px-row').forEach(r => r.addEventListener('pointermove', e => {
      const b = r.getBoundingClientRect();
      r.style.setProperty('--mx', (e.clientX - b.left) + 'px'); r.style.setProperty('--my', (e.clientY - b.top) + 'px');
    }, { passive: true }));
    if (!reduce) $$('.px-btn, .svc-button, .px-bar-cta').forEach(el => {
      el.addEventListener('pointermove', e => {
        const b = el.getBoundingClientRect();
        el.style.translate = `${(e.clientX - b.left - b.width / 2) * .22}px ${(e.clientY - b.top - b.height / 2) * .32}px`;
      });
      el.addEventListener('pointerleave', () => el.style.translate = '');
    });
  }

  /* ---- scroll-linked: progress bar, parallax, ghost numbers, scroll-spy ---- */
  const prog = $('.px-progress'), hero = $('.svc-hero'), photo = $('.svc-hero-photo');
  const pillars = $$('[data-pillar]'), chips = $$('.px-chips a'), chipWrap = $('.px-chips'), chipInd = $('.px-chip-ind');
  let ticking = false, activeSlug = null;
  const placeInd = () => {
    const a = chips.find(c => c.classList.contains('on'));
    if (!a || !chipInd) { chipWrap && chipWrap.style.setProperty('--io', 0); return; }
    chipWrap.style.setProperty('--ix', a.offsetLeft + 13 + 'px');
    chipWrap.style.setProperty('--iw', a.offsetWidth - 26 + 'px');
    chipWrap.style.setProperty('--io', 1);
    if (chipWrap.scrollWidth > chipWrap.clientWidth) chipWrap.scrollTo({ left: a.offsetLeft - 40, behavior: 'smooth' });
  };
  function frame() {
    ticking = false;
    const y = scrollY, vh = innerHeight, max = document.documentElement.scrollHeight - vh;
    if (prog) prog.style.setProperty('--sp', max > 0 ? clamp(y / max, 0, 1) : 0);
    if (hero) {
      const hb = hero.offsetHeight;
      if (photo && !reduce && y < hb * 1.2) photo.style.translate = `0 ${y * .18}px`;
      if (bar) bar.classList.toggle('is-on', y > hb * .7);
    }
    let cur = null;
    pillars.forEach(s => {
      const r = s.getBoundingClientRect();
      s.style.setProperty('--p', clamp((vh * .78 - r.top) / (r.height * .72), 0, 1).toFixed(3));
      s.style.setProperty('--py', clamp((vh - r.top) / (vh + r.height), 0, 1).toFixed(3));
      if (r.top <= vh * .4 && r.bottom > vh * .4) cur = s.id.replace('pillar-', '');
    });
    if (cur !== activeSlug) {
      activeSlug = cur;
      chips.forEach(c => c.classList.toggle('on', c.dataset.spy === cur));
      placeInd();
    }
  }
  const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
  addEventListener('scroll', req, { passive: true });
  addEventListener('resize', () => { req(); placeInd(); });
  frame();
})();
