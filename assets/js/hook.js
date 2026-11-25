// AI hook & lyric starter UI: generate, regenerate, refine, save (saved ideas stay in this browser).
(() => {
  const form = document.querySelector('[data-hk-form]');
  if (!form || form.dataset.ready) return; form.dataset.ready = '';
  const T = (s) => (window.mrsT ? window.mrsT(s) : s);
  const lang = () => (window.mrsLang ? window.mrsLang() : 'en');
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const out = document.querySelector('[data-hk-out]'); const status = document.querySelector('[data-hk-status]');
  const store = { get: () => { try { return JSON.parse(localStorage.getItem('mrs_ideas') || '[]'); } catch { return []; } }, set: (v) => { try { localStorage.setItem('mrs_ideas', JSON.stringify(v.slice(0, 30))); } catch {} } };
  if (lang() === 'es') form.querySelector('[name=lyricLang]').value = 'es';
  let concepts = []; let note = '';

  const card = (c, i, saved = false) => `<article class="hk__card" data-i="${i}">
    <h3>${esc(c.title)}</h3><p class="hk__concept">${esc(c.concept)}</p>
    <div class="hk__hook"><span>${esc(T('Hook'))}</span>${c.hook.map((l) => `<p>${esc(l)}</p>`).join('')}</div>
    ${c.chorus ? `<p><strong>${esc(T('Chorus direction'))}:</strong> ${esc(c.chorus)}</p>` : ''}
    ${c.verse.length ? `<div><strong>${esc(T('Verse ideas'))}:</strong><ul>${c.verse.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>` : ''}
    ${c.structure.length ? `<p class="hk__struct">${c.structure.map((s) => `<span>${esc(s)}</span>`).join('')}</p>` : ''}
    ${c.direction ? `<p class="muted">${esc(c.direction)}</p>` : ''}
    <div class="hk__act">${saved ? `<button type="button" class="btn btn--ghost btn--sm" data-hk-del="${i}">${esc(T('Remove'))}</button>` : `<button type="button" class="btn btn--ghost btn--sm" data-hk-save="${i}">${esc(T('Save'))}</button>
      <button type="button" class="btn btn--ghost btn--sm" data-hk-refine="${i}">${esc(T('Refine'))}</button>`}
      <button type="button" class="btn btn--ghost btn--sm" data-hk-copy="${i}" data-saved="${saved ? 1 : 0}">${esc(T('Copy'))}</button></div>
    <div class="hk__refine" data-hk-refbox="${i}" hidden><label class="field"><span class="label">${esc(T('How should we change it?'))}</span><input maxlength="300" placeholder="${esc(T('e.g. darker, more hopeful, shorter hook, add a call-and-response'))}"></label><button type="button" class="btn btn--primary btn--sm" data-hk-refgo="${i}">${esc(T('Refine this idea'))}</button></div>
  </article>`;
  const asText = (c) => [c.title, '', ...c.hook, '', c.chorus, ...c.verse, '', c.structure.join(' → '), c.direction].filter((x) => x !== undefined).join('\n');

  function render() {
    out.hidden = false;
    out.innerHTML = `${note ? `<p class="muted">${esc(note)}</p>` : ''}<div class="hk__grid">${concepts.map((c, i) => card(c, i)).join('')}</div>
      <div class="hk__more"><button type="button" class="btn btn--ghost" data-hk-again>${esc(T('Regenerate'))}</button></div>
      <div class="hk__next"><p><strong>${esc(T('Got a hook you love?'))}</strong> ${esc(T('Bring it to the booth, or learn to build the beat yourself.'))}</p><div class="btn-row"><a class="btn btn--primary" href="/book?service=recording-session-2-hours" data-track="book_cta_click" data-via="ai" data-label="hook_record">${esc(T('Book a recording session'))}</a><a class="btn btn--ghost" href="/artist-development" data-track="ecosystem_click" data-label="hook_ad">${esc(T('Explore Artist Development'))}</a><a class="btn btn--ghost" href="/release-planner" data-track="ecosystem_click" data-label="hook_planner">${esc(T('Plan the release'))}</a></div></div>`;
  }
  function renderSaved() {
    const list = store.get(); const box = document.querySelector('[data-hk-saved]');
    box.hidden = !list.length; document.querySelector('[data-hk-list]').innerHTML = `<div class="hk__grid">${list.map((c, i) => card(c, i, true)).join('')}</div>`;
  }
  async function call(extra = {}) {
    const fd = new FormData(form); const V = window.mrsVisitor || {};
    const r = await fetch('/api/ai/hook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...Object.fromEntries(fd.entries()), lang: lang(), visitor_id: V.vid, ...extra }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || T('Please try again.')); return j;
  }
  async function generate() {
    const btn = form.querySelector('[data-hk-go]'); btn.disabled = true; const label = btn.textContent; btn.textContent = T('Writing…');
    status.className = 'form__status'; status.textContent = '';
    try { const j = await call(); concepts = j.concepts; note = j.note; render(); out.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    catch (ex) { status.className = 'form__status is-error'; status.textContent = ex.message; }
    btn.disabled = false; btn.textContent = label;
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); generate(); });
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('button'); if (!t || !t.closest('.hk')) return;
    if (t.matches('[data-hk-again]')) generate();
    if (t.dataset.hkSave) { const list = store.get(); list.unshift(concepts[+t.dataset.hkSave]); store.set(list); renderSaved(); t.textContent = T('Saved ✓'); t.disabled = true; }
    if (t.dataset.hkDel) { const list = store.get(); list.splice(+t.dataset.hkDel, 1); store.set(list); renderSaved(); }
    if (t.dataset.hkCopy) { const c = t.dataset.saved === '1' ? store.get()[+t.dataset.hkCopy] : concepts[+t.dataset.hkCopy]; try { await navigator.clipboard.writeText(asText(c)); t.textContent = T('Copied'); } catch {} }
    if (t.dataset.hkRefine) { const box = out.querySelector(`[data-hk-refbox="${t.dataset.hkRefine}"]`); box.hidden = !box.hidden; box.querySelector('input').focus(); }
    if (t.dataset.hkRefgo) {
      const i = +t.dataset.hkRefgo; const box = out.querySelector(`[data-hk-refbox="${i}"]`); t.disabled = true; t.textContent = T('Refining…');
      try { const j = await call({ refine: { concept: concepts[i], instruction: box.querySelector('input').value } }); concepts[i] = j.concepts[0]; render(); }
      catch (ex) { t.textContent = ex.message; t.disabled = false; }
    }
  });
  renderSaved();
})();
