// Optional email alert to the studio via Resend (RESEND_API_KEY + CONTACT_TO_EMAIL). Silent no-op if not configured.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function emailConfigured() { return Boolean(process.env.RESEND_API_KEY && process.env.CONTACT_TO_EMAIL); }
export async function notify(subject, rows, replyTo) {
  if (!emailConfigured()) return false;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.CONTACT_FROM_EMAIL || 'Maryland Recording Studio <onboarding@resend.dev>',
      to: process.env.CONTACT_TO_EMAIL.split(',').map((s) => s.trim()), reply_to: replyTo || undefined, subject,
      html: `<table cellpadding="6">${rows.map(([k, v]) => `<tr><td><strong>${esc(k)}</strong></td><td style="white-space:pre-wrap">${esc(v || '-')}</td></tr>`).join('')}</table>`,
      text: rows.map(([k, v]) => `${k}: ${v || '-'}`).join('\n'),
    }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}`);
  return true;
}
