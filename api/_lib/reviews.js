// Genuine Google reviews through the official Places API (New). Needs GOOGLE_PLACES_API_KEY.
// Results are cached (12 h) so usage stays small. Nothing is shown when the key is missing.
import { rpc, dbConfigured } from './db.js';

const PLACE_ID = () => process.env.GOOGLE_PLACE_ID || 'ChIJwyX8yQfht4kRJ1wLAMJ64vI';
let mem = null;
export const reviewsConfigured = () => Boolean(process.env.GOOGLE_PLACES_API_KEY);

async function fetchPlace() {
  const r = await fetch(`https://places.googleapis.com/v1/places/${PLACE_ID()}?languageCode=en`, {
    headers: { 'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY, 'X-Goog-FieldMask': 'displayName,rating,userRatingCount,reviews,googleMapsUri,googleMapsLinks' },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Places ${r.status}: ${j.error?.message || ''}`.slice(0, 200));
  return {
    name: j.displayName?.text, rating: j.rating ?? null, count: j.userRatingCount ?? null,
    mapsUrl: j.googleMapsUri, reviewsUrl: j.googleMapsLinks?.reviewsUri || j.googleMapsUri, writeUrl: j.googleMapsLinks?.writeAReviewUri || `https://search.google.com/local/writereview?placeid=${PLACE_ID()}`,
    reviews: (j.reviews || []).map((x) => ({ author: x.authorAttribution?.displayName, authorUrl: x.authorAttribution?.uri, photo: x.authorAttribution?.photoUri, rating: x.rating, text: x.text?.text || x.originalText?.text || '', when: x.relativePublishTimeDescription, publishTime: x.publishTime, googleUrl: x.googleMapsUri })),
    fetchedAt: new Date().toISOString(),
  };
}

export async function getReviews({ refresh = false } = {}) {
  if (!reviewsConfigured()) return { configured: false };
  if (!refresh && mem && Date.now() - Date.parse(mem.fetchedAt) < 12 * 3600_000) return { configured: true, ...mem };
  if (!refresh && dbConfigured()) {
    try { const last = (await rpc('mrs_record_list', { p_kind: 'google_reviews', p_limit: 1, p_days: 2 }))?.[0]; if (last && Date.now() - Date.parse(last.data.fetchedAt) < 12 * 3600_000) { mem = last.data; return { configured: true, ...mem }; } } catch {}
  }
  mem = await fetchPlace();
  if (dbConfigured()) rpc('mrs_record_create', { p_kind: 'google_reviews', p_token_hash: null, p_visitor: null, p: mem }).catch(() => {});
  return { configured: true, ...mem };
}
