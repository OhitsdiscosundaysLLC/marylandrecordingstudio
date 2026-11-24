// AI hook & lyric starter: original songwriting ideas. Never reproduces existing lyrics or imitates a named artist.
import { send, readJSONBody } from '../http.js';
import { rpc, dbConfigured, getSettings } from '../db.js';
import { openai, openaiConfigured } from '../openai.js';

const c = (v, n) => String(v ?? '').replace(/[\u0000-\u001F]/g, ' ').trim().slice(0, n);
const hits = new Map();

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const settings = await getSettings();
  if (!settings.ai.enabled || settings.conversion?.hook === false) return send(res, 503, { error: 'The hook starter is switched off right now.' });
  if (!openaiConfigured()) return send(res, 503, { error: 'AI is not configured: OPENAI_API_KEY is missing.' });
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0] || 'x';
  const now = Date.now(); const recent = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  if (recent.length >= 30) return send(res, 429, { error: 'Lots of ideas this hour! Try again later.' });
  recent.push(now); hits.set(ip, recent);
  const b = await readJSONBody(req, 12_000).catch(() => ({}));
  const uiLang = b.lang === 'es' ? 'es' : 'en';
  const lyricLang = ['en', 'es', 'bilingual'].includes(b.lyricLang) ? b.lyricLang : uiLang;
  const brief = { vibe: c(b.vibe, 200), genre: c(b.genre, 80), mood: c(b.mood, 80), subject: c(b.subject, 400), direction: c(b.direction, 200), extra: c(b.extra, 300) };
  if (!brief.vibe && !brief.subject && !brief.genre) return send(res, 400, { error: uiLang === 'es' ? 'Cuéntanos al menos el género, la vibra o de qué trata la canción.' : 'Tell us at least the genre, the vibe or what the song is about.' });
  const refine = b.refine && typeof b.refine === 'object' ? { concept: JSON.stringify(b.refine.concept || {}).slice(0, 3000), instruction: c(b.refine.instruction, 300) } : null;
  const langLine = lyricLang === 'es' ? 'Write all lyrics in natural Spanish.' : lyricLang === 'bilingual' ? 'Write lyrics mixing English and Spanish naturally.' : 'Write all lyrics in English.';
  const sys = `You are a songwriting coach at Maryland Recording Studio by Disco Sundays. Create ORIGINAL ideas only: never quote, paraphrase or reuse lines from existing songs, and never imitate a specific living artist's distinctive style, flow, catchphrases or persona. If the user names an artist, translate it into general genre traits instead (and say so in "note"). Keep it suitable to publish: no slurs, no hate, nothing sexual involving minors. ${langLine} Explanations and labels in ${uiLang === 'es' ? 'Spanish' : 'English'}.
Return JSON: {"note": optional short string, "concepts": [{"title": string, "concept": 1-2 sentences, "hook": [2-4 short lines], "chorus": one sentence on chorus direction, "verse": [2 short verse ideas or opening lines], "structure": [ordered section names e.g. Intro, Verse 1, Pre-Chorus, Chorus...], "direction": 1-2 sentences on production, delivery and how to develop it}]}`;
  const user = refine
    ? `Refine this concept. Keep what works, apply the instruction, return exactly 1 concept.\nConcept: ${refine.concept}\nInstruction: ${refine.instruction || 'make it stronger'}`
    : `Brief: ${JSON.stringify(brief)}. Return 3 distinct concepts with different angles.`;
  let data;
  try {
    const out = await openai('/chat/completions', { model: settings.ai.model || 'gpt-4o-mini', temperature: refine ? 0.8 : 0.95, response_format: { type: 'json_object' }, max_tokens: 1400, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] });
    data = JSON.parse(out.choices[0].message.content);
  } catch (e) { console.error('hook', e.message); return send(res, 502, { error: uiLang === 'es' ? 'No pudimos generar ideas ahora. Inténtalo de nuevo.' : "Couldn't write ideas right now. Please try again." }); }
  const clean = (x) => ({
    title: c(x.title, 80), concept: c(x.concept, 300), hook: (Array.isArray(x.hook) ? x.hook : []).slice(0, 4).map((l) => c(l, 120)),
    chorus: c(x.chorus, 300), verse: (Array.isArray(x.verse) ? x.verse : []).slice(0, 3).map((l) => c(l, 160)),
    structure: (Array.isArray(x.structure) ? x.structure : []).slice(0, 12).map((l) => c(l, 30)), direction: c(x.direction, 300),
  });
  const concepts = (Array.isArray(data.concepts) ? data.concepts : []).slice(0, 3).map(clean).filter((x) => x.hook.length);
  if (!concepts.length) return send(res, 502, { error: uiLang === 'es' ? 'Inténtalo de nuevo.' : 'Please try again.' });
  try {
    if (dbConfigured()) {
      await rpc('mrs_record_create', { p_kind: 'song_idea', p_token_hash: null, p_visitor: c(b.visitor_id, 64), p: { brief, lyricLang, refine: !!refine, concepts } });
      await rpc('mrs_track', { p: { type: 'hook_generate', label: brief.genre || 'unspecified', visitor_id: c(b.visitor_id, 64), path: '/hook-starter', meta: { refine: !!refine, lang: lyricLang } } });
    }
  } catch (e) { console.error('hook save', e.message); }
  send(res, 200, { note: c(data.note, 300), concepts });
}
