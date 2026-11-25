// "Find your session" quiz: turns 3 answers into a personalised plan with real services only.
import { send, readJSONBody } from '../http.js';
import { rpc, dbConfigured, getSettings } from '../db.js';
import { openai, openaiConfigured } from '../openai.js';
import { catalogue, bookingCards } from '../knowledge.js';

const GOALS = { record: 'Record a new song', mix: 'Mix a song I already recorded', master: 'Master a finished mix', podcast: 'Podcast or video podcast', voiceover: 'Voice-over', develop: 'Grow as an artist (development, feedback, a plan)' };
const FREQ = { once: 'Just this once', few: 'A few times a month', weekly: 'Every week or more' };
const STAGE = { idea: 'Ideas / writing', ready: 'Beats and lyrics ready', recorded: 'Vocals already recorded', polish: 'Song done, needs polish' };

// Deterministic baseline so the quiz always answers, even if the AI is unavailable.
function baseline({ goal, freq }) {
  const heavy = freq === 'weekly' || freq === 'few';
  const map = {
    record: heavy ? ['unlimited-membership', 'recording-session-2-hours'] : ['recording-session-2-hours', 'recording-session-1-hour'],
    mix: ['mixing', 'mastering', 'submit-project'],
    master: ['mastering', 'submit-project'],
    podcast: ['video-podcasting', heavy ? 'unlimited-membership' : 'visit-studio'],
    voiceover: ['voice-over', 'visit-studio'],
    develop: ['artist-development', 'crash-test-artist-evaluation', heavy ? 'unlimited-membership' : 'release-planner'],
  };
  return map[goal] || ['visit-studio', 'recording-session-1-hour'];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const b = await readJSONBody(req, 4000).catch(() => ({}));
  const goal = GOALS[b.goal] ? b.goal : 'record', freq = FREQ[b.freq] ? b.freq : 'once', stage = STAGE[b.stage] ? b.stage : 'ready';
  const note = String(b.note || '').slice(0, 400);
  const settings = await getSettings();
  let slugs = baseline({ goal, freq });
  let plan = null;
  if (settings.ai.enabled && openaiConfigured()) {
    const { services } = catalogue();
    const list = services.filter((s) => s.category !== 'member-sessions' && !(s.category === 'development' && /free/i.test(s.price || ''))).map((s) => `${s.slug}: ${s.name}, ${s.price || 'free'}${s.durationMinutes ? `, ${s.durationMinutes} min` : ''}${s.action.type === 'purchase' ? ', monthly membership, no appointment' : ''}${s.category === 'member-sessions' ? ' (members only)' : ''}`).join('\n');
    try {
      const out = await openai('/chat/completions', {
        model: settings.ai.model || 'gpt-4o-mini', temperature: 0.4, response_format: { type: 'json_object' }, max_tokens: 500,
        messages: [
          { role: 'system', content: `You recommend services for Maryland Recording Studio by Disco Sundays (Hanover, MD). Use ONLY these services and prices; never invent prices, discounts, availability or outcomes:\n${list}\nAlso available: submit-project (free page to upload files for mixing/mastering), visit-studio (free 30-min visit), artist-development (Artist Development Program, $100: mentorship, production, Logic Pro, GarageBand, MIDI, recording techniques; separate from membership and from the RAP Program), release-planner (free AI release timeline), hook-starter (free AI songwriting ideas). Do not recommend members-only sessions (1/2 hour artist development session, course training) to non-members.\nMembership: $200/month + MD tax, 24/7 access up to 4 hrs/day, A&R review, help booking shows; pays off at about 4+ studio hours a month vs $60/hour. Do not recommend members-only sessions to non-members. Members still book their sessions in Square after joining (don't claim no scheduling).\nReturn JSON: {"headline": short personal headline (max 9 words), "summary": 1-2 sentences why, "steps": [3 short action steps], "slugs": [2-3 slugs from the list, best first], "estimate": ""} (leave estimate empty; it is calculated separately). Friendly, confident, no hype, no fake urgency. ${b.lang === 'es' ? 'Write headline, summary and steps in natural Latin-American Spanish.' : ''}` },
          { role: 'user', content: `Goal: ${GOALS[goal]}. How often: ${FREQ[freq]}. Stage: ${STAGE[stage]}. ${note ? 'Extra: ' + note : ''}` },
        ],
      });
      plan = JSON.parse(out.choices[0].message.content);
      const { services } = catalogue();
      const membersOnly = new Set(services.filter((x) => x.category === 'member-sessions' || (x.category === 'development' && /free/i.test(x.price || ''))).map((x) => x.slug));
      const valid = (plan.slugs || []).filter((x) => bookingCards([x]).length && !membersOnly.has(x) && !/^creator-membership/.test(x));
      if (valid.length) slugs = valid.slice(0, 3);
    } catch (e) { console.error('plan', e.message); }
  }
  const cards = bookingCards(slugs);
  // Cost line computed from real prices (never by the AI).
  const hrs = { once: 0, few: 4, weekly: 8 }[freq];
  const studio = ['record', 'podcast', 'voiceover', 'develop'].includes(goal);
  const es = b.lang === 'es';
  const estimate = es ? (studio && hrs ? `Unas ${hrs} horas de estudio al mes: $${hrs * 60} pagando $60/hora vs $212 con la Unlimited membership ($200 + impuesto de MD).` : goal === 'mix' ? 'Mixing Session $75 (1 hora)' + (stage === 'polish' ? '; agrega Mastering por $50.' : '.') : goal === 'master' ? 'Mastering cuesta $50.' : goal === 'record' ? 'La grabación cuesta $60/hora (sesiones de 1, 2 o 3 horas: $60, $120, $180).' : '') : studio && hrs ? `About ${hrs} studio hours a month: $${hrs * 60} paying $60/hour vs $212 with Unlimited membership ($200 + MD tax).`
    : goal === 'mix' ? 'Mixing Session $75 (1 hour)' + (stage === 'polish' ? '; add Mastering for $50.' : '.')
    : goal === 'master' ? 'Mastering is $50.'
    : goal === 'record' ? 'Recording is $60/hour (1, 2 or 3-hour sessions: $60, $120, $180).' : '';
  plan = {
    headline: String(plan?.headline || (es ? 'Por aquí puedes empezar' : 'Here’s where to start')).slice(0, 80),
    summary: String(plan?.summary || '').slice(0, 400),
    steps: (Array.isArray(plan?.steps) ? plan.steps : []).slice(0, 3).map((x) => String(x).slice(0, 160)),
    estimate,
  };
  try { if (dbConfigured()) await rpc('mrs_track', { p: { type: 'quiz_complete', label: `${goal}/${freq}/${stage}`, visitor_id: String(b.visitor_id || '').slice(0, 64), path: String(b.page || '').slice(0, 300), source: String(b.source || '').slice(0, 120), meta: { slugs } } }); } catch {}
  send(res, 200, { plan, cards });
}
