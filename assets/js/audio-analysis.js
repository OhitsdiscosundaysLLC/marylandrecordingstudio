// Browser-side audio measurements (no upload needed). Implements:
// - Integrated loudness (LUFS) with ITU-R BS.1770 K-weighting and gating (approximation of EBU R128)
// - Short-term loudness range (LRA, 10th-95th percentile of 3 s windows)
// - Sample peak and estimated true peak (4x oversampled)
// - Tonal balance in 7 bands, stereo correlation / width / L-R balance, clipping
window.mrsAudio = (() => {
  const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
  const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
  async function render(buffer, start, len, rate, build) {
    const ch = Math.min(2, buffer.numberOfChannels);
    const off = new OfflineAudioContext(ch, Math.ceil(len * rate), rate);
    const s = off.createBufferSource(); s.buffer = buffer;
    const last = build ? build(off, s) : s; last.connect(off.destination); s.start(0, start, len);
    return off.startRendering();
  }
  async function analyse(buffer, start = 0, maxLen = 60) {
    const len = Math.max(1, Math.min(maxLen, buffer.duration - start));
    const sr = 48000;
    // K-weighting: high-shelf (+4 dB @ ~1.68 kHz) then high-pass (~38 Hz)
    const k = await render(buffer, start, len, sr, (off, s) => {
      const shelf = off.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 1681; shelf.gain.value = 4;
      const hp = off.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 38; hp.Q.value = 0.5;
      s.connect(shelf); shelf.connect(hp); return hp;
    });
    const chs = [...Array(k.numberOfChannels)].map((_, i) => k.getChannelData(i));
    const block = Math.round(0.4 * sr), hop = Math.round(0.1 * sr);
    const msBlocks = [];
    for (let i = 0; i + block <= k.length; i += hop) {
      let sum = 0; for (const c of chs) { let s2 = 0; for (let j = i; j < i + block; j += 2) s2 += c[j] * c[j]; sum += s2 / (block / 2); }
      msBlocks.push(sum);
    }
    const L = (ms) => -0.691 + 10 * Math.log10(ms);
    const abs = msBlocks.filter((m) => L(m) > -70);
    const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
    const relGate = L(mean(abs)) - 10;
    const gated = abs.filter((m) => L(m) > relGate);
    const lufs = gated.length ? L(mean(gated)) : -Infinity;
    // Short-term (3 s) loudness range
    const st = [];
    for (let b = 0; b + 30 <= msBlocks.length; b += 10) st.push(L(mean(msBlocks.slice(b, b + 30))));
    const stg = st.filter((x) => x > -70); const stRel = L(mean(stg.map((x) => 10 ** ((x + 0.691) / 10)))) - 20;
    const lra = (() => { const a = stg.filter((x) => x > stRel).sort((x, y) => x - y); if (a.length < 4) return null; return a[Math.floor(a.length * 0.95) - 1] - a[Math.floor(a.length * 0.1)]; })();
    // Peaks (sample and ~true peak via 4x oversampling of the section)
    const sr0 = buffer.sampleRate; const a0 = Math.floor(start * sr0), n0 = Math.floor(len * sr0);
    const Lc = buffer.getChannelData(0).subarray(a0, a0 + n0), Rc = buffer.numberOfChannels > 1 ? buffer.getChannelData(1).subarray(a0, a0 + n0) : Lc;
    let peak = 0, clip = 0, sl = 0, sr2 = 0, slr = 0, mid = 0, side = 0;
    for (let i = 0; i < n0; i++) {
      const l = Lc[i], r = Rc[i]; const ab = Math.max(Math.abs(l), Math.abs(r));
      if (ab > peak) peak = ab; if (ab >= 0.999) clip++;
      sl += l * l; sr2 += r * r; slr += l * r; const m = (l + r) / 2, sd = (l - r) / 2; mid += m * m; side += sd * sd;
    }
    let tp = peak;
    try {
      const up = await render(buffer, start, Math.min(len, 30), Math.min(192000, sr0 * 4));
      for (let c = 0; c < up.numberOfChannels; c++) { const d = up.getChannelData(c); for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > tp) tp = v; } }
    } catch {}
    // Tonal balance: energy share per band
    const bands = [['sub', 'lowpass', 60], ['bass', 'bandpass', 110], ['lowmid', 'bandpass', 350], ['mid', 'bandpass', 1000], ['highmid', 'bandpass', 2800], ['presence', 'bandpass', 6000], ['air', 'highpass', 10000]];
    const e = [];
    for (const [, type, f] of bands) {
      const out = await render(buffer, start, len, 32000, (off, s) => { const bq = off.createBiquadFilter(); bq.type = type; bq.frequency.value = f; if (type === 'bandpass') bq.Q.value = 1.1; s.connect(bq); return bq; });
      let sum = 0; for (let c = 0; c < out.numberOfChannels; c++) { const d = out.getChannelData(c); for (let i = 0; i < d.length; i += 3) sum += d[i] * d[i]; }
      e.push(sum);
    }
    const tot = e.reduce((s, x) => s + x, 0) || 1;
    const stereo = buffer.numberOfChannels > 1;
    return {
      seconds: Math.round(len),
      lufs: r1(lufs), lra: r1(lra), samplePeak: r1(db(peak)), truePeak: r1(db(tp)), plr: r1(db(tp) - lufs),
      clippedPct: Math.round((clip / n0) * 10000) / 100,
      bands: Object.fromEntries(bands.map(([n], i) => [n, Math.round((e[i] / tot) * 1000) / 10])),
      correlation: stereo ? Math.round((slr / Math.sqrt(sl * sr2 || 1)) * 100) / 100 : 1,
      width: stereo ? r1(10 * Math.log10((side + 1e-12) / (mid + 1e-12))) : null,
      balance: stereo ? r1(10 * Math.log10((sl + 1e-12) / (sr2 + 1e-12))) : 0,
      mono: !stereo,
    };
  }
  async function clip(buffer, start, len, rate = 16000) {
    const out = await render(buffer, start, Math.min(len, buffer.duration - start), rate, (off, s) => s);
    const d0 = out.getChannelData(0), d1 = out.numberOfChannels > 1 ? out.getChannelData(1) : d0;
    const n = d0.length; const view = new DataView(new ArrayBuffer(44 + n * 2));
    const w = (o, str) => [...str].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); view.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); w(36, 'data'); view.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, (d0[i] + d1[i]) / 2)) * 0x7fff, true);
    const blob = new Blob([view], { type: 'audio/wav' });
    return new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
  }
  return { analyse, clip };
})();
