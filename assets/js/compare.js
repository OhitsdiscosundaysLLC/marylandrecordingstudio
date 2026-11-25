// Mix vs reference comparison UI (measurements in-browser + AI explanation).
(() => {
  const root = document.querySelector('[data-cmp]');
  if (!root || root.dataset.ready) return; root.dataset.ready = '';
  const T = (s) => (window.mrsT ? window.mrsT(s) : s);
  const lang = () => (window.mrsLang ? window.mrsLang() : 'en');
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = (s) => root.querySelector(s);
  // Tabs
  document.querySelectorAll('[data-fb-tab]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('[data-fb-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    document.getElementById('panel-fb').hidden = b.dataset.fbTab !== 'fb'; document.getElementById('panel-cmp').hidden = b.dataset.fbTab !== 'cmp';
    history.replaceState(null, '', b.dataset.fbTab === 'cmp' ? '#compare' : location.pathname);
  }));
  if (location.hash === '#compare') document.querySelector('[data-fb-tab=cmp]').click();
  const bufs = {}; let actx = null;
  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const status = (t, c = '') => { const s = $('[data-cmp-status]'); s.className = 'form__status' + (c ? ' ' + c : ''); s.textContent = t; };
  async function load(which, file) {
    if (!file) return;
    if (file.size > 80 * 1024 * 1024) return status(T('That file is over 80 MB. Export an MP3 and try again.'), 'is-error');
    $(`[data-cmp-name=${which}]`).textContent = file.name; status(T('Reading your song…'));
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      bufs[which] = await actx.decodeAudioData(await file.arrayBuffer());
      const b = bufs[which]; const r = $(`[data-cmp-start=${which}]`); const max = Math.max(0, Math.floor(b.duration - 60));
      r.max = max; r.value = Math.min(max, Math.floor(b.duration * 0.3)); $(`[data-cmp-at-wrap=${which}]`).hidden = false;
      const upd = () => { $(`[data-cmp-at=${which}]`).textContent = `${fmt(+r.value)}–${fmt(Math.min(b.duration, +r.value + 60))}`; }; upd(); r.oninput = upd;
      status(''); $('[data-cmp-go]').disabled = !(bufs.mine && bufs.ref);
      if (bufs.mine && bufs.ref) window.mrsTrack && window.mrsTrack('feedback_start', { label: 'compare', page: location.pathname });
    } catch { delete bufs[which]; status(T("Couldn't read that file in this browser. Try an MP3 or WAV."), 'is-error'); }
  }
  ['mine', 'ref'].forEach((w) => {
    $(`[data-cmp-file=${w}]`).addEventListener('change', (e) => load(w, e.target.files[0]));
    const d = $(`[data-cmp-drop=${w}]`);
    ['dragenter', 'dragover'].forEach((t) => d.addEventListener(t, (e) => { e.preventDefault(); d.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach((t) => d.addEventListener(t, (e) => { e.preventDefault(); d.classList.remove('is-over'); }));
    d.addEventListener('drop', (e) => load(w, e.dataTransfer.files[0]));
  });

  const BANDS = { sub: 'Sub (<60 Hz)', bass: 'Bass (60–200 Hz)', lowmid: 'Low mids (200–500 Hz)', mid: 'Mids (0.5–2 kHz)', highmid: 'High mids (2–5 kHz)', presence: 'Presence (5–8 kHz)', air: 'Air (>10 kHz)' };
  const row = (label, a, b, unit, hint) => `<tr><th scope="row">${esc(T(label))}${hint ? `<small>${esc(T(hint))}</small>` : ''}</th><td>${a ?? '–'}${a != null ? unit : ''}</td><td>${b ?? '–'}${b != null ? unit : ''}</td><td class="${a != null && b != null ? (Math.abs(a - b) >= 2 ? 'is-big' : 'is-ok') : ''}">${a != null && b != null ? `${a - b > 0 ? '+' : ''}${Math.round((a - b) * 10) / 10}${unit}` : '–'}</td></tr>`;

  function render(m, r, j) {
    const max = Math.max(...Object.keys(BANDS).flatMap((k) => [m.bands[k], r.bands[k]]), 1);
    const out = $('[data-cmp-out]'); out.hidden = false;
    const a = j.ai || {};
    out.innerHTML = `<div class="fb__card">
      <p class="eyebrow">${esc(T('Your mix vs. the reference'))}</p>${a.summary ? `<h2 class="h3">${esc(a.summary)}</h2>` : ''}
      <h3>${esc(T('Measured'))} <span class="cmp__tag">${esc(T('Objective measurements'))}</span></h3>
      <div class="cmp__tablewrap"><table class="cmp__table"><thead><tr><th></th><th>${esc(T('Your mix'))}</th><th>${esc(T('Reference'))}</th><th>${esc(T('Difference'))}</th></tr></thead><tbody>
        ${row('Integrated loudness', m.lufs, r.lufs, ' LUFS', 'How loud it feels overall')}
        ${row('True peak', m.truePeak, r.truePeak, ' dBTP', 'Highest peak, estimated')}
        ${row('Peak-to-loudness (PLR)', m.plr, r.plr, ' dB', 'Lower = more compressed')}
        ${row('Loudness range (LRA)', m.lra, r.lra, ' LU', 'How much loudness moves')}
        ${row('Stereo width (side vs mid)', m.width, r.width, ' dB', 'Higher = wider')}
        ${row('Stereo correlation', m.correlation, r.correlation, '', '1 = mono, 0 = very wide')}
        ${row('Left/right balance', m.balance, r.balance, ' dB', '0 = centred')}
        ${row('Clipped samples', m.clippedPct, r.clippedPct, '%', 'Above 0.05% can distort')}
      </tbody></table></div>
      <h3>${esc(T('Tonal balance'))}</h3>
      <div class="cmp__bands" role="img" aria-label="${esc(T('Tonal balance of your mix compared with the reference'))}">${Object.entries(BANDS).map(([k, l]) => `<div class="cmp__band"><span>${esc(T(l))}</span><div class="cmp__bars"><i class="cmp__m" style="width:${(m.bands[k] / max) * 100}%"></i><i class="cmp__r" style="width:${(r.bands[k] / max) * 100}%"></i></div><b>${m.bands[k]}% / ${r.bands[k]}%</b></div>`).join('')}</div>
      <p class="cmp__legend"><i class="cmp__m"></i>${esc(T('Your mix'))} <i class="cmp__r"></i>${esc(T('Reference'))}</p>
      ${a.working?.length ? `<h3>${esc(T("What's already working"))}</h3><ul class="ticks">${a.working.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${a.different?.length ? `<h3>${esc(T('What sounds different'))}</h3><ol class="fb__fix">${a.different.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
      ${a.improve?.length ? `<h3>${esc(T('What may need improvement'))}</h3><ol class="fb__fix">${a.improve.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
      ${j.listening?.length ? `<h3>${esc(T('AI listening notes'))} <span class="cmp__tag cmp__tag--ai">${esc(T('AI observations'))}</span></h3><ul>${j.listening.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${a.next ? `<p class="fb__next"><strong>${esc(T('Recommended next step'))}:</strong> ${esc(a.next)}</p>` : ''}
      <div class="finder__cards">${j.cards.map((c, i) => `<a class="finder__card${i === 0 ? ' is-top' : ''}" href="${esc(c.url)}"${c.external ? ' target="_blank" rel="noopener"' : ''} data-track="${c.type === 'page' ? 'ecosystem_click' : 'book_cta_click'}" data-via="ai" data-label="compare_${esc(c.slug)}">${i === 0 ? `<span class="finder__pick">${esc(T('Recommended'))}</span>` : ''}<strong>${esc(c.name)}</strong><span>${esc(c.price || '')}</span><em>${esc(T(c.label))} →</em></a>`).join('')}</div>
      <p class="fb__fine">${esc(T('Measurements are calculated in your browser from the sections you chose and follow the standard loudness method (ITU-R BS.1770), so they are close to, but may differ slightly from, professional meters. A reference is a guide, not a target: matching it exactly is not always right for your song.'))}</p>
    </div>`;
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  $('[data-cmp-form]').addEventListener('submit', async (e) => {
    e.preventDefault(); if (!bufs.mine || !bufs.ref) return status(T('Choose both tracks first.'), 'is-error');
    const btn = $('[data-cmp-go]'); btn.disabled = true; const label = btn.textContent; btn.textContent = T('Measuring…');
    status(T('Measuring both tracks. This takes a few seconds.'));
    try {
      const sm = +$('[data-cmp-start=mine]').value, sr = +$('[data-cmp-start=ref]').value;
      const m = await window.mrsAudio.analyse(bufs.mine, sm, 60); const r = await window.mrsAudio.analyse(bufs.ref, sr, 60);
      let clips = null;
      if (new FormData(e.target).get('listen')) clips = { mine: await window.mrsAudio.clip(bufs.mine, sm, 30), ref: await window.mrsAudio.clip(bufs.ref, sr, 30) };
      btn.textContent = T('Comparing…'); status(T('Writing your comparison…'));
      const V = window.mrsVisitor || {};
      const resp = await fetch('/api/ai/compare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mine: m, ref: r, clips, lang: lang(), visitor_id: V.vid, source: V.source }) });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(j.error || T('Comparison failed.'));
      status(''); render(m, r, j);
    } catch (ex) { status(ex.message, 'is-error'); }
    btn.disabled = false; btn.textContent = label;
  });
})();
