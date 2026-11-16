import { send } from './_lib/http.js';
import { getSettings } from './_lib/db.js';
import { openaiConfigured } from './_lib/openai.js';
// Public, non-secret flags the site needs (motion toggles, whether the assistant is on).
export default async function handler(req, res) {
  const s = await getSettings();
  send(res, 200, {
    motion: s.motion, personalization: s.personalization,
    ai: { enabled: s.ai.enabled && openaiConfigured(), voiceEnabled: s.ai.enabled && s.ai.voiceEnabled && openaiConfigured(), greeting: s.ai.greeting },
    contact: { phone: s.ai.handoffPhone, email: s.ai.handoffEmail },
  }, { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300, max-age=0' });
}
