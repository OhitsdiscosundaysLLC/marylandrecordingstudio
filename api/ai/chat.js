import { send, readJSONBody } from '../_lib/http.js';
import { rpc, dbConfigured, getSettings } from '../_lib/db.js';
import { openai, openaiConfigured } from '../_lib/openai.js';
import { systemPrompt, TOOLS } from '../_lib/knowledge.js';
import { runTool } from '../_lib/actions.js';

const clean = (s, n) => String(s || '').slice(0, n);

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const settings = await getSettings();
  if (!settings.ai.enabled) return send(res, 503, { error: 'The assistant is switched off right now.' });
  if (!openaiConfigured()) return send(res, 503, { error: 'AI is not configured: OPENAI_API_KEY is missing.' });
  let b;
  try { b = await readJSONBody(req, 40_000); } catch { return send(res, 400, { error: 'Bad request' }); }
  const history = (Array.isArray(b.messages) ? b.messages : []).slice(-16)
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: clean(m.content, 1500) }));
  const last = history[history.length - 1];
  if (!last || last.role !== 'user' || !last.content.trim()) return send(res, 400, { error: 'Say something first.' });

  const ctx = { ui: [], channel: 'chat', conversationId: b.conversation_id || null };
  try {
    if (dbConfigured()) {
      ctx.conversationId = await rpc('mrs_conversation', { p: { id: ctx.conversationId, visitor_id: clean(b.visitor_id, 64), channel: 'chat', interest: clean(b.interest, 40), page: clean(b.page, 300), source: clean(b.source, 120) } });
      await rpc('mrs_message', { p_conversation: ctx.conversationId, p_role: 'user', p_content: last.content, p_meta: { page: clean(b.page, 300) } });
    }
  } catch (e) { console.error('db', e.message); }

  const messages = [{ role: 'system', content: systemPrompt(settings, { channel: 'chat', interest: clean(b.interest, 40), page: clean(b.page, 300) }) }, ...history];
  const tools = TOOLS.map((t) => ({ type: 'function', function: t }));
  let reply = '';
  try {
    for (let round = 0; round < 4; round++) {
      const out = await openai('/chat/completions', { model: settings.ai.model || 'gpt-4o-mini', messages, tools, temperature: 0.4, max_tokens: 400 });
      const msg = out.choices[0].message;
      if (!msg.tool_calls?.length) { reply = msg.content || ''; break; }
      messages.push(msg);
      for (const call of msg.tool_calls) {
        let args = {}; try { args = JSON.parse(call.function.arguments || '{}'); } catch {}
        const result = await runTool(call.function.name, args, ctx, settings).catch((e) => ({ error: e.message }));
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
  } catch (e) {
    console.error('openai', e.message);
    return send(res, 502, { error: 'The assistant could not answer just now.', detail: e.status === 401 ? 'auth' : undefined, ui: [{ type: 'handoff', phone: settings.ai.handoffPhone, email: settings.ai.handoffEmail }] });
  }
  try {
    if (dbConfigured() && ctx.conversationId) await rpc('mrs_message', { p_conversation: ctx.conversationId, p_role: 'assistant', p_content: reply, p_meta: { ui: ctx.ui.map((u) => ({ type: u.type, cards: u.cards?.map((c) => c.slug) })) } });
  } catch (e) { console.error('db', e.message); }
  send(res, 200, { conversation_id: ctx.conversationId, reply, ui: ctx.ui });
}
