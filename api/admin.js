// Private dashboard API. Every action except login needs the signed HttpOnly session cookie.
import { send, readJSONBody } from './_lib/http.js';
import { rpc, getSettings, clearSettingsCache } from './_lib/db.js';
import { isAuthed, checkPassword, sessionCookie, clearCookie, adminConfigured } from './_lib/admin.js';
import { openai, openaiConfigured } from './_lib/openai.js';
import { files } from './_lib/files.js';
import { emailConfigured } from './_lib/notify.js';
import { catalogue } from './_lib/knowledge.js';
import { whatsappMissing } from './_lib/routes/whatsapp.js';
import { phoneMissing } from './_lib/routes/phone.js';
import hqPage from './_lib/routes/hq.js';

const facts = () => {
  const { services, config } = catalogue();
  return `Business: Maryland Recording Studio by Disco Sundays (Disco Sundays LLC), Hanover, MD 21076. Website ${config.siteUrl}. Phone ${config.phone}. Instagram ${config.social?.instagram?.handle || ''}.
Services and real prices (only use these): ${services.filter((s) => s.category !== 'member-sessions').map((s) => `${s.name} ${s.price || ''}`).join('; ')}.
Unlimited membership details: ${services.find((s) => s.slug === 'unlimited-membership')?.description}`;
};
async function write(settings, system, user, json = false) {
  const out = await openai('/chat/completions', { model: settings.ai.model || 'gpt-4o-mini', temperature: 0.7, ...(json ? { response_format: { type: 'json_object' } } : {}), messages: [{ role: 'system', content: system }, { role: 'user', content: user }] });
  return out.choices[0].message.content;
}
const NO_INVENT = 'Never invent prices, discounts, offers, deadlines, testimonials, reviews, customer names, equipment, awards or results. Only use the facts given. No fake urgency.';

const H = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
const tries = new Map();

