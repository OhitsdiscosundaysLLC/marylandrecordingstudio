// Executes the assistant's tool calls (shared by text chat and voice).
import { rpc, dbConfigured } from './db.js';
import { bookingCards, scoreLead } from './knowledge.js';

export async function runTool(name, args, ctx, settings) {
  if (name === 'show_booking_options') {
    const cards = bookingCards(args.slugs || []);
    ctx.ui.push({ type: 'booking', reason: args.reason || '', cards });
    return { shown: cards.map((c) => c.name) };
  }
  if (name === 'capture_lead') {
    if (args.consent_contact !== true) return { saved: false, error: 'Visitor has not agreed to be contacted. Ask first.' };
    if (!args.email && !args.phone) return { saved: false, error: 'Need an email or phone number to follow up.' };
    const lead = { ...args, conversation_id: ctx.conversationId, source: ctx.channel === 'voice' ? 'ai_voice' : 'ai_chat' };
    Object.assign(lead, scoreLead(lead));
    if (dbConfigured()) await rpc('mrs_lead', { p: lead });
    ctx.ui.push({ type: 'lead_saved' });
    return { saved: true };
  }
  if (name === 'handoff_to_human') {
    if (dbConfigured() && ctx.conversationId) await rpc('mrs_conversation', { p: { id: ctx.conversationId, outcome: 'handoff', status: 'needs_human', summary: String(args.reason || '').slice(0, 300) } });
    ctx.ui.push({ type: 'handoff', phone: settings.ai.handoffPhone, email: settings.ai.handoffEmail });
    return { phone: settings.ai.handoffPhone, email: settings.ai.handoffEmail, note: 'Contact options are shown on screen.' };
  }
  return { error: 'unknown tool' };
}
