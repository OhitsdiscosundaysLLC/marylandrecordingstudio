// Social feed (homepage), unified gallery wall (/gallery) and the lightbox.
// Sources, all official:
//   YouTube   – /api/youtube (channel feed, live)
//   Instagram – /api/instagram when INSTAGRAM_ACCESS_TOKEN is set (native cards);
//               otherwise the selected posts in content/social.json via Instagram's official embed
//   Facebook  – the official Page plugin, loaded only when the visitor asks
//   Photos    – content/media.json
// Nothing is invented: every item links to its original post.
(() => {
  const feed = document.querySelector('[data-feed]');
  const wall = document.querySelector('[data-wall]');
  if (!feed && !wall) return;
  const data = JSON.parse(document.getElementById('social-data')?.textContent || '{}');
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const track = (e, p) => window.mrsTrack && window.mrsTrack(e, p);
  const getJSON = (u) => fetch(u, { headers: { accept: 'application/json' } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const fmtDate = (d) => { try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; } };
  const LABEL = { instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', studio: 'Studio' };
  const badge = (p) => `<span class="pbadge pbadge--${p}"><span class="pbadge__dot" aria-hidden="true"></span>${LABEL[p]}</span>`;
  const extArrow = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  // ---------- lightbox ----------
  let dlg = document.querySelector('dialog.lightbox');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.className = 'lightbox';
    dlg.setAttribute('aria-label', 'Media viewer');
    dlg.innerHTML = '<div class="lightbox__inner"><button type="button" class="lightbox__close" aria-label="Close">×</button><div class="lightbox__media" data-lb-media></div><div class="lightbox__foot" data-lb-foot></div></div>';
    document.body.append(dlg);
    dlg.querySelector('.lightbox__close').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => { dlg.querySelector('[data-lb-media]').innerHTML = ''; document.documentElement.classList.remove('lb-open'); });
  }
  function openLightbox(item) {
    const media = dlg.querySelector('[data-lb-media]');
    const foot = dlg.querySelector('[data-lb-foot]');
    dlg.dataset.kind = item.kind;
    if (item.kind === 'youtube') {
      media.innerHTML = `<div class="lb-video"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(item.id)}?autoplay=1&rel=0" title="${esc(item.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
    } else if (item.kind === 'ig-embed') {
      media.innerHTML = `<div class="lb-embed"><iframe src="${esc(item.embed)}" title="Instagram post" loading="eager" scrolling="no" allowtransparency="true"></iframe></div>`;
    } else if (item.kind === 'facebook') {
      media.innerHTML = `<div class="lb-embed lb-embed--fb"><iframe src="https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(data.facebook)}&tabs=timeline&width=500&height=720&small_header=true&adapt_container_width=true&hide_cover=false&show_facepile=false" title="Disco Sundays on Facebook" allow="clipboard-write; encrypted-media; picture-in-picture; web-share"></iframe></div>`;
    } else if (item.video) {
      media.innerHTML = `<video class="lb-img" src="${esc(item.video)}" controls autoplay playsinline poster="${esc(item.image || '')}"></video>`;
    } else {
      media.innerHTML = `<img class="lb-img" src="${esc(item.image)}" alt="${esc(item.alt || item.title || '')}">`;
    }
    foot.innerHTML = `${badge(item.platform)}<p>${esc(item.title || '')}</p>${item.url ? `<a class="btn btn--ghost btn--sm" href="${esc(item.url)}" target="_blank" rel="noopener" data-track="social_profile_click" data-label="${item.platform}_original">Open on ${LABEL[item.platform] === 'Studio' ? 'site' : LABEL[item.platform]}${extArrow}</a>` : ''}`;
    document.documentElement.classList.add('lb-open');
    // Pause the radio so a video and the stream never play over each other.
    if (item.kind === 'youtube' || item.video || item.kind === 'ig-embed') document.dispatchEvent(new CustomEvent('mrs:media-play'));
    dlg.showModal();
    track('gallery_open', { platform: item.platform, label: item.title || item.url || '' });
  }

  // ---------- items ----------
  function tile(item, cls = '') {
    const el = document.createElement('article');
    el.className = `tile tile--${item.platform} ${cls}`.trim();
    el.dataset.platform = item.platform;
    if (item.kind === 'ig-embed') {
      el.classList.add('tile--embed');
      el.innerHTML = `<div class="tile__head">${badge('instagram')}<button type="button" class="tile__expand" aria-label="Open this Instagram post larger">Expand</button></div>
        <div class="tile__embed"><iframe src="${esc(item.embed)}" title="Instagram post from Disco Sundays" loading="lazy" scrolling="no" allowtransparency="true"></iframe></div>`;
      el.querySelector('.tile__expand').addEventListener('click', () => openLightbox(item));
      return el;
    }
    if (item.kind === 'facebook') {
      el.classList.add('tile--card');
      el.innerHTML = `${badge('facebook')}<h3 class="tile__title">Disco Sundays on Facebook</h3><p class="tile__text">Event photos, announcements and community posts from <strong>discosundaysofficial</strong>.</p>
        <div class="btn-row"><button type="button" class="btn btn--primary btn--sm" data-open>See recent posts</button><a class="btn btn--ghost btn--sm" href="${esc(data.facebook)}" target="_blank" rel="noopener" data-track="social_profile_click" data-label="facebook">Follow${extArrow}</a></div>
        <p class="tile__fine">Loads Facebook's official page viewer. Facebook may set cookies.</p>`;
      el.querySelector('[data-open]').addEventListener('click', () => openLightbox(item));
      return el;
    }
    if (item.kind === 'profile') {
      el.classList.add('tile--card');
      el.innerHTML = `${badge(item.platform)}<h3 class="tile__title">${esc(item.title)}</h3><p class="tile__text">${esc(item.text)}</p><a class="btn btn--primary btn--sm" href="${esc(item.url)}" target="_blank" rel="noopener" data-track="social_profile_click" data-label="${item.platform}">${esc(item.cta)}${extArrow}</a>`;
      return el;
    }
    // Native media tile (YouTube thumbnail, Instagram API image, studio photo).
    el.innerHTML = `<button type="button" class="tile__media" aria-label="${item.kind === 'youtube' ? 'Play video' : 'View'}: ${esc(item.title || LABEL[item.platform] + ' post')}">
        <img src="${esc(item.image)}" alt="" loading="lazy" decoding="async"${item.kind === 'youtube' ? ' width="480" height="360"' : ''}>
        ${item.kind === 'youtube' || item.video ? '<span class="tile__play" aria-hidden="true"></span>' : ''}
        <span class="tile__overlay">${badge(item.platform)}<span class="tile__caption">${esc(item.title || '')}</span>${item.date ? `<span class="tile__date">${esc(fmtDate(item.date))}</span>` : ''}</span>
      </button>`;
    el.querySelector('.tile__media').addEventListener('click', () => openLightbox(item));
    return el;
  }

  function igEmbedUrl(u) {
    const m = String(u).match(/instagram\.com\/(?:[^/]+\/)?(p|reel|tv)\/([A-Za-z0-9_-]+)/);
    return m ? `https://www.instagram.com/${m[1]}/${m[2]}/embed/` : null;
  }

  async function loadItems() {
    const [yt, ig] = await Promise.all([getJSON('/api/youtube'), getJSON('/api/instagram')]);
    const youtube = (yt?.videos || []).map((v) => ({ platform: 'youtube', kind: 'youtube', id: v.id, title: v.title, date: v.published, image: v.thumbnail, url: v.url }));
    let instagram;
    if (ig?.posts?.length) {
      instagram = ig.posts.map((p) => ({ platform: 'instagram', kind: 'native', title: (p.caption || '').split('\n')[0].slice(0, 140), date: p.timestamp, image: p.media_type === 'VIDEO' ? p.thumbnail_url : p.media_url, video: p.media_type === 'VIDEO' ? p.media_url : null, url: p.permalink }));
    } else {
      instagram = (data.instagram || []).map((u) => ({ platform: 'instagram', kind: 'ig-embed', embed: igEmbedUrl(u), url: u, title: 'Instagram post' })).filter((x) => x.embed);
    }
    const photos = (data.photos || []).map((p) => ({ platform: 'studio', kind: 'native', title: p.caption || p.alt || '', alt: p.alt, image: p.src }));
    const fb = { platform: 'facebook', kind: 'facebook', url: data.facebook, title: 'Disco Sundays on Facebook' };
    const igProfile = { platform: 'instagram', kind: 'profile', title: '@discosundays', text: 'Session clips, artists and behind-the-scenes from the studio.', url: data.instagramProfile, cta: 'Follow on Instagram' };
    return { youtube, instagram, photos, fb, igProfile, ytOk: youtube.length > 0 };
  }

  // Interleave platforms so the grid feels like one feed.
  function mix({ youtube, instagram, photos, fb, igProfile }) {
    const out = [];
    const q = [youtube.slice(), instagram.slice(), photos.slice()];
    let i = 0;
    while (q.some((a) => a.length)) { const a = q[i % q.length]; if (a.length) out.push(a.shift()); i++; }
    out.splice(Math.min(3, out.length), 0, fb);
    if (!instagram.length) out.splice(Math.min(1, out.length), 0, igProfile);
    return out;
  }

  // ---------- homepage feed ----------
  if (feed) {
    loadItems().then((src) => {
      const limit = Number(feed.dataset.limit || 9);
      const yt = src.youtube.slice(0, 5);
      const ig = src.instagram.slice(0, 2);
      const items = [];
      if (yt[0]) items.push([yt[0], 'tile--feature']);
      if (ig[0]) items.push([ig[0], 'tile--tall']);
      else items.push([src.igProfile, '']);
      if (yt[1]) items.push([yt[1], '']);
      items.push([src.fb, '']);
      if (yt[2]) items.push([yt[2], '']);
      if (ig[1]) items.push([ig[1], 'tile--tall']);
      yt.slice(3).forEach((v) => items.push([v, '']));
      src.photos.slice(0, 2).forEach((p) => items.push([p, '']));
      feed.innerHTML = '';
      items.slice(0, limit).forEach(([it, cls]) => feed.append(tile(it, cls)));
    });
  }

  // ---------- gallery wall ----------
  if (wall) {
    const filters = [...document.querySelectorAll('[data-wall-filters] [data-platform]')];
    const status = document.querySelector('[data-wall-status]');
    let current = new URLSearchParams(location.search).get('platform') || 'all';
    if (!filters.some((f) => f.dataset.platform === current)) current = 'all';

    function apply(pf, push) {
      current = pf;
      filters.forEach((b) => { const on = b.dataset.platform === pf; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); });
      let n = 0;
      [...wall.children].forEach((c) => { const ok = pf === 'all' || c.dataset.platform === pf; c.hidden = !ok; if (ok) n++; });
      if (status) status.textContent = `${n} item${n === 1 ? '' : 's'}${pf === 'all' ? '' : ' from ' + LABEL[pf]}`;
      if (push) { const u = new URL(location.href); pf === 'all' ? u.searchParams.delete('platform') : u.searchParams.set('platform', pf); history.replaceState(history.state, '', u); }
    }
    filters.forEach((b) => b.addEventListener('click', () => apply(b.dataset.platform, true)));

    loadItems().then((src) => {
      wall.innerHTML = '';
      const items = mix(src);
      if (!src.ytOk) items.push({ platform: 'youtube', kind: 'profile', title: 'Disco Sundays on YouTube', text: 'Sessions, performances and releases from the channel.', url: data.youtube, cta: 'Open YouTube' });
      items.forEach((it, i) => wall.append(tile(it, it.kind === 'youtube' && i % 7 === 0 ? 'tile--wide' : '')));
      apply(current, false);
    });
  }
})();
