// AI release planner UI.
(() => {
  const form = document.querySelector('[data-rp-form]');
  if (!form || form.dataset.ready) return; form.dataset.ready = '';
  const T = (s) => (window.mrsT ? window.mrsT(s) : s);
  const lang = () => (window.mrsLang ? window.mrsLang() : 'en');
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const out = document.querySelector('[data-rp-out]'); const status = document.querySelector('[data-rp-status]');
  const NAMES = { recording: 'Recording', production: 'Editing & production', mixing: 'Mixing', mastering: 'Mastering', artwork: 'Artwork & visuals', distribution: 'Upload to distributor', marketing: 'Marketing & promotion', release: 'Release day' };
  const WHAT = {
    recording: 'Record final vocals and instruments. Book enough studio time to finish without rushing.',
    production: 'Comp vocals, edit timing and tuning, finish the arrangement and production.',
    mixing: 'Balance, EQ, compression and effects so the song translates everywhere.',
    mastering: 'Final loudness and polish, plus streaming-ready masters for every song.',
    artwork: 'Cover art, square and vertical visuals, and short clips for promotion.',
    distribution: 'Upload masters, artwork and credits to your distributor so stores and playlist pitching have time.',
    marketing: 'Teasers, pre-save link, content calendar, outreach, then a push after release.',
    release: 'Go live, share everywhere and thank the people who helped.',
  };
  const STATUS = { done: 'Done', upcoming: 'On track', at_risk: 'Start now', overdue: 'Behind schedule' };
  const fmt = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString(lang() === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const store = { get: () => { try { return JSON.parse(localStorage.getItem('mrs_plans') || '[]'); } catch { return []; } }, set: (v) => { try { localStorage.setItem('mrs_plans', JSON.stringify(v.slice(0, 12))); } catch {} } };
  let current = null;
  const dateInput = form.querySelector('[name=releaseDate]');
  const min = new Date(); dateInput.min = min.toISOString().slice(0, 10);
  if (!dateInput.value) { const d = new Date(Date.now() + 60 * 864e5); dateInput.value = d.toISOString().slice(0, 10); }
  form.querySelector('[name=type]').addEventListener('change', (e) => { const s = form.querySelector('[name=songs]'); s.value = { single: 1, ep: 5, album: 10 }[e.target.value]; });

  function renderSaved() {
    const list = store.get(); const box = document.querySelector('[data-rp-saved]');
    box.hidden = !list.length;
    document.querySelector('[data-rp-list]').innerHTML = list.map((p) => `<li><a href="?plan=${esc(p.id)}&k=${esc(p.key)}">${esc(p.title)}</a> <span class="muted">${esc(fmt(p.releaseDate))}</span></li>`).join('');
  }

  function render(d) {
    current = d; const tl = d.timeline; const ai = d.ai || {};
    const R = Date.parse(tl.releaseDate); const first = Math.min(...tl.phases.map((p) => Date.parse(p.start)), Date.parse(tl.today));
    const last = Math.max(...tl.phases.map((p) => Date.parse(p.end))); const span = Math.max(1, last - first);
    const pos = (s, e) => `left:${((Date.parse(s) - first) / span) * 100}%;width:${Math.max(1.2, ((Date.parse(e) - Date.parse(s) + 864e5) / span) * 100)}%`;
    const todayPct = ((Date.parse(tl.today) - first) / span) * 100;
    out.hidden = false;
    out.innerHTML = `<div class="rp__head">
      <p class="eyebrow">${esc(T('Your release plan'))}</p><h2 class="h2">${esc(d.input.title)}</h2>
      <p class="rp__meta">${esc(T('Release date'))}: <strong>${esc(fmt(tl.releaseDate))}</strong> · ${tl.daysToRelease >= 0 ? `${tl.daysToRelease} ${esc(T('days to go'))}` : esc(T('This date has passed'))} · ${tl.songs} ${esc(tl.songs === 1 ? T('song') : T('songs'))}</p>
      ${tl.tight ? `<p class="rp__warn">⚠️ ${esc(T('This timeline is tight for the work that is left.'))} ${tl.suggestedDate ? `${esc(T('A realistic release date would be around'))} <strong>${esc(fmt(tl.suggestedDate))}</strong>.` : ''}</p>` : ''}
      ${ai.summary ? `<p class="rp__ai"><span class="ai-orb ai-orb--sm" aria-hidden="true"></span>${esc(ai.summary)}</p>` : ''}
    </div>
    <div class="rp__gantt" aria-hidden="true"><span class="rp__today" style="left:${todayPct}%">${esc(T('Today'))}</span>${tl.phases.map((p) => `<div class="rp__row"><span>${esc(T(NAMES[p.key]))}</span><i class="is-${p.status}" style="${pos(p.start, p.end)}"></i></div>`).join('')}</div>
    <ol class="rp__phases">${tl.phases.map((p) => `<li class="rp__ph is-${p.status}">
      <div class="rp__ph-top"><h3>${esc(T(NAMES[p.key]))}</h3><span class="rp__badge">${esc(T(STATUS[p.status]))}</span></div>
      <p class="rp__dates">${p.start === p.end ? esc(fmt(p.start)) : `${esc(fmt(p.start))} → ${esc(fmt(p.end))} · ${p.days} ${esc(T('days'))}`}</p>
      <p>${esc(T(WHAT[p.key]))}</p>
      ${ai.phaseTips?.[p.key] ? `<p class="rp__tip"><strong>${esc(T('Tip'))}:</strong> ${esc(ai.phaseTips[p.key])}</p>` : ''}
      ${p.status !== 'done' && p.services.length ? `<div class="rp__svc">${p.services.map((s) => `<a class="btn btn--ghost btn--sm" href="${esc(s.url)}"${s.external ? ' target="_blank" rel="noopener"' : ''} data-track="${s.type === 'purchase' ? 'membership_checkout_click' : s.type === 'page' ? 'ecosystem_click' : 'book_cta_click'}" data-via="ai" data-label="planner_${esc(s.slug)}">${esc(T(s.label))}: ${esc(s.name)}${s.price ? ` · ${esc(s.price)}` : ''}</a>`).join('')}</div><div class="rp__slots" data-slots="${esc(p.services.find((s) => s.type === 'book')?.slug || '')}"></div>` : ''}
    </li>`).join('')}</ol>
    ${(ai.risks || []).length ? `<div class="rp__risks"><h3>${esc(T('Watch out for'))}</h3><ul>${ai.risks.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
    <div class="rp__actions">
      ${d.id ? `<button type="button" class="btn btn--ghost btn--sm" data-rp-copy>${esc(T('Copy link to this plan'))}</button>` : ''}
      <button type="button" class="btn btn--ghost btn--sm" data-rp-print>${esc(T('Print / save as PDF'))}</button>
      <button type="button" class="btn btn--ghost btn--sm" data-rp-edit>${esc(T('Edit plan'))}</button><button type="button" class="btn btn--ghost btn--sm" data-rp-new>${esc(T('New plan'))}</button>
      <a class="btn btn--primary btn--sm" href="/artist-development" data-track="ecosystem_click" data-label="planner_ad">${esc(T('Want guidance? See Artist Development'))}</a>
    </div>
    <p class="fb__fine">${esc(T('Timeframes are recommended planning windows, not guarantees. Distributors and streaming services set their own deadlines, so check yours.'))}</p>`;
    out.querySelector('[data-rp-print]').onclick = () => print();
    out.querySelector('[data-rp-edit]').onclick = () => { form.scrollIntoView({ behavior: 'smooth' }); form.querySelector('input,select')?.focus({ preventScroll: true }); };
    out.querySelector('[data-rp-new]').onclick = () => { current = null; history.replaceState(null, '', location.pathname); form.reset(); out.hidden = true; status.textContent = ''; form.querySelector('[data-rp-go]').textContent = T('Build my release plan'); form.scrollIntoView({ behavior: 'smooth' }); };
    const cp = out.querySelector('[data-rp-copy]'); if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(location.href); cp.textContent = T('Link copied'); } catch { prompt('', location.href); } };
    window.mrsAvailability && out.querySelectorAll('[data-slots]').forEach((el) => el.dataset.slots && window.mrsAvailability(el, el.dataset.slots, { from: d.timeline.phases.find((p) => p.services.some((s) => s.slug === el.dataset.slots))?.start }));
    out.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  function fill(inp) {
    for (const [k, v] of Object.entries(inp)) {
      if (k === 'goals') form.querySelectorAll('[name=goals]').forEach((c) => (c.checked = v.includes(c.value)));
      else if (k === 'stage') form.querySelectorAll('[name=stage]').forEach((c) => (c.checked = c.value === v));
      else { const el = form.querySelector(`[name=${k}]`); if (el) el.value = v; }
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const err = form.querySelector('[data-err=releaseDate]'); err.textContent = '';
    if (!fd.get('releaseDate')) { err.textContent = T('Pick your release date.'); return; }
    const btn = form.querySelector('[data-rp-go]'); btn.disabled = true; const label = btn.textContent; btn.textContent = T('Building your plan…');
    status.className = 'form__status'; status.textContent = '';
    const V = window.mrsVisitor || {};
    const body = { title: fd.get('title'), releaseDate: fd.get('releaseDate'), type: fd.get('type'), songs: fd.get('songs'), stage: fd.get('stage'), goals: fd.getAll('goals'), details: fd.get('details'), lang: lang(), visitor_id: V.vid, source: V.source };
    const update = current?.id && current?.key;
    try {
      const r = await fetch(`/api/ai/release?action=${update ? 'update' : 'create'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update ? { ...body, id: current.id, key: current.key } : body) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || T('Could not build the plan.'));
      if (j.id && j.key) {
        history.replaceState(null, '', `?plan=${j.id}&k=${j.key}`);
        const list = store.get().filter((p) => p.id !== j.id); list.unshift({ id: j.id, key: j.key, title: j.input.title, releaseDate: j.input.releaseDate }); store.set(list); renderSaved();
      }
      render(j);
      status.textContent = update ? T('Plan updated and saved.') : j.id ? T('Plan saved. Bookmark this page or copy the link to come back to it.') : '';
      btn.textContent = T('Update my plan');
    } catch (ex) { status.className = 'form__status is-error'; status.textContent = ex.message; btn.textContent = label; }
    btn.disabled = false;
  });

  (async () => {
    renderSaved();
    const q = new URLSearchParams(location.search);
    if (q.get('plan') && q.get('k')) {
      status.textContent = T('Loading your plan…');
      try {
        const r = await fetch('/api/ai/release?action=get', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: q.get('plan'), key: q.get('k') }) });
        const j = await r.json(); if (!r.ok) throw new Error();
        j.key = q.get('k'); fill(j.input); render(j); status.textContent = '';
        form.querySelector('[data-rp-go]').textContent = T('Update my plan');
      } catch { status.className = 'form__status is-error'; status.textContent = T("We couldn't find that plan. Build a new one below."); }
    }
  })();
})();
