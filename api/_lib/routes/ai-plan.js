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
    develop: ['crash-test-artist-evaluation', '1-hour-artist-development-session', heavy ? 'unlimited-membership' : 'visit-studio'],
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
    const list = services.map((s) => `${s.slug}: ${s.name}, ${s.price || 'free'}${s.durationMinutes ? `, ${s.durationMinutes} min` : ''}${s.action.type === 'purchase' ? ', monthly membership, no appointment' : ''}${s.category === 'member-sessions' ? ' (members only)' : ''}`).join('\n');
    try {
      const out = await openai('/chat/completions', {
        model: settings.ai.model || 'gpt-4o-mini', temperature: 0.4, response_format: { type: 'json_object' }, max_tokens: 500,
        messages: [
          { role: 'system', content: `You recommend services for Maryland Recording Studio by Disco Sundays (Hanover, MD). Use ONLY these services and prices; never invent prices, discounts, availability or outcomes:\n${list}\nAlso available: submit-project (free page to upload files for mixing/mastering), visit-studio (free 30-min visit).\nMembership: $200/month + MD tax, 24/7 access up to 4 hrs/day, A&R review, help booking shows; pays off at about 4+ studio hours a month vs $60/hour. Do not recommend members-only sessions to non-members.\nReturn JSON: {"headline": short personal headline (max 9 words), "summary": 1-2 sentences why, "steps": [3 short action steps], "slugs": [2-3 slugs from the list, best first], "estimate": one short line of simple monthly/one-off cost math using only listed prices, or ""}. Friendly, confident, no hype, no fake urgency.` },
          { role: 'user', content: `Goal: ${GOALS[goal]}. How often: ${FREQ[freq]}. Stage: ${STAGE[stage]}. ${note ? 'Extra: ' + note : ''}` },
        ],
      });
      plan = JSON.parse(out.choices[0].message.content);
      const valid = (plan.slugs || []).filter((x) => bookingCards([x]).length);
      if (valid.length) slugs = valid.slice(0, 3);
    } catch (e) { console.error('plan', e.message); }
  }
  const cards = bookingCards(slugs);
  plan = {
    headline: String(plan?.headline || 'Here’s where to start').slice(0, 80),
    summary: String(plan?.summary || '').slice(0, 400),
    steps: (Array.isArray(plan?.steps) ? plan.steps : []).slice(0, 3).map((x) => String(x).slice(0, 160)),
    estimate: String(plan?.estimate || '').slice(0, 200),
  };
  try { if (dbConfigured()) await rpc('mrs_track', { p: { type: 'quiz_complete', label: `${goal}/${freq}/${stage}`, visitor_id: String(b.visitor_id || '').slice(0, 64), path: String(b.page || '').slice(0, 300), source: String(b.source || '').slice(0, 120), meta: { slugs } } }); } catch {}
  send(res, 200, { plan, cards });
}
