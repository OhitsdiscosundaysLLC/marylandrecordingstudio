// Deterministic release-timeline engine: works backwards from the release date.
// Durations are recommended planning windows (not guarantees) and scale with the number of songs.
const DAY = 86400000;
export const STAGES = ['writing', 'demo', 'recorded', 'produced', 'mixed', 'mastered'];
const ORDER = ['recording', 'production', 'mixing', 'mastering', 'artwork', 'distribution', 'marketing', 'release'];
const DONE_BY_STAGE = { writing: [], demo: [], recorded: ['recording'], produced: ['recording', 'production'], mixed: ['recording', 'production', 'mixing'], mastered: ['recording', 'production', 'mixing', 'mastering'] };

const iso = (t) => new Date(t).toISOString().slice(0, 10);
const parse = (s) => { const t = Date.parse(String(s) + 'T12:00:00Z'); return Number.isFinite(t) ? t : NaN; };
export function todayET() { return parse(new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })); }

export function buildTimeline({ releaseDate, songs = 1, stage = 'writing', goals = [], today = todayET() }) {
  const R = parse(releaseDate);
  if (!Number.isFinite(R)) throw new Error('bad_date');
  const n = Math.max(1, Math.min(30, Number(songs) || 1));
  const len = {
    recording: Math.min(60, 7 + 3 * (n - 1)),
    production: Math.min(30, 5 + 2 * (n - 1)),
    mixing: Math.min(30, 5 + 2 * (n - 1)),
    mastering: Math.min(10, 3 + Math.ceil((n - 1) / 2)),
    artwork: 10,
  };
  const done = new Set(DONE_BY_STAGE[stage] || []);
  const P = {};
  P.distribution = { start: R - 21 * DAY, end: R - 21 * DAY };
  P.mastering = { end: P.distribution.start - DAY }; P.mastering.start = P.mastering.end - (len.mastering - 1) * DAY;
  P.mixing = { end: P.mastering.start - DAY }; P.mixing.start = P.mixing.end - (len.mixing - 1) * DAY;
  P.production = { end: P.mixing.start - DAY }; P.production.start = P.production.end - (len.production - 1) * DAY;
  P.recording = { end: P.production.start - DAY }; P.recording.start = P.recording.end - (len.recording - 1) * DAY;
  P.artwork = { end: R - 28 * DAY }; P.artwork.start = P.artwork.end - (len.artwork - 1) * DAY;
  const wantsBigPush = goals.some((g) => ['press', 'radio', 'video', 'playlist'].includes(g));
  P.marketing = { start: R - (wantsBigPush ? 42 : 28) * DAY, end: R + 14 * DAY };
  P.release = { start: R, end: R };

  const phases = ORDER.map((key) => {
    const p = P[key];
    let status = 'upcoming';
    if (done.has(key)) status = 'done';
    else if (p.end < today) status = 'overdue';
    else if (p.start < today) status = 'at_risk';
    return { key, start: iso(p.start), end: iso(p.end), days: Math.round((p.end - p.start) / DAY) + 1, status };
  });
  // Can the remaining production work still fit before the distribution deadline?
  const remainingDays = ['recording', 'production', 'mixing', 'mastering'].filter((k) => !done.has(k)).reduce((s, k) => s + len[k], 0);
  const daysToDistribution = Math.round((P.distribution.start - today) / DAY);
  const daysToRelease = Math.round((R - today) / DAY);
  let suggestedDate = null;
  if (daysToRelease < 0) suggestedDate = iso(today + (remainingDays + 21 + 7) * DAY);
  else if (remainingDays > daysToDistribution) suggestedDate = iso(today + (remainingDays + 21) * DAY);
  return { releaseDate: iso(R), today: iso(today), songs: n, stage, phases, daysToRelease, remainingDays, tight: suggestedDate !== null, suggestedDate };
}

// Real studio services that help with each phase (slugs from the Square catalogue / site pages).
export const PHASE_SERVICES = {
  recording: (n) => (n >= 3 ? ['unlimited-membership', 'recording-session-2-hours'] : ['recording-session-2-hours', 'recording-session-1-hour']),
  production: () => ['artist-development', 'hook-starter'],
  mixing: () => ['mixing', 'submit-project'],
  mastering: () => ['mastering'],
  artwork: () => ['live-session-performances'],
  distribution: () => [],
  marketing: () => ['live-session-performances', 'video-podcasting'],
  release: () => [],
};
