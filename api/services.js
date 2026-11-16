// GET /api/services: the bookable service catalogue.
// With SQUARE_ACCESS_TOKEN set, it reads Square live (cached at the edge for 5 minutes),
// so price changes, new services and removals show up without a redeploy.
// Without it, it serves the committed snapshot and says so (source: "snapshot").
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { send, CACHE } from './_lib/http.js';
import { fetchSquareCatalogue, squareConfigured } from './_lib/square.js';

const LOCATION_ID = 'LBRQ3J5MYKNYX';

function fmtDuration(m) {
  if (!m) return '';
  const h = Math.floor(m / 60), r = m % 60;
  return [h ? `${h} hr` : '', r ? `${r} min` : ''].filter(Boolean).join(' ');
}

function decorate(data, source) {
  return {
    source,
    syncedAt: data.syncedAt,
    categories: data.categories,
    services: data.services.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      description: s.description,
      price: s.price,
      durationMinutes: s.durationMinutes,
      durationLabel: fmtDuration(s.durationMinutes),
      priceLine: [s.price?.display, fmtDuration(s.durationMinutes)].filter(Boolean).join(' · '),
      variations: s.variations || [],
    })),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });
  if (squareConfigured()) {
    try {
      const live = await fetchSquareCatalogue(process.env.SQUARE_LOCATION_ID || LOCATION_ID);
      return send(res, 200, decorate(live, 'square-api'), CACHE(300));
    } catch (err) {
      console.error('[api/services] Square request failed:', err.message);
      // fall through to the snapshot so the site keeps working
    }
  }
  try {
    const snap = JSON.parse(await readFile(path.join(process.cwd(), 'data/services.json'), 'utf8'));
    return send(res, 200, decorate(snap, 'snapshot'), CACHE(300));
  } catch (err) {
    return send(res, 500, { error: 'catalogue_unavailable' });
  }
}
