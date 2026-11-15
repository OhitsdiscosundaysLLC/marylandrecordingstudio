// Captures real screenshots of the Disco Sundays App, Rewards programme and RAP Program
// with Playwright, and writes optimised images for the website.
// Runs in GitHub Actions (.github/workflows/capture-ecosystem.yml) or locally:
//   npm i --no-save playwright sharp && npx playwright install chromium && node scripts/capture-ecosystem.mjs
//
// Output:
//   assets/ecosystem/<product>/<name>.webp   (+ .avif)   used by the site
//   media-originals/ecosystem/<product>/<name>.png       full-resolution originals (not deployed)
//   content/ecosystem-shots.json                         manifest the build reads
import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const APPS = {
  app: 'https://disco-sundays-app.base44.app/',
  rewards: 'https://disco-sundaysllc-club.base44.app/',
  'rap-program': 'https://disco-rap-flow.base44.app/',
};

// Each shot: real page, real state. `inner` scrolls an inner scroll container (the app's <main>).
const SHOTS = [
  { product: 'app', name: 'app-home', url: APPS.app, device: 'phone', alt: 'Disco Sundays app home screen: choose recording, mixing, mastering or membership' },
  { product: 'app', name: 'app-rap-and-radio', url: APPS.app, device: 'phone', scrollTo: 690, inner: 'main', alt: 'Disco Sundays app showing the RAP Program and Disco Sundays Radio' },
  { product: 'app', name: 'app-rewards-tab', url: APPS.app, device: 'phone', click: 'Rewards', alt: 'Rewards tab in the Disco Sundays app' },
  { product: 'rewards', name: 'rewards-home', url: APPS.rewards, device: 'phone', alt: 'Disco Rewards: where studio time pays you back' },
  { product: 'rewards', name: 'rewards-levels', url: APPS.rewards, device: 'phone', scrollTo: 1680, alt: 'Disco Rewards levels, from Newcomer to Disco Legend' },
  { product: 'rewards', name: 'rewards-desktop', url: APPS.rewards, device: 'desktop', alt: 'Disco Rewards website on desktop' },
  { product: 'rap-program', name: 'rap-home', url: APPS['rap-program'], device: 'phone', alt: 'RAP Program home: Create. Record. Perform. Grow.' },
  { product: 'rap-program', name: 'rap-packages', url: APPS['rap-program'], device: 'phone', scrollTo: 1880, alt: 'RAP Program packages: Single, EP, LP, Star Pack' },
  { product: 'rap-program', name: 'rap-desktop', url: APPS['rap-program'], device: 'desktop', alt: 'RAP Program website on desktop' },
];

const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, out: 780 },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, out: 1600 },
};

// Hide the hosting platform's floating edit badge and transient promo toasts so the
// screenshot shows the app itself. Nothing in the app's own interface is altered.
const CLEAN = () => {
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if ((cs.position === 'fixed' || cs.position === 'sticky') && /Edit with|Points earned|pays for itself|Membership pays|first access|Professional equipment|cookie/i.test(el.innerText || '') && !/Home\s*Book\s*Rewards/.test(el.innerText || '')) el.style.setProperty('display', 'none', 'important');
  }
  // Rotating promo toasts: small fixed cards with a close button, never the bottom navigation.
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    const t = (el.innerText || '').trim();
    if (cs.position === 'fixed' && el.querySelector('button') && t.length > 0 && t.length < 100 && !/Home|Book|Rewards|More/.test(t)) el.style.setProperty('display', 'none', 'important');
  }
  document.querySelectorAll('[data-sonner-toaster],[role=status],[role=alert]').forEach((e) => e.style.setProperty('display', 'none', 'important'));
};

const root = process.cwd();
const manifest = { capturedAt: new Date().toISOString(), sources: APPS, shots: [] };
const browser = await chromium.launch();
for (const s of SHOTS) {
  const d = DEVICES[s.device];
  const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.deviceScaleFactor, isMobile: d.isMobile, hasTouch: d.hasTouch, colorScheme: 'light' });
  const page = await ctx.newPage();
  try {
    await page.goto(s.url, { waitUntil: 'networkidle', timeout: 60000 });
  } catch { /* SPA may keep connections open; continue after the wait below */ }
  await page.waitForTimeout(3000);
  // Dismiss first-visit onboarding and promo banners the way a visitor would.
  await page.getByText('Skip', { exact: true }).first().click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    document.querySelectorAll('button').forEach((b) => {
      const label = (b.getAttribute('aria-label') || b.textContent || '').trim();
      const box = b.closest('[class*="fixed"],[class*="toast"],[class*="banner"]') || b.parentElement;
      if (/^(×|✕|x)$/i.test(label) || /close|dismiss/i.test(label)) {
        if (box && /first access|equipment|pays for itself|points earned|Get the App/i.test(box.innerText || '')) b.click();
      }
    });
  });
  await page.waitForTimeout(700);
  if (s.click) { await page.getByText(s.click, { exact: true }).last().click(); await page.waitForTimeout(4500); }
  if (s.scrollTo) {
    await page.evaluate(([y, inner]) => (inner ? document.querySelector(inner) : document.scrollingElement).scrollTo(0, y), [s.scrollTo, s.inner || null]);
    await page.waitForTimeout(1500);
  }
  await page.evaluate(CLEAN);
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(800);
  const png = await page.screenshot({ type: 'png' });
  await ctx.close();

  const origDir = path.join(root, 'media-originals/ecosystem', s.product);
  const outDir = path.join(root, 'assets/ecosystem', s.product);
  await mkdir(origDir, { recursive: true });
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(origDir, `${s.name}.png`), png);
  const img = sharp(png).resize({ width: d.out, withoutEnlargement: true });
  const webp = await img.clone().webp({ quality: 82, effort: 6 }).toBuffer();
  const avif = await img.clone().avif({ quality: 58, effort: 6 }).toBuffer();
  await writeFile(path.join(outDir, `${s.name}.webp`), webp);
  await writeFile(path.join(outDir, `${s.name}.avif`), avif);
  const small = d.out === 780 ? 390 : 800;
  const sm = sharp(png).resize({ width: small });
  await writeFile(path.join(outDir, `${s.name}-${small}.webp`), await sm.clone().webp({ quality: 80, effort: 6 }).toBuffer());
  await writeFile(path.join(outDir, `${s.name}-${small}.avif`), await sm.clone().avif({ quality: 60, effort: 6 }).toBuffer());
  const meta = await sharp(webp).metadata();
  manifest.shots.push({ product: s.product, name: s.name, device: s.device, alt: s.alt, source: s.url, width: meta.width, height: meta.height, webp: `/assets/ecosystem/${s.product}/${s.name}.webp`, avif: `/assets/ecosystem/${s.product}/${s.name}.avif` });
  console.log(`captured ${s.product}/${s.name} ${meta.width}x${meta.height} webp ${webp.length} avif ${avif.length}`);
}
await browser.close();
await writeFile(path.join(root, 'content/ecosystem-shots.json'), JSON.stringify(manifest, null, 2) + '\n');
