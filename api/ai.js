// AI endpoints (one function to stay within the plan's function limit):
// /api/ai/chat, /api/ai/realtime, /api/ai/voice-event  (rewritten to /api/ai?op=...)
import chat from './_lib/routes/ai-chat.js';
import realtime from './_lib/routes/ai-realtime.js';
import voiceEvent from './_lib/routes/ai-voice-event.js';
import plan from './_lib/routes/ai-plan.js';
import feedback from './_lib/routes/ai-feedback.js';
import lead from './_lib/routes/ai-lead.js';
import release from './_lib/routes/ai-release.js';
import hook from './_lib/routes/ai-hook.js';
import compare from './_lib/routes/ai-compare.js';
import { send } from './_lib/http.js';
const ROUTES = { chat, realtime, 'voice-event': voiceEvent, plan, feedback, lead, release, hook, compare };
export default function handler(req, res) {
  const u = new URL(req.url, 'http://x');
  const op = u.searchParams.get('op') || u.pathname.split('/').pop();
  return ROUTES[op] ? ROUTES[op](req, res) : send(res, 404, { error: 'not_found' });
}
