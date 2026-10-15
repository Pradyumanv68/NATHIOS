(() => {
  document.documentElement.classList.add('svc-reveal-ready');
  const items = document.querySelectorAll('.svc-services .reveal, .svc-proof .reveal, .svc-mall-feature .reveal, #process .rv, .cta-band.rv');
  if (!('IntersectionObserver' in window)) { items.forEach(el => el.classList.add('is-visible')); return; }
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -35px 0px' });
  items.forEach(el => observer.observe(el));
})();
