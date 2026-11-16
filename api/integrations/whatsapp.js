// WhatsApp Business (Meta Cloud API) webhook, ready for when credentials are added.
// Required env: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET.
// Webhook URL to give Meta: https://<your-domain>/api/integrations/whatsapp
import crypto from 'node:crypto';
import { send } from '../_lib/http.js';
import { rawBody } from '../_lib/raw.js';
import { rpc, dbConfigured, getSettings } from '../_lib/db.js';
import { openaiConfigured } from '../_lib/openai.js';
import { runAssistant, logMessage } from '../_lib/assistant.js';

export const config = { api: { bodyParser: false } };
const BASE = () => process.env.PUBLIC_SITE_URL || `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || 'marylandrecordingstudio.vercel.app'}`;
const REQUIRED = ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_APP_SECRET'];
export const whatsappMissing = () => REQUIRED.filter((k) => !process.env[k]);

async function reply(to, text) {
  const r = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { preview_url: true, body: text.slice(0, 4000) } }),
  });
  if (!r.ok) console.error('whatsapp send', r.status, (await r.text()).slice(0, 200));
}

export default async function handler(req, res) {
  const missing = whatsappMissing();
  if (missing.length) return send(res, 503, { error: 'WhatsApp is not connected yet.', missing });
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET') { // Meta verification handshake
    if (url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN) {
      res.statusCode = 200; res.setHeader('Content-Type', 'text/plain'); return res.end(url.searchParams.get('hub.challenge') || '');
    }
    return send(res, 403, { error: 'forbidden' });
  }
  if (req.method !== 'POST') return send(res, 405, {});
  const raw = await rawBody(req).catch(() => '');
  const sig = String(req.headers['x-hub-signature-256'] || '');
  const good = 'sha256=' + crypto.createHmac('sha256', process.env.WHATSAPP_APP_SECRET).update(raw).digest('hex');
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return send(res, 401, { error: 'bad signature' });
  let body; try { body = JSON.parse(raw); } catch { return send(res, 400, {}); }
  const msgs = (body.entry || []).flatMap((e) => (e.changes || []).flatMap((c) => c.value?.messages || []));
  const settings = await getSettings();
  for (const m of msgs) {
    const from = m.from; const text = m.type === 'text' ? m.text?.body : '';
    if (!from) continue;
    if (!text) { await reply(from, `Thanks! I can read text messages. To send files, use ${BASE()}/submit-project`); continue; }
    if (!settings.ai.enabled || !openaiConfigured()) { await reply(from, `Thanks for your message! The team will reply soon. You can also call or text ${settings.ai.handoffPhone}.`); continue; }
    const visitor = 'wa:' + crypto.createHash('sha256').update(from).digest('hex').slice(0, 24);
    let thread = { id: null, messages: [] };
    try { if (dbConfigured()) thread = await rpc('mrs_thread', { p_visitor: visitor, p_channel: 'whatsapp', p_hours: 72 }); } catch {}
    let conversationId = thread.id;
    try { if (dbConfigured()) conversationId = await rpc('mrs_conversation', { p: { id: conversationId, visitor_id: visitor, channel: 'whatsapp', source: 'whatsapp' } }); } catch {}
    await logMessage(conversationId, 'user', text.slice(0, 1500), { channel: 'whatsapp' });
    try {
      const history = [...(thread.messages || []), { role: 'user', content: text.slice(0, 1500) }].slice(-16);
      const out = await runAssistant({ settings, history, channel: 'whatsapp', conversationId });
      const base = BASE();
      const links = out.ui.flatMap((u) => u.type === 'booking' ? u.cards.map((c) => `• ${c.name}: ${c.url.startsWith('http') ? c.url : base + c.url}`) : u.type === 'handoff' ? [`Call/text: ${u.phone} · Email: ${u.email}`] : []);
      const textOut = [out.reply, ...links].filter(Boolean).join('\n');
      await reply(from, textOut);
      await logMessage(conversationId, 'assistant', textOut, { channel: 'whatsapp' });
    } catch (e) { console.error(e.message); await reply(from, `Sorry, I couldn't answer just now. Please call or text ${settings.ai.handoffPhone}.`); }
  }
  send(res, 200, { ok: true });
}
