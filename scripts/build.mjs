// Zero-dependency static site builder for Maryland Recording Studio.
// Assembles src/pages/*.html into dist/, generates a page per Square service,
// and writes sitemap.xml / robots.txt. Run: node scripts/build.mjs
import { readFile, writeFile, mkdir, readdir, rm, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const readJSON = async (p) => JSON.parse(await readFile(path.join(root, p), 'utf8'));

const config = await readJSON('site.config.json');
const catalogue = await readJSON('data/services.json');
const editorial = await readJSON('content/services-editorial.json');
const media = await readJSON('content/media.json');
const faqs = await readJSON('content/faq.json');
const social = await readJSON('content/social.json');

const SITE_URL = (process.env.SITE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
  || config.siteUrl).replace(/\/$/, '');
const BUILD_ID = Date.now().toString(36);

// Fonts: self-host at build time (Vercel builds have network access) so pages make no
// third-party font requests. Falls back to Google Fonts if the download fails.
const FONT_CSS_URL = 'https://fonts.googleapis.com/css2?family=Unbounded:wght@700&family=Inter:wght@400;600&display=swap';
let FONT_HEAD = `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${FONT_CSS_URL}">`;
async function selfHostFonts() {
  try {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
    const css = await (await fetch(FONT_CSS_URL, { headers: { 'User-Agent': ua }, signal: AbortSignal.timeout(8000) })).text();
    // Keep only the latin subsets.
    const blocks = css.split('/* ').filter((b) => b.startsWith('latin */'));
    if (!blocks.length) throw new Error('no latin font faces');
    await mkdir(path.join(dist, 'assets/fonts'), { recursive: true });
    let out = '';
    const preload = [];
    for (const b of blocks) {
      const url = b.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
      const fam = b.match(/font-family: '([^']+)'/)?.[1];
      const wt = b.match(/font-weight: (\d+)/)?.[1];
      if (!url) continue;
      const name = `${fam.toLowerCase()}-${wt}.woff2`;
      const buf = Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(8000) })).arrayBuffer());
      await writeFile(path.join(dist, 'assets/fonts', name), buf);
      out += '/* ' + b.replace(url, `/assets/fonts/${name}`).replace('font-display: swap', fam === 'Inter' ? 'font-display: optional' : 'font-display: swap');
      if ((fam === 'Unbounded' && wt === '700') || (fam === 'Inter' && wt === '400')) preload.push(name);
    }
    await writeFile(path.join(dist, 'assets/fonts/fonts.css'), out);
    FONT_HEAD = preload.map((n) => `<link rel="preload" href="/assets/fonts/${n}" as="font" type="font/woff2" crossorigin>`).join('') + `<style>${out.replace(/\s+/g, ' ')}</style>`;
    console.log(`[build] self-hosted ${blocks.length} font files`);
  } catch (err) {
    console.log('[build] font self-hosting skipped (using Google Fonts):', err.message);
  }
}

// ---------- helpers ----------
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = (s) => String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const fmtDuration = (m) => {
  if (!m) return '';
  const h = Math.floor(m / 60), r = m % 60;
  return [h ? `${h} hr` : '', r ? `${r} min` : ''].filter(Boolean).join(' ');
};
const RAINBOW = ['#ff5b2e', '#ff9f1c', '#ffd23f', '#3ddc84', '#22b8ff', '#7c5cff', '#ff4fa3'];

// ---------- services ----------
const usedSlugs = new Set();
const services = catalogue.services.map((s, i) => {
  const ed = editorial.services[s.id] || {};
  let slug = ed.slug || slugify(s.name);
  while (usedSlugs.has(slug)) slug += '-' + s.id.slice(0, 4).toLowerCase();
  usedSlugs.add(slug);
  const cat = catalogue.categories.find((c) => c.id === s.category) || { id: s.category, name: s.category };
  const catLabel = editorial.categoryLabels?.[cat.id]?.label || cat.name;
  return {
    ...s,
    slug,
    featured: !!ed.featured,
    order: ed.order ?? 100 + i,
    tagline: ed.tagline || '',
    seoDescription: ed.seoDescription || s.description,
    image: ed.image || null,
    categoryName: cat.name,
    categoryLabel: catLabel,
    bookUrl: `${config.square.bookingBase}/${s.id}`,
    seed: i,
  };
}).sort((a, b) => a.order - b.order);
// Square can list two services with the same name (e.g. different prices); add the price so each is distinct.
const nameCount = services.reduce((m, s) => m.set(s.name, (m.get(s.name) || 0) + 1), new Map());
for (const s of services) if (nameCount.get(s.name) > 1 && s.price?.display) s.name = `${s.name} (${s.price.display})`;

const categories = catalogue.categories
  .filter((c) => services.some((s) => s.category === c.id))
  .map((c) => ({ ...c, label: editorial.categoryLabels?.[c.id]?.label || c.name, blurb: editorial.categoryLabels?.[c.id]?.blurb || '' }));

