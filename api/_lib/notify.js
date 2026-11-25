// Email delivery through Resend with duplicate prevention, retries and a delivery log (mrs.notifications).
// Needs RESEND_API_KEY and CONTACT_TO_EMAIL (owner inbox). CONTACT_FROM_EMAIL should be an address on a
// domain verified in Resend; without it Resend's test sender only delivers to the Resend account owner.
import { rpc, dbConfigured } from './db.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function emailConfigured() { return Boolean(process.env.RESEND_API_KEY && process.env.CONTACT_TO_EMAIL); }
export const siteBase = () => process.env.PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'https://www.marylandrecordingstudio.com');
export const dashboardUrl = (tab = '') => (process.env.ADMIN_PATH ? `${siteBase()}/${process.env.ADMIN_PATH}${tab ? '#' + tab : ''}` : siteBase());

export function layoutEmail(title, rows, { intro = '', cta } = {}) {
  const table = rows.length ? `<table cellpadding="8" style="border-collapse:collapse;font:14px/1.5 -apple-system,Segoe UI,Arial,sans-serif;width:100%;max-width:640px">${rows.map(([k, v]) => `<tr><td style="border-bottom:1px solid #eee;color:#666;width:150px;vertical-align:top"><strong>${esc(k)}</strong></td><td style="border-bottom:1px solid #eee;white-space:pre-wrap">${esc(v || '-')}</td></tr>`).join('')}</table>` : '';
  return `<div style="font:15px/1.55 -apple-system,Segoe UI,Arial,sans-serif;color:#111;max-width:640px"><h2 style="margin:0 0 8px">${esc(title)}</h2>${intro ? `<p>${intro}</p>` : ''}${table}${cta ? `<p style="margin-top:20px"><a href="${esc(cta.url)}" style="background:#ffa630;color:#111;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:700">${esc(cta.label)}</a></p>` : ''}<p style="color:#888;font-size:12px;margin-top:24px">Maryland Recording Studio by Disco Sundays</p></div>`;
}

async function resend(payload) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': payload.idem }, body: JSON.stringify(payload.body) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) return { ok: true, id: j.id };
    if (r.status < 500 && r.status !== 429) return { ok: false, error: `Resend ${r.status}: ${j.message || ''}` };
    await new Promise((res) => setTimeout(res, 600 * attempt));
  }
  return { ok: false, error: 'Resend unavailable after retries' };
}

// Send one email at most once per dedupKey. Returns {status}.
export async function sendEmail({ dedupKey, kind, to, subject, html, text, replyTo, ref }) {
  const recipient = to || process.env.CONTACT_TO_EMAIL || '';
  let id = null;
  if (dbConfigured()) {
    try { id = await rpc('mrs_notify_claim', { p_key: dedupKey, p_kind: kind, p_recipient: recipient, p_subject: subject, p_ref: ref || null }); }
    catch (e) { console.error('notify claim', e.message); }
    if (!id) return { status: 'duplicate' };
  }
  const mark = (status, error = null, providerId = null) => id && rpc('mrs_notify_status', { p_id: id, p_status: status, p_error: error, p_provider_id: providerId }).catch(() => {});
  if (!process.env.RESEND_API_KEY || !recipient) { await mark('not_configured', 'RESEND_API_KEY / CONTACT_TO_EMAIL not set'); return { status: 'not_configured' }; }
  const out = await resend({ idem: dedupKey.slice(0, 250), body: { from: process.env.CONTACT_FROM_EMAIL || 'Maryland Recording Studio <onboarding@resend.dev>', to: recipient.split(',').map((s) => s.trim()), reply_to: replyTo || undefined, subject, html, text } });
  await mark(out.ok ? 'sent' : 'failed', out.error || null, out.id || null);
  if (!out.ok) console.error('email', kind, out.error);
  return { status: out.ok ? 'sent' : 'failed', error: out.error };
}

// Instant lead alert to the studio.
export async function leadAlert({ type, dedupKey, name, email, phone, service, details, extra = [], tab = 'leads' }) {
  const rows = [['Type', type], ['Name', name], ['Email', email], ['Phone', phone], ['Service', service], ...extra, ['Details', details]].filter(([, v]) => v);
  const subject = `New ${type.toLowerCase()}: ${name || email || phone || 'website visitor'}${service ? ` (${service})` : ''}`;
  return sendEmail({ dedupKey, kind: 'lead_alert', subject, replyTo: email || undefined, ref: tab,
    html: layoutEmail(subject, rows, { intro: 'A new enquiry just came in on the website. Reply to this email to answer them directly.', cta: { label: 'Open in dashboard', url: dashboardUrl(tab) } }),
    text: `${subject}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nDashboard: ${dashboardUrl(tab)}` });
}

// Backwards-compatible helper used by older code paths.
export async function notify(subject, rows, replyTo) {
  return sendEmail({ dedupKey: `legacy:${subject}:${Date.now()}`, kind: 'lead_alert', subject, replyTo, html: layoutEmail(subject, rows), text: rows.map(([k, v]) => `${k}: ${v}`).join('\n') });
}
