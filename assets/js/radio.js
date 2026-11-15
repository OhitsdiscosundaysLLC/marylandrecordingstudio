// Disco Sundays Radio: one shared <audio> for the whole site.
// - Never autoplays: playback only starts from a visitor's click.
// - Shows live "now playing" from the station's Airtime Pro live-info API.
// - Handles buffering, stalls and errors, with automatic reconnect.
// - While the radio is playing, internal links load pages in place so the music keeps going.
(() => {
  const CFG = window.MRS_RADIO;
  if (!CFG) return;
  const track = (e, p) => window.mrsTrack && window.mrsTrack(e, p);
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

  let audio = null;
  let state = 'idle'; // idle | loading | playing | paused | error
  let nowText = CFG.tagline;
  let infoTimer = null;
  let retries = 0;
  const mini = document.querySelector('[data-mini-player]');

  function setState(s, msg) {
    state = s;
    const label = {
      idle: 'Press play to listen',
      loading: 'Connecting to the stream…',
      playing: 'Live now',
      paused: 'Paused',
      error: msg || "The stream isn't available right now. Try again in a moment.",
    }[s];
    document.querySelectorAll('[data-radio-status]').forEach((el) => { el.textContent = label; el.dataset.state = s; });
    document.querySelectorAll('[data-radio-toggle]').forEach((b) => {
      const playing = s === 'playing' || s === 'loading';
      b.classList.toggle('is-playing', playing);
      b.classList.toggle('is-loading', s === 'loading');
      if (!b.classList.contains('hero__radio')) b.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${CFG.name}`);
      b.setAttribute('aria-pressed', String(playing));
    });
    document.documentElement.classList.toggle('radio-on', s === 'playing' || s === 'loading');
    if (mini && (s === 'playing' || s === 'loading')) mini.hidden = false;
  }

  function setNow(text) {
    nowText = text || CFG.tagline;
    document.querySelectorAll('[data-radio-now]').forEach((el) => { el.textContent = nowText; });
    if ('mediaSession' in navigator && state === 'playing') {
      navigator.mediaSession.metadata = new MediaMetadata({ title: nowText, artist: CFG.name, artwork: [{ src: '/assets/brand/icon-512.png', sizes: '512x512', type: 'image/png' }] });
    }
  }

  async function fetchInfo() {
    try {
      const r = await fetch(CFG.info, { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      const name = d?.current?.name || d?.current?.metadata?.track_title;
      const show = d?.currentShow?.[0]?.name;
      setNow([name, show && !/auto dj/i.test(show) ? show : null].filter(Boolean).join(' · ') || CFG.tagline);
    } catch { /* metadata is optional */ }
  }

  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = 'none';
    const v = parseFloat(store.get('mrs-radio-volume'));
    audio.volume = Number.isFinite(v) ? v : 0.8;
    syncVolume();
    audio.addEventListener('playing', () => { retries = 0; setState('playing'); });
    audio.addEventListener('waiting', () => { if (state === 'playing') setState('loading'); });
    audio.addEventListener('stalled', () => { if (state === 'playing') setState('loading'); });
    audio.addEventListener('pause', () => { if (state !== 'error') setState('paused'); });
    audio.addEventListener('error', () => {
      if (state === 'paused' || state === 'idle') return;
      if (retries < 2) { retries++; setState('loading'); setTimeout(() => start(true), 2000 * retries); return; }
      setState('error');
      track('radio_error', {});
    });
    return audio;
  }

  function start(isRetry) {
    const a = ensureAudio();
    // Live streams: always reconnect to the live edge instead of resuming old buffer.
    a.src = `${CFG.stream}${CFG.stream.includes('?') ? '&' : '?'}t=${Date.now()}`;
    setState('loading');
    a.play().catch((err) => {
      if (err && err.name === 'NotAllowedError') setState('paused');
      else if (!isRetry) setState('error');
    });
    fetchInfo();
    clearInterval(infoTimer);
    infoTimer = setInterval(fetchInfo, 30000);
    if (!isRetry) track('radio_play', { page: location.pathname });
  }

  function stop() {
    if (!audio) return;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    clearInterval(infoTimer);
    setState('paused');
  }

  function syncVolume() {
    document.querySelectorAll('[data-radio-volume]').forEach((r) => { r.value = String(audio ? audio.volume : 0.8); });
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-radio-toggle]');
    if (t) { (state === 'playing' || state === 'loading') ? stop() : start(); return; }
    if (e.target.closest('[data-radio-close]')) { stop(); if (mini) mini.hidden = true; document.documentElement.classList.remove('radio-on'); }
  });
  document.addEventListener('input', (e) => {
    const r = e.target.closest('[data-radio-volume]');
    if (!r) return;
    ensureAudio().volume = Number(r.value);
    store.set('mrs-radio-volume', r.value);
    syncVolume();
  });

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => start());
    navigator.mediaSession.setActionHandler('pause', () => stop());
    navigator.mediaSession.setActionHandler('stop', () => stop());
  }

  // Show station info before play, without touching the audio.
  if (document.querySelector('[data-radio-player], .hero__radio')) fetchInfo();

  // ---------- keep the music playing across pages ----------
  const isPlaying = () => state === 'playing' || state === 'loading';
  const sameSite = (a) => a && a.origin === location.origin && !a.target && !a.hasAttribute('download') && !a.href.includes('#') && !/\.(xml|txt|json|png|jpe?g|webp|pdf)$/i.test(a.pathname) && !a.pathname.startsWith('/api/');

  let swap = async function (url, push) {
    let html;
    try {
      const r = await fetch(url, { headers: { accept: 'text/html' } });
      html = await r.text();
    } catch { location.href = url; return; }
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const newMain = doc.querySelector('main');
    if (!newMain) { location.href = url; return; }
    document.querySelector('main').replaceWith(newMain);
    document.title = doc.title;
    document.body.className = doc.body.className;
    ['[data-nav-list]', '.mobile-menu__main'].forEach((sel) => { const n = doc.querySelector(sel); const o = document.querySelector(sel); if (n && o) o.innerHTML = n.innerHTML; });
    const sticky = document.querySelector('[data-sticky-cta]');
    if (sticky) sticky.hidden = !doc.querySelector('[data-sticky-cta]');
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || '');
    if (push) history.pushState({ mrs: true }, '', url);
    window.scrollTo(0, 0);
    // Re-run the new page's scripts.
    document.querySelectorAll('script[data-page-script]').forEach((s) => s.remove());
    doc.querySelectorAll('script[data-page-script]').forEach((s) => {
      const n = document.createElement('script');
      n.src = s.src.split('?')[0] + '?r=' + Date.now();
      n.dataset.pageScript = '';
      document.body.append(n);
    });
    window.mrsRefresh && window.mrsRefresh();
    setState(state);
    setNow(nowText);
    syncVolume();
    newMain.focus({ preventScroll: true });
    track('page_view', { page: new URL(url).pathname, via: 'radio' });
  };

  document.addEventListener('click', (e) => {
    if (!isPlaying() || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if (!sameSite(a)) return;
    e.preventDefault();
    swap(a.href, true);
  });
  history.replaceState({ mrs: true, ...(history.state || {}) }, '');
  let swapped = false;
  const _swap = swap;
  swap = async (u, p) => { swapped = true; return _swap(u, p); };
  addEventListener('popstate', (e) => {
    if (!e.state || !e.state.mrs || !swapped) return; // ordinary history (e.g. booking page service changes)
    if (isPlaying()) swap(location.href, false);
    else location.reload();
  });
})();
