// AI phone receptionist, ready for when a phone line is connected.
// Architecture (OpenAI-supported): Twilio Elastic SIP trunk -> OpenAI Realtime SIP
// (sip:<OPENAI_PROJECT_ID>@sip.api.openai.com;transport=tls). OpenAI then sends a
// `realtime.call.incoming` webhook here and we accept the call with the studio's instructions.
// Required env: OPENAI_WEBHOOK_SECRET (from the OpenAI webhook settings) and a SIP trunk pointed at OpenAI.
import crypto from 'node:crypto';
import { send } from '../http.js';
import { rawBody } from '../raw.js';
import { rpc, dbConfigured, getSettings } from '../db.js';
import { openai, openaiConfigured } from '../openai.js';
import { systemPrompt } from '../knowledge.js';

export const config = { api: { bodyParser: false } };
export const phoneMissing = () => ['OPENAI_WEBHOOK_SECRET'].filter((k) => !process.env[k]).concat(openaiConfigured() ? [] : ['OPENAI_API_KEY']);

function verify(req, raw) { // Standard Webhooks signature, as used by OpenAI webhooks
  const id = req.headers['webhook-id'], ts = req.headers['webhook-timestamp'], sigs = String(req.headers['webhook-signature'] || '');
  if (!id || !ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const secret = Buffer.from(String(process.env.OPENAI_WEBHOOK_SECRET).replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', secret).update(`${id}.${ts}.${raw}`).digest('base64');
  return sigs.split(' ').some((s) => { const v = s.split(',')[1] || ''; return v.length === expected.length && crypto.timingSafeEqual(Buffer.from(v), Buffer.from(expected)); });
}

export default async function handler(req, res) {
  const missing = phoneMissing();
  if (missing.length) return send(res, 503, { error: 'Phone receptionist is not connected yet.', missing });
  if (req.method !== 'POST') return send(res, 405, {});
  const raw = await rawBody(req).catch(() => '');
  if (!verify(req, raw)) return send(res, 401, { error: 'bad signature' });
  let ev; try { ev = JSON.parse(raw); } catch { return send(res, 400, {}); }
  if (ev.type !== 'realtime.call.incoming') return send(res, 200, { ignored: ev.type });
  const callId = ev.data?.call_id;
  const settings = await getSettings();
  if (!settings.ai.enabled || !settings.ai.voiceEnabled) {
    await openai(`/realtime/calls/${callId}/reject`, {}).catch(() => {});
    return send(res, 200, { rejected: true });
  }
  try { if (dbConfigured()) await rpc('mrs_conversation', { p: { visitor_id: 'phone:' + crypto.createHash('sha256').update(String(callId)).digest('hex').slice(0, 20), channel: 'phone', source: 'phone' } }); } catch {}
  const instructions = systemPrompt(settings, { channel: 'voice' }) + `\nPHONE CALL: You are answering the studio's phone line. Start with: "Thanks for calling Maryland Recording Studio by Disco Sundays. I'm the studio's AI assistant. How can I help?" You cannot send links by voice; tell callers to visit marylandrecordingstudio.com to book or join, or offer the team's number ${settings.ai.handoffPhone} and email ${settings.ai.handoffEmail} for a person.`;
  try {
    await openai(`/realtime/calls/${callId}/accept`, { type: 'realtime', model: settings.ai.voiceModel || 'gpt-realtime', instructions, audio: { output: { voice: settings.ai.voice || 'marin' } } });
    send(res, 200, { accepted: true });
  } catch (e) { console.error('accept', e.message); send(res, 500, { error: 'accept failed' }); }
}
