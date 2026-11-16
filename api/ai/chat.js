import { send, readJSONBody } from '../_lib/http.js';
import { rpc, dbConfigured, getSettings } from '../_lib/db.js';
import { openaiConfigured } from '../_lib/openai.js';
import { runAssistant, logMessage } from '../_lib/assistant.js';

const clean = (s, n) => String(s || '').slice(0, n);
const hits = new Map();

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const settings = await getSettings();
  if (!settings.ai.enabled) return send(res, 503, { error: 'The assistant is switched off right now.' });
  if (!openaiConfigured()) return send(res, 503, { error: 'AI is not configured: OPENAI_API_KEY is missing.' });
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0] || 'x';
  const now = Date.now(); const recent = (hits.get(ip) || []).filter((t) => now - t < 600_000);
  if (recent.length >= 60) return send(res, 429, { error: 'Lots of messages! Please wait a few minutes, or call or text the studio.' });
  recent.push(now); hits.set(ip, recent);
  let b;
  try { b = await readJSONBody(req, 40_000); } catch { return send(res, 400, { error: 'Bad request' }); }
  const history = (Array.isArray(b.messages) ? b.messages : []).slice(-16)
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content)
    .map((m) => ({ role: m.role, content: clean(m.content, 1500) }));
  const last = history[history.length - 1];
  if (!last || last.role !== 'user' || !last.content.trim()) return send(res, 400, { error: 'Say something first.' });

  let conversationId = /^[0-9a-f-]{36}$/.test(b.conversation_id || '') ? b.conversation_id : null;
  try {
    if (dbConfigured()) conversationId = await rpc('mrs_conversation', { p: { id: conversationId, visitor_id: clean(b.visitor_id, 64), channel: 'chat', interest: clean(b.interest, 40), page: clean(b.page, 300), source: clean(b.source, 120) } });
  } catch (e) { console.error('db', e.message); }
  await logMessage(conversationId, 'user', last.content, { page: clean(b.page, 300) });
  try {
    const out = await runAssistant({ settings, history, channel: 'chat', conversationId, interest: clean(b.interest, 40), page: clean(b.page, 300) });
    await logMessage(conversationId, 'assistant', out.reply, { ui: out.ui.map((u) => ({ type: u.type, cards: u.cards?.map((c) => c.slug) })) });
    send(res, 200, { conversation_id: conversationId, reply: out.reply, ui: out.ui });
  } catch (e) {
    console.error('openai', e.message);
    send(res, 502, { conversation_id: conversationId, error: e.status === 401 ? 'The AI key was rejected by OpenAI. The studio team has been notified in the dashboard.' : 'The assistant could not answer just now.', ui: [{ type: 'handoff', phone: settings.ai.handoffPhone, email: settings.ai.handoffEmail }] });
  }
}
