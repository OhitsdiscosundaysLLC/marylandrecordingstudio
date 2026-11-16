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
const server = spawn('node', ['scripts/serve.mjs'], { cwd: root, env: { ...process.env, PORT: String(PORT), RESEND_API_KEY: '', CONTACT_TO_EMAIL: '', OPENAI_API_KEY: '', SUPABASE_URL: '', SUPABASE_ANON_KEY: '', DB_API_SECRET: '', ADMIN_PASSWORD: '', ADMIN_PATH: '', ADMIN_SESSION_SECRET: '' }, stdio: 'ignore' });
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
    for (const r of ['/', '/studio', '/services', '/book', '/gallery', '/radio', '/explore', '/about', '/contact', '/faq', '/members', '/submit-project', '/feedback']) assert.ok(seen.has(r), `missing ${r}`);
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
      assert.match(s.bookUrl, /^https:\/\/book\.squareup\.com\/appointments\/(rot9qejuixvuzc|fk5phm6o38fjpy)\/location\/LBRQ3J5MYKNYX\/services\/[A-Z0-9]{24}$/);
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

  const post = (u, body, headers = {}) => fetch(base + u, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  await t('AI chat reports missing OpenAI key honestly (503, no fake answer)', async () => {
    const r = await post('/api/ai/chat', { messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(r.status, 503); assert.match((await r.json()).error, /OPENAI_API_KEY/);
  });
  await t('AI voice session reports missing key honestly', async () => {
    const r = await post('/api/ai/realtime', {}); assert.equal(r.status, 503);
  });
  await t('GET /api/settings falls back to safe defaults', async () => {
    const d = await (await fetch(base + '/api/settings')).json();
    assert.equal(d.ai.enabled, false); assert.equal(typeof d.motion.magneticButtons, 'boolean');
  });
  await t('POST /api/track accepts events without a database', async () => {
    const r = await post('/api/track', { type: 'page_view', path: '/' }); assert.ok([200, 204].includes(r.status));
  });
  await t('Project upload reports not configured without storage', async () => {
    const r = await post('/api/projects?action=submit', { name: 'x' }); assert.equal(r.status, 503);
  });
  await t('Project upload rejects cross-site origins', async () => {
    const r = await post('/api/projects?action=submit', {}, { origin: 'https://evil.example' }); assert.equal(r.status, 403);
  });
  await t('WhatsApp webhook stays off until credentials exist', async () => {
    const r = await fetch(base + '/api/integrations/whatsapp'); assert.equal(r.status, 503);
    assert.ok((await r.json()).missing.includes('WHATSAPP_TOKEN'));
  });
  await t('Phone receptionist webhook stays off until connected', async () => {
    const r = await post('/api/integrations/phone', {}); assert.equal(r.status, 503);
  });
  await t('Dashboard is hidden when not configured', async () => {
    assert.equal((await fetch(base + '/api/admin?action=stats')).status, 404);
    assert.equal((await fetch(base + '/hq-123456')).status, 404);
  });
  await t('Dashboard is not linked or listed anywhere', async () => {
    for (const [p, html] of pages) assert.ok(!/hq-[a-z0-9]{6,}/.test(html), `dashboard path leaked on ${p}`);
    assert.ok(!(await (await fetch(base + '/sitemap.xml')).text()).includes('hq-'));
  });
  await t('Estimator uses real catalogue prices', async () => {
    const html = pages.find(([p]) => p === '/services')[1];
    const m = html.match(/data-prices='([^']+)'/); assert.ok(m, 'estimator missing');
    const P = JSON.parse(m[1]); assert.deepEqual([P.member, P.hour, P.mix, P.master], [200, 60, 75, 50]);
  });

  await t('Session finder always answers with real services (rule-based without AI)', async () => {
    const r = await post('/api/ai/plan', { goal: 'mix', freq: 'once', stage: 'recorded' });
    assert.equal(r.status, 200); const d = await r.json();
    assert.deepEqual(d.cards.map((c) => c.slug), ['mixing', 'mastering', 'submit-project']);
  });
  await t('Demo feedback reports missing key honestly', async () => {
    const r = await post('/api/ai/feedback', { audio: 'x' }); assert.equal(r.status, 503);
  });
  await t('Quiz lead capture requires consent', async () => {
    const r = await post('/api/ai/lead', { email: 'a@b.co', source: 'ai_quiz' }); assert.equal(r.status, 400);
  });
  await t('Serverless function count fits the Vercel Hobby limit (12)', async () => {
    const { readdirSync } = await import('node:fs');
    const n = readdirSync(path.join(root, 'api'), { recursive: true }).filter((f) => f.endsWith('.js') && !String(f).split(/[\\/]/).some((p) => p.startsWith('_'))).length;
    assert.ok(n <= 12, `${n} functions`);
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
