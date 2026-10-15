(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];

  // Before/after comparison slider — mouse, touch and keyboard friendly.
  const stage = $('#compareStage'), divider = $('#compareDivider');
  if (stage && divider) {
    const after = stage.querySelector('.compare-side.new');
    const set = x => { const r = stage.getBoundingClientRect(); const p = Math.max(2, Math.min(98, ((x-r.left)/r.width)*100)); after.style.width = p+'%'; divider.style.left = p+'%'; };
    let drag=false;
    stage.addEventListener('pointerdown', e => { drag=true; stage.setPointerCapture(e.pointerId); set(e.clientX); });
    stage.addEventListener('pointermove', e => { if(drag) set(e.clientX); });
    stage.addEventListener('pointerup', () => drag=false); stage.addEventListener('pointercancel', () => drag=false);
    divider.querySelector('button').addEventListener('keydown', e => { if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault(); const r=stage.getBoundingClientRect(); const current=parseFloat(divider.style.left||50); set(r.left+r.width*(current+(e.key==='ArrowRight'?2:-2))/100); }});
  }

  // Scroll reveal.
  const io = new IntersectionObserver(entries => entries.forEach(e => { if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.12});
  $$('.rv').forEach(x=>io.observe(x));

  // 3D hover tilt.
  if(!reduce) $$('.data-tilt, [data-tilt]').forEach(card => {
    card.addEventListener('pointermove', e => { const r=card.getBoundingClientRect(), x=(e.clientX-r.left)/r.width-.5, y=(e.clientY-r.top)/r.height-.5; card.style.transform=`perspective(900px) rotateX(${y*-5}deg) rotateY(${x*6}deg) translateY(-4px)`; });
    card.addEventListener('pointerleave',()=>card.style.transform='');
  });

  // Transformation stage reacts to scroll progress.
  const scene=$('#transformScene'), num=$('#transformNumber'), word=$('#transformWord');
  const words=['AUDIT','RETHINK','REDESIGN','REBUILD','ANIMATE','LAUNCH'];
  if(scene && !reduce){
    const update=()=>{const r=scene.getBoundingClientRect(), vh=innerHeight, p=Math.max(0,Math.min(1,(vh-r.top)/(vh+r.height*.2))); const i=Math.min(words.length-1,Math.floor(p*words.length)); if(num)num.textContent=String(i+1).padStart(2,'0'); if(word)word.textContent=words[i]; const old=scene.querySelector('.transform-old'),nw=scene.querySelector('.transform-new'); const t=(p-.5)*80; old.style.transform=`rotateY(${18-t*.35}deg) translateX(${-20-t}px) scale(${1-p*.05})`; nw.style.transform=`rotateY(${-18+t*.35}deg) translateX(${20+t}px) scale(${.95+p*.05})`; }; addEventListener('scroll',update,{passive:true});update();
  }

  // Counters.
  $$('[data-count]').forEach(el=>{const end=+el.dataset.count; const obs=new IntersectionObserver(es=>{if(!es[0].isIntersecting)return;obs.disconnect(); if(reduce){el.textContent=end;return;} const t=performance.now(); const step=n=>{const p=Math.min(1,(n-t)/1200),e=1-Math.pow(1-p,3);el.textContent=Math.round(end*e)+(end===360?'°':'');if(p<1)requestAnimationFrame(step)};requestAnimationFrame(step)},{threshold:.5});obs.observe(el)});

  // Particle field.
  const cv=$('#makeoverParticles'); if(cv && !reduce){const c=cv.getContext('2d');let W,H,ps=[];const size=()=>{W=innerWidth;H=innerHeight;const d=Math.min(devicePixelRatio||1,2);cv.width=W*d;cv.height=H*d;c.setTransform(d,0,0,d,0,0);ps=Array.from({length:Math.min(90,Math.floor(W/14))},()=>({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.25,vy:(Math.random()-.5)*.25,r:Math.random()*1.4+.3}))};const draw=()=>{c.clearRect(0,0,W,H);for(const p of ps){p.x+=p.vx;p.y+=p.vy;if(p.x<0||p.x>W)p.vx*=-1;if(p.y<0||p.y>H)p.vy*=-1;c.beginPath();c.arc(p.x,p.y,p.r,0,Math.PI*2);c.fillStyle='rgba(95,170,255,.45)';c.fill()}for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){const a=ps[i],b=ps[j],d=Math.hypot(a.x-b.x,a.y-b.y);if(d<100){c.strokeStyle=`rgba(70,140,255,${(1-d/100)*.11})`;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke()}}requestAnimationFrame(draw)};size();draw();addEventListener('resize',size)}
})();
