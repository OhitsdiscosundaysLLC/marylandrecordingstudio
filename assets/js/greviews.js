// Genuine Google reviews (Places API via /api/reviews). Without the API key it shows links only, never a made-up rating.
(() => {
  const T = (s) => (window.mrsT ? window.mrsT(s) : s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const stars = (n) => `<span class="gr__stars" aria-label="${n} / 5">${'★'.repeat(Math.round(n))}${'☆'.repeat(5 - Math.round(n))}</span>`;
  document.querySelectorAll('[data-google-reviews]').forEach(async (el) => {
    const read = el.dataset.reviewsUrl, write = el.dataset.writeUrl;
    try {
      const r = await fetch('/api/reviews'); const j = await r.json();
      if (!r.ok || !j.configured || !j.reviews?.length) throw 0;
      const list = j.reviews.filter((x) => x.text).slice(0, 5);
      el.querySelector('[data-gr-body]').innerHTML = `<p class="gr__sum">${stars(j.rating)} <strong>${esc(j.rating?.toFixed(1))}</strong> · ${esc(j.count)} ${esc(T('Google reviews'))}</p>
        <div class="gr__list">${list.map((x) => `<figure class="gr__item"><blockquote>${esc(x.text.length > 420 ? x.text.slice(0, 417) + '…' : x.text)}</blockquote><figcaption>${stars(x.rating)} <a href="${esc(x.authorUrl || j.reviewsUrl)}" target="_blank" rel="noopener nofollow">${esc(x.author)}</a> · ${esc(x.when || '')}</figcaption></figure>`).join('')}</div>
        <p class="gr__attr">${esc(T('Reviews from Google.'))} <a href="${esc(j.reviewsUrl || read)}" target="_blank" rel="noopener">${esc(T('Read all reviews'))}</a> · <a href="${esc(j.writeUrl || write)}" target="_blank" rel="noopener">${esc(T('Write a review'))}</a></p>`;
    } catch {
      el.querySelector('[data-gr-body]').innerHTML = `<p class="gr__sum">${esc(T('See what artists say about us on Google.'))}</p><div class="btn-row"><a class="btn btn--ghost" href="${esc(read)}" target="_blank" rel="noopener" data-track="ecosystem_click" data-label="google_reviews">${esc(T('Read our Google reviews'))}<span class="sr-only"> (opens Google Maps)</span></a><a class="btn btn--ghost" href="${esc(write)}" target="_blank" rel="noopener" data-track="ecosystem_click" data-label="google_write">${esc(T('Write a review'))}</a></div>`;
    }
  });
})();
