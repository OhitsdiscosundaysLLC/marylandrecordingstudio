// Creates a short-lived Realtime client secret so the browser can talk to OpenAI over WebRTC
// without ever seeing the API key.
import { send, readJSONBody } from '../http.js';
import { rpc, dbConfigured, getSettings } from '../db.js';
import { openai, openaiConfigured } from '../openai.js';
import { systemPrompt, TOOLS } from '../knowledge.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const settings = await getSettings();
  if (!settings.ai.enabled || !settings.ai.voiceEnabled) return send(res, 503, { error: 'Voice assistant is switched off right now.' });
  if (!openaiConfigured()) return send(res, 503, { error: 'AI is not configured: OPENAI_API_KEY is missing.' });
  const b = await readJSONBody(req, 4000).catch(() => ({}));
  let conversationId = null;
  try {
    if (dbConfigured()) conversationId = await rpc('mrs_conversation', { p: { visitor_id: String(b.visitor_id || '').slice(0, 64), channel: 'voice', interest: String(b.interest || '').slice(0, 40), page: String(b.page || '').slice(0, 300), source: String(b.source || '').slice(0, 120) } });
  } catch (e) { console.error('db', e.message); }
  const instructions = systemPrompt(settings, { channel: 'voice', interest: String(b.interest || '').slice(0, 40), page: String(b.page || '').slice(0, 300) })
    + `\nVOICE: Start by saying: "Hi, I'm the Disco Sundays AI studio assistant. I'm an AI, and this call isn't recorded as audio, but I keep a text note so the team can follow up. How can I help?" Speak warmly, briefly, in English unless the caller uses another language.`;
  try {
    const out = await openai('/realtime/client_secrets', {
      expires_after: { anchor: 'created_at', seconds: 120 },
      session: {
        type: 'realtime', model: settings.ai.voiceModel || 'gpt-realtime', instructions,
        audio: { output: { voice: settings.ai.voice || 'marin' }, input: { transcription: { model: 'gpt-4o-mini-transcribe' }, turn_detection: { type: 'server_vad' } } },
        tools: TOOLS.map((t) => ({ type: 'function', ...t })),
      },
    });
    send(res, 200, { client_secret: out.value, expires_at: out.expires_at, model: settings.ai.voiceModel || 'gpt-realtime', conversation_id: conversationId });
  } catch (e) {
    console.error('realtime', e.message);
    send(res, 502, { error: 'Voice could not start just now.', detail: e.status === 401 ? 'auth' : undefined });
  }
}
