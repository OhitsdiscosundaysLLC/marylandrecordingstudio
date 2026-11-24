// English / Spanish switch. English is the source HTML; Spanish is applied to marked areas
// ([data-i18n-scope]: navigation, forms, buttons, AI tools) from /assets/i18n/es.json.
(() => {
  const root = document.documentElement;
  let lang = 'en';
  try { const q = new URLSearchParams(location.search).get('lang'); if (q === 'es' || q === 'en') localStorage.setItem('mrs_lang', q); lang = localStorage.getItem('mrs_lang') === 'es' ? 'es' : 'en'; } catch {}
  let ES = null;
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const t = (s) => { if (lang !== 'es' || !ES || s == null) return s; const k = norm(String(s)); return ES[k] ?? ES[k.replace(/[:.]$/, '')] ?? s; };
  window.mrsLang = () => lang;
  window.mrsT = t;
  const ATTRS = ['placeholder', 'aria-label', 'title'];
  function translate(node) {
    if (!ES) return;
    const scope = node.nodeType === 1 ? node : node.parentElement;
    if (!scope || !(scope.closest('[data-i18n-scope]') || scope.querySelector?.('[data-i18n-scope]'))) return;
    const roots = scope.closest('[data-i18n-scope]') ? [scope] : [...scope.querySelectorAll('[data-i18n-scope]')];
    for (const r of roots) {
      const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        if (n.parentElement.closest('script,style,[data-no-i18n],[data-radio-now]')) continue;
        const k = norm(n.nodeValue); if (!k || !ES[k] || ES[k] === k) continue;
        const lead = n.nodeValue.match(/^\s*/)[0], trail = n.nodeValue.match(/\s*$/)[0];
        n.nodeValue = lead + ES[k] + trail;
      }
      (r.matches?.('[placeholder],[aria-label],[title]') ? [r] : []).concat([...r.querySelectorAll('[placeholder],[aria-label],[title]')]).forEach((el) => ATTRS.forEach((a) => { const v = el.getAttribute(a); const tr = v && ES[norm(v)]; if (tr && tr !== v) el.setAttribute(a, tr); }));
    }
  }
  function toggles() {
    document.querySelectorAll('[data-lang-toggle]').forEach((b) => {
      const wide = b.classList.contains('lang-toggle--wide');
      b.textContent = lang === 'es' ? (wide ? 'English' : 'EN') : (wide ? 'Español' : 'ES');
      b.setAttribute('aria-label', lang === 'es' ? 'View in English' : 'Ver en español');
      b.setAttribute('lang', lang === 'es' ? 'en' : 'es');
      b.onclick = () => { try { localStorage.setItem('mrs_lang', lang === 'es' ? 'en' : 'es'); } catch {} const u = new URL(location.href); u.searchParams.delete('lang'); location.href = u.toString(); };
    });
  }
  toggles();
  if (lang !== 'es') { root.classList.remove('i18n-pending'); return; }
  root.lang = 'es';
  fetch('/assets/i18n/es.json', { cache: 'force-cache' }).then((r) => r.json()).then((d) => {
    ES = d; translate(document.body); root.classList.remove('i18n-pending');
    new MutationObserver((ms) => { for (const m of ms) { if (m.type === 'characterData') translate(m.target); m.addedNodes.forEach((n) => (n.nodeType === 1 || n.nodeType === 3) && translate(n)); } }).observe(document.body, { childList: true, subtree: true, characterData: true });
    document.dispatchEvent(new CustomEvent('mrs:lang'));
  }).catch(() => root.classList.remove('i18n-pending'));
})();
