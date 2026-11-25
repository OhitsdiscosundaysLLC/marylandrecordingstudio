// Weekly AI report: real first-party data only (site analytics, leads, AI tool usage).
import { rpc } from './db.js';
import { openai, openaiConfigured } from './openai.js';
import { sendEmail, layoutEmail, dashboardUrl } from './notify.js';

const diff = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);

export async function buildWeeklyReport(settings, { send = true, reason = 'scheduled' } = {}) {
  const s7 = await rpc('mrs_stats', { p_days: 7 });
  const s14 = await rpc('mrs_stats', { p_days: 14 });
  const ev7 = (await rpc('mrs_event_counts', { p_days: 7 }))?.byType || {};
  const ev14 = (await rpc('mrs_event_counts', { p_days: 14 }))?.byType || {};
  const since = Date.now() - 7 * 86400_000;
  const leads = ((await rpc('mrs_list', { p_what: 'leads', p_limit: 200, p_offset: 0, p_id: null })) || []).filter((l) => Date.parse(l.created_at) >= since && !/QA test/i.test(l.notes || ''));
  const prev = (k) => (s14?.[k] ?? 0) - (s7?.[k] ?? 0);
  const prevEv = (k) => (ev14[k] || 0) - (ev7[k] || 0);
  const m = {
    pageViews: s7.pageViews, pageViewsPrev: prev('pageViews'), visitors: s7.visitors, returningVisitors: s7.returningVisitors,
    conversations: s7.conversations, conversationsPrev: prev('conversations'), leads: leads.length, leadsPrev: prev('leads'),
    bookingStarts: s7.bookingStarts, bookingStartsPrev: prev('bookingStarts'), membershipCheckouts: s7.membershipCheckouts, adCheckouts: ev7.ad_checkout_click || 0, adCheckoutsPrev: prevEv('ad_checkout_click'),
    aiBookingStarts: s7.aiBookingStarts, escalations: s7.escalations, sources: s7.sources, topPages: s7.topPages, leadsByService: leads.reduce((o, l) => ((o[l.service || 'other'] = (o[l.service || 'other'] || 0) + 1), o), {}),
    tools: { sessionFinder: ev7.quiz_complete || 0, demoFeedback: ev7.feedback_complete || 0, releasePlans: ev7.release_plan || 0, hookIdeas: ev7.hook_generate || 0, nudgeClicks: ev7.nudge_click || 0, projectUploads: leads.filter((l) => l.source === 'project_upload').length },
  };
  let ai = null;
  if (openaiConfigured()) {
    try {
      const out = await openai('/chat/completions', { model: settings.ai.model || 'gpt-4o-mini', temperature: 0.2, response_format: { type: 'json_object' }, max_tokens: 700, messages: [
        { role: 'system', content: 'You write a weekly performance report for the owner of a Maryland recording studio website. Use ONLY the numbers given. Never invent figures, customers or causes; when data is too small to conclude, say so. Booking completions and revenue happen in Square and are not in this data: never claim them. Return JSON {"headline": one sentence, "wins": [up to 3], "concerns": [up to 3], "missed": [up to 3 missed opportunities supported by the data], "actions": [3 specific actions for next week, each tied to a number]}.' },
        { role: 'user', content: JSON.stringify(m) }] });
      ai = JSON.parse(out.choices[0].message.content);
    } catch (e) { console.error('report ai', e.message); }
  }
  const weekOf = new Date(since).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
  const report = { weekOf, generatedAt: new Date().toISOString(), reason, metrics: m, ai };
  const id = await rpc('mrs_record_create', { p_kind: 'weekly_report', p_token_hash: null, p_visitor: null, p: report });
  let email = { status: 'skipped' };
  if (send) {
    const fmt = (a, b) => `${a ?? 0}${diff(a || 0, b || 0) !== null ? ` (${diff(a || 0, b || 0) >= 0 ? '+' : ''}${diff(a || 0, b || 0)}% vs prior week)` : ''}`;
    const rows = [['Page views', fmt(m.pageViews, m.pageViewsPrev)], ['Visitors', m.visitors], ['AI conversations', fmt(m.conversations, m.conversationsPrev)], ['New leads', fmt(m.leads, m.leadsPrev)], ['Clicks to Square booking', fmt(m.bookingStarts, m.bookingStartsPrev)], ['Membership checkout clicks', m.membershipCheckouts], ['Artist Development checkout clicks', fmt(m.adCheckouts, m.adCheckoutsPrev)], ['AI tools used', `Finder ${m.tools.sessionFinder} · Demo feedback ${m.tools.demoFeedback} · Release plans ${m.tools.releasePlans} · Hooks ${m.tools.hookIdeas}`], ['Leads by service', Object.entries(m.leadsByService).map(([k, v]) => `${k} ${v}`).join(', ') || '-']];
    const ai2 = ai ? `<p><strong>${ai.headline || ''}</strong></p>${[['Wins', ai.wins], ['Concerns', ai.concerns], ['Missed opportunities', ai.missed], ['Do this week', ai.actions]].filter(([, a]) => a?.length).map(([h, a]) => `<h3 style="margin:16px 0 4px">${h}</h3><ul>${a.map((x) => `<li>${String(x).replace(/[<>&]/g, '')}</li>`).join('')}</ul>`).join('')}` : '';
    email = await sendEmail({ dedupKey: `weekly:${new Date(since).toISOString().slice(0, 10)}:${reason}`, kind: 'weekly_report', subject: `Weekly website report · week of ${weekOf}`, ref: 'reports',
      html: layoutEmail(`Weekly website report · week of ${weekOf}`, rows, { intro: 'Your Monday summary from the website (first-party data; Square booking completions and revenue are not included).', cta: { label: 'Open the full report', url: dashboardUrl('reports') } }).replace('</table>', `</table>${ai2}`),
      text: rows.map(([k, v]) => `${k}: ${v}`).join('\n') + (ai ? `\n\n${ai.headline}\n- ${(ai.actions || []).join('\n- ')}` : '') + `\n\n${dashboardUrl('reports')}` });
  }
  return { id, report, email };
}
