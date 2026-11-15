// Square Catalog helpers shared by the /api/services function and scripts/sync-square.mjs.
// Uses only the official Square REST API (no SDK) so the project has zero dependencies.
// Requires SQUARE_ACCESS_TOKEN (a production access token with ITEMS_READ permission).

const SQUARE_VERSION = '2025-10-16';

function apiBase() {
  return process.env.SQUARE_ENVIRONMENT === 'sandbox'
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com';
}

async function squareFetch(path, body) {
  const res = await fetch(apiBase() + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Square-Version': SQUARE_VERSION,
      Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Square API ${path} failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return res.json();
}

export function squareConfigured() {
  return Boolean(process.env.SQUARE_ACCESS_TOKEN);
}

function slugify(s) {
  return String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function formatMoney(m) {
  if (!m || typeof m.amount !== 'number') return null;
  if (m.amount === 0) return 'Free';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: m.currency || 'USD' }).format(m.amount / 100);
}

// Fetch every bookable appointment service for the location and normalise it
// into the same shape as data/services.json.
export async function fetchSquareCatalogue(locationId) {
  const items = [];
  let cursor;
  do {
    const page = await squareFetch('/v2/catalog/search-catalog-items', {
      product_types: ['APPOINTMENTS_SERVICE'],
      enabled_location_ids: locationId ? [locationId] : undefined,
      limit: 100,
      cursor,
    });
    items.push(...(page.items || []));
    cursor = page.cursor;
  } while (cursor);

  // Resolve category names.
  const catIds = [...new Set(items.flatMap((i) => [
    ...((i.item_data?.categories || []).map((c) => c.id)),
    i.item_data?.category_id,
  ]).filter(Boolean))];
  const catNames = {};
  if (catIds.length) {
    const r = await squareFetch('/v2/catalog/batch-retrieve', { object_ids: catIds });
    for (const o of r.objects || []) catNames[o.id] = o.category_data?.name || 'Other';
  }

  const categories = new Map();
  const services = [];
  for (const item of items) {
    const d = item.item_data || {};
    if (item.is_deleted || d.is_archived) continue;
    const vars = (d.variations || []).filter((v) => v.item_variation_data?.available_for_booking !== false);
    if (!vars.length) continue;
    const catId = (d.categories && d.categories[0]?.id) || d.category_id;
    const catName = catNames[catId] || 'Other';
    const catSlug = slugify(catName);
    categories.set(catSlug, { id: catSlug, name: catName });

    const prices = vars.map((v) => v.item_variation_data?.price_money).filter(Boolean);
    const variablePricing = vars.some((v) => v.item_variation_data?.pricing_type === 'VARIABLE_PRICING');
    let price;
    if (variablePricing || prices.length !== vars.length) {
      price = { amount: null, currency: 'USD', display: 'Price varies' };
    } else {
      const amounts = [...new Set(prices.map((p) => p.amount))];
      price = amounts.length === 1
        ? { amount: amounts[0], currency: prices[0].currency, display: formatMoney(prices[0]) }
        : { amount: Math.min(...amounts), currency: prices[0].currency, display: `From ${formatMoney({ amount: Math.min(...amounts), currency: prices[0].currency })}` };
    }
    const durationMs = vars[0].item_variation_data?.service_duration;
    services.push({
      id: item.id,
      name: d.name,
      category: catSlug,
      description: (d.description_plaintext || d.description || '').trim(),
      price,
      durationMinutes: durationMs ? Math.round(durationMs / 60000) : null,
      variations: vars.length > 1 ? vars.map((v) => ({ id: v.id, name: v.item_variation_data?.name })) : [],
    });
  }
  return {
    source: 'square-api',
    syncedAt: new Date().toISOString(),
    categories: [...categories.values()],
    services,
  };
}
