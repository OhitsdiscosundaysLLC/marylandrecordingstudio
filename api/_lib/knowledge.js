// Builds the AI's knowledge from the site's own verified data files, so the assistant
// only ever quotes real services, prices, policies and links.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const read = (p) => JSON.parse(readFileSync(path.join(process.cwd(), p), 'utf8'));
let built = null;

export function catalogue() {
  if (built) return built;
  const config = read('site.config.json');
  const data = read('data/services.json');
  const ed = read('content/services-editorial.json');
  const faqs = read('content/faq.json');
  const services = data.services.map((s) => {
    const e = ed.services[s.id] || {};
    const base = s.bookingBase || config.square.bookingBase;
    const hideDuration = !!e.hideDuration;
    const price = e.priceSuffix && s.price?.display ? s.price.display.replace(/\.00$/, '') + e.priceSuffix : s.price?.display;
    return {
      id: s.id, slug: e.slug || s.id, name: s.name, category: s.category,
      categoryLabel: ed.categoryLabels?.[s.category]?.label || s.category,
      price, durationMinutes: hideDuration ? null : s.durationMinutes,
      description: [s.description, ...(s.longDescription || [])].join(' '),
      includes: s.includes || [], primary: e.primary || null, order: e.order ?? 99,
      action: e.purchase ? { type: 'purchase', label: e.purchase.label, url: e.purchase.url, note: e.purchase.note } : { type: 'book', label: 'Book', url: `/book?service=${e.slug}`, squareUrl: `${base}/${s.id}` },
      page: `/services/${e.slug}`,
    };
  }).sort((a, b) => a.order - b.order);
  const strip = (h) => h.replace(/<[^>]+>/g, '');
  built = { config, services, faqs: faqs.flatMap((g) => g.items.map((i) => ({ q: i.q, a: strip(i.a.join(' ')) }))) };
  return built;
}

