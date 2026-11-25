// Mix vs reference: explains browser-measured differences; optional AI listening notes are labelled separately.
import { send, readJSONBody } from '../http.js';
import { rpc, dbConfigured, getSettings } from '../db.js';
import { openai, openaiConfigured } from '../openai.js';
import { bookingCards } from '../knowledge.js';

const hits = new Map();
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null);
function cleanMetrics(x = {}) {
  const b = x.bands || {};
  return {
    lufs: num(x.lufs, -80, 5), lra: num(x.lra, 0, 40), truePeak: num(x.truePeak, -80, 10), samplePeak: num(x.samplePeak, -80, 10), plr: num(x.plr, 0, 60),
    clippedPct: num(x.clippedPct, 0, 100), correlation: num(x.correlation, -1, 1), width: num(x.width, -80, 20), balance: num(x.balance, -40, 40), mono: !!x.mono, seconds: num(x.seconds, 0, 600),
    bands: Object.fromEntries(['sub', 'bass', 'lowmid', 'mid', 'highmid', 'presence', 'air'].map((k) => [k, num(b[k], 0, 100)])),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const settings = await getSettings();
  if (!settings.ai.enabled || settings.conversion?.compare === false) return send(res, 503, { error: 'The comparison tool is switched off right now.' });
  if (!openaiConfigured()) return send(res, 503, { error: 'AI is not configured: OPENAI_API_KEY is missing.' });
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0] || 'x';
  const now = Date.now(); const recent = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  if (recent.length >= 8) return send(res, 429, { error: 'You have run a few comparisons this hour. Try again later.' });
  let b; try { b = await readJSONBody(req, 4_400_000); } catch { return send(res, 413, { error: 'Too large. Untick the listening notes and try again.' }); }
  recent.push(now); hits.set(ip, recent);
  const es = b.lang === 'es';
  const mine = cleanMetrics(b.mine), ref = cleanMetrics(b.ref);
  if (mine.lufs == null || ref.lufs == null) return send(res, 400, { error: es ? 'No pudimos medir los archivos.' : 'Could not read the measurements.' });
  const L = es ? 'Write in natural Latin-American Spanish.' : 'Write in English.';
  let ai = null, listening = [];
  try {
    const out = await openai('/chat/completions', {
      model: settings.ai.model || 'gpt-4o-mini', temperature: 0.3, response_format: { type: 'json_object' }, max_tokens: 800,
      messages: [{ role: 'system', content: `You are a mix and mastering engineer at Maryland Recording Studio by Disco Sundays. Explain measured differences between an artist's mix and a reference track in plain language for non-technical artists. Use ONLY the numbers given; do not claim to hear anything. Context: LUFS = integrated loudness (streaming services normalise playback, often around -14 LUFS); true peak above -1 dBTP risks distortion after encoding; PLR is peak-to-loudness (lower = more limited/compressed); LRA is loudness movement; width is side vs mid energy in dB (higher = wider); correlation near 1 is narrow/mono, below 0 can cause mono problems; bands are % share of energy. A big loudness/peak/PLR gap usually points to mastering; tonal balance, width, balance and clipping inside the mix usually point to mixing. ${L} Return JSON {"summary": one sentence, "working": [up to 3], "different": [up to 4, each citing the numbers], "improve": [up to 3 specific, practical actions], "next": one sentence, "service": "mixing" | "mastering" | "both"}.` },
        { role: 'user', content: JSON.stringify({ mine, reference: ref }) }],
    });
    ai = JSON.parse(out.choices[0].message.content);
  } catch (e) { console.error('compare ai', e.message); }
  const c = b.clips;
  if (c && typeof c.mine === 'string' && typeof c.ref === 'string' && c.mine.length > 10000 && c.ref.length > 10000) {
    for (const model of [...new Set([settings.ai.audioModel || 'gpt-audio', 'gpt-4o-audio-preview'])]) {
      try {
        const out = await openai('/chat/completions', { model, modalities: ['text'], max_tokens: 400, messages: [
          { role: 'system', content: 'You are an audio engineer assistant. The user attaches two clips (their mix, then a reference) for comparison; listening and describing them is expected.' },
          { role: 'user', content: [{ type: 'input_audio', input_audio: { data: c.mine, format: 'wav' } }, { type: 'input_audio', input_audio: { data: c.ref, format: 'wav' } }, { type: 'text', text: `Clip 1 is the artist's mix, clip 2 is the reference. Give up to 4 short listening observations comparing them (vocal level and clarity, low end, brightness, space/reverb, punch, energy). Only describe what you can actually hear; if unsure, say so. Do not identify the reference song or artist, and do not quote lyrics. ${L} Reply ONLY with JSON {"notes": [strings]}` }] }] });
        const t = String(out.choices[0].message.content || '').replace(/^```(json)?|```$/gm, '').trim();
        const notes = JSON.parse(t).notes; if (Array.isArray(notes) && notes.length) { listening = notes.slice(0, 4).map((x) => String(x).slice(0, 240)); break; }
      } catch (e) { console.error('compare listen', model, e.message); }
    }
  }
  if (!ai) return send(res, 502, { error: es ? 'No pudimos crear la comparación ahora. Inténtalo de nuevo.' : 'Could not write the comparison right now. Please try again.' });
  const svc = ['mixing', 'mastering', 'both'].includes(ai.service) ? ai.service : 'mixing';
  const cards = bookingCards(svc === 'both' ? ['mixing', 'mastering', 'submit-project'] : [svc, 'submit-project']);
  const clean = (a, n) => (Array.isArray(a) ? a : []).slice(0, n).map((x) => String(x).slice(0, 260));
  const result = { summary: String(ai.summary || '').slice(0, 300), working: clean(ai.working, 3), different: clean(ai.different, 4), improve: clean(ai.improve, 3), next: String(ai.next || '').slice(0, 300), service: svc };
  try {
    if (dbConfigured()) {
      await rpc('mrs_record_create', { p_kind: 'mix_compare', p_token_hash: null, p_visitor: String(b.visitor_id || '').slice(0, 64), p: { mine, ref, service: svc, listened: listening.length > 0 } });
      await rpc('mrs_track', { p: { type: 'feedback_complete', label: `compare:${svc}`, visitor_id: String(b.visitor_id || '').slice(0, 64), path: '/feedback', meta: { compare: true } } });
    }
  } catch {}
  send(res, 200, { ai: result, listening, cards });
}
