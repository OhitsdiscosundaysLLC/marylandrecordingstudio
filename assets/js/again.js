(() => {
  const root = document.querySelector('[data-again]'); if (!root) return;
  const lang = () => (window.mrsLang ? window.mrsLang() : 'en');
  const msg = root.querySelector('[data-again-msg]');
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  root.querySelector('[data-again-form]').addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = e.target.querySelector('button'); btn.disabled = true;
    try { const r = await fetch('/api/ai/book-again', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e.target.email.value, lang: lang() }) }); const j = await r.json(); msg.textContent = j.message || j.error || ''; }
    catch { msg.textContent = ''; }
    btn.disabled = false;
  });
  const t = new URLSearchParams(location.search).get('again');
  if (t) (async () => {
    const r = await fetch('/api/ai/book-again', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t, lang: lang() }) }); const j = await r.json();
    if (!r.ok) { msg.textContent = j.error || ''; return; }
    const list = root.querySelector('[data-again-list]'); list.hidden = false;
    list.insertAdjacentHTML('beforeend', j.services.map((s) => `<a class="btn btn--ghost btn--block" href="${esc(s.url)}" data-track="book_cta_click" data-label="book_again">${esc(s.label)}: ${esc(s.name)}${s.price?.display ? ` · ${esc(s.price.display)}` : ''}</a>`).join(''));
    root.scrollIntoView({ block: 'center' });
  })();
})();