export function systemPrompt(settings, { channel = 'chat', interest = '', page = '' } = {}) {
  const { config, services, faqs } = catalogue();
  const svc = services.map((s) => `- [${s.slug}] ${s.name} (${s.categoryLabel}): ${s.price || 'price shown at booking'}${s.durationMinutes ? `, ${s.durationMinutes} min` : ''}. ${s.action.type === 'purchase' ? 'Joined/paid through checkout, NO appointment needed.' : 'Booked as an appointment in Square.'} ${s.description}`).join('\n');
  const faq = faqs.map((f) => `Q: ${f.q}\nA: ${f.a}`).join('\n');
  const eco = config.ecosystem.map((e) => `- ${e.name}: ${e.description} (${e.url.startsWith('/') ? config.siteUrl + e.url : e.url})`).join('\n');
  return `You are the AI studio assistant for Maryland Recording Studio by Disco Sundays (Disco Sundays LLC), a members' recording studio in Hanover, Maryland 21076. You are an AI, not a person: say so if asked, and never pretend to be human.

GOAL: help each visitor find the right service and get booked or joined, by being genuinely helpful (never pushy). Ask one short question at a time to understand what they want to achieve (e.g. record vocals over a beat, need production help, mixing a finished recording, recording often enough that membership saves money). Then recommend specific services. EVERY time you recommend or mention a specific service they could book or join, also call show_booking_options with its slug(s) so they get tappable Book/Join buttons (never paste links in text). The buttons appear right under your message, so never ask "would you like me to show you the options?"; just say the buttons are below.

THREE SEPARATE PROGRAMS — never merge or rename them:
- ARTIST DEVELOPMENT PROGRAM (slug 'artist-development' for the page, 'artist-development-join' for checkout): Disco Sundays mentorship and practical music education: music production, Logic Pro, GarageBand, MIDI equipment, recording and production techniques, creative guidance and community. "Artist Development Plan" is $100 via Square checkout (billing details shown at checkout). For beginners and growing artists/producers.
- UNLIMITED MEMBERSHIP: studio access (below). Members can book 1/2-hour artist development sessions and 2-hour course training as member sessions, but the membership is NOT the Artist Development Program.
- RAP PROGRAM (slug 'rap-program'): a completely separate music production program for young artists with its own packages (Single $125, EP $200, LP $300, Star Pack $500, Superstar Bonus $750) and a free one-time introductory hour; registration on its own website. Do not call it Artist Development.
FREE TOOLS: 'release-planner' (AI release timeline), 'hook-starter' (original hook and lyric ideas), 'feedback' (AI demo feedback, includes mix vs reference comparison).
THE THREE MAIN WAYS IN (recommend these first when they fit):
1. Disco Sundays Unlimited membership: $200/month (plus Maryland sales tax at checkout). 24/7 studio access, up to 4 hours a day, no contracts, music uploaded for A&R review, help booking shows, one location. Joining is a checkout payment: NO appointment or 4-hour booking is needed. Members then book member sessions.
2. Recording: 1 Hour Session $60, 2 Hour Session $120, 3 Hour Session $180, booked in Square.
3. Mixing: Mixing Session $75 for 1 hour, plus Mastering $50.
Membership vs pay-as-you-go: the only facts you may use are the prices above. E.g. at $60/hour, 4 one-hour sessions cost $240 vs $200/month membership; you may do simple arithmetic like this when the visitor tells you how often they record; say it's an estimate and that Maryland sales tax is added to the membership at checkout. Membership allows up to 4 hours a day.

ALL SERVICES (the only services that exist):
${svc}

FAQ AND POLICIES:
${faq}

CONTACT: call or text ${settings.ai.handoffPhone}, email ${settings.ai.handoffEmail}. Website: ${config.siteUrl}.
WEBSITE PAGES YOU CAN OFFER (use show_booking_options with these slugs too): 'submit-project' = upload files/stems for mixing or mastering (private, up to 50 MB per file or a Drive/Dropbox link); 'members' = members area (portal, member sessions, help); 'rewards' = Disco Rewards customer portal sign-in; 'feedback' = free AI feedback on a demo (upload a song, get notes in about a minute), great for unsure artists.
Existing members book free member sessions (1-hour-membership-session, 2-hour-membership-session, 3-hour-membership-session, 4-hour-membership-session) after signing in with the username/password they created at checkout.
Changing/cancelling a booking or receipts: handled by Square (confirmation email) or the team; you cannot see or change bookings.
DISCO SUNDAYS ECOSYSTEM (the Rewards program is also the customer portal / member login):
${eco}
${settings.ai.extraKnowledge ? `\nADDITIONAL VERIFIED INFORMATION FROM THE OWNER:\n${settings.ai.extraKnowledge}\n` : ''}
STRICT RULES:
- Only state prices, services, policies and benefits listed above. Never invent prices, discounts, availability, equipment, engineers' names, testimonials, reviews or guarantees. If you don't know (e.g. specific gear, exact availability, turnaround times), say so and offer to connect them with the team.
- You cannot see the calendar or take payments. Never say a booking is confirmed. Booking happens on Square's secure page; membership is paid through Square checkout.
- No fake urgency. No pressure.
- Capturing contact details: only when the visitor wants follow-up. Ask permission explicitly ("Is it OK if the team contacts you about this?"). Only call capture_lead after they say yes, with consent_contact=true. Ask about marketing updates separately; default no.
- Use handoff_to_human when they ask for a person, have a complaint, a billing/refund issue, or anything you can't answer.
- Never ask for card numbers or passwords. Membership usernames/passwords are created at Square checkout, not here.
- Keep replies short: 1-3 sentences for chat${channel === 'voice' ? '; for voice, speak naturally in one or two sentences and never read out URLs (the buttons appear on screen)' : ''}. Use plain text, no markdown headings.
${interest ? `The visitor told us they're interested in: ${interest}.` : ''}${page ? ` They are currently on the page: ${page}.` : ''}`;
}

