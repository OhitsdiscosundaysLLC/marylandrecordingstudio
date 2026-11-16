// Free AI demo feedback: decode the song in the browser, cut a 45 s mono 24 kHz WAV section,
// send only that clip to /api/ai/feedback.
(() => {
  const root = document.querySelector('[data-fb]');
  if (!root || root.dataset.ready) return; root.dataset.ready = '';
  const $ = (s) => root.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const track = (e, p) => window.mrsTrack && window.mrsTrack(e, p);
  const CLIP = 45, RATE = 24000;
  let buffer = null, actx = null, src = null;
  const status = (t, cls = '') => { const s = $('[data-fb-status]'); s.className = 'form__status' + (cls ? ' ' + cls : ''); s.textContent = t; };
  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  async function load(file) {
    if (!file) return;
    if (file.size > 80 * 1024 * 1024) return status('That file is over 80 MB. Export an MP3 and try again.', 'is-error');
    $('[data-fb-name]').textContent = file.name; status('Reading your song…');
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      buffer = await actx.decodeAudioData(await file.arrayBuffer());
      const max = Math.max(0, Math.floor(buffer.duration - CLIP));
      const r = $('[data-fb-start]'); r.max = max; r.value = Math.min(max, Math.floor(buffer.duration * 0.3));
      $('[data-fb-at]').textContent = `${fmt(+r.value)}–${fmt(Math.min(buffer.duration, +r.value + CLIP))}`;
      $('[data-fb-clip]').hidden = false; $('[data-fb-go]').disabled = false; status('');
      track('feedback_start', { page: location.pathname });
    } catch { buffer = null; status("Couldn't read that file in this browser. Try an MP3 or WAV.", 'is-error'); }
  }
  $('[data-fb-file]').addEventListener('change', (e) => load(e.target.files[0]));
  const drop = $('[data-fb-drop]');
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
  drop.addEventListener('drop', (e) => load(e.dataTransfer.files[0]));
  $('[data-fb-start]').addEventListener('input', (e) => { $('[data-fb-at]').textContent = `${fmt(+e.target.value)}–${fmt(Math.min(buffer.duration, +e.target.value + CLIP))}`; });
  $('[data-fb-preview]').addEventListener('click', (e) => {
    if (src) { src.stop(); src = null; e.target.textContent = '▶ Preview section'; return; }
    src = actx.createBufferSource(); src.buffer = buffer; src.connect(actx.destination);
    src.start(0, +$('[data-fb-start]').value, 10); e.target.textContent = '■ Stop';
    src.onended = () => { src = null; e.target.textContent = '▶ Preview section'; };
  });

  async function clipWav(start) {
    const len = Math.min(CLIP, buffer.duration - start);
    const off = new OfflineAudioContext(1, Math.ceil(len * RATE), RATE);
    const s = off.createBufferSource(); s.buffer = buffer; s.connect(off.destination); s.start(0, start, len);
    const out = (await off.startRendering()).getChannelData(0);
    const view = new DataView(new ArrayBuffer(44 + out.length * 2));
    const w = (o, str) => [...str].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); view.setUint32(4, 36 + out.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, RATE, true); view.setUint32(28, RATE * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); w(36, 'data'); view.setUint32(40, out.length * 2, true);
    for (let i = 0; i < out.length; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, out[i])) * 0x7fff, true);
    const blob = new Blob([view], { type: 'audio/wav' });
    const b64 = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
    return { b64, seconds: Math.round(len) };
  }

  // Objective measurements of the chosen section (level, dynamics, tonal balance, stereo, clipping).
  async function measure(start) {
    const len = Math.min(CLIP, buffer.duration - start), sr = buffer.sampleRate;
    const a = Math.floor(start * sr), n = Math.floor(len * sr);
    const L = buffer.getChannelData(0).subarray(a, a + n), R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1).subarray(a, a + n) : L;
    let peak = 0, sum = 0, clip = 0, mid = 0, side = 0;
    const win = sr, wins = [];
    let ws = 0, wc = 0;
    for (let i = 0; i < n; i++) {
      const m = (L[i] + R[i]) / 2, sd = (L[i] - R[i]) / 2, ab = Math.max(Math.abs(L[i]), Math.abs(R[i]));
      if (ab > peak) peak = ab; if (ab >= 0.999) clip++;
      sum += m * m; mid += m * m; side += sd * sd; ws += m * m; wc++;
      if (wc === win) { wins.push(Math.sqrt(ws / wc)); ws = 0; wc = 0; }
    }
    const db = (x) => (x > 0 ? Math.round(20 * Math.log10(x) * 10) / 10 : -99);
    const rms = Math.sqrt(sum / n);
    const wdb = wins.map(db).filter((x) => x > -60);
    const avg = wdb.reduce((s, x) => s + x, 0) / (wdb.length || 1);
    const sdev = Math.sqrt(wdb.reduce((s, x) => s + (x - avg) ** 2, 0) / (wdb.length || 1));
    const bands = [['sub/bass <150Hz', 'lowpass', 150], ['low-mids 150-500Hz', 'bandpass', 274], ['mids 500-2kHz', 'bandpass', 1000], ['presence 2-6kHz', 'bandpass', 3460], ['air >6kHz', 'highpass', 6000]];
    const energies = [];
    for (const [, type, f] of bands) {
      const off = new OfflineAudioContext(1, Math.ceil(len * 22050), 22050);
      const s = off.createBufferSource(); s.buffer = buffer;
      const bq = off.createBiquadFilter(); bq.type = type; bq.frequency.value = f; if (type === 'bandpass') bq.Q.value = 0.9;
      s.connect(bq); bq.connect(off.destination); s.start(0, start, len);
      const d = (await off.startRendering()).getChannelData(0);
      let e = 0; for (let i = 0; i < d.length; i += 2) e += d[i] * d[i];
      energies.push(e);
    }
    const tot = energies.reduce((x, y) => x + y, 0) || 1;
    return {
      peak_dBFS: db(peak), rms_dBFS: db(rms), crest_dB: Math.round((db(peak) - db(rms)) * 10) / 10,
      clipped_samples_pct: Math.round((clip / n) * 10000) / 100, loudness_variation_dB: Math.round(sdev * 10) / 10,
      stereo_side_to_mid_dB: buffer.numberOfChannels > 1 ? Math.round((10 * Math.log10((side + 1e-12) / (mid + 1e-12))) * 10) / 10 : 'mono',
      tonal_balance_pct: Object.fromEntries(bands.map(([name], i) => [name, Math.round((energies[i] / tot) * 1000) / 10])),
    };
  }

  $('[data-fb-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!buffer) return status('Choose a song first.', 'is-error');
    const btn = $('[data-fb-go]'); btn.disabled = true; btn.textContent = 'Listening…';
    status('Cutting your section and listening. This takes 15 to 40 seconds.');
    try {
      const at = +$('[data-fb-start]').value;
      const [{ b64, seconds }, metrics] = await Promise.all([clipWav(at), measure(at).catch(() => null)]);
      const fd = new FormData(e.target); const V = window.mrsVisitor || {};
      const r = await fetch('/api/ai/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: b64, seconds, metrics, stage: fd.get('stage'), genre: fd.get('genre'), notes: fd.get('notes'), visitor_id: V.vid, source: V.source }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Feedback failed');
      const f = j.feedback; status('');
      const out = $('[data-fb-out]'); out.hidden = false;
      out.innerHTML = `<div class="fb__card">
        <p class="eyebrow">Your AI feedback</p>${f.vibe ? `<h2 class="h3">${esc(f.vibe)}</h2>` : ''}
        ${f.strengths.length ? `<h3>What's working</h3><ul class="ticks">${f.strengths.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${f.improve.length ? `<h3>What to improve</h3><ol class="fb__fix">${f.improve.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
        ${f.next ? `<p class="fb__next"><strong>Next step:</strong> ${esc(f.next)}</p>` : ''}
        <div class="finder__cards">${j.cards.map((c, i) => `<a class="finder__card${i === 0 ? ' is-top' : ''}" href="${esc(c.url)}"${c.external ? ' target="_blank" rel="noopener"' : ''} data-track="${c.type === 'page' ? 'ecosystem_click' : c.type === 'purchase' ? 'membership_checkout_click' : 'book_cta_click'}" data-via="ai" data-label="feedback_${esc(c.slug)}">${i === 0 ? '<span class="finder__pick">Recommended</span>' : ''}<strong>${esc(c.name)}</strong><span>${esc(c.price || '')}</span><em>${esc(c.label)} →</em></a>`).join('')}</div>
        <p class="fb__fine">${j.basis === 'measurements' ? 'Based on measured levels, dynamics and tonal balance of your section.' : 'Based on the AI listening to your section plus measured levels and tonal balance.'} AI feedback is a starting point. A real engineer will hear more.</p>
        <button type="button" class="btn btn--ghost btn--sm" data-ai-open="chat" data-ai-topic="${esc('I got AI feedback on my demo: ' + f.improve.join('; ').slice(0, 300) + '. What should I book?')}">Talk it through with the AI</button>
      </div>`;
      out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) { status(err.message, 'is-error'); }
    btn.disabled = false; btn.textContent = 'Get feedback again';
  });
})();
