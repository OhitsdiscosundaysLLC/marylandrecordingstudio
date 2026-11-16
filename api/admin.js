// Private dashboard API. Every action except login needs the signed HttpOnly session cookie.
import { send, readJSONBody } from './_lib/http.js';
import { rpc, getSettings, clearSettingsCache } from './_lib/db.js';
import { isAuthed, checkPassword, sessionCookie, clearCookie, adminConfigured } from './_lib/admin.js';
import { openai, openaiConfigured } from './_lib/openai.js';

const H = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
const tries = new Map();

export default async function handler(req, res) {
  if (!adminConfigured()) return send(res, 404, { error: 'Not found' }, H);
  const url = new URL(req.url, 'http://x');
  const action = url.searchParams.get('action');
  const body = req.method === 'POST' ? await readJSONBody(req, 60_000).catch(() => ({})) : {};

  if (action === 'login') {
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0];
    const t = tries.get(ip) || { n: 0, at: Date.now() };
    if (Date.now() - t.at > 15 * 60_000) { t.n = 0; t.at = Date.now(); }
    if (t.n >= 8) return send(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' }, H);
    if (!checkPassword(body.password)) { t.n++; tries.set(ip, t); return send(res, 401, { error: 'Wrong password' }, H); }
    return send(res, 200, { ok: true }, { ...H, 'Set-Cookie': sessionCookie() });
  }
  if (action === 'logout') return send(res, 200, { ok: true }, { ...H, 'Set-Cookie': clearCookie() });
  if (!isAuthed(req)) return send(res, 401, { error: 'Sign in' }, H);

  try {
    const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '30', 10) || 30, 1), 365);
    switch (action) {
      case 'stats': return send(res, 200, { stats: await rpc('mrs_stats', { p_days: days }), openai: openaiConfigured() }, H);
      case 'list': {
        const what = url.searchParams.get('what');
        return send(res, 200, { items: await rpc('mrs_list', { p_what: what, p_limit: 100, p_offset: 0, p_id: url.searchParams.get('id') || null }) }, H);
      }
      case 'settings': {
        if (req.method === 'POST') {
          const allowed = ['ai', 'motion', 'personalization'];
          if (!allowed.includes(body.key) || typeof body.value !== 'object') return send(res, 400, { error: 'Bad setting' }, H);
          await rpc('mrs_settings_set', { p_key: body.key, p_value: body.value });
          clearSettingsCache();
        }
        return send(res, 200, { settings: await getSettings({ fresh: true }) }, H);
      }
      case 'lead': {
        await rpc('mrs_lead_update', { p_id: body.id, p: { stage: body.stage, priority: body.priority, notes: body.notes } });
        return send(res, 200, { ok: true }, H);
      }
      case 'insights': {
        if (req.method !== 'POST') return send(res, 200, { items: await rpc('mrs_list', { p_what: 'insights', p_limit: 5, p_offset: 0, p_id: null }) }, H);
        const stats = await rpc('mrs_stats', { p_days: days });
        const questions = (await rpc('mrs_list', { p_what: 'questions', p_limit: 300, p_offset: 0, p_id: null })) || [];
        const leads = ((await rpc('mrs_list', { p_what: 'leads', p_limit: 100, p_offset: 0, p_id: null })) || []).map((l) => ({ service: l.service, stage: l.stage, priority: l.priority, urgency: l.urgency, project: (l.project || '').slice(0, 200), created_at: l.created_at }));
        const settings = await getSettings({ fresh: true });
        const out = await openai('/chat/completions', {
          model: settings.ai.model || 'gpt-4o-mini', temperature: 0.2, response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'You analyse first-party analytics for a Maryland recording studio (services: $200/month unlimited membership, recording $60/hr, mixing $75). Use ONLY the numbers and text supplied. Never invent figures, customers or trends. If the sample is too small to conclude anything, say so plainly. Return JSON: {"summary": string, "frequentQuestions": [{"topic": string, "count": number, "example": string}], "reasonsNotBooking": [{"reason": string, "evidence": string}], "recommendations": [{"title": string, "why": string, "action": string, "evidence": string}], "dataGaps": [string]}. Max 5 items per list. Every recommendation must cite evidence from the data.' },
            { role: 'user', content: JSON.stringify({ periodDays: days, stats, leads, visitorQuestions: questions.slice(0, 300) }).slice(0, 90_000) },
          ],
        });
        let data; try { data = JSON.parse(out.choices[0].message.content); } catch { data = { summary: out.choices[0].message.content }; }
        data.generatedFrom = { days, questions: questions.length, leads: leads.length, visitors: stats?.visitors ?? null };
        await rpc('mrs_insight_save', { p_days: days, p_data: data });
        return send(res, 200, { insight: data }, H);
      }
      default: return send(res, 400, { error: 'Unknown action' }, H);
    }
  } catch (e) {
    console.error('admin', e.message);
    return send(res, 500, { error: e.message }, H);
  }
}
