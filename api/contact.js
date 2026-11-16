// POST /api/contact: validates an enquiry and emails it to the studio via Resend.
// Required env: RESEND_API_KEY, CONTACT_TO_EMAIL. Optional: CONTACT_FROM_EMAIL (a verified sender).
// If email isn't configured it returns 503, and the form tells the visitor to email or call instead.
// It never pretends a message was sent.
import { send, readJSONBody } from './_lib/http.js';
import { rpc, dbConfigured } from './_lib/db.js';

const hits = new Map(); // best-effort per-instance rate limit
const WINDOW = 10 * 60 * 1000, MAX = 5;

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
const escHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'method_not_allowed' }, { Allow: 'POST' });

  // Reject cross-site posts.
  const origin = req.headers.origin;
  if (origin) {
    try { if (new URL(origin).host !== req.headers.host) return send(res, 403, { ok: false, error: 'forbidden' }); } catch { return send(res, 403, { ok: false, error: 'forbidden' }); }
  }

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW);
  if (recent.length >= MAX) return send(res, 429, { ok: false, error: 'rate_limited' });

  let body;
  try { body = await readJSONBody(req); } catch (e) { return send(res, e.status || 400, { ok: false, error: 'bad_request' }); }

  // Spam traps: hidden honeypot field and a minimum fill time. Bots get a quiet 200 so they move on.
  const started = Number(body.startedAt);
  if (body.website || (started && now - started < 2500)) return send(res, 200, { ok: true });

  const data = {
    name: clean(body.name, 100),
    email: clean(body.email, 200),
    phone: clean(body.phone, 40),
    service: clean(body.service, 160),
    preferredDate: clean(body.preferredDate, 20),
    message: clean(body.message, 4000),
  };
  const fields = {};
  if (data.name.length < 2) fields.name = 'Please enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) fields.email = 'Please enter a valid email address.';
  if (data.message.length < 10) fields.message = 'Please write a message of at least 10 characters.';
  if (data.preferredDate && !/^\d{4}-\d{2}-\d{2}$/.test(data.preferredDate)) fields.preferredDate = 'Please choose a valid date.';
  if (Object.keys(fields).length) return send(res, 400, { ok: false, error: 'validation', fields });

  const key = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL;
  // Every enquiry is saved to the private dashboard (Leads), so nothing is lost even without email.
  let saved = false;
  if (dbConfigured()) {
    try {
      const svc = data.service.toLowerCase();
      const service = /member/.test(svc) ? 'membership' : /mix/.test(svc) ? 'mixing' : /master/.test(svc) ? 'mastering' : /record|session/.test(svc) ? 'recording' : /podcast/.test(svc) ? 'podcast' : /voice/.test(svc) ? 'voice-over' : 'other';
      await rpc('mrs_lead', { p: { name: data.name, email: data.email, phone: data.phone, service, project: `${data.service ? data.service + ': ' : ''}${data.message}`, preferred_date: data.preferredDate, stage: 'new', priority: data.phone ? 'medium' : 'normal', consent_contact: true, consent_marketing: false, source: 'contact_form' } });
      await rpc('mrs_track', { p: { type: 'contact_submit', path: '/contact', label: service, visitor_id: String(body.visitor_id || '').slice(0, 64) } });
      saved = true;
    } catch (e) { console.error('[api/contact] db', e.message); }
  }
  if (!key || !to) return saved ? send(res, 200, { ok: true }) : send(res, 503, { ok: false, error: 'not_configured' });

  recent.push(now);
  hits.set(ip, recent);

  const rows = [['Name', data.name], ['Email', data.email], ['Phone', data.phone || '-'], ['Service', data.service || '-'], ['Preferred date', data.preferredDate || '-']];
  const html = `<h2>New studio enquiry</h2><table cellpadding="6">${rows.map(([k, v]) => `<tr><td><strong>${k}</strong></td><td>${escHtml(v)}</td></tr>`).join('')}</table><p style="white-space:pre-wrap">${escHtml(data.message)}</p>`;
  const text = `${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${data.message}`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.CONTACT_FROM_EMAIL || 'Maryland Recording Studio <onboarding@resend.dev>',
        to: to.split(',').map((s) => s.trim()),
        reply_to: data.email,
        subject: `Studio enquiry: ${data.name}${data.service ? ` (${data.service})` : ''}`,
        html,
        text,
      }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return send(res, 200, { ok: true });
  } catch (err) {
    console.error('[api/contact]', err.message);
    return saved ? send(res, 200, { ok: true }) : send(res, 502, { ok: false, error: 'send_failed' });
  }
}
