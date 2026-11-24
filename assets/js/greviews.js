// Genuine Google reviews. The page already contains every written review from the Google listing (verbatim snapshot, built in).
// When the official Places API is configured (/api/reviews), refresh the live rating and count and add any review newer than the snapshot.
// If the API is not configured or fails, nothing changes: we never show a made-up rating.
(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  document.querySelectorAll('[data-google-reviews]').forEach(async (el) => {
    try {
      const r = await fetch('/api/reviews'); if (!r.ok) return;
      const j = await r.json(); if (!j.configured || typeof j.rating !== 'number' || !j.count) return;
      const sum = el.querySelector('.gr__sum strong'); if (sum) sum.textContent = j.rating.toFixed(1);
      const s = el.querySelector('.gr__sum'); if (s) s.lastChild.textContent = ` on Google · ${j.count} reviews`;
      const known = new Set([...el.querySelectorAll('.gr__who')].map((n) => n.textContent.trim().toLowerCase()));
      const fresh = (j.reviews || []).filter((x) => x.text && x.author && !known.has(String(x.author).trim().toLowerCase()));
      const list = el.querySelector('.gr__list');
      if (list && fresh.length) list.insertAdjacentHTML('afterbegin', fresh.map((x) => `<figure class="gr__item"><figcaption><span class="gr__stars" aria-hidden="true">${'★'.repeat(Math.round(x.rating))}${'☆'.repeat(5 - Math.round(x.rating))}</span><span class="sr-only">${esc(x.rating)} out of 5 stars</span><span class="gr__who">${esc(x.author)}</span><time>${esc(x.when || '')}</time></figcaption><blockquote><p>${esc(x.text)}</p></blockquote></figure>`).join(''));
    } catch { /* keep the built-in reviews */ }
  });
})();
