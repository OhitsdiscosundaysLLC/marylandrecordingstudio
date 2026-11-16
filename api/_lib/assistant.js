// Shared assistant brain for every text channel (website chat now; WhatsApp once credentials exist).
import { rpc, dbConfigured } from './db.js';
import { openai } from './openai.js';
import { systemPrompt, TOOLS, bookingCards } from './knowledge.js';
import { runTool } from './actions.js';

export async function runAssistant({ settings, history, channel = 'chat', conversationId = null, interest = '', page = '' }) {
  const ctx = { ui: [], channel, conversationId };
  const messages = [{ role: 'system', content: systemPrompt(settings, { channel, interest, page }) }, ...history];
  const tools = TOOLS.map((t) => ({ type: 'function', function: t }));
  let reply = '';
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
  // If the reply names services but the model skipped the buttons, attach them (real catalogue only).
  if (!ctx.ui.some((u) => u.type === 'booking' || u.type === 'handoff')) {
    const t = reply.toLowerCase(); const slugs = [];
    if (/membership|unlimited/.test(t)) slugs.push('unlimited-membership');
    if (/recording session|record (a|your)|\$60|1 hour session|hour session/.test(t) && !/membership session/.test(t)) slugs.push('recording-session-1-hour');
    if (/mixing/.test(t)) slugs.push('mixing');
    if (/mastering/.test(t)) slugs.push('mastering');
    if (/podcast/.test(t)) slugs.push('video-podcasting');
    if (/voice-?over/.test(t)) slugs.push('voice-over');
    if (/visit the studio|studio visit|visit first|free visit/.test(t)) slugs.push('visit-studio');
    if (/upload|send (us )?(your|the) (files|stems|project)/.test(t)) slugs.push('submit-project');
    const cards = bookingCards(slugs);
    if (cards.length) ctx.ui.push({ type: 'booking', reason: '', cards });
  }
  return { reply, ui: ctx.ui, conversationId: ctx.conversationId };
}

export async function logMessage(conversationId, role, content, meta = {}) {
  if (!dbConfigured() || !conversationId) return;
  try { await rpc('mrs_message', { p_conversation: conversationId, p_role: role, p_content: content, p_meta: meta }); } catch (e) { console.error('db', e.message); }
}