// Generative brand artwork (used until real photography is supplied in content/media.json).
function art(seed = 0, { bars = 42, className = 'art' } = {}) {
  const w = 420, h = 260;
  let rects = '';
  for (let i = 0; i < bars; i++) {
    const t = i / bars;
    const v = Math.abs(Math.sin(i * 0.55 + seed * 1.7) * 0.55 + Math.sin(i * 0.21 + seed) * 0.35) + 0.08;
    const bh = Math.min(h * 0.86, v * h * 0.9);
    const x = 14 + t * (w - 28);
    rects += `<rect x="${x.toFixed(1)}" y="${((h - bh) / 2).toFixed(1)}" width="${((w - 28) / bars * 0.56).toFixed(1)}" height="${bh.toFixed(1)}" rx="2"/>`;
  }
  const id = `g${seed}${bars}`;
  const rot = (seed * 37) % 360;
  return `<svg class="${className}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${RAINBOW.map((c, i) => `<stop offset="${(i / (RAINBOW.length - 1)).toFixed(2)}" stop-color="${c}"/>`).join('')}</linearGradient>
<radialGradient id="${id}r" cx="${30 + (seed * 13) % 40}%" cy="40%" r="75%"><stop offset="0" stop-color="hsl(${rot} 60% 18%)"/><stop offset="1" stop-color="#0b0b0c"/></radialGradient></defs>
<rect width="${w}" height="${h}" fill="url(#${id}r)"/><g fill="url(#${id})" opacity=".9">${rects}</g></svg>`;
}

function picture(img, { sizes = '100vw', className = '', eager = false } = {}) {
  if (!img) return '';
  const src = typeof img === 'string' ? img : img.src;
  const alt = typeof img === 'string' ? '' : (img.alt || '');
  return `<img class="${className}" src="${esc(src)}" alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" sizes="${sizes}"${img.width ? ` width="${img.width}" height="${img.height}"` : ''}>`;
}

const priceLine = (s) => [s.price?.display, fmtDuration(s.durationMinutes)].filter(Boolean).join(' · ');

function serviceCard(s, { headingLevel = 3 } = {}) {
  const H = `h${headingLevel}`;
  const visual = s.image ? picture(s.image, { sizes: '(min-width: 900px) 33vw, 100vw' }) : art(s.seed);
  const search = [s.name, s.description, s.categoryLabel, s.tagline].join(' ').toLowerCase();
  return `<article class="svc-card reveal" data-category="${esc(s.category)}" data-search="${esc(search)}" data-id="${s.id}">
  <a class="svc-card__media" href="/services/${s.slug}" tabindex="-1" aria-hidden="true">${visual}<span class="svc-card__cat">${esc(s.categoryLabel)}</span></a>
  <div class="svc-card__body">
    <${H} class="svc-card__title"><a href="/services/${s.slug}" data-track="service_card_click" data-label="${esc(s.name)}">${esc(s.name)}</a></${H}>
    <p class="svc-card__meta">${esc(priceLine(s))}</p>
    <p class="svc-card__desc">${esc(s.tagline || s.description)}</p>
    <div class="svc-card__actions">
      <a class="btn btn--primary btn--sm" href="/book?service=${s.slug}" data-track="book_cta_click" data-label="${esc(s.name)}">Book this service</a>
      <a class="btn btn--ghost btn--sm" href="/services/${s.slug}">Details<span class="sr-only"> about ${esc(s.name)}</span></a>
    </div>
  </div>
</article>`;
}

function catalogueUI() {
  return `<div class="catalogue" data-catalogue>
  <div class="catalogue__bar">
    <div class="chips" role="group" aria-label="Filter services by category">
      <button type="button" class="chip is-active" data-filter="all" aria-pressed="true">All <span class="chip__count">${services.length}</span></button>
      ${categories.map((c) => `<button type="button" class="chip" data-filter="${esc(c.id)}" aria-pressed="false">${esc(c.label)} <span class="chip__count">${services.filter((s) => s.category === c.id).length}</span></button>`).join('')}
    </div>
    <label class="search"><span class="sr-only">Search services</span>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <input type="search" placeholder="Search services" data-search-input autocomplete="off">
    </label>
  </div>
  <p class="catalogue__status" role="status" aria-live="polite" data-status>${services.length} services</p>
  <div class="svc-grid" data-grid>${services.map((s) => serviceCard(s)).join('\n')}</div>
  <div class="empty" data-empty hidden><p>No services match that search.</p><button type="button" class="btn btn--ghost btn--sm" data-reset>Clear filters</button></div>
</div>`;
}

const featured = services.filter((s) => s.featured).slice(0, 4);

function ctaBand(title = 'Your next session starts here.', copy = 'Pick a service, choose a time and get your confirmation from Square in minutes.') {
  return `<section class="cta-band reveal" aria-labelledby="cta-${slugify(title)}">
  <div class="cta-band__glow" aria-hidden="true"></div>
  <div class="container cta-band__inner">
    <h2 id="cta-${slugify(title)}" class="display-2">${esc(title)}</h2>
    <p class="lead">${esc(copy)}</p>
    <div class="btn-row">
      <a class="btn btn--primary btn--lg" href="/book" data-track="book_cta_click" data-label="cta_band">Book your session</a>
      <a class="btn btn--ghost btn--lg" href="/services">Explore available services</a>
    </div>
  </div>
</section>`;
}

function faqList(items) {
  return `<div class="faq">${items.map((f, i) => `<details class="faq__item reveal"${i === 0 ? ' open' : ''}><summary><span>${esc(f.q)}</span><span class="faq__icon" aria-hidden="true"></span></summary><div class="faq__a">${f.a.map((p) => `<p>${p}</p>`).join('')}</div></details>`).join('')}</div>`;
}

