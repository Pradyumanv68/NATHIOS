document.documentElement.classList.add('js');
(() => {
  const CONTACT_EMAIL = 'nathios.tech@gmail.com';
  const WHATSAPP_NUMBER = '917701865629';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const sleep = ms => new Promise(r => setTimeout(r, reduce ? 0 : ms));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  $$('[data-mail]').forEach(a => a.href = 'mailto:' + CONTACT_EMAIL);

  /* ---------- nav ---------- */
  const navEl = $('#nav');
  if (navEl) {
    addEventListener('scroll', () => navEl.classList.toggle('scrolled', scrollY > 20), { passive: true });
  }
  const menuBtn = $('#menuBtn'), links = $('#links');
  if (menuBtn && links) {
    menuBtn.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', open);
    });
    links.addEventListener('click', e => { if (e.target.closest('a')) { links.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); } });
  }
  /* scroll-spy only matters on the homepage, which has in-page sections */
  const navLinks = $$('.links a');
  const spyTargets = ['home', 'services', 'process', 'zor'].map(id => document.getElementById(id)).filter(Boolean);
  if (spyTargets.length) {
    const spy = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) navLinks.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id));
    }), { rootMargin: '-45% 0px -50% 0px' });
    spyTargets.forEach(t => spy.observe(t));
  }

  /* ---------- card spotlight ---------- */
  $$('.spot, .svc').forEach(c => c.addEventListener('pointermove', e => {
    const r = c.getBoundingClientRect();
    c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    c.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true }));

  /* ---------- reveal on scroll ---------- */
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 });
  $$('.rv').forEach(el => io.observe(el));
  const stepsEl = $('#steps');
  if (stepsEl) new IntersectionObserver((es, o) => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('go'); o.unobserve(e.target); } }), { threshold: .3 }).observe(stepsEl);

  /* ---------- counters ---------- */
  $$('[data-count]').forEach(el => {
    const end = +el.dataset.count, suf = el.dataset.suffix || '';
    const obs = new IntersectionObserver((es, o) => {
      if (!es[0].isIntersecting) return;
      o.disconnect();
      if (reduce) { el.textContent = end + suf; return; }
      const t0 = performance.now();
      (function step(now) {
        const p = clamp((now - t0) / 1400, 0, 1), e = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(end * e) + suf;
        if (p < 1) requestAnimationFrame(step);
      })(t0);
    }, { threshold: .4 });
    obs.observe(el);
  });

  /* ---------- reference background parallax ---------- */
  if (!reduce) {
    let bgTick = false;
    addEventListener('pointermove', e => {
      if (bgTick) return;
      bgTick = true;
      requestAnimationFrame(() => {
        const x = ((e.clientX / innerWidth) - .5) * 1.6;
        const y = ((e.clientY / innerHeight) - .5) * 1.2;
        document.documentElement.style.setProperty('--flux-x', x + '%');
        document.documentElement.style.setProperty('--flux-y', y + '%');
        bgTick = false;
      });
    }, { passive: true });
  }

  /* ---------- particle background ---------- */
  const cv = $('#bg');
  if (cv) {
    const ctx = cv.getContext('2d');
    let W, H, parts = [];
    function sizeCanvas() {
      const d = Math.min(devicePixelRatio || 1, 2);
      W = innerWidth; H = innerHeight;
      cv.width = W * d; cv.height = H * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      const n = clamp(Math.floor(W / 22), 24, 70);
      parts = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .28, vy: (Math.random() - .5) * .28, r: Math.random() * 1.6 + .5 }));
    }
    function drawBg() {
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        if (!reduce) { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1; }
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fillStyle = 'rgba(150,190,255,.55)'; ctx.fill();
      }
      for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i], b = parts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 120) { ctx.strokeStyle = `rgba(60,120,255,${(1 - d / 120) * .24})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      }
      if (!reduce) requestAnimationFrame(drawBg);
    }
    sizeCanvas(); drawBg();
    let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { sizeCanvas(); if (reduce) drawBg(); }, 150); });
  }

  /* ---------- marquee ---------- */
  const marq = $('#marq');
  if (marq) {
    const stack = ['React', 'Next.js', 'Flutter', 'Swift', 'Kotlin', 'Node.js', 'Python', 'Shopify', 'Firebase', 'AWS', 'OpenAI', 'WhatsApp API'];
    marq.innerHTML = [...stack, ...stack].map(s => `<span>${s}</span>`).join('');
  }

  /* ---------- punchline ticker bars (reusable, any page) ---------- */
  document.querySelectorAll('.punch-marq').forEach(el => {
    const inner = el.querySelector('.punch-marq-in');
    if (!inner) return;
    const items = (el.dataset.items || '').split('•').map(s => s.trim()).filter(Boolean);
    if (!items.length) return;
    inner.innerHTML = [...items, ...items].map(s => `<span>${s}</span>`).join('');
  });


  /* ---------- pricing data + logic (pricing page only) ---------- */
  const PLANS = {
    web: [
      { name: 'Starter', tag: 'For new businesses that need a strong first site.', inr: 24999, usd: 299, per: 'one-time', time: '2 weeks',
        feats: ['Up to 5 custom-designed pages', 'Responsive on every device', 'Contact form and chat button', 'Basic on-page SEO', 'Google Analytics setup', '2 rounds of revisions'] },
      { name: 'Business', pop: true, tag: 'For growing companies that publish and sell.', inr: 64999, usd: 799, per: 'one-time', time: '3 to 4 weeks',
        feats: ['Up to 12 pages with a CMS', 'Blog and lead-capture forms', 'Scroll and hover animations', 'Speed and SEO optimisation', 'Multi-language ready', '4 rounds of revisions'] },
      { name: 'Premium', tag: 'For custom platforms, portals and stores.', inr: 149999, usd: 1799, per: 'one-time', time: '6 to 8 weeks',
        feats: ['Custom web app or online store', 'User accounts and dashboards', 'Payment gateway integration', 'API and third-party integrations', 'Admin panel', '60 days of priority support'] }
    ],
    app: [
      { name: 'MVP', tag: 'Test your idea on one platform, fast.', inr: 199000, usd: 2400, per: 'one-time', time: '6 weeks',
        feats: ['iOS or Android', 'Up to 8 screens', 'Login and user profiles', 'Backend and database', 'Store publishing', '30 days of bug fixes'] },
      { name: 'Growth', pop: true, tag: 'Both platforms, with everything to grow.', inr: 449000, usd: 5400, per: 'one-time', time: '10 to 12 weeks',
        feats: ['iOS and Android from one codebase', 'Up to 20 screens', 'Payments and push notifications', 'Admin panel', 'Analytics and crash reports', '60 days of support'] },
      { name: 'Scale', custom: true, tag: 'For complex products and larger teams.', time: 'Scoped with you',
        feats: ['Dedicated design and dev team', 'Custom architecture', 'AI features and real-time sync', 'Security review', 'Load testing', 'Service-level agreement'] }
    ],
    ai: [
      { name: 'Chatbot Lite', tag: 'A website chatbot that answers common questions.', inr: 34999, usd: 420, per: 'one-time setup', time: '1 to 2 weeks',
        feats: ['Trained on your FAQs and pages', 'Website chat widget', 'Lead capture', 'Branded look and feel', 'Monthly conversation report', 'Handover to email'] },
      { name: 'Assistant', pop: true, tag: 'A smarter assistant across web and WhatsApp.', inr: 94999, usd: 1150, per: 'one-time setup', time: '3 to 4 weeks',
        feats: ['Everything in Lite', 'WhatsApp Business integration', 'Order and booking lookups', 'Multi-language replies', 'Human handover', 'Priority support'] },
      { name: 'Enterprise AI', custom: true, tag: 'Deep integrations across your stack.', time: 'Scoped with you',
        feats: ['Custom data and CRM integrations', 'Voice and multi-channel support', 'Advanced analytics', 'Dedicated fine-tuning', 'SLA and uptime guarantee', 'Ongoing optimisation'] }
    ]
  };
  const ADDONS = [
    ['Logo and brand kit', 14999, 180],
    ['SEO launch pack', 9999, 120],
    ['Copywriting, per page', 1500, 18],
    ['Extra language', 7999, 95],
    ['Payment gateway setup', 6999, 85],
    ['App Store and Play Store publishing', 8999, 110],
    ['Analytics dashboard', 11999, 145],
    ['Monthly care plan', 4999, 60, '/mo']
  ];
  const state = { tab: 'web', cur: 'INR' };
  const money = (inr, usd) => state.cur === 'INR' ? '₹' + inr.toLocaleString('en-IN') : '$' + usd.toLocaleString('en-US');
  const fromPlan = p => money(p.inr, p.usd);

  const plansEl = $('#plans');
  if (plansEl) {
    function tween(el) {
      const end = state.cur === 'INR' ? +el.dataset.inr : +el.dataset.usd;
      const fmt = v => state.cur === 'INR' ? '₹' + Math.round(v).toLocaleString('en-IN') : '$' + Math.round(v).toLocaleString('en-US');
      if (reduce) { el.textContent = fmt(end); return; }
      const t0 = performance.now();
      (function s(now) {
        const p = clamp((now - t0) / 800, 0, 1), e = 1 - Math.pow(1 - p, 4);
        el.textContent = fmt(end * e);
        if (p < 1) requestAnimationFrame(s);
      })(t0);
    }
    function renderPlans() {
      const kind = state.tab;
      plansEl.innerHTML = PLANS[kind].map((p, i) => `
        <article class="plan ${p.pop ? 'pop' : ''}" style="--d:${i * 90}ms">
          ${p.pop ? '<span class="badge">Most chosen</span>' : ''}
          <h3>${p.name}</h3>
          <p class="tag">${p.tag}</p>
          <div class="price">
            ${p.custom ? '<span class="amt">Custom</span><span class="per">quoted after a call</span>'
                       : `<span class="amt" data-inr="${p.inr}" data-usd="${p.usd}"></span><span class="per">${p.per}</span>`}
          </div>
          <p class="time">Delivery: ${p.time}</p>
          <ul>${p.feats.map(f => `<li>${f}</li>`).join('')}</ul>
          <a href="contact.html#form" class="btn ${p.pop ? 'primary' : ''} block" data-plan="${p.name}" data-kind="${kind}">${p.custom ? 'Talk to us' : 'Choose ' + p.name}</a>
        </article>`).join('');
      $$('#plans .amt[data-inr]').forEach(tween);
    }
    function renderAddons() {
      const a = $('#addons'); if (!a) return;
      a.innerHTML = ADDONS.map(x => `<li><span>${x[0]}</span><b>${money(x[1], x[2])}${x[3] || ''}</b></li>`).join('');
    }
    $('#tabs').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      state.tab = b.dataset.tab;
      $$('#tabs button').forEach(x => x.setAttribute('aria-pressed', x === b));
      renderPlans();
    });
    $('#cur').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      state.cur = b.dataset.cur;
      $$('#cur button').forEach(x => x.setAttribute('aria-pressed', x === b));
      renderPlans(); renderAddons();
    });
    renderPlans(); renderAddons();
  }

  /* ---------- talking state (used by hero + Zor window) ---------- */
  let talkCount = 0;
  const avatar = $('#avatar');
  function talk(on) {
    talkCount = Math.max(0, talkCount + (on ? 1 : -1));
    if (avatar) avatar.classList.toggle('talk', talkCount > 0);
  }

  async function say(log, role, text, actions) {
    const el = document.createElement('div');
    el.className = 'msg ' + role;
    log.appendChild(el);
    const keep = () => { log.scrollTop = log.scrollHeight; };
    if (role === 'user') { el.textContent = text; keep(); return el; }
    el.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
    keep();
    await sleep(700);
    el.textContent = '';
    talk(true);
    if (reduce) el.textContent = text;
    else for (let i = 0; i < text.length; i++) {
      el.textContent += text[i];
      if (i % 4 === 0) keep();
      await sleep(15);
    }
    talk(false);
    if (actions && actions.length) {
      const box = document.createElement('div');
      box.className = 'acts';
      actions.forEach(a => {
        const l = document.createElement('a');
        l.href = a[1]; l.textContent = a[0];
        box.appendChild(l);
      });
      el.appendChild(box);
    }
    keep();
    return el;
  }

  /* ---------- hero mini-chat loop (home page) ---------- */
  const hlog = $('#hlog');
  if (hlog) {
    const stage = $('#stage');
    let heroVisible = true;
    if (stage) new IntersectionObserver(e => { heroVisible = e[0].isIntersecting; }, { threshold: .15 }).observe(stage);
    const waitVisible = async () => { while (!heroVisible) await sleep(400); };
    async function heroLoop() {
      while (true) {
        hlog.innerHTML = '';
        const script = [
          ['user', 'I need a booking app for my clinic.'],
          ['bot', 'Got it. Appointments, reminders and UPI payments. A first version can ship in about 6 weeks.'],
          ['user', 'What will it cost?'],
          ['bot', 'Apps start at ' + fromPlan(PLANS.app[0]) + '. Want a full estimate in two minutes?']
        ];
        for (const [role, text] of script) {
          await waitVisible();
          if (role === 'user') await sleep(900);
          await say(hlog, role, text);
          if (reduce) break;
          await sleep(role === 'bot' ? 1300 : 500);
        }
        if (reduce) return;
        await sleep(3800);
      }
    }
    heroLoop();
  }

  /* ---------- Zor chat (contact page) ---------- */
  const wlog = $('#wlog');
  if (wlog) {
    const MAIL = ['Email the team', 'mailto:' + CONTACT_EMAIL];
    const KB = [
      { k: /^\s*(hi|hello|hey|hii|namaste|vanakkam)\b/i, a: () => ["Hi, I'm Zor. I can help you scope a website, an app or an AI chatbot. What are you planning?", [['See pricing', 'pricing.html']]] },
      { k: /(how long|timeline|deadline|weeks|days|duration|take time|delivery|when)/i, a: () => ['A five-page website takes about 2 weeks. An app MVP takes about 6 weeks, a two-platform app 10 to 12. AI chatbots take 1 to 4 weeks depending on how much they need to know.', [['See the process', 'services.html#process']]] },
      { k: /(price|cost|pricing|budget|quote|how much|rate|charge|fees?)/i, a: () => [`Websites start at ${fromPlan(PLANS.web[0])}, mobile apps at ${fromPlan(PLANS.app[0])} and AI chatbots at ${fromPlan(PLANS.ai[0])}. Every plan has a fixed scope, so the price will not change halfway.`, [['Compare plans', 'pricing.html']]] },
      { k: /(\bai\b|chatbot|chat bot|gpt|llm|assistant|automation|whatsapp bot)/i, a: () => [`Yes. We train chatbots on your pages, FAQs and documents, then deploy them on your website or WhatsApp. They can capture leads, check order status and hand over to your team. Plans start at ${fromPlan(PLANS.ai[0])}.`, [['AI plans', 'pricing.html']]] },
      { k: /(app|mobile|ios|android|iphone|flutter|native|play store|app store)/i, a: () => [`We build iOS and Android apps from one codebase using Flutter or React Native, then publish them to both stores. An MVP starts at ${fromPlan(PLANS.app[0])}.`, [['App plans', 'pricing.html']]] },
      { k: /(website|web site|web|landing|site|shop|store|ecommerce|e-commerce|shopify)/i, a: () => [`We build custom, fast websites and online stores with React and Next.js, or Shopify if you prefer. Sites start at ${fromPlan(PLANS.web[0])} for up to five pages.`, [['Website plans', 'pricing.html']]] },
      { k: /(tech|stack|react|next|node|python|framework|language|built with)/i, a: () => ['Our main tools are React, Next.js, Flutter, React Native, Node.js and Python, with AWS or Firebase behind them. We choose the stack that fits your product, not the other way around.'] },
      { k: /(contact|call|talk|human|person|email|reach|team|meet)/i, a: () => ['Happy to connect you. Email the team, or fill in the project form below and we will reply within one working day.', [MAIL]] },
      { k: /(thank|thanks|great|awesome|cool|nice)/i, a: () => ['You are welcome. Ask me anything else, or start a project when you are ready.', [['See pricing', 'pricing.html']]] }
    ];
    const FALLBACK = ["I'm not sure about that one yet. I can help with pricing, timelines, technology, or connecting you with the team.", [['Ask about pricing', 'pricing.html'], MAIL]];
    let queue = Promise.resolve();
    function ask(text) {
      text = text.trim(); if (!text) return;
      say(wlog, 'user', text);
      const hit = KB.find(x => x.k.test(text));
      const [reply, actions] = hit ? hit.a() : FALLBACK;
      queue = queue.then(() => say(wlog, 'bot', reply, actions));
    }
    queue = queue.then(() => say(wlog, 'bot', "Hi, I'm Zor. Ask me about pricing, timelines or technology, or tap a suggestion below."));
    $('#wform').addEventListener('submit', e => { e.preventDefault(); const i = $('#winput'); ask(i.value); i.value = ''; });
    $('#quick').addEventListener('click', e => { const b = e.target.closest('button'); if (b) ask(b.textContent); });
  }

  /* ---------- contact form ---------- */
  const form = $('#form');
  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const body = `Hi Nathios,\n\nI'm ${f.get('name')} (${f.get('email')}).\nI need: ${f.get('need')}\nBudget: ${f.get('budget')}\n\n${f.get('msg')}`;
      const subject = 'New project: ' + f.get('need');
      $('#mailLink').href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      $('#whatsappLink').href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(body)}`;
      $('#doneName').textContent = f.get('name');
      e.target.hidden = true;
      $('#done').hidden = false;
    });
  }

  /* ---------- process accordion ---------- */
  $$('.process-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const item = trigger.closest('.process-item');
      if (!item) return;
      const open = item.classList.contains('active');
      $$('.process-item').forEach(other => {
        other.classList.remove('active');
        const btn = other.querySelector('.process-trigger');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      });
      if (!open) {
        item.classList.add('active');
        trigger.setAttribute('aria-expanded', 'true');
      }
    });
  });



  /* ---------- cinematic final scene reveal ---------- */
  const finalScene = $('#final-scene');
  if (finalScene) {
    const revealFinal = () => finalScene.classList.add('in-view');
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => {
        if (entries.some(e => e.isIntersecting)) { revealFinal(); io.disconnect(); }
      }, { threshold: 0.18 });
      io.observe(finalScene);
    } else revealFinal();
  }

  /* ---------- cinematic side drawer ---------- */
  const dockGrid = $('#dockGrid');
  const drawer = $('#sideDrawer');
  const overlay = $('#sideOverlay');
  const drawerClose = $('#drawerClose');
  function setDrawer(open) {
    if (!drawer) return;
    drawer.classList.toggle('open', open);
    overlay && overlay.classList.toggle('open', open);
    dockGrid && dockGrid.setAttribute('aria-expanded', String(open));
    drawer.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('drawer-open', open);
  }
  dockGrid && dockGrid.addEventListener('click', () => setDrawer(!drawer.classList.contains('open')));
  document.querySelectorAll('.menu-btn').forEach(btn => btn.addEventListener('click', () => setDrawer(!drawer.classList.contains('open'))));
  drawerClose && drawerClose.addEventListener('click', () => setDrawer(false));
  overlay && overlay.addEventListener('click', () => setDrawer(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setDrawer(false); });
  $$('.drawer-group-title').forEach(btn => btn.addEventListener('click', () => {
    const group = btn.closest('.drawer-group');
    const open = group.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
    const b = btn.querySelector('b'); if (b) b.textContent = open ? '−' : '+';
  }));
  $$('.drawer-nav a').forEach(a => a.addEventListener('click', () => setDrawer(false)));

})();


  /* NATHIOS global drawer works on every page */
  const nathiosDrawer = document.querySelector('#sideDrawer');
  const nathiosOverlay = document.querySelector('#sideOverlay');
  const nathiosOpen = document.querySelector('#dockGrid');
  const nathiosClose = document.querySelector('#drawerClose');
  const nathiosSetDrawer = open => {
    if(!nathiosDrawer) return;
    nathiosDrawer.classList.toggle('open',open);
    nathiosOverlay && nathiosOverlay.classList.toggle('open',open);
    document.body.classList.toggle('drawer-open',open);
    nathiosDrawer.setAttribute('aria-hidden',String(!open));
    nathiosOpen && nathiosOpen.setAttribute('aria-expanded',String(open));
  };
  nathiosOpen && nathiosOpen.addEventListener('click',()=>nathiosSetDrawer(true));
  nathiosClose && nathiosClose.addEventListener('click',()=>nathiosSetDrawer(false));
  nathiosOverlay && nathiosOverlay.addEventListener('click',()=>nathiosSetDrawer(false));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')nathiosSetDrawer(false)});
  document.querySelectorAll('.drawer-group-title').forEach(b=>b.addEventListener('click',()=>{
    const g=b.closest('.drawer-group'); const open=g.classList.toggle('open');
    b.setAttribute('aria-expanded',String(open)); const x=b.querySelector('b'); if(x)x.textContent=open?'−':'+';
  }));
  document.querySelectorAll('.drawer-nav a').forEach(a=>a.addEventListener('click',()=>nathiosSetDrawer(false)));

  /* smooth reveal + tiny pointer motion for the reference end */
  document.querySelectorAll('.nathios-reference-end').forEach(end=>{
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    end.addEventListener('pointermove',e=>{
      const r=end.getBoundingClientRect(), x=(e.clientX-r.left)/r.width-.5, y=(e.clientY-r.top)/r.height-.5;
      end.style.setProperty('--nre-x',(x*8).toFixed(2)+'px');
      end.style.setProperty('--nre-y',(y*5).toFixed(2)+'px');
    });
  });