export default async function handler(req, res) {
  if (new URL(req.url, 'http://x').searchParams.get('op') === 'page') return hqPage(req, res);
  if (!adminConfigured()) return send(res, 404, { error: 'Not found' }, H);
  const url = new URL(req.url, 'http://x');
  const action = url.searchParams.get('action');
  const body = req.method === 'POST' ? await readJSONBody(req, 60_000).catch(() => ({})) : {};

  if (action === 'login') {
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0];
    const t = tries.get(ip) || { n: 0, at: Date.now() };
    if (Date.now() - t.at > 15 * 60_000) { t.n = 0; t.at = Date.now(); }
    if (t.n >= 8) return send(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' }, H);
    if (!checkPassword(body.password)) { t.n++; tries.set(ip, t); return send(res, 401, { error: 'Wrong password' }, H); }
    return send(res, 200, { ok: true }, { ...H, 'Set-Cookie': sessionCookie() });
  }
  if (action === 'logout') return send(res, 200, { ok: true }, { ...H, 'Set-Cookie': clearCookie() });
  if (!isAuthed(req)) return send(res, 401, { error: 'Sign in' }, H);

  try {
    const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '30', 10) || 30, 1), 365);
    switch (action) {
      case 'stats': return send(res, 200, { stats: await rpc('mrs_stats', { p_days: days }), openai: openaiConfigured() }, H);
      case 'list': {
        const what = url.searchParams.get('what');
        return send(res, 200, { items: await rpc('mrs_list', { p_what: what, p_limit: 100, p_offset: 0, p_id: url.searchParams.get('id') || null }) }, H);
      }
      case 'settings': {
        if (req.method === 'POST') {
          const allowed = ['ai', 'motion', 'personalization'];
          if (!allowed.includes(body.key) || typeof body.value !== 'object') return send(res, 400, { error: 'Bad setting' }, H);
          await rpc('mrs_settings_set', { p_key: body.key, p_value: body.value });
          clearSettingsCache();
        }
        return send(res, 200, { settings: await getSettings({ fresh: true }) }, H);
      }
      case 'lead': {
        await rpc('mrs_lead_update', { p_id: body.id, p: { stage: body.stage, priority: body.priority, notes: body.notes } });
        return send(res, 200, { ok: true }, H);
      }
      case 'insights': {
        if (req.method !== 'POST') return send(res, 200, { items: await rpc('mrs_list', { p_what: 'insights', p_limit: 5, p_offset: 0, p_id: null }) }, H);
        const stats = await rpc('mrs_stats', { p_days: days });
        const questions = (await rpc('mrs_list', { p_what: 'questions', p_limit: 300, p_offset: 0, p_id: null })) || [];
        const leads = ((await rpc('mrs_list', { p_what: 'leads', p_limit: 100, p_offset: 0, p_id: null })) || []).map((l) => ({ service: l.service, stage: l.stage, priority: l.priority, urgency: l.urgency, project: (l.project || '').slice(0, 200), created_at: l.created_at }));
        const settings = await getSettings({ fresh: true });
        const out = await openai('/chat/completions', {
          model: settings.ai.model || 'gpt-4o-mini', temperature: 0.2, response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'You analyse first-party analytics for a Maryland recording studio (services: $200/month unlimited membership, recording $60/hr, mixing $75). Use ONLY the numbers and text supplied. Never invent figures, customers or trends. If the sample is too small to conclude anything, say so plainly. Return JSON: {"summary": string, "frequentQuestions": [{"topic": string, "count": number, "example": string}], "reasonsNotBooking": [{"reason": string, "evidence": string}], "recommendations": [{"title": string, "why": string, "action": string, "evidence": string}], "dataGaps": [string]}. Max 5 items per list. Every recommendation must cite evidence from the data.' },
            { role: 'user', content: JSON.stringify({ periodDays: days, stats, leads, visitorQuestions: questions.slice(0, 300) }).slice(0, 90_000) },
          ],
        });
        let data; try { data = JSON.parse(out.choices[0].message.content); } catch { data = { summary: out.choices[0].message.content }; }
        data.generatedFrom = { days, questions: questions.length, leads: leads.length, visitors: stats?.visitors ?? null };
        await rpc('mrs_insight_save', { p_days: days, p_data: data });
        return send(res, 200, { insight: data }, H);
      }
      case 'projects': {
        if (req.method === 'POST') { await rpc('mrs_project_update', { p_id: body.id, p: { status: body.status } }); return send(res, 200, { ok: true }, H); }
        const items = (await rpc('mrs_projects', { p_limit: 100 })) || [];
        const paths = items.flatMap((p) => (p.files || []).map((f) => f.path));
        let urls = {};
        if (paths.length) { try { const j = await files('download', { paths }); urls = Object.fromEntries((j.urls || []).map((u) => [u.path, u.signedUrl])); } catch (e) { console.error(e.message); } }
        items.forEach((p) => (p.files || []).forEach((f) => { f.url = urls[f.path] || null; }));
        return send(res, 200, { items }, H);
      }
      case 'marketing': {
        const settings = await getSettings();
        const kinds = { instagram: 'three Instagram captions (each under 120 words, with 5-8 relevant hashtags and a clear call to action)', email: 'one short email newsletter with a subject line, preview text and body (under 200 words)', google: 'two Google Business Profile posts (under 80 words each, each with a call-to-action button suggestion: Book, Learn more or Call)', tiktok: 'three short-form video ideas (hook, shot list, on-screen text, caption)', sms: 'three SMS messages under 160 characters for people who opted in to marketing texts' };
        const k = kinds[body.kind] ? body.kind : 'instagram';
        const stats = await rpc('mrs_stats', { p_days: 30 }).catch(() => null);
        const text = await write(settings, `You are the marketing writer for a Maryland recording studio. Voice: confident, warm, creative, music-culture, never cheesy. ${NO_INVENT}\n${facts()}`,
          `Write ${kinds[k]}. Focus / campaign: ${String(body.topic || 'grow memberships, recording and mixing bookings').slice(0, 500)}. ${stats ? `Real site data from the last 30 days you MAY reference for targeting (not for public claims): top interests ${JSON.stringify(stats.interestPicks || {})}, enquiries by service ${JSON.stringify(stats.leadsByService || {})}.` : ''} Plain text, ready to paste.`);
        return send(res, 200, { text }, H);
      }
      case 'review': {
        const settings = await getSettings();
        const review = String(body.review || '').slice(0, 3000);
        if (review.length < 5) return send(res, 400, { error: 'Paste the review first.' }, H);
        const text = await write(settings, `You write public replies to customer reviews for a recording studio owner. Be genuine, specific to what the reviewer said, brief (under 90 words), thankful, and professional. For negative reviews: acknowledge, don't argue, don't share private details, invite them to contact the studio directly at ${settings.ai.handoffPhone} or ${settings.ai.handoffEmail}. ${NO_INVENT} Give two alternative replies labelled Option 1 and Option 2.`,
          `Platform: ${String(body.platform || 'Google').slice(0, 30)}. Rating: ${String(body.rating || 'unknown').slice(0, 10)}. Reviewer name: ${String(body.name || 'unknown').slice(0, 60)}.\nReview:\n${review}`);
        return send(res, 200, { text }, H);
      }
      case 'followup': {
        const settings = await getSettings();
        const leads = (await rpc('mrs_list', { p_what: 'leads', p_limit: 200, p_offset: 0, p_id: null })) || [];
        const l = leads.find((x) => x.id === body.id);
        if (!l) return send(res, 404, { error: 'Lead not found' }, H);
        if (!l.consent_contact) return send(res, 400, { error: 'This person did not agree to be contacted.' }, H);
        const text = await write(settings, `You draft a personal follow-up message from the studio team to someone who asked about a service. Short (under 110 words), friendly, helpful, references what they asked about, gives the single most relevant next step and link from the facts. Sign off as "The Disco Sundays team". ${NO_INVENT}\n${facts()}\nBooking links: membership checkout https://square.link/u/rJp640Zd ; book any service at ${catalogue().config.siteUrl}/book ; upload files ${catalogue().config.siteUrl}/submit-project`,
          `Channel: ${body.channel === 'sms' ? 'text message (under 300 characters, no subject)' : 'email (include a subject line on the first line as "Subject: ...")'}. Lead: name ${l.name || 'unknown'}, service ${l.service}, what they said: ${(l.project || '').slice(0, 600)}, preferred date ${l.preferred_date || 'not given'}.`);
        return send(res, 200, { text, email: l.email, phone: l.phone }, H);
      }
      case 'integrations': {
        return send(res, 200, { items: [
          { name: 'OpenAI (AI assistant, voice, insights)', ok: openaiConfigured(), note: openaiConfigured() ? 'OPENAI_API_KEY is set (server-side only).' : 'Set OPENAI_API_KEY in Vercel → Project → Settings → Environment Variables.' },
          { name: 'Database (analytics, leads, projects)', ok: true, note: 'Supabase project connected.' },
          { name: 'Email alerts for new leads/projects', ok: emailConfigured(), note: emailConfigured() ? 'Resend is set up.' : 'Optional: add RESEND_API_KEY and CONTACT_TO_EMAIL in Vercel to get an email for every enquiry and upload. Everything is saved here either way.' },
          { name: 'WhatsApp assistant', ok: !whatsappMissing().length, note: whatsappMissing().length ? `Ready to connect. Add ${whatsappMissing().join(', ')} in Vercel, then set the Meta webhook to /api/integrations/whatsapp.` : 'Connected.' },
          { name: 'AI phone receptionist', ok: !phoneMissing().length, note: phoneMissing().length ? 'Ready to connect. Point a Twilio Elastic SIP trunk at OpenAI Realtime SIP, create an OpenAI webhook to /api/integrations/phone, and add OPENAI_WEBHOOK_SECRET in Vercel.' : 'Connected.' },
          { name: 'Square bookings & payments data', ok: Boolean(process.env.SQUARE_ACCESS_TOKEN), note: process.env.SQUARE_ACCESS_TOKEN ? 'Token present.' : 'Needed for completed bookings, revenue, repeat bookings and automated retention/booking-recovery messages (with customer consent).' },
        ] }, H);
      }
      default: return send(res, 400, { error: 'Unknown action' }, H);
    }
  } catch (e) {
    console.error('admin', e.message);
    return send(res, 500, { error: e.message }, H);
  }
}
