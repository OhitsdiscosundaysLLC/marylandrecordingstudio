// YouTube strips (home, gallery) and the unified social wall (social page).
// Data comes from our own /api endpoints, which use official feeds/APIs only. Nothing is faked:
// if a platform's feed isn't connected, we show a clearly labelled link to the real profile.
(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const track = (e, p) => window.mrsTrack && window.mrsTrack(e, p);
  const YT_URL = 'https://www.youtube.com/channel/UCuiLXxntyyMegzINhvDn0aw';
  const getJSON = (u) => fetch(u, { headers: { accept: 'application/json' } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const date = (d) => { try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; } };

  function videoCard(v, { featured = false, badge = false } = {}) {
    const el = document.createElement('article');
    el.className = `video-card${featured ? ' video-card--featured' : ''}${badge ? ' wall__item' : ''}`;
    el.dataset.platform = 'youtube';
    el.innerHTML = `<div class="video-card__player">${badge ? '<span class="wall__badge wall__badge--youtube is-overlay">YouTube</span>' : ''}
      <button type="button" class="video-card__play" aria-label="Play video: ${esc(v.title)}"><img src="${esc(v.thumbnail)}" alt="" loading="lazy" decoding="async" width="480" height="360"></button></div>
      <div class="video-card__body"><h3 class="video-card__title">${esc(v.title)}</h3>
      <p class="video-card__meta"><span>${esc(date(v.published))}</span><a href="${esc(v.url)}" target="_blank" rel="noopener" data-track="social_profile_click" data-label="youtube_video">Watch on YouTube<span class="sr-only"> (opens in a new tab)</span></a></p></div>`;
    el.querySelector('.video-card__play').addEventListener('click', (e) => {
      const f = document.createElement('iframe');
      f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.id)}?autoplay=1&rel=0`;
      f.title = v.title; f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'; f.allowFullscreen = true;
      e.currentTarget.replaceWith(f);
      track('video_play', { label: v.title, platform: 'youtube' });
    });
    return el;
  }

  function ytUnavailable() {
    const el = document.createElement('div');
    el.className = 'notice-card';
    el.style.gridColumn = '1 / -1';
    el.innerHTML = `<div><h3>Watch Disco Sundays on YouTube</h3><p>Our latest videos are on the Disco Sundays channel.</p></div><a class="btn btn--primary" href="${YT_URL}" target="_blank" rel="noopener" data-track="social_profile_click" data-label="youtube">Open YouTube</a>`;
    return el;
  }

  const ytPromise = getJSON('/api/youtube');

  // ---- YouTube strips ----
  document.querySelectorAll('[data-youtube-strip]').forEach(async (strip) => {
    const limit = Number(strip.dataset.limit || 3);
    const data = await ytPromise;
    strip.innerHTML = '';
    const vids = data?.videos?.slice(0, limit) || [];
    if (!vids.length) { strip.append(ytUnavailable()); return; }
    vids.forEach((v, i) => strip.append(videoCard(v, { featured: strip.dataset.featured === 'true' && i === 0 })));
  });

  // ---- Social wall ----
  const wall = document.querySelector('[data-wall]');
  if (!wall) return;
  const filters = [...document.querySelectorAll('[data-platform]')].filter((b) => b.tagName === 'BUTTON');
  const status = document.querySelector('[data-wall-status]');

  (async () => {
    const [yt, ig] = await Promise.all([ytPromise, getJSON('/api/instagram')]);
    wall.innerHTML = '';
    const items = [];
    (ig?.posts || []).forEach((p) => items.push({ platform: 'instagram', time: +new Date(p.timestamp), el: igCard(p) }));
    (yt?.videos || []).slice(0, 12).forEach((v) => items.push({ platform: 'youtube', time: +new Date(v.published), el: videoCard(v, { badge: true }) }));
    items.sort((a, b) => b.time - a.time);

    // Profile / plugin cards always appear so every platform is represented honestly.
    const nodes = items.map((it) => it.el);
    const fb = document.querySelector('[data-tpl-facebook]').content.firstElementChild.cloneNode(true);
    nodes.splice(Math.min(1, nodes.length), 0, fb);
    if (!ig?.posts?.length) nodes.splice(Math.min(3, nodes.length), 0, document.querySelector('[data-tpl-instagram-fallback]').content.firstElementChild.cloneNode(true));
    if (!yt?.videos?.length) { const n = ytUnavailable(); n.classList.add('wall__item'); n.dataset.platform = 'youtube'; nodes.push(n); }
    wall.append(...nodes);
    applyFilter('all');
  })();

  function igCard(p) {
    const a = document.createElement('a');
    a.className = 'wall__item';
    a.dataset.platform = 'instagram';
    a.href = p.permalink; a.target = '_blank'; a.rel = 'noopener';
    a.dataset.track = 'social_profile_click'; a.dataset.label = 'instagram_post';
    const img = p.media_type === 'VIDEO' ? p.thumbnail_url : p.media_url;
    a.innerHTML = `<span class="wall__badge wall__badge--instagram is-overlay">Instagram</span>${img ? `<img src="${esc(img)}" alt="${esc((p.caption || 'Instagram post').slice(0, 120))}" loading="lazy" decoding="async">` : ''}<p class="wall__caption">${esc((p.caption || '').slice(0, 160))}${(p.caption || '').length > 160 ? '…' : ''}<span class="sr-only"> (opens Instagram)</span></p>`;
    return a;
  }

  function applyFilter(pf) {
    filters.forEach((b) => { const on = b.dataset.platform === pf; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); });
    let n = 0;
    [...wall.children].forEach((c) => { const ok = pf === 'all' || c.dataset.platform === pf; c.hidden = !ok; if (ok) n++; });
    if (status) status.textContent = `Showing ${n} item${n === 1 ? '' : 's'}${pf === 'all' ? '' : ' from ' + pf}`;
  }
  filters.forEach((b) => b.addEventListener('click', () => applyFilter(b.dataset.platform)));

  // Facebook Page plugin loads only when the visitor asks (privacy + performance).
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fb-load]');
    if (!b) return;
    const f = document.createElement('iframe');
    f.src = b.dataset.src; f.title = 'Disco Sundays Facebook Page'; f.loading = 'lazy';
    f.allow = 'clipboard-write; encrypted-media; picture-in-picture; web-share';
    b.closest('[data-fb-embed]').append(f);
    b.remove();
    track('social_embed_load', { platform: 'facebook' });
  });
})();