export const TOOLS = [
  {
    name: 'show_booking_options',
    description: 'Show the visitor tappable buttons for specific services (booking links or membership checkout). Use whenever you recommend services.',
    parameters: { type: 'object', properties: { slugs: { type: 'array', items: { type: 'string' }, description: 'Service slugs from the list, or page slugs submit-project / members / rewards. Best first (max 4).' }, reason: { type: 'string', description: 'One short line on why these fit.' } }, required: ['slugs'] },
  },
  {
    name: 'capture_lead',
    description: 'Save the visitor as a lead for the team to follow up. ONLY after they explicitly agreed to be contacted.',
    parameters: { type: 'object', properties: {
      name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' },
      service: { type: 'string', enum: ['membership', 'recording', 'mixing', 'mastering', 'podcast', 'voice-over', 'live-performance', 'artist-development', 'other'] },
      project: { type: 'string', description: 'What they want to do, in their words.' }, preferred_date: { type: 'string' }, budget: { type: 'string' },
      urgency: { type: 'string', enum: ['today', 'this_week', 'this_month', 'later', 'unknown'] },
      consent_contact: { type: 'boolean' }, consent_marketing: { type: 'boolean' },
    }, required: ['service', 'consent_contact'] },
  },
  {
    name: 'handoff_to_human',
    description: 'Connect the visitor with the studio team (shows call/text/email options and flags the conversation).',
    parameters: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] },
  },
];

const PAGES = {
  'submit-project': { slug: 'submit-project', name: 'Send us your project', price: 'Upload files for mixing or mastering', type: 'page', label: 'Upload files', url: '/submit-project', external: false, page: '/submit-project' },
  feedback: { slug: 'feedback', name: 'Free AI demo feedback', price: 'Free · notes in about a minute', type: 'page', label: 'Try it', url: '/feedback', external: false, page: '/feedback' },
  'artist-development': { slug: 'artist-development', name: 'Artist Development Program', price: '$100 · mentorship & production education', type: 'page', label: 'See the program', url: '/artist-development', external: false, page: '/artist-development' },
  'artist-development-join': { slug: 'artist-development-join', name: 'Join Artist Development', price: '$100 · secure Square checkout', type: 'purchase', label: 'Join now', url: 'https://checkout.square.site/merchant/MLY8PKVN9PH8E/checkout/54URAM24X2QNNBYBC73FZVJ7', external: true, page: '/artist-development' },
  'rap-program': { slug: 'rap-program', name: 'RAP Program (separate youth program)', price: 'Packages from $125 · first hour free', type: 'page', label: 'Visit RAP Program', url: 'https://disco-rap-flow.base44.app/', external: true, page: 'https://disco-rap-flow.base44.app/' },
  'release-planner': { slug: 'release-planner', name: 'AI release planner', price: 'Free · timeline back from your release date', type: 'page', label: 'Plan my release', url: '/release-planner', external: false, page: '/release-planner' },
  'hook-starter': { slug: 'hook-starter', name: 'AI hook & lyric starter', price: 'Free · original song ideas', type: 'page', label: 'Start writing', url: '/hook-starter', external: false, page: '/hook-starter' },
  members: { slug: 'members', name: 'Members area', price: 'Portal, member sessions, help', type: 'page', label: 'Open', url: '/members', external: false, page: '/members' },
  rewards: { slug: 'rewards', name: 'Disco Rewards (customer portal)', price: 'Sign in, points and rewards', type: 'page', label: 'Open portal', url: 'https://disco-sundaysllc-club.base44.app/', external: true, page: 'https://disco-sundaysllc-club.base44.app/' },
};
export function bookingCards(slugs = []) {
  const { services } = catalogue();
  return [...new Set(slugs)].slice(0, 4).map((slug) => PAGES[slug] || services.find((s) => s.slug === slug)).filter(Boolean).map((s) => s.type === 'page' ? s : ({
    slug: s.slug, name: s.name, price: s.price, duration: s.durationMinutes, type: s.action.type,
    label: s.action.type === 'purchase' ? 'Join now' : (s.primary === 'recording' || s.category === 'recording' ? 'Book recording' : s.primary === 'mixing' ? 'Book mixing' : 'Book'),
    url: s.action.url, external: s.action.type === 'purchase', page: s.page,
  }));
}

// Transparent lead-priority rules shown in the dashboard.
export function scoreLead(l) {
  const hasContact = !!(l.email || l.phone);
  let priority = 'normal';
  if (l.urgency === 'today' || l.urgency === 'this_week') priority = 'high';
  if (l.service === 'membership' && hasContact) priority = priority === 'high' ? 'high' : 'medium';
  if (!hasContact) priority = 'low';
  const stage = l.service === 'membership' ? 'membership_prospect' : (l.urgency === 'today' || l.urgency === 'this_week') ? 'urgent_booking' : l.project && l.project.length > 40 ? 'project_enquiry' : 'new';
  return { priority, stage };
}
