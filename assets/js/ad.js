// Cinematic zoom-in -> zoom-out treatment tied to scroll position (transform only, one rAF loop).
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('no-ambient')) return;
  const els = [...document.querySelectorAll('[data-ad-zoom]')];
  if (!els.length) return;
  let raf = 0;
  const vis = new Set();
  const io = new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? vis.add(e.target) : vis.delete(e.target))), { rootMargin: '10% 0px' });
  els.forEach((el) => io.observe(el));
  function frame() {
    raf = 0;
    const vh = innerHeight;
    vis.forEach((el) => {
      const r = el.getBoundingClientRect();
      // p: 0 when the element enters from below, 0.5 at centre, 1 when it leaves at the top
      const p = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)));
      const z = 1 + 0.35 * Math.sin(p * Math.PI); // in, peak at centre, back out
      el.style.setProperty('--z', z.toFixed(3));
      el.style.setProperty('--p', p.toFixed(3));
    });
  }
  const req = () => { if (!raf) raf = requestAnimationFrame(frame); };
  addEventListener('scroll', req, { passive: true }); addEventListener('resize', req); req();
  // Approved spotlight videos play only while visible.
  document.querySelectorAll('[data-spot-video]').forEach((v) => new IntersectionObserver(([e]) => (e.isIntersecting ? v.play().catch(() => {}) : v.pause()), { threshold: 0.4 }).observe(v));
})();
