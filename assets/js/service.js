// Individual service page: refresh price/duration from Square when the API is connected,
// and flag the page if the service has been removed from Square since the last deploy.
(() => {
  const hero = document.querySelector('[data-service-id]');
  if (!hero) return;
  fetch('/api/services', { headers: { accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data || data.source !== 'square-api') return;
      const s = data.services.find((x) => x.id === hero.dataset.serviceId);
      if (!s) {
        hero.querySelector('[data-unavailable]').hidden = false;
        hero.querySelectorAll('a[href^="/book?service="]').forEach((a) => { a.setAttribute('aria-disabled', 'true'); a.href = '/services'; a.textContent = 'See available services'; });
        return;
      }
      const p = hero.querySelector('[data-live-price]');
      const d = hero.querySelector('[data-live-duration]');
      if (p && s.price?.display) p.textContent = s.price.display;
      if (d && s.durationLabel) d.textContent = s.durationLabel;
    })
    .catch(() => {});
})();
