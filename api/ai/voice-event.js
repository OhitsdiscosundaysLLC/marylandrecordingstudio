// Voice sessions run browser<->OpenAI; the browser relays transcripts and tool calls here
// so leads are saved server-side and conversations appear in the dashboard.
import { send, readJSONBody } from '../_lib/http.js';
import { rpc, dbConfigured, getSettings } from '../_lib/db.js';
import { TOOLS } from '../_lib/knowledge.js';
import { runTool } from '../_lib/actions.js';
const NAMES = new Set(TOOLS.map((t) => t.name));
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const b = await readJSONBody(req, 12_000).catch(() => null);
  if (!b || !b.conversation_id) return send(res, 400, { error: 'Bad request' });
  const settings = await getSettings();
  const ctx = { ui: [], channel: 'voice', conversationId: b.conversation_id };
  try {
    if (b.kind === 'transcript' && dbConfigured() && (b.role === 'user' || b.role === 'assistant')) {
      await rpc('mrs_message', { p_conversation: b.conversation_id, p_role: b.role, p_content: String(b.text || '').slice(0, 2000), p_meta: { channel: 'voice' } });
      return send(res, 200, { ok: true });
    }
    if (b.kind === 'tool' && NAMES.has(b.name)) {
      const result = await runTool(b.name, b.args || {}, ctx, settings);
      return send(res, 200, { result, ui: ctx.ui });
    }
  } catch (e) { console.error(e.message); return send(res, 200, { result: { error: 'failed' }, ui: [] }); }
  send(res, 400, { error: 'Unknown event' });
}
