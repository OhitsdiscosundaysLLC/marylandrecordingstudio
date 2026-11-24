// Genuine open times from Square (via /api/availability). Renders nothing when not connected.
(() => {
  const T = (s) => (window.mrsT ? window.mrsT(s) : s);
  const lang = () => (window.mrsLang ? window.mrsLang() : 'en');
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let off = false;
  async function show(el, slug, { from } = {}) {
    if (!el || !slug || off) return;
    try {
      const r = await fetch(`/api/availability?service=${encodeURIComponent(slug)}${from ? `&from=${from}` : ''}&days=14`);
      if (r.status === 503) { off = true; return; }
      const j = await r.json(); if (!r.ok) return;
      const loc = lang() === 'es' ? 'es-US' : 'en-US';
      const days = {};
      for (const s of j.slots) { const d = new Date(s.startAt).toLocaleDateString(loc, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' }); (days[d] ||= []).push(s); }
      const entries = Object.entries(days).slice(0, 3);
      if (!entries.length) { el.innerHTML = `<p class="slots__none">${esc(T('No open times found in the next two weeks.'))}</p>`; return; }
      el.innerHTML = `<div class="slots" data-i18n-scope><p class="slots__h">${esc(T('Next open slots'))}</p>${entries.map(([d, list]) => `<div class="slots__day"><span>${esc(d)}</span><div>${list.slice(0, 4).map((s) => `<a class="slots__t" href="/book?service=${encodeURIComponent(slug)}&at=${encodeURIComponent(s.startAt)}" data-track="book_cta_click" data-label="slot_${esc(slug)}">${esc(new Date(s.startAt).toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }))}</a>`).join('')}</div></div>`).join('')}<p class="slots__note">${esc(T('Live availability from our Square calendar.'))} ET</p></div>`;
    } catch {}
  }
  window.mrsAvailability = show;
  const run = () => document.querySelectorAll('[data-slots]:not([data-slots-done])').forEach((el) => { el.dataset.slotsDone = ''; if (el.dataset.slots) show(el, el.dataset.slots); });
  run(); document.addEventListener('mrs:refresh', run);
})();