function studioPanels() {
  if (media.studio?.length) {
    return `<div class="bento">${media.studio.map((m, i) => `<figure class="bento__item bento__item--${(i % 5) + 1} reveal">${picture(m, { sizes: '(min-width: 900px) 50vw, 100vw' })}${m.caption ? `<figcaption>${esc(m.caption)}</figcaption>` : ''}</figure>`).join('')}</div>`;
  }
  const panels = [
    ['Record', 'Book studio time by the hour, from one to four hours, with up to four hours a day on the Unlimited membership.'],
    ['Engineer', 'Creator members get a personal audio engineer who handles all of their audio needs.'],
    ['Mix', 'Creator Membership sessions include mixing.'],
    ['Perform', 'Creator Membership sessions include live video performance.'],
    ['Develop', 'Artist development sessions, course training and the Crash Test evaluation map out your next move.'],
  ];
  return `<div class="bento">${panels.map(([t, d], i) => `<figure class="bento__item bento__item--${i + 1} reveal">${art(i + 20, { bars: 30 + i * 6 })}<figcaption><strong>${t}</strong><span>${d}</span></figcaption></figure>`).join('')}</div>`;
}

function galleryGrid() {
  if (!media.gallery?.length) {
    return `<div class="notice-card reveal">
  <div><h3>Studio photos live on Instagram</h3><p>Our latest sessions, artists and behind-the-scenes moments are posted to <a href="${config.social.instagram.url}" target="_blank" rel="noopener" data-track="social_profile_click" data-label="instagram">${config.social.instagram.handle}</a>. Book a free studio visit to see the room in person.</p></div>
  <div class="btn-row"><a class="btn btn--ghost" href="${config.social.instagram.url}" target="_blank" rel="noopener" data-track="social_profile_click" data-label="instagram">Open Instagram</a><a class="btn btn--primary" href="/book?service=visit-studio" data-track="book_cta_click" data-label="gallery_visit">Book a free visit</a></div>
</div>`;
  }
  return `<div class="masonry">${media.gallery.map((m) => `<figure class="masonry__item reveal">${picture(m, { sizes: '(min-width: 900px) 33vw, 50vw' })}${m.caption ? `<figcaption>${esc(m.caption)}</figcaption>` : ''}</figure>`).join('')}</div>`;
}

function heroMedia() {
  const h = media.hero || {};
  if (h.video) {
    return `<video class="hero__video" autoplay muted loop playsinline preload="none" ${h.image ? `poster="${esc(h.image)}"` : ''} data-hero-video aria-hidden="true"><source src="${esc(h.video)}" type="video/mp4"></video>`;
  }
  if (h.image) return picture({ src: h.image, alt: h.alt }, { className: 'hero__img', eager: true });
  return '';
}

function socialLinks(className = 'social-links') {
  const s = config.social;
  const icon = {
    instagram: '<path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4ZM17.3 5.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z"/><rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    facebook: '<path d="M14 8.5V6.8c0-.8.5-1 .9-1h2.3V2.1L14 2c-3.5 0-4.3 2.6-4.3 4.3v2.2H7.5v3.8h2.2V22H14v-9.7h3l.4-3.8H14Z"/>',
    youtube: '<path d="M21.6 7.2a2.6 2.6 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.6 2.6 0 0 0 2.4 7.2 27 27 0 0 0 2 12a27 27 0 0 0 .4 4.8 2.6 2.6 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.8A27 27 0 0 0 22 12a27 27 0 0 0-.4-4.8ZM10 15.1V8.9l5.2 3.1L10 15.1Z"/>',
  };
  return `<ul class="${className}">${['instagram', 'facebook', 'youtube'].map((k) => `<li><a href="${s[k].url}" target="_blank" rel="noopener" aria-label="Disco Sundays on ${k[0].toUpperCase() + k.slice(1)} (opens in a new tab)" data-track="social_profile_click" data-label="${k}"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">${icon[k]}</svg></a></li>`).join('')}</ul>`;
}

// ---------- layout ----------
const NAV = [
  ['/studio', 'The Studio'], ['/services', 'Services'], ['/gallery', 'Gallery'],
  ['/radio', 'Radio'], ['/about', 'About'], ['/contact', 'Contact'],
];
const ECO = config.ecosystem;
const extIcon = '<svg class="ext" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ecoIcon = {
  app: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 18.5h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  rewards: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16v10H4zM2.5 6.5h19V10h-19zM12 6.5V20M12 6.5C10 3 6.5 3.5 7 5.5c.4 1.4 5 1 5 1Zm0 0c2-3.5 5.5-3 5-1-.4 1.4-5 1-5 1Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  radio: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M8 8a5.6 5.6 0 0 0 0 8m8-8a5.6 5.6 0 0 1 0 8M5 5a9.9 9.9 0 0 0 0 14M19 5a9.9 9.9 0 0 1 0 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  rap: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2.5" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21m-3.5 0h7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  studio: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V9.5L12 4l8 5.5V20M9 20v-5.5h6V20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
};
const ecoHref = (e) => e.internal || e.url;
const ecoExternal = (e) => !e.internal && /^https?:/.test(e.url);

function logo({ size = 'md', eager = false } = {}) {
  const w = { sm: 160, md: 160, lg: 320 }[size];
  return `<span class="logo-plate logo-plate--${size}"><img src="/assets/brand/logo-${w}.webp" srcset="/assets/brand/logo-96.webp 96w, /assets/brand/logo-160.webp 160w, /assets/brand/logo-320.webp 320w, /assets/brand/logo.png 382w" sizes="${size === 'lg' ? '(min-width: 700px) 240px, 180px' : '72px'}" alt="Disco Sundays" width="382" height="231"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async"></span>`;
}

