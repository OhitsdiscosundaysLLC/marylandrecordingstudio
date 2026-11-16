// Pulls the live service catalogue from Square into data/services.json before each build.
// Without SQUARE_ACCESS_TOKEN it leaves the committed snapshot untouched, so builds never fail.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fetchSquareCatalogue, squareConfigured } from '../api/_lib/square.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'data/services.json');
const config = JSON.parse(await readFile(path.join(root, 'site.config.json'), 'utf8'));

if (!squareConfigured()) {
  console.log('[sync-square] SQUARE_ACCESS_TOKEN not set: using committed data/services.json snapshot.');
  process.exit(0);
}

try {
  const previous = JSON.parse(await readFile(file, 'utf8'));
  const prevById = Object.fromEntries(previous.services.map((s) => [s.id, s]));
  const live = await fetchSquareCatalogue(config.square.locationId);
  // Keep long-form copy that was split out of the Square description for nicer layout.
  for (const s of live.services) {
    const p = prevById[s.id];
    if (!p) continue;
    for (const k of ['longDescription', 'includes', 'outcome', 'membershipTerms']) if (p[k] && !s[k]) s[k] = p[k];
  }
  live._comment = previous._comment;
  await writeFile(file, JSON.stringify(live, null, 2) + '\n');
  console.log(`[sync-square] Synced ${live.services.length} services from Square.`);
} catch (err) {
  console.error('[sync-square] Square sync failed, keeping the existing snapshot:', err.message);
}
