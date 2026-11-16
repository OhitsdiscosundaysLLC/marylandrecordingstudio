// "Alive" layer: dashboard-controlled motion, interest-based personalisation and the AI launcher.
// Everything here is progressive: the site works fully if this file never loads.
(() => {
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const DEF = { motion: { ambient: true, magneticButtons: true, cursorGlow: true, waveform: true, reveal: true, marquee: true }, personalization: { enabled: true }, ai: { enabled: false, voiceEnabled: false } };
  let S = DEF;
  const track = (e, p) => window.mrsTrack && window.mrsTrack(e, p);

  const getSettings = async () => {
    try { const c = JSON.parse(sessionStorage.getItem('mrs_settings') || 'null'); if (c && Date.now() - c.at < 120000) return c.v; } catch {}
    try { const r = await fetch('/api/settings'); if (!r.ok) throw 0; const v = await r.json(); try { sessionStorage.setItem('mrs_settings', JSON.stringify({ at: Date.now(), v })); } catch {} return v; } catch { return DEF; }
  };

  function applyMotion() {
    const m = S.motion || {};
    for (const k of Object.keys(DEF.motion)) root.classList.toggle(`no-${k}`, reduce || m[k] === false);
    if (reduce || m.reveal === false) document.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-in'));
  }

  // ---- Magnetic buttons (desktop pointer only) ----
  function magnetic() {
    if (!fine || reduce || S.motion.magneticButtons === false) return;
    document.querySelectorAll('.btn--primary.btn--lg:not([data-mag]), .trio .btn--primary:not([data-mag]), .ai-launch:not([data-mag])').forEach((b) => {
      b.dataset.mag = '';
      let raf = 0;
      b.addEventListener('pointermove', (e) => {
        const r = b.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) / r.width; const y = (e.clientY - r.top - r.height / 2) / r.height;
        cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { b.style.transform = `translate(${x * 10}px, ${y * 8}px)`; });
      });
      b.addEventListener('pointerleave', () => { cancelAnimationFrame(raf); b.style.transform = ''; });
    });
  }

  // ---- Cursor spotlight on glass cards (one listener, CSS variables only) ----
  let glowBound = false;
  function cursorGlow() {
    if (!fine || reduce || S.motion.cursorGlow === false || glowBound) return;
    glowBound = true;
    let raf = 0, ev = null;
    document.addEventListener('pointermove', (e) => {
      ev = e; if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = ev.target.closest && ev.target.closest('.trio__card, .svc-card, .eco-card, .qb, .svc-row a, .glass');
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${ev.clientX - r.left}px`); el.style.setProperty('--my', `${ev.clientY - r.top}px`);
      });
    }, { passive: true });
  }

  // ---- Live waveform under the hero copy (CSS animated; livelier while the radio plays) ----
  function waveform() {
    if (S.motion.waveform === false) return;
    document.querySelectorAll('[data-wave]:not(.is-built)').forEach((w) => {
      w.classList.add('is-built');
      const n = innerWidth < 760 ? 32 : 64;
      let html = '';
      for (let i = 0; i < n; i++) { const h = 18 + Math.round(70 * Math.abs(Math.sin(i * 0.47) * Math.cos(i * 0.13))); html += `<i style="--h:${h}%;--d:${(i % 9) * -0.13}s"></i>`; }
      w.innerHTML = html;
    });
  }

  // ---- Personalisation: visitor chooses an interest; the homepage adapts. Stored only in this browser. ----
  const INTEREST = {
    recording: { cta: 'Book recording · from $60', href: '/book?service=recording-session-1-hour', track: 'book_cta_click' },
    mixing: { cta: 'Book mixing · $75', href: '/book?service=mixing', track: 'book_cta_click' },
    membership: { cta: 'Join for $200/month', href: 'https://square.link/u/rJp640Zd', track: 'membership_checkout_click', external: true },
  };
  const getInterest = () => { try { return localStorage.getItem('mrs_interest') || ''; } catch { return ''; } };
  function personalise(interest) {
    const box = document.querySelector('[data-interest]');
    if (!box || S.personalization?.enabled === false) return;
    box.hidden = false;
    box.querySelectorAll('button[data-pick]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pick === interest)));
    const cta = document.querySelector('[data-hero-cta]');
    if (cta) {
      cta.dataset.orig ||= cta.innerHTML; cta.dataset.origHref ||= cta.getAttribute('href');
      const I = INTEREST[interest];
      if (I) {
        cta.textContent = I.cta; cta.href = I.href; cta.dataset.track = I.track; cta.dataset.label = `hero_${interest}`;
        if (I.external) { cta.target = '_blank'; cta.rel = 'noopener'; } else { cta.removeAttribute('target'); }
      } else { cta.innerHTML = cta.dataset.orig; cta.href = cta.dataset.origHref; cta.dataset.track = 'book_cta_click'; cta.dataset.label = 'hero'; cta.removeAttribute('target'); }
    }
    const list = document.querySelector('.svc-rows');
    if (list && interest) {
      const items = [...list.children];
      items.sort((a, b) => (b.dataset.primary === interest) - (a.dataset.primary === interest));
      items.forEach((li) => { list.append(li); li.classList.toggle('is-match', li.dataset.primary === interest); });
    }
    const note = box.querySelector('[data-interest-note]');
    if (note) note.textContent = interest ? 'Showing what fits you first. Saved only on this device.' : '';
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-interest] button[data-pick]');
    if (!b) return;
    const v = b.getAttribute('aria-pressed') === 'true' ? '' : b.dataset.pick;
    try { v ? localStorage.setItem('mrs_interest', v) : localStorage.removeItem('mrs_interest'); } catch {}
    if (v) track('interest_select', { label: v, page: location.pathname });
    personalise(v);
  });

  // ---- AI assistant launcher: ai.js loads only when someone opens it ----
  let aiLoading = null;
  const loadAI = () => aiLoading ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = document.querySelector('script[src*="alive.js"]').src.replace('alive.js', 'ai.js'); s.onload = res; s.onerror = rej; document.body.append(s); });
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-ai-open]');
    if (!t) return;
    e.preventDefault();
    await loadAI();
    window.mrsAI && window.mrsAI.open({ mode: t.dataset.aiOpen || 'chat', topic: t.dataset.aiTopic || '', interest: getInterest(), settings: S });
  });
  function launcher() {
    const l = document.querySelector('[data-ai-launch]');
    if (l) l.hidden = !S.ai?.enabled;
    document.querySelectorAll('[data-ai-inline]').forEach((x) => { x.hidden = !S.ai?.enabled; });
    document.querySelectorAll('[data-ai-voice]').forEach((x) => { x.hidden = !S.ai?.voiceEnabled; });
  }

  function refresh() { applyMotion(); magnetic(); cursorGlow(); waveform(); personalise(getInterest()); launcher(); }
  window.mrsAliveRefresh = refresh;
  const prev = window.mrsRefresh;
  window.mrsRefresh = () => { prev && prev(); refresh(); };
  applyMotion(); waveform(); personalise(getInterest());
  getSettings().then((v) => { S = { ...DEF, ...v, motion: { ...DEF.motion, ...(v.motion || {}) } }; window.mrsSettings = S; refresh(); });
})();