function ecosystemGrid({ heading = true } = {}) {
  return `<div class="eco-grid">${ECO.map((e) => `<a class="eco-card eco-card--${e.id} reveal" href="${ecoHref(e)}"${ecoExternal(e) ? ' target="_blank" rel="noopener"' : ''} data-track="ecosystem_click" data-label="${e.id}">
    <span class="eco-card__icon">${ecoIcon[e.id] || ''}</span>
    <span class="eco-card__kicker">${esc(e.kicker)}</span>
    <${heading ? 'h3' : 'span'} class="eco-card__name">${esc(e.name)}</${heading ? 'h3' : 'span'}>
    <span class="eco-card__desc">${esc(e.description)}</span>
    <span class="eco-card__cta">${esc(e.cta)}${ecoExternal(e) ? extIcon + '<span class="sr-only"> (opens in a new tab)</span>' : ' <span aria-hidden="true">→</span>'}</span>
  </a>`).join('')}</div>`;
}

function radioPlayer({ compact = false } = {}) {
  return `<div data-anim class="radio-player${compact ? ' radio-player--compact' : ''}" data-radio-player>
  <div class="radio-player__art" aria-hidden="true"><span class="radio-player__ring"></span>${logo({ size: 'sm' })}</div>
  <div class="radio-player__main">
    <p class="radio-player__station"><span class="live-dot" aria-hidden="true"></span>${esc(config.radio.name)} <span class="radio-player__badge">Live 24/7</span></p>
    <p class="radio-player__now" data-radio-now aria-live="polite">${esc(config.radio.tagline)}</p>
    <p class="radio-player__status" data-radio-status role="status">Press play to listen</p>
    <div class="radio-player__controls">
      <button type="button" class="play-btn" data-radio-toggle aria-label="Play ${esc(config.radio.name)}"><span class="play-btn__icon" aria-hidden="true"></span></button>
      <label class="vol"><span class="sr-only">Volume</span><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><input type="range" min="0" max="1" step="0.05" value="0.8" data-radio-volume></label>
      <a class="radio-player__ext" href="${config.radio.appUrl}" target="_blank" rel="noopener" data-track="ecosystem_click" data-label="radio_app">Open Radio Drops${extIcon}<span class="sr-only"> (opens in a new tab)</span></a>
    </div>
  </div>
  <div class="eq" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
</div>`;
}

const businessLD = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  '@id': `${SITE_URL}/#business`,
  name: `${config.siteName} by ${config.brand}`,
  legalName: config.legalName,
  url: SITE_URL + '/',
  image: `${SITE_URL}/assets/brand/og-image.jpg`,
  logo: `${SITE_URL}/assets/brand/icon-512.png`,
  telephone: config.phoneE164,
  email: config.email,
  address: { '@type': 'PostalAddress', addressLocality: config.locality, addressRegion: config.region, postalCode: config.postalCode, addressCountry: config.country },
  areaServed: config.areaServed.map((n) => ({ '@type': 'Place', name: n })),
  sameAs: [...Object.values(config.social).map((s) => s.url), ...ECO.filter(ecoExternal).map((e) => e.url)],
  potentialAction: { '@type': 'ReserveAction', target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/book`, actionPlatform: ['http://schema.org/DesktopWebPlatform', 'http://schema.org/MobileWebPlatform'] }, result: { '@type': 'Reservation', name: 'Studio session' } },
};

function analyticsTags() {
  const a = config.analytics || {};
  let out = '';
  if (a.plausibleDomain) out += `<script defer data-domain="${esc(a.plausibleDomain)}" src="https://plausible.io/js/script.js"></script>`;
  if (a.ga4MeasurementId) out += `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(a.ga4MeasurementId)}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${esc(a.ga4MeasurementId)}',{anonymize_ip:true});</script>`;
  return out;
}

