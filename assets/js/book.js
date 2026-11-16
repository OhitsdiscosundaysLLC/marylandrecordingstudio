// Booking page: embeds the official Square Appointments booking flow for the chosen service.
// The selected service lives in the URL (?service=slug or ?id=SQUARE_ID) so refresh, back and
// shared links all work. Square handles availability, details, payment and confirmation.
(() => {
  let frame = document.querySelector('[data-booking-frame]');
  if (!frame) return;
  const loading = document.querySelector('[data-loading]');
  const fallback = document.querySelector('[data-fallback]');
  const select = document.querySelector('[data-service-select]');
  const panelTitle = document.querySelector('[data-panel-title]');
  const title = document.querySelector('[data-book-title]');
  const sub = document.querySelector('[data-book-sub]');
  const externals = [...document.querySelectorAll('[data-external-link]')];
  const items = [...document.querySelectorAll('[data-pick]')];
  const track = (e, p) => window.mrsTrack && window.mrsTrack(e, p);
  const defaultTitle = title.textContent;
  const defaultSub = sub.textContent;

  let catalogue = null;
  let timer;

  function resolve() {
    const p = new URLSearchParams(location.search);
    const slug = p.get('service');
    const id = p.get('id');
    if (!catalogue) return null;
    return catalogue.services.find((s) => (slug && s.slug === slug) || (id && s.id === id)) || null;
  }

  function load(url) {
    clearTimeout(timer);
    fallback.hidden = true;
    loading.classList.remove('is-hidden');
    // Swap in a fresh iframe instead of changing src, so the embed doesn't add entries to
    // the browser history (Back should go to the previous service, not inside Square).
    const next = frame.cloneNode(false);
    next.src = url;
    next.addEventListener('load', onFrameLoad);
    frame.replaceWith(next);
    frame = next;
    timer = setTimeout(() => { fallback.hidden = false; }, 12000);
  }

  function render({ fromUser = false } = {}) {
    const p = new URLSearchParams(location.search);
    const requested = p.get('service') || p.get('id');
    const s = resolve();
    const base = catalogue.bookingBase;
    // A service added in Square after the last deploy can still be booked by its Square ID.
    const url = s ? s.bookUrl : (p.get('id') && /^[A-Z0-9]{10,40}$/.test(p.get('id')) ? `${base}/${p.get('id')}` : base);
    const purchase = s && s.purchase;
    const pp = document.querySelector('[data-purchase]');
    const wrap = document.querySelector('[data-frame-wrap]');
    if (pp) pp.hidden = !purchase;
    wrap.hidden = !!purchase;
    document.querySelector('.booking-panel__ext').hidden = !!purchase;
    if (purchase) {
      clearTimeout(timer); fallback.hidden = true;
      pp.querySelector('[data-purchase-name]').textContent = s.name;
      pp.querySelector('[data-purchase-price]').textContent = s.priceText || '';
      pp.querySelector('[data-purchase-note]').textContent = purchase.note || '';
      const link = pp.querySelector('[data-purchase-link]');
      link.href = purchase.url; link.firstChild.textContent = purchase.label || 'Join now';
    } else {
      load(url);
    }
    externals.forEach((a) => { a.href = url; });
    items.forEach((b) => b.setAttribute('aria-pressed', String((s ? s.slug : '') === b.dataset.pick)));
    if (select) select.value = s ? s.slug : '';
    if (s) {
      panelTitle.textContent = `${s.name}${s.priceText ? ' · ' + s.priceText : ''}`;
      title.textContent = s.name;
      sub.textContent = s.purchase ? 'Pay your membership securely with Square. No appointment needed.' : 'Choose a team member below, then press Book to pick your time in Square\'s secure booking page.';
      document.title = `Book ${s.name} | Maryland Recording Studio`;
    } else {
      panelTitle.textContent = p.get('id') ? 'Selected service' : 'All services';
      title.textContent = defaultTitle;
      sub.textContent = requested && !p.get('id') ? "We couldn't find that service. It may have been updated, so choose from everything that's currently available." : defaultSub;
      document.title = 'Book a Session | Maryland Recording Studio';
    }
    if (fromUser) track('square_booking_visit', { label: s ? s.name : 'all_services', page: location.pathname });
  }

  function choose(slug) {
    const u = new URL(location.href);
    u.searchParams.delete('id');
    slug ? u.searchParams.set('service', slug) : u.searchParams.delete('service');
    history.pushState(null, '', u);
    render({ fromUser: true });
    if (innerWidth < 900) document.querySelector('.booking-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function onFrameLoad() {
    clearTimeout(timer);
    loading.classList.add('is-hidden');
  }
  items.forEach((b) => b.addEventListener('click', () => choose(b.dataset.pick)));
  select?.addEventListener('change', () => choose(select.value));
  addEventListener('popstate', () => render());

  fetch('/data/services.json')
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((data) => { catalogue = data; render({ fromUser: true }); })
    .catch(() => {
      // Catalogue unavailable: still show the full Square booking flow.
      catalogue = { services: [], bookingBase: externals[0]?.href };
      render();
    });
})();
