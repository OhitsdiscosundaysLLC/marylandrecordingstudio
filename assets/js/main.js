// Site-wide behaviour: header, mobile menu, reveal animations, sticky CTA and analytics events.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Analytics: one function for every provider; always pushes to dataLayer ----
  window.dataLayer = window.dataLayer || [];
  const track = (event, props = {}) => {
    try {
      window.dataLayer.push({ event, ...props });
      if (typeof window.plausible === 'function') window.plausible(event, { props });
      if (typeof window.gtag === 'function') window.gtag('event', event, props);
    } catch (_) { /* never break the page for analytics */ }
  };
  window.mrsTrack = track;

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a, button');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    const label = a.dataset.label || a.textContent.trim().slice(0, 60);
    if (a.dataset.track) track(a.dataset.track, { label, href, page: location.pathname });
    else if (href.startsWith('tel:')) track('phone_click', { label, page: location.pathname });
    else if (href.startsWith('mailto:')) track('email_click', { label, page: location.pathname });
    else if (href.includes('wa.me') || href.includes('whatsapp')) track('whatsapp_click', { label, page: location.pathname });
    else if (href.includes('book.squareup.com')) track('square_booking_visit', { label, page: location.pathname });
  }, { capture: true });

  // ---- Header compaction on scroll ----
  const header = $('[data-header]');
  const onScroll = () => {
    const y = window.scrollY;
    header?.classList.toggle('is-scrolled', y > 24);
    if (sticky) {
      const nearEnd = window.innerHeight + y > document.body.scrollHeight - 520;
      sticky.classList.toggle('is-visible', y > 480 && !nearEnd);
    }
  };
  const sticky = $('[data-sticky-cta]');
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---- Mobile menu ----
  const toggle = $('[data-menu-toggle]');
  const menu = $('[data-mobile-menu]');
  const setMenu = (open) => {
    if (!toggle || !menu) return;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('.sr-only').textContent = open ? 'Close menu' : 'Open menu';
    document.body.classList.toggle('menu-open', open);
    if (open) {
      menu.hidden = false;
      requestAnimationFrame(() => menu.classList.add('is-open'));
      menu.querySelector('a')?.focus();
    } else {
      menu.classList.remove('is-open');
      setTimeout(() => { if (toggle.getAttribute('aria-expanded') === 'false') menu.hidden = true; }, reduceMotion ? 0 : 300);
    }
  };
  toggle?.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  menu?.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toggle?.getAttribute('aria-expanded') === 'true') { setMenu(false); toggle.focus(); }
    if (e.key === 'Tab' && toggle?.getAttribute('aria-expanded') === 'true') {
      // Keep focus inside header + menu while the menu is open.
      const f = [toggle, ...$$('a, button', menu)];
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  });
  matchMedia('(min-width: 1081px)').addEventListener('change', (m) => { if (m.matches) setMenu(false); });

  // ---- Reveal on scroll ----
  const reveals = $$('.reveal');
  if (!('IntersectionObserver' in window) || reduceMotion) reveals.forEach((el) => el.classList.add('is-in'));
  else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    reveals.forEach((el) => io.observe(el));
  }

  // ---- Hero video: only on larger screens, never with reduced motion or data saver ----
  const vid = $('[data-hero-video]');
  if (vid) {
    const saveData = navigator.connection && navigator.connection.saveData;
    if (reduceMotion || saveData || innerWidth < 760) vid.remove();
    else { vid.preload = 'auto'; vid.play().catch(() => {}); }
  }

  // ---- Lazy click-to-load embeds (map, Facebook) ----
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-map-load]');
    if (!b) return;
    const f = document.createElement('iframe');
    f.src = b.dataset.src; f.title = 'Map of Hanover, Maryland'; f.loading = 'lazy'; f.referrerPolicy = 'no-referrer-when-downgrade';
    b.closest('[data-map]').prepend(f);
    b.remove();
  });
})();