function layout({ title, description, pathname, body, scripts = [], jsonld = [], bodyClass = '', ogImage, noindex = false, hideStickyCta = false }) {
  const canonical = SITE_URL + (pathname === '/' ? '/' : pathname);
  const fullTitle = pathname === '/' ? title : `${title} | ${config.siteName}`;
  const img = ogImage || `${SITE_URL}/assets/brand/og-image.jpg`;
  const navItems = NAV.map(([href, label]) => `<li><a href="${href}"${pathname.startsWith(href) ? ' aria-current="page"' : ''}>${label}</a></li>`).join('');
  const ecoMenu = ECO.filter((e) => e.id !== 'studio').map((e) => `<li><a href="${ecoHref(e)}"${ecoExternal(e) ? ' target="_blank" rel="noopener"' : ''} data-track="ecosystem_click" data-label="${e.id}"><span class="menu-icon">${ecoIcon[e.id]}</span><span><strong>${esc(e.name)}</strong><small>${esc(e.kicker)}</small></span>${ecoExternal(e) ? extIcon : ''}</a></li>`).join('');
  return `<!doctype html>
<html lang="en-US">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
${noindex ? '<meta name="robots" content="noindex">' : ''}
<meta name="theme-color" content="#0a0a0b">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(config.siteName)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(fullTitle)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${img}">
<link rel="icon" href="/assets/brand/favicon.png" type="image/png">
<link rel="apple-touch-icon" href="/assets/brand/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
${FONT_HEAD}
<link rel="stylesheet" href="/assets/css/site.css?v=${BUILD_ID}">
<script>document.documentElement.classList.add('js')</script>
${[businessLD, ...jsonld].map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
${analyticsTags()}
</head>
<body class="${bodyClass}">
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header" data-header>
  <div class="container site-header__inner">
    <a class="brand" href="/" aria-label="${esc(config.siteName)} by Disco Sundays, home">
      ${logo({ size: 'sm', eager: true })}
      <span class="brand__text"><span class="brand__name">Maryland Recording Studio</span><span class="brand__sub">Hanover, MD · Est. by Disco Sundays</span></span>
    </a>
    <nav class="site-nav" aria-label="Main">
      <ul data-nav-list>${navItems}
        <li class="has-menu"><button type="button" class="nav-explore" aria-expanded="false" aria-controls="explore-menu" data-explore-toggle>Explore <span aria-hidden="true" class="chev"></span></button>
          <div class="explore-menu" id="explore-menu" hidden data-explore-menu><p class="explore-menu__h">Explore Disco Sundays</p><ul>${ecoMenu}</ul><a class="explore-menu__all" href="/explore">See the whole ecosystem →</a></div>
        </li>
      </ul>
    </nav>
    <a class="btn btn--primary btn--sm site-header__cta" href="/book" data-track="book_cta_click" data-label="header">Book now</a>
    <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="mobile-menu" data-menu-toggle><span class="sr-only">Open menu</span><span class="menu-toggle__bars" aria-hidden="true"></span></button>
  </div>
</header>
<div class="mobile-menu" id="mobile-menu" data-mobile-menu hidden>
  <a class="btn btn--primary btn--lg btn--block" href="/book" data-track="book_cta_click" data-label="mobile_menu">Book your session</a>
  <nav aria-label="Mobile">
    <ul class="mobile-menu__main"><li><a href="/"${pathname === '/' ? ' aria-current="page"' : ''}>Home</a></li>${navItems}<li><a href="/faq"${pathname === '/faq' ? ' aria-current="page"' : ''}>FAQ</a></li></ul>
    <p class="mobile-menu__h">Explore Disco Sundays</p>
    <ul class="mobile-menu__eco">${ecoMenu}</ul>
  </nav>
  <div class="mobile-menu__contact"><a href="tel:${config.phoneE164}" data-track="phone_click">${config.phone}</a>${socialLinks()}</div>
</div>
<main id="main" tabindex="-1" data-page="${esc(pathname)}">
${body}
</main>
<footer class="site-footer">
  <div class="rainbow-rule" aria-hidden="true"></div>
  <div class="container site-footer__top">
    <div class="site-footer__brand">
      <a href="/" aria-label="Home">${logo({ size: 'lg' })}</a>
      <p>Maryland Recording Studio by ${esc(config.legalName)}. A members' recording studio in ${config.locality}, ${config.regionName}.</p>
      ${socialLinks()}
    </div>
    <div class="site-footer__cta">
      <p class="footer-big">Ready when you are.</p>
      <div class="btn-row"><a class="btn btn--primary btn--lg" href="/book" data-track="book_cta_click" data-label="footer">Book a session</a><a class="btn btn--ghost btn--lg" href="/book?service=visit-studio" data-track="book_cta_click" data-label="footer_visit">Free studio visit</a></div>
    </div>
  </div>
  <div class="container site-footer__grid">
    <nav aria-label="Studio">
      <h2 class="footer-h">Studio</h2>
      <ul><li><a href="/studio">The Studio</a></li><li><a href="/services">Services</a></li><li><a href="/book">Book now</a></li><li><a href="/gallery">Gallery</a></li><li><a href="/faq">FAQ</a></li></ul>
    </nav>
    <nav aria-label="Explore Disco Sundays">
      <h2 class="footer-h">Explore Disco Sundays</h2>
      <ul>${ECO.filter((e) => e.id !== 'studio').map((e) => `<li><a href="${ecoHref(e)}"${ecoExternal(e) ? ' target="_blank" rel="noopener"' : ''} data-track="ecosystem_click" data-label="${e.id}">${esc(e.name)}${ecoExternal(e) ? extIcon : ''}</a></li>`).join('')}</ul>
    </nav>
    <nav aria-label="Company">
      <h2 class="footer-h">Company</h2>
      <ul><li><a href="/about">About</a></li><li><a href="/contact">Contact</a></li><li><a href="/explore">Ecosystem</a></li><li><a href="/radio">Radio</a></li></ul>
    </nav>
    <div>
      <h2 class="footer-h">Get in touch</h2>
      <ul class="footer-contact">
        <li><a href="tel:${config.phoneE164}" data-track="phone_click">${config.phone}</a></li>
        <li><a href="sms:${config.phoneE164}" data-track="phone_click" data-label="sms">Text us</a></li>
        <li><a href="mailto:${config.email}" data-track="email_click">${config.email}</a></li>
        <li>${config.locality}, ${config.region} ${config.postalCode}</li>
      </ul>
    </div>
  </div>
  <div class="container site-footer__legal"><p>© <span data-year>${new Date().getFullYear()}</span> ${esc(config.legalName)}. Bookings and payments are processed securely by Square.</p><p><a href="/faq">Booking &amp; membership FAQ</a></p></div>
</footer>
<div class="mini-player" data-mini-player hidden>
  <button type="button" class="play-btn play-btn--sm" data-radio-toggle aria-label="Pause ${esc(config.radio.name)}"><span class="play-btn__icon" aria-hidden="true"></span></button>
  <div class="mini-player__text"><strong>${esc(config.radio.name)}</strong><span data-radio-now>${esc(config.radio.tagline)}</span></div>
  <a class="mini-player__link" href="/radio" aria-label="Open the radio page">Radio</a>
  <button type="button" class="mini-player__close" data-radio-close aria-label="Stop and close the radio player">×</button>
</div>
${hideStickyCta ? '' : `<div class="sticky-cta" data-sticky-cta><a class="btn btn--primary btn--block" href="/book" data-track="book_cta_click" data-label="sticky_mobile">Book a session</a></div>`}
<script>window.MRS_RADIO=${JSON.stringify({ stream: config.radio.streamUrl, info: config.radio.liveInfoUrl, name: config.radio.name, tagline: config.radio.tagline })}</script>
<script src="/assets/js/main.js?v=${BUILD_ID}" defer></script>
<script src="/assets/js/radio.js?v=${BUILD_ID}" defer></script>
${scripts.map((s) => `<script src="/assets/js/${s}?v=${BUILD_ID}" defer data-page-script></script>`).join('\n')}
</body>
</html>`;
}

