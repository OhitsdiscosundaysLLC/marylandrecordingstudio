// Real-time availability from Square Bookings (SearchAvailability). Server-side only.
// Needs SQUARE_ACCESS_TOKEN with APPOINTMENTS_READ and ITEMS_READ. Never invents slots.
import { squareFetch, squareConfigured } from './square.js';
import { catalogue } from './knowledge.js';

const LOCATION = () => process.env.SQUARE_LOCATION_ID || 'LBRQ3J5MYKNYX';
const cache = new Map(); // key -> {at, value}
const variationCache = new Map();

async function variationFor(itemId) {
  if (variationCache.has(itemId)) return variationCache.get(itemId);
  const r = await squareFetch(`/v2/catalog/object/${encodeURIComponent(itemId)}`);
  const v = (r.object?.item_data?.variations || []).find((x) => x.item_variation_data?.available_for_booking !== false) || r.object?.item_data?.variations?.[0];
  if (!v) throw new Error('no_variation');
  const out = { id: v.id, version: v.version, durationMinutes: Math.round((v.item_variation_data?.service_duration || 0) / 60000) || null, teamMembers: v.item_variation_data?.team_member_ids || [] };
  variationCache.set(itemId, out);
  return out;
}

export async function availability(slug, { from, days = 14 } = {}) {
  if (!squareConfigured()) return { configured: false, slots: [] };
  const svc = catalogue().services.find((s) => s.slug === slug);
  if (!svc || svc.action.type !== 'book') return { configured: true, error: 'not_bookable', slots: [] };
  const start = Math.max(Date.now() + 15 * 60_000, from ? Date.parse(from + 'T00:00:00-05:00') || 0 : 0);
  const key = `${slug}|${new Date(start).toISOString().slice(0, 13)}|${days}`;
  const c = cache.get(key); if (c && Date.now() - c.at < 120_000) return c.value;
  const v = await variationFor(svc.id);
  const end = start + Math.min(31, days) * 86400_000;
  const body = { query: { filter: { start_at_range: { start_at: new Date(start).toISOString(), end_at: new Date(end).toISOString() }, location_id: LOCATION(), segment_filters: [{ service_variation_id: v.id }] } } };
  const r = await squareFetch('/v2/bookings/availability/search', body);
  const slots = (r.availabilities || []).map((a) => ({ startAt: a.start_at, durationMinutes: a.appointment_segments?.[0]?.duration_minutes || v.durationMinutes })).sort((x, y) => Date.parse(x.startAt) - Date.parse(y.startAt));
  const value = { configured: true, slug, name: svc.name, timezone: 'America/New_York', bookUrl: svc.action.squareUrl, slots: slots.slice(0, 120), checkedAt: new Date().toISOString() };
  cache.set(key, { at: Date.now(), value });
  return value;
}

export async function squareHealth() {
  if (!squareConfigured()) return { ok: false, reason: 'SQUARE_ACCESS_TOKEN not set' };
  try { await squareFetch(`/v2/locations/${LOCATION()}`); return { ok: true }; } catch (e) { return { ok: false, reason: e.message.slice(0, 200) }; }
}

// Bookings that ended in a window (for review invitations). Requires APPOINTMENTS_READ + CUSTOMERS_READ.
export async function endedBookings(sinceMs, untilMs) {
  const out = []; let cursor;
  do {
    const q = new URLSearchParams({ location_id: LOCATION(), start_at_min: new Date(sinceMs - 6 * 3600_000).toISOString(), start_at_max: new Date(untilMs).toISOString(), limit: '100' });
    if (cursor) q.set('cursor', cursor);
    const r = await squareFetch(`/v2/bookings?${q}`);
    out.push(...(r.bookings || [])); cursor = r.cursor;
  } while (cursor && out.length < 500);
  return out.filter((b) => b.status === 'ACCEPTED' && b.customer_id).filter((b) => {
    const endAt = Date.parse(b.start_at) + (b.appointment_segments || []).reduce((s, x) => s + (x.duration_minutes || 0), 0) * 60_000;
    return endAt >= sinceMs && endAt <= untilMs;
  });
}
export async function customer(id) { const r = await squareFetch(`/v2/customers/${encodeURIComponent(id)}`); return r.customer || null; }
// Number of upcoming (accepted or pending) bookings for a customer, so reminders never go to someone already booked.
export async function upcomingFor(customerId) {
  const q = new URLSearchParams({ customer_id: customerId, location_id: LOCATION(), start_at_min: new Date().toISOString(), limit: '20' });
  const r = await squareFetch(`/v2/bookings?${q}`);
  return (r.bookings || []).filter((b) => ['ACCEPTED', 'PENDING'].includes(b.status)).length;
}
