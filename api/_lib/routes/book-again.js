// "Book again": a returning client enters their email; if Square has past bookings for it, we email a
// signed link (proving they own the address) that lists those services with Book buttons.
// Never reveals whether an email exists. Needs SQUARE_ACCESS_TOKEN (CUSTOMERS_READ, APPOINTMENTS_READ) + Resend sender.
import crypto from 'node:crypto';
import { send, readJSONBody } from '../http.js';
import { squareFetch, squareConfigured } from '../square.js';
import { catalogue } from '../knowledge.js';
import { sendEmail, siteBase } from '../notify.js';
import { customerEmailReady } from '../invites.js';

const key = () => process.env.ADMIN_SESSION_SECRET || 'x';
export const sign = (p) => { const b = Buffer.from(JSON.stringify(p)).toString('base64url'); return `${b}.${crypto.createHmac('sha256', key()).update('again:' + b).digest('base64url').slice(0, 32)}`; };
export function readToken(t) {
  const [b, s] = String(t || '').split('.');
  if (!b || !s || s !== crypto.createHmac('sha256', key()).update('again:' + b).digest('base64url').slice(0, 32)) return null;
  try { const p = JSON.parse(Buffer.from(b, 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
}
const hits = new Map();
// Square service-variation ids -> our bookable service slugs.
export async function slugsForVariations(variationIds) {
  const ids = [...new Set(variationIds)].filter(Boolean); if (!ids.length) return [];
  const r = await squareFetch('/v2/catalog/batch-retrieve', { object_ids: ids });
  const items = new Set((r.objects || []).map((o) => o.item_variation_data?.item_id).filter(Boolean));
  return catalogue().services.filter((s) => items.has(s.id) && s.action.type === 'book').map((s) => s.slug).slice(0, 8);
}
export const againLink = (email, slugs, days = 14) => `${siteBase()}/members?again=${sign({ email: String(email).toLowerCase(), slugs, exp: Date.now() + days * 86400_000 })}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const b = await readJSONBody(req, 4000).catch(() => ({}));
  const es = b.lang === 'es';
  if (b.token) {
    const p = readToken(b.token); if (!p) return send(res, 400, { error: es ? 'Este enlace venció. Pide uno nuevo.' : 'This link has expired. Request a new one.' });
    const svcs = catalogue().services.filter((s) => p.slugs.includes(s.slug)).map((s) => ({ slug: s.slug, name: s.name, price: s.price, url: `/book?service=${s.slug}`, label: es ? 'Reservar de nuevo' : 'Book again' }));
    return send(res, 200, { services: svcs });
  }
  if (!squareConfigured() || !customerEmailReady()) return send(res, 503, { error: es ? 'Pronto disponible. Mientras tanto, reserva desde la página de servicios.' : 'Coming soon. In the meantime, book from the services page.' });
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return send(res, 400, { error: es ? 'Escribe un correo válido.' : 'Enter a valid email.' });
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0] || 'x';
  const now = Date.now(); const recent = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  if (recent.length >= 5) return send(res, 429, { error: es ? 'Demasiados intentos. Inténtalo más tarde.' : 'Too many attempts. Try later.' });
  recent.push(now); hits.set(ip, recent);
  const generic = { ok: true, message: es ? 'Si encontramos reservas con ese correo, te enviamos un enlace. Revisa tu bandeja de entrada.' : 'If we found bookings for that email, we just sent you a link. Check your inbox.' };
  try {
    const c = await squareFetch('/v2/customers/search', { query: { filter: { email_address: { exact: email } } }, limit: 5 });
    const ids = (c.customers || []).map((x) => x.id);
    if (!ids.length) return send(res, 200, generic);
    const variationToItem = {};
    const svcs = new Set();
    for (const id of ids) {
      const r = await squareFetch(`/v2/bookings?customer_id=${encodeURIComponent(id)}&limit=50&location_id=${process.env.SQUARE_LOCATION_ID || 'LBRQ3J5MYKNYX'}`);
      for (const bk of r.bookings || []) for (const seg of bk.appointment_segments || []) svcs.add(seg.service_variation_id);
    }
    if (svcs.size) {
      const r = await squareFetch('/v2/catalog/batch-retrieve', { object_ids: [...svcs] });
      for (const o of r.objects || []) variationToItem[o.id] = o.item_variation_data?.item_id;
    }
    const itemIds = new Set(Object.values(variationToItem));
    const slugs = catalogue().services.filter((s) => itemIds.has(s.id) && s.action.type === 'book').map((s) => s.slug).slice(0, 8);
    if (!slugs.length) return send(res, 200, generic);
    const link = `${siteBase()}/members?again=${sign({ email, slugs, exp: Date.now() + 7 * 86400_000 })}`;
    await sendEmail({ dedupKey: `again:${email}:${new Date().toISOString().slice(0, 13)}`, kind: 'book_again', to: email, subject: es ? 'Reserva de nuevo en Disco Sundays' : 'Book again at Disco Sundays',
      html: `<div style="font:15px/1.6 system-ui,Arial,sans-serif;max-width:540px"><p>${es ? 'Aquí tienes tus sesiones anteriores para reservar de nuevo en un toque:' : 'Here are your past sessions, ready to book again in one tap:'}</p><p><a href="${link}" style="background:#ffa630;color:#111;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:700">${es ? 'Ver mis sesiones' : 'See my sessions'}</a></p><p style="color:#888;font-size:12px">${es ? 'El enlace vence en 7 días. Si no lo pediste, ignora este correo.' : 'This link expires in 7 days. If you did not ask for it, ignore this email.'}</p></div>`,
      text: `${link}` });
  } catch (e) { console.error('book again', e.message); }
  send(res, 200, generic);
}
