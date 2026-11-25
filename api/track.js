import { send, readJSONBody } from './_lib/http.js';
import { rpc, dbConfigured } from './_lib/db.js';
const ALLOWED = new Set(['page_view', 'book_cta_click', 'square_booking_visit', 'membership_checkout_click', 'ad_checkout_click', 'interest_select', 'ai_open', 'voice_start', 'phone_click', 'email_click', 'whatsapp_click', 'radio_play', 'ecosystem_click', 'contact_submit', 'rewards_click', 'exp_view', 'nudge_shown', 'nudge_click', 'estimator_use', 'quiz_start', 'feedback_start']);
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (!dbConfigured()) return send(res, 204, {});
  try {
    const b = await readJSONBody(req, 4000);
    if (!ALLOWED.has(b.type)) return send(res, 400, { error: 'unknown event' });
    const ua = req.headers['user-agent'] || '';
    if (/bot|crawl|spider|lighthouse|headless/i.test(ua)) return send(res, 204, {});
    const device = /Mobi|Android|iPhone/i.test(ua) ? 'mobile' : /iPad|Tablet/i.test(ua) ? 'tablet' : 'desktop';
    await rpc('mrs_track', { p: {
      visitor_id: String(b.visitor_id || '').slice(0, 64), session_id: String(b.session_id || '').slice(0, 64), type: b.type,
      path: String(b.path || '').slice(0, 300), label: String(b.label || '').slice(0, 200), source: String(b.source || '').slice(0, 120),
      referrer: String(b.referrer || '').slice(0, 300), device, meta: typeof b.meta === 'object' && b.meta ? b.meta : {},
    } });
    send(res, 204, {});
  } catch (e) { send(res, 200, { ok: false }); }
}