// ---------- page tokens ----------
const tokens = {
  featuredServices: () => `<div class="svc-grid svc-grid--featured">${featured.map((s) => serviceCard(s)).join('')}</div>`,
  catalogue: catalogueUI,
  ctaBand: () => ctaBand(),
  ctaVisit: () => ctaBand('See the room before you book.', 'Studio visits are free and take 30 minutes. Pick a time that suits you.'),
  faqAll: () => faqList(faqs.flatMap((g) => g.items)),
  faqGrouped: () => faqs.map((g) => `<section class="faq-group" aria-labelledby="faq-${slugify(g.group)}"><h2 id="faq-${slugify(g.group)}" class="h3">${esc(g.group)}</h2>${faqList(g.items)}</section>`).join(''),
  faqTop: () => faqList(faqs.flatMap((g) => g.items).filter((f) => f.top)),
  studioPanels,
  galleryGrid,
  heroMedia,
  heroArt: () => art(7, { bars: 64, className: 'hero__art' }),
  socialLinks: () => socialLinks(),
  ecosystem: () => ecosystemGrid(),
  radioPlayer: () => radioPlayer(),
  logoLg: () => logo({ size: 'lg' }),
  serviceRows: () => `<ol class="svc-rows">${services.filter((s) => s.featured).map((s, i) => `<li class="svc-row reveal"><a href="/services/${s.slug}" data-track="service_card_click" data-label="${esc(s.name)}">
      <span class="svc-row__num">${String(i + 1).padStart(2, '0')}</span>
      <span class="svc-row__main"><span class="svc-row__cat">${esc(s.categoryLabel)}</span><span class="svc-row__name">${esc(s.name)}</span><span class="svc-row__tag">${esc(s.tagline || s.description)}</span></span>
      <span class="svc-row__meta">${esc(priceLine(s))}</span>
      <span class="svc-row__art" aria-hidden="true">${s.image ? picture(s.image) : art(s.seed, { bars: 28 })}</span>
      <span class="svc-row__go" aria-hidden="true">→</span></a></li>`).join('')}</ol>`,
  quickBook: () => ['visit-studio', 'crash-test-artist-evaluation', 'unlimited-membership'].map((slug) => services.find((s) => s.slug === slug)).filter(Boolean).map((s) => `<li><a href="/book?service=${s.slug}" data-track="book_cta_click" data-label="hero_quick_${s.slug}"><span class="qb__name">${esc(s.name.replace('Disco Sundays ', ''))}</span><span class="qb__meta">${esc(priceLine(s))}</span><span class="qb__go" aria-hidden="true">→</span></a></li>`).join(''),
  socialData: () => `<script type="application/json" id="social-data">${JSON.stringify({ instagram: social.instagram, facebook: config.social.facebook.url, instagramProfile: config.social.instagram.url, youtube: config.social.youtube.url, photos: (media.gallery || []).concat(media.studio || []) }).replace(/</g, '\\u003c')}</script>`,
  followButtons: () => `<div class="follow-row">${['instagram', 'facebook', 'youtube'].map((k) => `<a class="follow follow--${k}" href="${config.social[k].url}" target="_blank" rel="noopener" data-track="social_profile_click" data-label="${k}">Follow on ${k === 'youtube' ? 'YouTube' : k[0].toUpperCase() + k.slice(1)}<span class="sr-only"> (opens in a new tab)</span></a>`).join('')}</div>`,
  radioAppUrl: () => config.radio.appUrl,
  partners: () => `<section class="partners" aria-labelledby="partners-title"><div class="container"><h2 id="partners-title" class="partners__h">${esc(config.partners.heading)}</h2><ul class="partners__list">${config.partners.logos.map((l) => `<li class="partner" style="--pbg:${l.bg}"><img src="${l.src240 || l.src}"${l.src240 ? ` srcset="${l.src240} ${l.src240.includes('-160') ? 160 : 240}w, ${l.src} ${l.w}w" sizes="(min-width: 1024px) 140px, (min-width: 480px) 28vw, 40vw"` : ''} alt="${esc(l.name)}" width="${l.w}" height="${l.h}" loading="lazy" decoding="async"></li>`).join('')}</ul></div></section>`,
  rapProgram: () => { const r = ECO.find((e) => e.id === 'rap'); return `<section class="rap" aria-labelledby="rap-title"><div class="container rap__grid">
    <div class="rap__copy reveal"><p class="eyebrow">RAP Program</p><h2 id="rap-title" class="display-2">Create. Record. <em>Perform. Grow.</em></h2>
      <p class="lead">A music production and artist development program that helps young artists turn talent into professionally recorded music, creative projects and performance opportunities.</p>
      <div class="btn-row"><a class="btn btn--primary btn--lg" href="${r.url}" target="_blank" rel="noopener" data-track="ecosystem_click" data-label="rap_home">Explore the RAP Program<span class="sr-only"> (opens in a new tab)</span></a></div></div>
    <ol class="rap__steps reveal"><li><span>01</span><strong>Register</strong><p>Tell us about your musical goals.</p></li><li><span>02</span><strong>Free first hour</strong><p>A one-time introductory session to explore your talent.</p></li><li><span>03</span><strong>Choose a package</strong><p>Single, EP, LP, Star Pack or Superstar.</p></li><li><span>04</span><strong>Create &amp; release</strong><p>Develop, record and release with the RAP team.</p></li></ol>
  </div></section>`; },

  serviceCount: () => String(services.length),
  categoryCount: () => String(categories.length),
  phone: () => config.phone,
  phoneE164: () => config.phoneE164,
  email: () => config.email,
  bookingBase: () => config.square.bookingBase,
  instagramUrl: () => config.social.instagram.url,
  facebookUrl: () => config.social.facebook.url,
  youtubeUrl: () => config.social.youtube.url,
  instagramHandle: () => config.social.instagram.handle,
  facebookPluginSrc: () => esc(`https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(config.social.facebook.url)}&tabs=timeline&width=500&height=640&small_header=true&adapt_container_width=true&hide_cover=false&show_facepile=false`),
  servicePicker: () => categories.map((c) => `<div class="picker__group"><h3 class="picker__h">${esc(c.label)}</h3><ul>${services.filter((s) => s.category === c.id).map((s) => `<li><button type="button" class="picker__item" data-pick="${s.slug}" data-id="${s.id}" aria-pressed="false"><span class="picker__name">${esc(s.name)}</span><span class="picker__meta">${esc(priceLine(s))}</span></button></li>`).join('')}</ul></div>`).join(''),
  serviceOptions: () => `<option value="">All services</option>` + categories.map((c) => `<optgroup label="${esc(c.label)}">${services.filter((s) => s.category === c.id).map((s) => `<option value="${s.slug}">${esc(s.name)} (${esc(priceLine(s))})</option>`).join('')}</optgroup>`).join(''),
  contactServiceOptions: () => `<option value="">Choose a service (optional)</option>` + services.map((s) => `<option>${esc(s.name)}</option>`).join('') + '<option>Something else</option>',
};

