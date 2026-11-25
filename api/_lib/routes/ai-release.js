// AI release-plan builder: deterministic timeline + AI tips; plans are saved and can be reopened/updated with a private key.
import crypto from 'node:crypto';
import { send, readJSONBody } from '../http.js';
import { rpc, dbConfigured, getSettings } from '../db.js';
import { openai, openaiConfigured } from '../openai.js';
import { bookingCards } from '../knowledge.js';
import { buildTimeline, PHASE_SERVICES, STAGES } from '../release.js';

const GOALS = ['streaming', 'playlist', 'video', 'radio', 'press', 'live', 'fans', 'first'];
const c = (v, n) => String(v ?? '').replace(/[\u0000-\u001F]/g, ' ').trim().slice(0, n);
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const hits = new Map();

function input(b) {
  return {
    title: c(b.title, 120) || 'My release', type: ['single', 'ep', 'album'].includes(b.type) ? b.type : 'single',
    songs: Math.max(1, Math.min(30, parseInt(b.songs, 10) || (b.type === 'album' ? 10 : b.type === 'ep' ? 5 : 1))),
    releaseDate: c(b.releaseDate, 10), stage: STAGES.includes(b.stage) ? b.stage : 'writing',
    goals: (Array.isArray(b.goals) ? b.goals : []).filter((g) => GOALS.includes(g)).slice(0, 8),
    details: c(b.details, 800), lang: b.lang === 'es' ? 'es' : 'en',
  };
}

async function tips(settings, inp, tl) {
  if (!settings.ai.enabled || !openaiConfigured()) return null;
  const out = await openai('/chat/completions', {
    model: settings.ai.model || 'gpt-4o-mini', temperature: 0.5, response_format: { type: 'json_object' }, max_tokens: 900,
    messages: [
      { role: 'system', content: `You are a practical release strategist at Maryland Recording Studio by Disco Sundays (Hanover, MD). Give specific, realistic advice for an independent artist. Never promise streams, playlist placement, press or results. Never invent prices, services or partners. Write in ${inp.lang === 'es' ? 'natural Latin-American Spanish' : 'English'}. Return JSON {"summary": 2 sentences, "phaseTips": {"recording": "...", "production": "...", "mixing": "...", "mastering": "...", "artwork": "...", "distribution": "...", "marketing": "...", "release": "..."}, "risks": [up to 3 short items]}. Each tip max 35 words. If the timeline is tight or overdue, say so plainly and suggest what to cut or move.` },
      { role: 'user', content: JSON.stringify({ project: inp.title, type: inp.type, songs: inp.songs, stage: inp.stage, goals: inp.goals, details: inp.details, timeline: tl }) },
    ],
  });
  try { return JSON.parse(out.choices[0].message.content); } catch { return null; }
}

function decorate(tl) {
  return tl.phases.map((p) => ({ ...p, services: bookingCards((PHASE_SERVICES[p.key] || (() => []))(tl.songs)).map(({ slug, name, price, label, url, external, type }) => ({ slug, name, price, label, url, external, type })) }));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const url = new URL(req.url, 'http://x');
  const action = url.searchParams.get('action') || 'create';
  const b = await readJSONBody(req, 12_000).catch(() => ({}));
  const settings = await getSettings();

  if (action === 'get') {
    if (!dbConfigured() || !/^[0-9a-f-]{36}$/.test(b.id || '')) return send(res, 400, { error: 'not_found' });
    const r = await rpc('mrs_record_get', { p_kind: 'release_plan', p_id: b.id });
    if (!r || r.token_hash !== hash(b.key)) return send(res, 404, { error: 'not_found' });
    const inp = r.data.input; const tl = buildTimeline(inp); // recompute statuses against today
    return send(res, 200, { id: r.id, input: inp, timeline: { ...tl, phases: decorate(tl) }, ai: r.data.ai || null, updated_at: r.updated_at });
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0] || 'x';
  const now = Date.now(); const recent = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  if (recent.length >= 20) return send(res, 429, { error: 'Too many plans this hour. Try again later.' });
  recent.push(now); hits.set(ip, recent);

  const inp = input(b);
  let tl;
  try { tl = buildTimeline(inp); } catch { return send(res, 400, { error: inp.lang === 'es' ? 'Elige una fecha de lanzamiento válida.' : 'Pick a valid release date.' }); }
  if (tl.daysToRelease > 730) return send(res, 400, { error: inp.lang === 'es' ? 'Elige una fecha dentro de los próximos 2 años.' : 'Pick a date within the next 2 years.' });
  let ai = null; try { ai = await tips(settings, inp, tl); } catch (e) { console.error('release ai', e.message); }
  const out = { input: inp, timeline: { ...tl, phases: decorate(tl) }, ai };
  if (dbConfigured()) {
    try {
      if (action === 'update' && /^[0-9a-f-]{36}$/.test(b.id || '') && b.key) {
        const ok = await rpc('mrs_record_update', { p_kind: 'release_plan', p_id: b.id, p_token_hash: hash(b.key), p: { input: inp, ai, summary: { songs: tl.songs, stage: tl.stage, tight: tl.tight, releaseDate: tl.releaseDate } } });
        if (ok) return send(res, 200, { ...out, id: b.id, key: b.key });
      }
      const key = crypto.randomBytes(18).toString('base64url');
      const id = await rpc('mrs_record_create', { p_kind: 'release_plan', p_token_hash: hash(key), p_visitor: c(b.visitor_id, 64), p: { input: inp, ai, summary: { songs: tl.songs, stage: tl.stage, tight: tl.tight, releaseDate: tl.releaseDate } } });
      await rpc('mrs_track', { p: { type: 'release_plan', label: `${inp.type}/${inp.stage}${tl.tight ? '/tight' : ''}`, visitor_id: c(b.visitor_id, 64), path: '/release-planner', source: c(b.source, 120), meta: { goals: inp.goals } } }).catch(() => {});
      return send(res, 200, { ...out, id, key });
    } catch (e) { console.error('release save', e.message); }
  }
  send(res, 200, out);
}
