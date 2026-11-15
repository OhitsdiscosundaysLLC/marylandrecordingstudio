// Smoke tests: builds the site, starts the preview server, then checks every internal link,
// SEO essentials on every page, booking deep links and the API contracts.
// Usage: npm test
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
execFileSync('node', ['scripts/build.mjs'], { cwd: root, stdio: 'inherit' });
const PORT = 3999;
const server = spawn('node', ['scripts/serve.mjs'], { cwd: root, env: { ...process.env, PORT: String(PORT), RESEND_API_KEY: '', CONTACT_TO_EMAIL: '' }, stdio: 'ignore' });
const base = `http://localhost:${PORT}`;
await new Promise((r) => setTimeout(r, 600));

let failures = 0;
const ok = (name) => console.log(`  ✓ ${name}`);
const fail = (name, e) => { failures++; console.log(`  ✗ ${name}\n    ${e.message}`); };
async function t(name, fn) { try { await fn(); ok(name); } catch (e) { fail(name, e); } }

try {
  // Crawl internal links from the home page.
  const seen = new Set(), queue = ['/'], pages = [];
  while (queue.length) {
    const p = queue.shift();
    if (seen.has(p)) continue;
    seen.add(p);
    const r = await fetch(base + p);
    if (r.status !== 200) { fail(`GET ${p}`, new Error(`status ${r.status}`)); continue; }
    if (!(r.headers.get('content-type') || '').includes('html')) continue;
    const html = await r.text();
    pages.push([p, html]);
    for (const [, href] of html.matchAll(/href="(\/[^"#]*)/g)) {
      const clean = href.split('?')[0];
      if (!seen.has(clean) && !clean.startsWith('/api/')) queue.push(clean);
    }
    for (const [, src] of html.matchAll(/src="(\/[^"]+)"/g)) {
      const a = await fetch(base + src.split('?')[0]);
      if (a.status !== 200) fail(`asset ${src} on ${p}`, new Error(`status ${a.status}`));
    }
  }
  console.log(`\nCrawled ${pages.length} pages`);

  await t('every page has one h1, title, description, canonical and OG tags', () => {
    const titles = new Set();
    for (const [p, html] of pages) {
      assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${p}: h1 count`);
      const title = html.match(/<title>([^<]+)/)?.[1];
      assert.ok(title, `${p}: title`);
      assert.ok(!titles.has(title), `${p}: duplicate title "${title}"`);
      titles.add(title);
      for (const re of [/name="description" content="[^"]{50,}/, /rel="canonical"/, /property="og:title"/, /property="og:image"/, /name="twitter:card"/, /application\/ld\+json/, /lang="en-US"/]) assert.match(html, re, `${p}: ${re}`);
      for (const [, img] of html.matchAll(/<img([^>]*)>/g)) assert.match(img, /alt="/, `${p}: img without alt`);
    }
  });

  await t('all main routes resolve', async () => {
    for (const r of ['/', '/studio', '/services', '/book', '/gallery', '/social', '/about', '/contact', '/faq']) assert.ok(seen.has(r), `missing ${r}`);
  });

  await t('unknown routes return the 404 page', async () => {
    const r = await fetch(base + '/no-such-page');
    assert.equal(r.status, 404);
    assert.match(await r.text(), /That track got cut/);
  });

  await t('every service has a page and a valid Square deep link', async () => {
    const cat = await (await fetch(base + '/data/services.json')).json();
    assert.ok(cat.services.length > 0);
    for (const s of cat.services) {
      assert.ok(seen.has(`/services/${s.slug}`), `no page for ${s.slug}`);
      assert.match(s.bookUrl, /^https:\/\/book\.squareup\.com\/appointments\/fk5phm6o38fjpy\/location\/LBRQ3J5MYKNYX\/services\/[A-Z0-9]{24}$/);
    }
  });

  await t('sitemap and robots', async () => {
    const sm = await (await fetch(base + '/sitemap.xml')).text();
    assert.match(sm, /<loc>[^<]+\/services\/visit-studio<\/loc>/);
    assert.ok(!sm.includes('/404'));
    assert.match(await (await fetch(base + '/robots.txt')).text(), /Sitemap:/);
  });

  await t('GET /api/services returns the catalogue', async () => {
    const r = await fetch(base + '/api/services');
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.ok(['snapshot', 'square-api'].includes(d.source));
    assert.ok(d.services.every((s) => s.id && s.name && 'priceLine' in s));
  });

  await t('POST /api/contact validates input', async () => {
    const r = await fetch(base + '/api/contact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'A', email: 'nope', message: 'hi' }) });
    assert.equal(r.status, 400);
    const d = await r.json();
    assert.deepEqual(Object.keys(d.fields).sort(), ['email', 'message', 'name']);
  });

  await t('POST /api/contact reports 503 (not a fake success) when email is not configured', async () => {
    const r = await fetch(base + '/api/contact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Test Person', email: 'test@example.com', message: 'Hello, testing the form.', startedAt: Date.now() - 10000 }) });
    assert.equal(r.status, 503);
    assert.equal((await r.json()).ok, false);
  });

  await t('POST /api/contact quietly drops honeypot spam', async () => {
    const r = await fetch(base + '/api/contact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Bot', email: 'b@b.co', message: 'spam spam spam', website: 'http://spam' }) });
    assert.equal(r.status, 200);
  });

  await t('POST /api/contact rejects cross-site origins', async () => {
    const r = await fetch(base + '/api/contact', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{}' });
    assert.equal(r.status, 403);
  });

  await t('GET /api/instagram reports configuration honestly', async () => {
    const d = await (await fetch(base + '/api/instagram')).json();
    assert.ok(Array.isArray(d.posts));
  });
} finally {
  server.kill();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
