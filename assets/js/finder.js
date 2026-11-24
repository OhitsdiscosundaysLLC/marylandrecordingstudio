// AI session finder: 3 taps -> personalised plan with real Book / Join buttons.
(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const track = (e, p) => window.mrsTrack && window.mrsTrack(e, p);
  document.querySelectorAll('[data-finder]:not([data-ready])').forEach((root) => {
    root.dataset.ready = '';
    const form = root.querySelector('[data-finder-form]');
    const out = root.querySelector('[data-finder-result]');
    const show = () => { const S = window.mrsSettings; root.hidden = !!(S && S.conversion && S.conversion.quiz === false); };
    show(); document.addEventListener('mrs:settings', show);
    let started = false;
    form.addEventListener('change', (e) => {
      if (!started) { started = true; track('quiz_start', { page: location.pathname }); }
      const q = e.target.closest('[data-q]');
      const next = q && q.nextElementSibling;
      if (e.target.type === 'radio' && next && next.matches('[data-q]') && next.hidden) {
        next.hidden = false;
        next.querySelector('input')?.focus({ preventScroll: true });
        next.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      if (!fd.get('goal') || !fd.get('freq') || !fd.get('stage')) { out.hidden = false; out.innerHTML = '<p class="finder__err">Pick an answer for each question.</p>'; return; }
      const btn = form.querySelector('[data-finder-go]');
      btn.disabled = true; btn.textContent = 'Building your plan…';
      out.hidden = false; out.innerHTML = '<div class="finder__loading"><i></i><i></i><i></i></div>';
      try {
        const V = window.mrsVisitor || {};
        const r = await fetch('/api/ai/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...Object.fromEntries(fd.entries()), visitor_id: V.vid, source: V.source, lang: window.mrsLang ? window.mrsLang() : 'en', page: location.pathname }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Could not build a plan');
        const p = j.plan;
        try { localStorage.setItem('mrs_interest', fd.get('goal') === 'mix' || fd.get('goal') === 'master' ? 'mixing' : fd.get('freq') !== 'once' ? 'membership' : 'recording'); } catch {}
        out.innerHTML = `<div class="finder__plan">
          <h3>${esc(p.headline)}</h3>${p.summary ? `<p>${esc(p.summary)}</p>` : ''}
          ${p.steps.length ? `<ol>${p.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
          ${p.estimate ? `<p class="finder__est">${esc(p.estimate)}</p>` : ''}
          <div class="finder__cards">${j.cards.map((c, i) => `<a class="finder__card${i === 0 ? ' is-top' : ''}" href="${esc(c.url)}"${c.external ? ' target="_blank" rel="noopener"' : ''} data-track="${c.type === 'purchase' ? 'membership_checkout_click' : c.type === 'page' ? 'ecosystem_click' : 'book_cta_click'}" data-via="ai" data-label="finder_${esc(c.slug)}">${i === 0 ? '<span class="finder__pick">Best match</span>' : ''}<strong>${esc(c.name)}</strong><span>${esc(c.price || '')}${c.duration ? ` · ${c.duration >= 60 ? c.duration / 60 + ' hr' : c.duration + ' min'}` : ''}</span><em>${esc(c.label)} →</em></a>`).join('')}</div>
          <div class="finder__more"><button type="button" class="btn btn--ghost btn--sm" data-ai-open="chat" data-ai-topic="${esc(`I used the session finder (${fd.get('goal')}, ${fd.get('freq')}, ${fd.get('stage')}). Can you help me choose between the options?`)}">Questions? Ask the AI</button><button type="button" class="btn btn--ghost btn--sm" data-finder-reset>Start over</button></div>
          <details class="finder__save"><summary>Want the team to help you plan it?</summary>
            <form data-finder-lead><input type="hidden" name="plan" value="${esc(p.headline + ' — ' + j.cards.map((c) => c.name).join(', '))}">
              <div class="form__row"><label class="field"><span>Name</span><input name="name" autocomplete="name" maxlength="120"></label><label class="field"><span>Email or phone</span><input name="contact" autocomplete="email" maxlength="200" required></label></div>
              <label class="checkline"><input type="checkbox" name="consent" required> <span>The studio team can contact me about this.</span></label>
              <div class="hp" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></div>
              <button class="btn btn--primary btn--sm">Send to the team</button><p class="finder__msg" role="status"></p></form></details>
        </div>`;
        out.querySelector('[data-finder-reset]').onclick = () => { form.reset(); form.querySelectorAll('[data-q]').forEach((q, i) => { q.hidden = i > 0; }); out.hidden = true; root.scrollIntoView({ block: 'start' }); };
        const lf = out.querySelector('[data-finder-lead]');
        lf.onsubmit = async (ev) => {
          ev.preventDefault();
          const d = Object.fromEntries(new FormData(lf).entries()); const msg = lf.querySelector('.finder__msg');
          const isEmail = d.contact.includes('@');
          const r2 = await fetch('/api/ai/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: d.name, email: isEmail ? d.contact : '', phone: isEmail ? '' : d.contact, service: { record: 'recording', mix: 'mixing', master: 'mastering', podcast: 'podcast', voiceover: 'voice-over', develop: 'artist-development' }[fd.get('goal')] || 'other', project: `Session finder: ${fd.get('goal')}, ${fd.get('freq')}, ${fd.get('stage')}. ${fd.get('note') || ''} Plan: ${d.plan}`, consent_contact: !!d.consent, source: 'ai_quiz', website: d.website }) });
          const j2 = await r2.json().catch(() => ({}));
          msg.textContent = r2.ok ? "Sent! The team will be in touch." : (j2.error || 'Could not send. Please call or text us.');
          if (r2.ok) lf.querySelector('button').disabled = true;
        };
      } catch (err) {
        out.innerHTML = `<p class="finder__err">${esc(err.message)}. <a href="/book">Browse all services</a>.</p>`;
      }
      btn.disabled = false; btn.textContent = 'Get my plan';
    });
  });
})();