function render(tpl, extra = {}) {
  const all = { ...tokens, ...extra };
  return tpl.replace(/\{\{\s*([\w]+)\s*\}\}/g, (m, k) => {
    if (!(k in all)) throw new Error(`Unknown template token {{${k}}}`);
    const v = all[k];
    return typeof v === 'function' ? v() : v;
  });
}

// ---------- write ----------
async function writePage(pathname, html) {
  const dir = path.join(dist, pathname === '/' ? '' : pathname);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'index.html'), html);
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(path.join(root, 'assets'), path.join(dist, 'assets'), { recursive: true });
// Minify CSS (comments + whitespace); JS is small and served compressed.
{
  const cssPath = path.join(dist, 'assets/css/site.css');
  const css = (await readFile(cssPath, 'utf8'))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .replace(/ !important/g, '!important')
    .trim();
  await writeFile(cssPath, css);
}
await mkdir(path.join(dist, 'data'), { recursive: true });
await selfHostFonts();

// Public, client-side copy of the catalogue (used for booking deep links and live refresh).
const publicCatalogue = {
  syncedAt: catalogue.syncedAt,
  bookingBase: config.square.bookingBase,
  categories: categories.map(({ id, name, label }) => ({ id, name, label })),
  services: services.map((s) => ({ id: s.id, slug: s.slug, name: s.name, category: s.category, categoryLabel: s.categoryLabel, description: s.description, tagline: s.tagline, price: s.price, durationMinutes: s.durationMinutes, bookUrl: s.bookUrl, featured: s.featured })),
};
await writeFile(path.join(dist, 'data/services.json'), JSON.stringify(publicCatalogue));

