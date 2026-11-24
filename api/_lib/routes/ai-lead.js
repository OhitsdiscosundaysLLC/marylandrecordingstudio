// Consented lead capture from the quiz / demo-feedback tools.
import { send, readJSONBody } from '../http.js';
import { rpc, dbConfigured } from '../db.js';
import { scoreLead } from '../knowledge.js';
import { leadAlert } from '../notify.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const origin = req.headers.origin;
  if (origin) { try { if (new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'forbidden' }); } catch { return send(res, 403, { error: 'forbidden' }); } }
  const b = await readJSONBody(req, 8000).catch(() => ({}));
  if (b.website) return send(res, 200, { ok: true });
  const c = (v, n) => String(v ?? '').trim().slice(0, n);
  const lead = { name: c(b.name, 120), email: c(b.email, 200), phone: c(b.phone, 40), service: c(b.service, 80) || 'other', project: c(b.project, 2000), consent_contact: b.consent_contact === true, consent_marketing: b.consent_marketing === true, source: ['ai_quiz', 'ai_feedback'].includes(b.source) ? b.source : 'ai_tool', urgency: 'unknown' };
  if (!lead.consent_contact) return send(res, 400, { error: 'Please tick the box so we can contact you.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lead.email) && lead.phone.replace(/\D/g, '').length < 10) return send(res, 400, { error: 'Add an email or phone number.' });
  if (!dbConfigured()) return send(res, 503, { error: 'not_configured' });
  Object.assign(lead, scoreLead(lead));
  await rpc('mrs_lead', { p: lead });
  await leadAlert({ type: lead.source === 'ai_quiz' ? 'Session finder lead' : 'AI tool lead', dedupKey: `toollead:${lead.email || lead.phone}:${lead.project.slice(0, 60)}`, name: lead.name, email: lead.email, phone: lead.phone, service: lead.service, details: lead.project }).catch((e) => console.error('alert', e.message));
  send(res, 200, { ok: true });
}
