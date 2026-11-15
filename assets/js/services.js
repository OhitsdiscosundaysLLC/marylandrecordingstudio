// Services catalogue: category filters, search, deep-linkable state and live refresh from Square.
(() => {
  const root = document.querySelector('[data-catalogue]');
  if (!root) return;
  const grid = root.querySelector('[data-grid]');
  const chips = [...root.querySelectorAll('[data-filter]')];
  const input = root.querySelector('[data-search-input]');
  const status = root.querySelector('[data-status]');
  const empty = root.querySelector('[data-empty]');
  const cards = () => [...grid.querySelectorAll('.svc-card')];
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const state = { cat: 'all', q: '' };
  const params = new URLSearchParams(location.search);
  if (params.get('category')) state.cat = params.get('category');
  if (location.hash.length > 1) state.cat = decodeURIComponent(location.hash.slice(1));
  if (params.get('q')) state.q = params.get('q');
  if (!chips.some((c) => c.dataset.filter === state.cat)) state.cat = 'all';
  input.value = state.q;

  function apply(push) {
    const q = state.q.trim().toLowerCase();
    let shown = 0;
    for (const c of cards()) {
      const ok = (state.cat === 'all' || c.dataset.category === state.cat) && (!q || c.dataset.search.includes(q)) && !c.dataset.unavailable;
      c.hidden = !ok;
      if (ok) shown++;
    }
    chips.forEach((ch) => { const on = ch.dataset.filter === state.cat; ch.classList.toggle('is-active', on); ch.setAttribute('aria-pressed', String(on)); });
    status.textContent = `${shown} service${shown === 1 ? '' : 's'}${state.cat !== 'all' ? ' in ' + chips.find((c) => c.dataset.filter === state.cat).firstChild.textContent.trim() : ''}${q ? ` matching “${state.q.trim()}”` : ''}`;
    empty.hidden = shown > 0;
    if (push) {
      const u = new URL(location.href);
      u.hash = state.cat === 'all' ? '' : state.cat;
      state.q ? u.searchParams.set('q', state.q) : u.searchParams.delete('q');
      u.searchParams.delete('category');
      history.replaceState(null, '', u);
    }
  }

  chips.forEach((ch) => ch.addEventListener('click', () => { state.cat = ch.dataset.filter; apply(true); }));
  let t;
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.q = input.value; apply(true); }, 120); });
  root.querySelector('[data-reset]').addEventListener('click', () => { state.cat = 'all'; state.q = ''; input.value = ''; apply(true); input.focus(); });
  addEventListener('hashchange', () => { const h = decodeURIComponent(location.hash.slice(1)); if (chips.some((c) => c.dataset.filter === h)) { state.cat = h; apply(false); } });
  apply(false);

  // Live refresh: when the Square API is connected, /api/services returns the current catalogue.
  fetch('/api/services', { headers: { accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data || data.source !== 'square-api' || !Array.isArray(data.services)) return;
      const live = new Map(data.services.map((s) => [s.id, s]));
      for (const c of cards()) {
        const s = live.get(c.dataset.id);
        if (!s) { c.dataset.unavailable = '1'; continue; }
        const meta = c.querySelector('.svc-card__meta');
        if (meta && s.priceLine) meta.textContent = s.priceLine;
        live.delete(c.dataset.id);
      }
      // Services added in Square since the last deploy: show them with a direct booking link.
      for (const s of live.values()) {
        const el = document.createElement('article');
        el.className = 'svc-card is-in';
        el.dataset.category = s.category; el.dataset.id = s.id;
        el.dataset.search = `${s.name} ${s.description || ''}`.toLowerCase();
        el.innerHTML = `<div class="svc-card__body"><h3 class="svc-card__title">${esc(s.name)}</h3><p class="svc-card__meta">${esc(s.priceLine || '')}</p><p class="svc-card__desc">${esc(s.description || '')}</p><div class="svc-card__actions"><a class="btn btn--primary btn--sm" href="/book?id=${encodeURIComponent(s.id)}" data-track="book_cta_click" data-label="${esc(s.name)}">Book this service</a></div></div>`;
        grid.append(el);
      }
      apply(false);
    })
    .catch(() => { /* keep the static catalogue */ });
})();
