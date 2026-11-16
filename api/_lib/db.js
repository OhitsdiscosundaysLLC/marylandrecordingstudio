// Supabase access through secret-gated Postgres functions (see supabase/migrations).
// The database secret and keys live only in server-side environment variables.
export function dbConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.DB_API_SECRET);
}

export async function rpc(name, args = {}) {
  if (!dbConfigured()) throw new Error('database_not_configured');
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_secret: process.env.DB_API_SECRET, ...args }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`db ${name} ${r.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

const DEFAULTS = {
  ai: { enabled: true, voiceEnabled: true, model: 'gpt-4o-mini', voiceModel: 'gpt-realtime', voice: 'marin', greeting: "Hey! I'm the Disco Sundays AI studio assistant. What are you working on?", extraKnowledge: '', handoffPhone: '(443) 401-5425', handoffEmail: 'ohitsdiscosundays@gmail.com', audioModel: 'gpt-audio' },
  motion: { ambient: true, magneticButtons: true, cursorGlow: true, waveform: true, reveal: true, marquee: true },
  personalization: { enabled: true },
  conversion: { quiz: true, feedback: true, nudges: true, welcomeBack: true },
  experiment: { enabled: false, id: '', variants: [] },
};
let cache = { at: 0, value: null };
export async function getSettings({ fresh = false } = {}) {
  if (!fresh && cache.value && Date.now() - cache.at < 30_000) return cache.value;
  let stored = {};
  try { stored = (await rpc('mrs_settings_get')) || {}; } catch { /* fall back to defaults */ }
  const merged = {};
  for (const k of Object.keys(DEFAULTS)) merged[k] = { ...DEFAULTS[k], ...(stored[k] || {}) };
  cache = { at: Date.now(), value: merged };
  return merged;
}
export function clearSettingsCache() { cache = { at: 0, value: null }; }
