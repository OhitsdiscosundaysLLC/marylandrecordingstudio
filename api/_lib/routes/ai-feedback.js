// Free AI demo feedback: the browser trims the song to a short mono WAV clip, the AI listens and
// gives honest, specific notes plus the real service that would help most.
import { send, readJSONBody } from '../http.js';
import { rpc, dbConfigured, getSettings } from '../db.js';
import { openai, openaiConfigured } from '../openai.js';
import { bookingCards } from '../knowledge.js';

const hits = new Map();
const AUDIO_FALLBACK = 'gpt-4o-audio-preview';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const settings = await getSettings();
  if (!settings.ai.enabled || settings.conversion?.feedback === false) return send(res, 503, { error: 'Demo feedback is switched off right now.' });
  if (!openaiConfigured()) return send(res, 503, { error: 'AI is not configured: OPENAI_API_KEY is missing.' });
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0] || 'x';
  const now = Date.now(); const recent = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  if (recent.length >= 6) return send(res, 429, { error: 'You have used free feedback a few times this hour. Try again later, or send the full song to the team.' });
  let b; try { b = await readJSONBody(req, 4_400_000); } catch { return send(res, 413, { error: 'That clip is too large. Try a shorter section.' }); }
  const data = String(b.audio || '');
  if (data.length < 20_000 || !/^[A-Za-z0-9+/=]+$/.test(data.slice(0, 2000))) return send(res, 400, { error: 'Could not read that audio. Try a WAV or MP3 file.' });
  recent.push(now); hits.set(ip, recent);
  const stage = String(b.stage || 'demo').slice(0, 40), genre = String(b.genre || '').slice(0, 60), notes = String(b.notes || '').slice(0, 400);
  const prompt = `You are a supportive, honest senior mix engineer at Maryland Recording Studio by Disco Sundays. Listen to this ${Number(b.seconds) || 'short'}-second clip of an artist's song (stage: ${stage}${genre ? `, genre: ${genre}` : ''}${notes ? `, artist says: ${notes}` : ''}).
Give specific, useful feedback about what you can actually hear: vocal clarity/level vs the beat, low end, harshness/brightness, space/reverb, loudness/dynamics, arrangement/energy, performance. If you are unsure about something, say so; never invent details you cannot hear. Do not mention prices.
Then choose the ONE studio service that would help most from: mixing (Mixing Session), mastering (Mastering), recording-session-2-hours (re-record or record more), crash-test-artist-evaluation (career/artist feedback), unlimited-membership (if they record a lot).
Reply ONLY with JSON: {"vibe": one encouraging sentence about what works, "strengths": [2 short items], "improve": [3 short, specific items], "next": one sentence on the best next step, "service": one slug from the list}`;
  const m = b.metrics && typeof b.metrics === 'object' ? JSON.stringify(b.metrics).slice(0, 1500) : '';
  const measured = m ? `\nMeasured from this exact section in the artist's browser (trust these numbers): ${m}. Reference points: modern streaming mixes usually peak around -1 to -0.3 dBFS with RMS around -14 to -8 dBFS; crest factor under ~6 dB means heavy limiting, over ~14 dB means very dynamic/quiet; clipped samples above ~0.05% suggests distortion; tonal balance where presence 2-6kHz is above ~20% can sound harsh, sub/bass above ~45% can sound boomy, air under ~1% can sound dull; stereo side-to-mid below -20 dB is very narrow/near-mono.` : '';
  const call = (model) => openai('/chat/completions', { model, modalities: ['text'], max_tokens: 600, messages: [{ role: 'system', content: 'You are an audio engineer assistant. The user attaches an audio clip of their own song for feedback; listening to and describing it is expected and allowed.' }, { role: 'user', content: [{ type: 'input_audio', input_audio: { data, format: 'wav' } }, { type: 'text', text: prompt + measured }] }] });
  const parse = (t) => { try { const x = JSON.parse(String(t).replace(/^```(json)?|```$/gm, '').trim()); return x && Array.isArray(x.improve) && x.improve.length ? x : null; } catch { return null; } };
  let fb = null, basis = 'listening';
  for (const model of [...new Set([settings.ai.audioModel || 'gpt-audio', AUDIO_FALLBACK])]) {
    try { fb = parse((await call(model)).choices[0].message.content); } catch (e) { console.error('feedback', model, e.message); }
    if (fb) break;
  }
  if (!fb && m) { // Audio model declined or failed: give honest feedback from the measurements alone.
    basis = 'measurements';
    try {
      const out = await openai('/chat/completions', { model: settings.ai.model || 'gpt-4o-mini', temperature: 0.3, response_format: { type: 'json_object' }, max_tokens: 600, messages: [{ role: 'user', content: prompt.replace('Listen to this', 'You cannot hear it, but you have exact measurements of this').replace('what you can actually hear', 'what the measurements show (do not claim to hear the song; say "the measurements suggest")') + measured }] });
      fb = parse(out.choices[0].message.content);
    } catch (e) { console.error('feedback metrics', e.message); }
  }
  if (!fb) return send(res, 502, { error: 'The AI could not analyse that clip right now. Please try again, or send the song to the team.' });
  const slug = ['mixing', 'mastering', 'recording-session-2-hours', 'crash-test-artist-evaluation', 'unlimited-membership'].includes(fb.service) ? fb.service : 'mixing';
  const cards = bookingCards([slug, slug === 'mixing' || slug === 'mastering' ? 'submit-project' : 'visit-studio']);
  const clean = (a, n) => (Array.isArray(a) ? a : []).slice(0, n).map((x) => String(x).slice(0, 220));
  const result = { vibe: String(fb.vibe || '').slice(0, 300), strengths: clean(fb.strengths, 3), improve: clean(fb.improve, 4), next: String(fb.next || '').slice(0, 400) };
  try { if (dbConfigured()) await rpc('mrs_track', { p: { type: 'feedback_complete', label: slug, visitor_id: String(b.visitor_id || '').slice(0, 64), path: '/feedback', source: String(b.source || '').slice(0, 120), meta: { stage, genre, basis } } }); } catch {}
  send(res, 200, { feedback: result, cards, basis });
}
