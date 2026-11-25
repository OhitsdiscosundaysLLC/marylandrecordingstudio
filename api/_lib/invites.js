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
  const html = `<div style="font:15px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#111;max-width:560px"><p>Hi${first ? ' ' + first.replace(/[<>&]/g, '') : ''},</p><p>Thanks for working with us${service ? ` on your ${String(service).replace(/[<>&]/g, '')}` : ''} at Maryland Recording Studio by Disco Sundays. We'd really value your honest feedback, good or bad. It helps us improve and helps other artists decide.</p><p><a href="${WRITE()}" style="display:inline-block;background:#ffa630;color:#111;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:700">Leave a Google review</a></p><p>Prefer to tell us privately? <a href="${fb}">Send feedback to the team</a>.</p><p>Thank you,<br>The Disco Sundays team</p><p style="color:#888;font-size:12px">You received this because you booked with Disco Sundays. <a href="${unsubscribeUrl(email)}">Stop these emails</a>.</p></div>`;
  const text = `Hi${first ? ' ' + first : ''},\n\nThanks for working with us at Maryland Recording Studio by Disco Sundays. We'd value your honest feedback, good or bad.\n\nLeave a Google review: ${WRITE()}\nOr tell us privately: ${fb}\n\nThank you,\nThe Disco Sundays team\n\nStop these emails: ${unsubscribeUrl(email)}`;
  const r = await sendEmail({ dedupKey: dedupKey || `review:${email}:${new Date().toISOString().slice(0, 7)}`, kind: 'review_invite', to: email, subject, html, text, ref: source });
  await rpc('mrs_record_create', { p_kind: 'review_invite', p_token_hash: null, p_visitor: null, p: { email, name, source, service, status: r.status, error: r.error || null, at: new Date().toISOString() } });
  return r;
}

// "Time for your next session?" reminder for previous customers. Off by default (dashboard toggle).
// Sent once per past booking, only to customers who have not unsubscribed (here or in Square) and have nothing booked ahead.
export async function sendRebookReminder({ email, name = '', bookingId, link, service = '', source = 'square_auto' }) {
  email = norm(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { status: 'invalid_email' };
  if (await optedOut(email)) return { status: 'opted_out' };
  const log = (status, error = null) => rpc('mrs_record_create', { p_kind: 'rebook_reminder', p_token_hash: null, p_visitor: null, p: { email, name, source, service, booking: bookingId || null, status, error, at: new Date().toISOString() } }).catch(() => {});
  if (!customerEmailReady()) { await log('not_configured'); return { status: 'not_configured' }; }
  const first = String(name).split(' ')[0].replace(/[<>&]/g, '');
  const svc = String(service).replace(/[<>&]/g, '');
  const subject = 'Ready for your next session?';
  const html = `<div style="font:15px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#111;max-width:560px"><p>Hi${first ? ' ' + first : ''},</p><p>It has been a little while since your last ${svc ? svc + ' ' : ''}session at Maryland Recording Studio by Disco Sundays. Whenever you are ready to keep the momentum going, you can book the same session again in one tap.</p><p><a href="${link}" style="display:inline-block;background:#ffa630;color:#111;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:700">Book again</a></p><p>Not sure what you need next? Just reply to this email and the team will help.</p><p>The Disco Sundays team</p><p style="color:#888;font-size:12px">You received this because you booked with Disco Sundays. The link above is personal and expires in 14 days. <a href="${unsubscribeUrl(email)}">Stop these emails</a>.</p></div>`;
  const text = `Hi${first ? ' ' + first : ''},\n\nReady for your next session at Maryland Recording Studio by Disco Sundays? Book the same session again: ${link}\n\nStop these emails: ${unsubscribeUrl(email)}`;
  const r = await sendEmail({ dedupKey: `rebook:${bookingId || email}`, kind: 'rebook_reminder', to: email, subject, html, text, ref: source, replyTo: process.env.CONTACT_TO_EMAIL || undefined });
  await log(r.status, r.error || null);
  return r;
}
