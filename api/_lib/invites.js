// Post-session review invitations. Every invited customer gets the same two options (public Google
// review or private feedback); no filtering by sentiment and no incentives. Opt-out is honoured.
import crypto from 'node:crypto';
import { rpc } from './db.js';
import { sendEmail, siteBase } from './notify.js';

const WRITE = () => `https://search.google.com/local/writereview?placeid=${process.env.GOOGLE_PLACE_ID || 'ChIJwyX8yQfht4kRJ1wLAMJ64vI'}`;
const norm = (e) => String(e || '').trim().toLowerCase();
const sig = (e) => crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET || 'x').update('optout:' + norm(e)).digest('base64url').slice(0, 22);
export const unsubscribeUrl = (e) => `${siteBase()}/api/admin?action=unsubscribe&e=${encodeURIComponent(Buffer.from(norm(e)).toString('base64url'))}&s=${sig(e)}`;
export const verifyOptout = (e64, s) => { const e = Buffer.from(String(e64 || ''), 'base64url').toString(); return e && s === sig(e) ? e : null; };
export const customerEmailReady = () => Boolean(process.env.RESEND_API_KEY && process.env.CONTACT_FROM_EMAIL);

export async function optedOut(email) {
  const h = crypto.createHash('sha256').update(norm(email)).digest('hex');
  const list = (await rpc('mrs_record_list', { p_kind: 'email_optout', p_limit: 500, p_days: 3650 })) || [];
  return list.some((r) => r.data?.h === h);
}
export async function optOut(email) {
  const h = crypto.createHash('sha256').update(norm(email)).digest('hex');
  if (!(await optedOut(email))) await rpc('mrs_record_create', { p_kind: 'email_optout', p_token_hash: null, p_visitor: null, p: { h, at: new Date().toISOString() } });
}

export async function sendReviewInvite({ email, name = '', dedupKey, source = 'manual', service = '' }) {
  email = norm(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { status: 'invalid_email' };
  if (await optedOut(email)) return { status: 'opted_out' };
  if (!customerEmailReady()) {
    await rpc('mrs_record_create', { p_kind: 'review_invite', p_token_hash: null, p_visitor: null, p: { email, name, source, service, status: 'not_configured', at: new Date().toISOString() } });
    return { status: 'not_configured' };
  }
  const first = String(name).split(' ')[0];
  const fb = `${siteBase()}/contact?feedback=1`;
  const subject = 'How was your session at Disco Sundays?';
  const html = `<div style="font:15px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#111;max-width:560px"><p>Hi${first ? ' ' + first.replace(/[<>&]/g, '') : ''},</p><p>Thanks for working with us${service ? ` on your ${String(service).replace(/[<>&]/g, '')}` : ''} at Maryland Recording Studio by Disco Sundays. We'd really value your honest feedback, good or bad. It helps us improve and helps other artists decide.</p><p><a href="${WRITE()}" style="display:inline-block;background:#ffa630;color:#111;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:700">Leave a Google review</a></p><p>Prefer to tell us privately? <a href="${fb}">Send feedback to the team</a>.</p><p>Thank you,<br>The Disco Sundays team</p><p style="color:#888;font-size:12px">You received this because you booked with Disco Sundays. <a href="${unsubscribeUrl(email)}">Don't email me about reviews</a>.</p></div>`;
  const text = `Hi${first ? ' ' + first : ''},\n\nThanks for working with us at Maryland Recording Studio by Disco Sundays. We'd value your honest feedback, good or bad.\n\nLeave a Google review: ${WRITE()}\nOr tell us privately: ${fb}\n\nThank you,\nThe Disco Sundays team\n\nUnsubscribe from review emails: ${unsubscribeUrl(email)}`;
  const r = await sendEmail({ dedupKey: dedupKey || `review:${email}:${new Date().toISOString().slice(0, 7)}`, kind: 'review_invite', to: email, subject, html, text, ref: source });
  await rpc('mrs_record_create', { p_kind: 'review_invite', p_token_hash: null, p_visitor: null, p: { email, name, source, service, status: r.status, error: r.error || null, at: new Date().toISOString() } });
  return r;
}