const sitemap = [];
const pageFiles = (await readdir(path.join(root, 'src/pages'))).filter((f) => f.endsWith('.html'));
for (const f of pageFiles) {
  const raw = await readFile(path.join(root, 'src/pages', f), 'utf8');
  const m = raw.match(/^<!--\s*(\{[\s\S]*?\})\s*-->\n?/);
  if (!m) throw new Error(`${f}: missing meta header`);
  const meta = JSON.parse(m[1]);
  const body = render(raw.slice(m[0].length));
  const jsonld = [];
  if (meta.faqSchema) jsonld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.flatMap((g) => g.items).map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a.join(' ').replace(/<[^>]+>/g, '') } })) });
  if (meta.path === '/services') jsonld.push({ '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: services.map((s, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE_URL}/services/${s.slug}`, name: s.name })) });
  const html = layout({ ...meta, pathname: meta.path, body, jsonld });
  if (meta.path === '/404') await writeFile(path.join(dist, '404.html'), html);
  else { await writePage(meta.path, html); if (!meta.noindex) sitemap.push(meta.path); }
}

// Individual service pages, generated from the Square catalogue.
const svcTpl = await readFile(path.join(root, 'src/templates/service.html'), 'utf8');
for (const s of services) {
  const related = services.filter((o) => o.id !== s.id && o.category === s.category).slice(0, 3);
  const fill = related.length < 3 ? services.filter((o) => o.id !== s.id && o.featured && !related.includes(o)).slice(0, 3 - related.length) : [];
  const relatedHtml = [...related, ...fill].map((o) => serviceCard(o)).join('');
  const relevantFaqs = faqs.flatMap((g) => g.items).filter((x) => (x.services || []).some((tag) => tag === s.slug || tag === s.category || (tag === 'membership' && s.membershipTerms)));
  const body = render(svcTpl, {
    svcName: esc(s.name),
    svcSlug: s.slug,
    svcId: s.id,
    svcCategory: esc(s.categoryLabel),
    svcTagline: esc(s.tagline || ''),
    svcPrice: esc(s.price?.display || ''),
    svcDuration: esc(fmtDuration(s.durationMinutes)),
    svcVisual: s.image ? picture(s.image, { eager: true, sizes: '(min-width: 900px) 50vw, 100vw' }) : art(s.seed, { bars: 56 }),
    svcDescription: [s.description, ...(s.longDescription || [])].map((p) => `<p>${esc(p)}</p>`).join(''),
    svcIncludes: s.includes ? `<h2 class="h3">During your session</h2><ul class="ticks">${s.includes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '',
    svcOutcome: s.outcome ? `<p class="callout">${esc(s.outcome)}</p>` : '',
    svcVariations: s.variations?.length ? `<div class="variations"><h2 class="h3">Options</h2><p>Choose one of these options when you book. Pricing for each option is shown in the booking step.</p><ul class="pill-list">${s.variations.map((v) => `<li>${esc(v.name)}</li>`).join('')}</ul></div>` : '',
    svcTerms: s.membershipTerms ? `<details class="terms"><summary>Membership terms at a glance</summary><ul><li>Memberships are billed monthly and renew automatically unless canceled before the renewal date. Fees are non-refundable once charged.</li><li>Each membership includes a set number of studio hours per month. Hours must be used within the billing cycle and don't roll over unless agreed in writing.</li><li>Sessions are booked through the official Disco Sundays scheduling system. Booking priority and advance windows vary by tier, and availability isn't guaranteed.</li><li>Members are responsible for their conduct and for any damage to studio property.</li><li>Engineering, production, premium equipment and other add-ons may cost extra.</li></ul><p>The full terms are shown on the service in the booking step.</p></details>` : '',
    svcFaq: relevantFaqs.length ? `<section class="section section--tight"><div class="container narrow"><h2 class="h2">Questions about this service</h2>${faqList(relevantFaqs)}</div></section>` : '',
    svcRelated: relatedHtml,
    svcBookUrl: s.bookUrl,
  });
  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'Service', name: s.name, description: s.description, serviceType: 'Recording studio service', provider: { '@id': `${SITE_URL}/#business` }, areaServed: `${config.locality}, ${config.regionName}`, url: `${SITE_URL}/services/${s.slug}`, ...(typeof s.price?.amount === 'number' ? { offers: { '@type': 'Offer', price: (s.price.amount / 100).toFixed(2), priceCurrency: s.price.currency, url: `${SITE_URL}/book?service=${s.slug}` } } : {}) },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL + '/' }, { '@type': 'ListItem', position: 2, name: 'Services', item: `${SITE_URL}/services` }, { '@type': 'ListItem', position: 3, name: s.name, item: `${SITE_URL}/services/${s.slug}` }] },
  ];
  const html = layout({
    title: `${s.name} in Hanover, MD`,
    description: (s.seoDescription || s.description).slice(0, 158),
    pathname: `/services/${s.slug}`,
    body,
    jsonld,
    scripts: ['service.js'],
  });
  await writePage(`/services/${s.slug}`, html);
  sitemap.push(`/services/${s.slug}`);
}

// Static extras.
await writeFile(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
const today = new Date().toISOString().slice(0, 10);
await writeFile(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap.map((p) => `  <url><loc>${SITE_URL}${p === '/' ? '/' : p}</loc><lastmod>${today}</lastmod><priority>${p === '/' ? '1.0' : p.startsWith('/services/') ? '0.7' : '0.8'}</priority></url>`).join('\n')}\n</urlset>\n`);
await writeFile(path.join(dist, 'site.webmanifest'), JSON.stringify({ name: config.siteName, short_name: 'Disco Sundays', start_url: '/', display: 'standalone', background_color: '#0a0a0b', theme_color: '#0a0a0b', icons: [{ src: '/assets/brand/icon-512.png', sizes: '512x512', type: 'image/png' }] }));

console.log(`[build] ${pageFiles.length} pages + ${services.length} service pages → dist/ (site URL ${SITE_URL})`);
