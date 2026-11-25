// Private dashboard API. Every action except login needs the signed HttpOnly session cookie.
import { send, readJSONBody } from './_lib/http.js';
import { rpc, getSettings, clearSettingsCache } from './_lib/db.js';
import { isAuthed, checkPassword, sessionCookie, clearCookie, adminConfigured } from './_lib/admin.js';
import { openai, openaiConfigured } from './_lib/openai.js';
import { files } from './_lib/files.js';
import { catalogue } from './_lib/knowledge.js';
import { whatsappMissing } from './_lib/routes/whatsapp.js';
import { phoneMissing } from './_lib/routes/phone.js';
import hqPage from './_lib/routes/hq.js';
import { buildWeeklyReport } from './_lib/report.js';
import { sendEmail, layoutEmail, emailConfigured, dashboardUrl } from './_lib/notify.js';
import { sendReviewInvite, sendRebookReminder, verifyOptout, optOut, customerEmailReady } from './_lib/invites.js';
import { squareHealth, endedBookings, customer, availability, upcomingFor } from './_lib/availability.js';
import { slugsForVariations, againLink } from './_lib/routes/book-again.js';
import { getReviews, reviewsConfigured } from './_lib/reviews.js';
import { squareConfigured } from './_lib/square.js';

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
  // Public: one-click unsubscribe from review emails (signed link).
  if (action === 'unsubscribe') {
    const e = verifyOptout(url.searchParams.get('e'), url.searchParams.get('s'));
    if (e) await optOut(e).catch(() => {});
    res.statusCode = e ? 200 : 400; res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Email preferences</title><body style="font:16px/1.5 system-ui;padding:40px;max-width:520px;margin:auto"><h1>${e ? 'You are unsubscribed' : 'Link not valid'}</h1><p>${e ? 'We will not send you review or reminder emails again.' : 'This link is invalid or expired.'}</p><p><a href="/">Back to the website</a></p></body>`);
  }
  // Daily scheduled job (Vercel Cron sends Authorization: Bearer CRON_SECRET).
  if (action === 'cron') {
    if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return send(res, 401, { error: 'unauthorized' }, H);
    const settings = await getSettings({ fresh: true });
    const log = { at: new Date().toISOString() };
    const etDay = new Date().toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/New_York' });
    if (etDay === 'Mon' && settings.reports?.weekly !== false) { try { const r = await buildWeeklyReport(settings, { send: true }); log.weekly = r.email.status; } catch (e) { log.weekly = 'error: ' + e.message; } }
    if (reviewsConfigured()) { try { await getReviews({ refresh: true }); log.reviews = 'refreshed'; } catch (e) { log.reviews = 'error: ' + e.message; } }
    if (settings.reviewsInvites?.auto && squareConfigured() && customerEmailReady()) {
      try {
        const until = Date.now() - 2 * 3600_000, since = until - 24 * 3600_000;
        const bookings = await endedBookings(since, until); let sent = 0;
        for (const b of bookings.slice(0, 40)) {
          const c = await customer(b.customer_id).catch(() => null);
          if (!c?.email_address) continue;
          const r = await sendReviewInvite({ email: c.email_address, name: [c.given_name, c.family_name].filter(Boolean).join(' '), dedupKey: `review:booking:${b.id}`, source: 'square_auto' });
          if (r.status === 'sent') sent++;
        }
        log.invites = `${sent}/${bookings.length}`;
      } catch (e) { log.invites = 'error: ' + e.message; }
    }
    if (settings.rebookReminders?.auto && squareConfigured() && customerEmailReady()) {
      try {
        const days = Math.min(120, Math.max(7, Number(settings.rebookReminders.days) || 30));
        const until = Date.now() - days * 86400_000, since = until - 86400_000;
        const bookings = await endedBookings(since, until); let sent = 0; const seen = new Set();
        for (const b of bookings.slice(0, 40)) {
          if (seen.has(b.customer_id)) continue; seen.add(b.customer_id);
          const c = await customer(b.customer_id).catch(() => null);
          if (!c?.email_address || c.preferences?.email_unsubscribed) continue;
          if ((await upcomingFor(b.customer_id).catch(() => 1)) > 0) continue;
          const slugs = await slugsForVariations((b.appointment_segments || []).map((x) => x.service_variation_id)).catch(() => []);
          if (!slugs.length) continue;
          const r = await sendRebookReminder({ email: c.email_address, name: [c.given_name, c.family_name].filter(Boolean).join(' '), bookingId: b.id, link: againLink(c.email_address, slugs) });
          if (r.status === 'sent') sent++;
        }
        log.rebook = `${sent}/${bookings.length}`;
      } catch (e) { log.rebook = 'error: ' + e.message; }
    }
    await rpc('mrs_record_create', { p_kind: 'cron_log', p_token_hash: null, p_visitor: null, p: log }).catch(() => {});
    return send(res, 200, log, H);
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
          const allowed = ['ai', 'motion', 'personalization', 'conversion', 'experiment', 'reports', 'reviewsInvites', 'rebookReminders'];
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
      case 'conversion': {
        const settings = await getSettings({ fresh: true });
        const counts = await rpc('mrs_event_counts', { p_days: days });
        const exp = settings.experiment?.id ? await rpc('mrs_experiment_stats', { p_exp: settings.experiment.id }) : {};
        return send(res, 200, { counts, experiment: settings.experiment, expStats: exp, conversion: settings.conversion }, H);
      }
      case 'headlines': {
        const settings = await getSettings();
        const text = await write(settings, `You write homepage hero headlines for a recording studio website to increase bookings. ${NO_INVENT}\n${facts()}\nCurrent headline: "Make the record you keep | hearing in your head." Current subline: "A members' studio for artists who are serious about what's next: 24/7 access, your own audio engineer if you want one, and artist development that maps out your next move."`,
          `Write 3 alternative hero variants with different angles (e.g. outcome, price/value with real prices, membership freedom). ${String(body.focus || '').slice(0, 300)} Return JSON {"variants":[{"headline": "main part | accent part (max 10 words total, use one | to split)", "sub": "one sentence, max 30 words", "angle": "2-4 words"}]}`, true);
        let v = []; try { v = JSON.parse(text).variants || []; } catch {}
        return send(res, 200, { variants: v.slice(0, 3).map((x, i) => ({ id: 'v' + (i + 1), headline: String(x.headline || '').slice(0, 120), sub: String(x.sub || '').slice(0, 240), angle: String(x.angle || '').slice(0, 40) })) }, H);
      }
      case 'reports': {
        if (req.method === 'POST') { const r = await buildWeeklyReport(await getSettings({ fresh: true }), { send: body.email === true, reason: 'manual-' + Date.now() }); return send(res, 200, { report: r.report, email: r.email.status }, H); }
        return send(res, 200, { items: await rpc('mrs_record_list', { p_kind: 'weekly_report', p_limit: 20, p_days: 400 }) }, H);
      }
      case 'alerts': {
        if (req.method === 'POST' && body.test) {
          const r = await sendEmail({ dedupKey: `test:${Date.now()}`, kind: 'test', subject: 'Test alert from your website', html: layoutEmail('Test alert from your website', [['Status', 'If you can read this, lead alerts work.']], { cta: { label: 'Open dashboard', url: dashboardUrl() } }), text: 'If you can read this, lead alerts work.' });
          return send(res, 200, r, H);
        }
        return send(res, 200, { items: await rpc('mrs_notify_list', { p_limit: 150 }), configured: emailConfigured(), customerReady: customerEmailReady() }, H);
      }
      case 'invites': {
        if (req.method === 'POST') {
          const list = (Array.isArray(body.recipients) ? body.recipients : []).slice(0, 25);
          const results = [];
          for (const r of list) results.push({ email: r.email, ...(await sendReviewInvite({ email: r.email, name: r.name, service: r.service, source: 'manual' })) });
          return send(res, 200, { results }, H);
        }
        return send(res, 200, { items: await rpc('mrs_record_list', { p_kind: 'review_invite', p_limit: 200, p_days: 400 }), rebook: await rpc('mrs_record_list', { p_kind: 'rebook_reminder', p_limit: 200, p_days: 400 }), ready: customerEmailReady(), square: squareConfigured() }, H);
      }
      case 'records': {
        const kind = url.searchParams.get('kind');
        if (!['release_plan', 'song_idea', 'mix_compare', 'cron_log'].includes(kind)) return send(res, 400, { error: 'bad kind' }, H);
        return send(res, 200, { items: await rpc('mrs_record_list', { p_kind: kind, p_limit: 100, p_days: days }) }, H);
      }
      case 'square': {
        const health = await squareHealth();
        let sample = null; if (health.ok) { try { sample = await availability('recording-session-1-hour', { days: 7 }); } catch (e) { sample = { error: e.message }; } }
        return send(res, 200, { health, sample }, H);
      }
      case 'integrations': {
        return send(res, 200, { items: [
          { name: 'OpenAI (AI assistant, voice, insights)', ok: openaiConfigured(), note: openaiConfigured() ? 'OPENAI_API_KEY is set (server-side only).' : 'Set OPENAI_API_KEY in Vercel → Project → Settings → Environment Variables.' },
          { name: 'Database (analytics, leads, projects)', ok: true, note: 'Supabase project connected.' },
          { name: 'Email alerts for new leads/projects', ok: emailConfigured(), note: emailConfigured() ? 'Resend is set up.' : 'Optional: add RESEND_API_KEY and CONTACT_TO_EMAIL in Vercel to get an email for every enquiry and upload. Everything is saved here either way.' },
          { name: 'WhatsApp assistant', ok: !whatsappMissing().length, note: whatsappMissing().length ? `Ready to connect. Add ${whatsappMissing().join(', ')} in Vercel, then set the Meta webhook to /api/integrations/whatsapp.` : 'Connected.' },
          { name: 'AI phone receptionist', ok: !phoneMissing().length, note: phoneMissing().length ? 'Ready to connect. Point a Twilio Elastic SIP trunk at OpenAI Realtime SIP, create an OpenAI webhook to /api/integrations/phone, and add OPENAI_WEBHOOK_SECRET in Vercel.' : 'Connected.' },
          { name: 'Square live availability & bookings', ok: squareConfigured(), note: squareConfigured() ? 'SQUARE_ACCESS_TOKEN is set. See the Square check below.' : 'Add SQUARE_ACCESS_TOKEN (production, scopes APPOINTMENTS_READ, ITEMS_READ, CUSTOMERS_READ) in Vercel to show real open times, power automatic review invitations and booking data.' },
          { name: 'Google reviews on the website', ok: reviewsConfigured(), note: reviewsConfigured() ? 'GOOGLE_PLACES_API_KEY is set; reviews refresh daily.' : 'Add GOOGLE_PLACES_API_KEY (Google Cloud, Places API (New) enabled, restricted to this API) to show your genuine Google reviews. Your Google Business Profile is not changed.' },
          { name: 'Emails to customers (review invitations)', ok: customerEmailReady(), note: customerEmailReady() ? 'Sender domain set.' : 'Needs RESEND_API_KEY plus CONTACT_FROM_EMAIL on a domain verified in Resend (e.g. hello@marylandrecordingstudio.com).' },
          { name: 'Scheduled jobs (weekly report, review invites)', ok: Boolean(process.env.CRON_SECRET), note: process.env.CRON_SECRET ? 'Runs daily at about 8 am Eastern; weekly report on Mondays.' : 'CRON_SECRET not set.' },
        ] }, H);
      }
      default: return send(res, 400, { error: 'Unknown action' }, H);
    }
  } catch (e) {
    console.error('admin', e.message);
    return send(res, 500, { error: e.message }, H);
  }
}
