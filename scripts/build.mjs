// Zero-dependency static site builder for Maryland Recording Studio.
// Assembles src/pages/*.html into dist/, generates a page per Square service,
// and writes sitemap.xml / robots.txt. Run: node scripts/build.mjs
import { readFile, writeFile, mkdir, readdir, rm, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
import { execFileSync } from 'node:child_process';
const readJSON = async (p) => JSON.parse(await readFile(path.join(root, p), 'utf8'));

const config = await readJSON('site.config.json');
const catalogue = await readJSON('data/services.json');
const editorial = await readJSON('content/services-editorial.json');
const media = await readJSON('content/media.json');
const greviews = await readJSON('content/google-reviews.json');
const faqs = await readJSON('content/faq.json');
const social = await readJSON('content/social.json');
const ecoShots = existsSync(path.join(root, 'content/ecosystem-shots.json')) ? await readJSON('content/ecosystem-shots.json') : { shots: [] };

const SITE_URL = (process.env.SITE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
  || config.siteUrl).replace(/\/$/, '');
const BUILD_ID = Date.now().toString(36);

// Fonts: self-hosted from assets/fonts (vendored by scripts/vendor-fonts.mjs), inlined @font-face
// and preloaded, so pages make no third-party font requests.
let FONT_HEAD = '';
async function selfHostFonts() {
  const css = (await readFile(path.join(root, 'assets/fonts/fonts.css'), 'utf8')).replace(/\/\*[^*]*\*\//g, '').replace(/\s+/g, ' ').trim();
  FONT_HEAD = ['unbounded-700', 'inter-400'].map((n) => `<link rel="preload" href="/assets/fonts/${n}.woff2" as="font" type="font/woff2" crossorigin>`).join('') + `<style>${css}</style>`;
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
    seoTitle: ed.seoTitle || null,
    image: ed.image || null,
    categoryName: cat.name,
    categoryLabel: catLabel,
    bookUrl: `${s.bookingBase || config.square.bookingBase}/${s.id}`,
    primary: ed.primary || null,
    purchase: ed.purchase || null,
    hideDuration: !!ed.hideDuration,
    priceSuffix: ed.priceSuffix || '',
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

const priceText = (s) => (s.priceSuffix && s.price?.display ? s.price.display.replace(/\.00$/, '') + s.priceSuffix : s.price?.display);
const priceLine = (s) => [priceText(s), s.hideDuration ? '' : fmtDuration(s.durationMinutes)].filter(Boolean).join(' · ');
// Primary action for a service: memberships go to checkout (no appointment), everything else books in Square.
const ctaFor = (s, label) => s.purchase
  ? `<a class="btn btn--primary btn--sm" href="${s.purchase.url}" target="_blank" rel="noopener" data-track="membership_checkout_click" data-label="${esc(s.name)}">${label || 'Join now'}<span class="sr-only"> (opens secure Square checkout)</span></a>`
  : `<a class="btn btn--primary btn--sm" href="/book?service=${s.slug}" data-track="book_cta_click" data-label="${esc(s.name)}">${label || 'Book this service'}</a>`;

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
      ${ctaFor(s)}
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
const bySlug = (slug) => services.find((s) => s.slug === slug);

// The three main ways in: Membership, Recording, Mixing. Each has its own presentation.
function primaryTrio() {
  const m = bySlug('unlimited-membership');
  const rec = services.filter((s) => s.category === 'recording');
  const mix = bySlug('mixing'), mas = bySlug('mastering');
  const U = (s) => esc(s.description);
  return `<div class="trio">
  <article class="trio__card trio__card--membership reveal" aria-labelledby="trio-m">
    <p class="trio__kicker">01 · Membership</p>
    <h2 id="trio-m" class="trio__title">Disco Sundays Unlimited</h2>
    <p class="trio__price"><strong>${esc(m.price.display.replace(/\.00$/, ''))}</strong><span>/month</span></p>
    <ul class="ticks"><li>24/7 studio access, up to 4 hours a day</li><li>No contracts</li><li>Music uploaded for A&amp;R review</li><li>Help booking shows</li></ul>
    <p class="trio__note">No appointment needed to join. You'll set your member username and password at checkout, then book member sessions any time.</p>
    <div class="btn-row"><a class="btn btn--primary btn--lg" href="${m.purchase.url}" target="_blank" rel="noopener" data-track="membership_checkout_click" data-label="trio">Join for $200/month<span class="sr-only"> (opens secure Square checkout)</span></a><a class="btn btn--ghost btn--lg" href="/services/${m.slug}">How it works</a></div>
    <p class="trio__fine">${esc(m.purchase.note)}</p>
  </article>
  <article class="trio__card trio__card--recording reveal" aria-labelledby="trio-r">
    <p class="trio__kicker">02 · Recording</p>
    <h2 id="trio-r" class="trio__title">Book studio time</h2>
    <p class="trio__lead">Record music, vocals and more by the hour.</p>
    <ul class="trio__options">${rec.map((s) => `<li><a href="/book?service=${s.slug}" data-track="book_cta_click" data-label="trio_${s.slug}"><span>${esc(fmtDuration(s.durationMinutes))}</span><strong>${esc(s.price.display.replace(/\.00$/, ''))}</strong></a></li>`).join('')}</ul>
    <a class="btn btn--primary btn--lg btn--block" href="/book?service=${rec[0].slug}" data-track="book_cta_click" data-label="trio_recording">Book recording</a>
  </article>
  <article class="trio__card trio__card--mixing reveal" aria-labelledby="trio-x">
    <div class="trio__wave" aria-hidden="true">${art(3, { bars: 36 })}</div>
    <p class="trio__kicker">03 · Mixing</p>
    <h2 id="trio-x" class="trio__title">Mixing &amp; mastering</h2>
    <dl class="trio__menu"><div><dt>Mixing session</dt><dd>${esc(priceLine(mix))}</dd></div>${mas ? `<div><dt>Mastering</dt><dd>${esc(priceLine(mas))}</dd></div>` : ''}</dl>
    <div class="btn-row"><a class="btn btn--primary btn--lg" href="/book?service=${mix.slug}" data-track="book_cta_click" data-label="trio_mixing">Book mixing</a>${mas ? `<a class="btn btn--ghost btn--lg" href="/book?service=${mas.slug}" data-track="book_cta_click" data-label="trio_mastering">Book mastering</a>` : ''}</div>
    <a class="link-arrow trio__upload" href="/submit-project" data-track="ecosystem_click" data-label="trio_upload">Send us your files first</a>
    <button type="button" class="trio__ask" data-ai-inline hidden data-ai-open="chat" data-ai-topic="I have a project that needs mixing. Can you help me figure out what to book?">Not sure what you need? Ask our AI studio assistant →</button>
  </article>
</div>`;
}

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
const COST_FAQ = [
  { q: 'How much is studio time per hour at Disco Sundays?', a: ['Recording is $60 an hour, with 1, 2 and 3 hour sessions at $60, $120 and $180. You book and pay securely through Square.'] },
  { q: 'Is mixing included in a recording session?', a: ['No. Recording, mixing and mastering are separate. A Mixing Session is $75 for one hour and Mastering is $50. Creator Membership sessions include mixing.'] },
  { q: 'When is the Unlimited membership cheaper than paying per hour?', a: ['At $60 an hour, the $200 membership (about $212 with Maryland sales tax) costs less once you record roughly 4 or more hours a month. Members can use the studio 24/7, up to 4 hours a day.'] },
  { q: 'Can I see the studio before I pay?', a: ['Yes. Studio visits are free and take 30 minutes. <a href="/book?service=visit-studio">Book a studio visit</a>.'] },
];
const NAV = [
  ['/studio', 'The Studio'], ['/services', 'Services'], ['/artist-development', 'Artist Development'],
  ['/gallery', 'Gallery'], ['/about', 'About'], ['/contact', 'Contact'],
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
  address: { '@type': 'PostalAddress', ...(config.streetAddress ? { streetAddress: config.streetAddress } : {}), addressLocality: config.locality, addressRegion: config.region, postalCode: config.postalCode, addressCountry: config.country },
  ...(config.geo ? { geo: { '@type': 'GeoCoordinates', latitude: config.geo.lat, longitude: config.geo.lng }, hasMap: config.google?.mapsUrl } : {}),
  parentOrganization: { '@type': 'Organization', name: config.brand, url: 'https://discosundays.com/' },
  areaServed: config.areaServed.map((n) => ({ '@type': 'Place', name: n })),
  sameAs: [...Object.values(config.social).map((s) => s.url), ...(config.google?.cid ? [`https://maps.google.com/?cid=${config.google.cid}`] : []), ...ECO.filter(ecoExternal).map((e) => e.url)],
  potentialAction: { '@type': 'ReserveAction', target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/book`, actionPlatform: ['http://schema.org/DesktopWebPlatform', 'http://schema.org/MobileWebPlatform'] }, result: { '@type': 'Reservation', name: 'Studio session' } },
};

function analyticsTags() {
  const a = config.analytics || {};
  let out = '';
  if (a.plausibleDomain) out += `<script defer data-domain="${esc(a.plausibleDomain)}" src="https://plausible.io/js/script.js"></script>`;
  if (a.ga4MeasurementId) out += `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(a.ga4MeasurementId)}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${esc(a.ga4MeasurementId)}',{anonymize_ip:true});</script>`;
  return out;
}

function layout({ title, description, pathname, body, scripts = [], jsonld = [], bodyClass = '', ogImage, noindex = false, hideStickyCta = false, stickyCta = '' }) {
  const canonical = SITE_URL + (pathname === '/' ? '/' : pathname);
  const fullTitle = pathname === '/' ? title : `${title} | ${config.siteName}`;
  const img = ogImage || `${SITE_URL}/assets/brand/og-image.jpg`;
  const navItems = NAV.map(([href, label]) => `<li><a href="${href}"${pathname.startsWith(href) ? ' aria-current="page"' : ''}>${label}</a></li>`).join('');
  const memberMenu = `<li><a href="/members" data-track="ecosystem_click" data-label="members"><span class="menu-icon"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5Z"/></svg></span><span><strong>Members area</strong><small>Portal, member sessions, projects</small></span></a></li><li><a href="/submit-project" data-track="ecosystem_click" data-label="submit_project"><span class="menu-icon"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M11 16V7.8l-3.3 3.3-1.4-1.4L12 4l5.7 5.7-1.4 1.4L13 7.8V16h-2Zm-6 4v-5h2v3h10v-3h2v5H5Z"/></svg></span><span><strong>Send us your project</strong><small>Upload tracks for mixing or mastering</small></span></a></li><li><a href="/feedback" data-track="ecosystem_click" data-label="feedback"><span class="menu-icon"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M3 10h2v4H3v-4Zm4-4h2v12H7V6Zm4-3h2v18h-2V3Zm4 5h2v8h-2V8Zm4 2h2v4h-2v-4Z"/></svg></span><span><strong>Free AI demo feedback</strong><small>Upload a song, get notes in a minute</small></span></a></li><li><a href="/release-planner" data-track="ecosystem_click" data-label="planner"><span class="menu-icon"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7Zm12 7v10H5V9h14Zm-8 2v2H7v-2h4Zm6 4v2h-6v-2h6Z"/></svg></span><span><strong>Release planner</strong><small>Plan a release with AI</small></span></a></li><li><a href="/hook-starter" data-track="ecosystem_click" data-label="hook"><span class="menu-icon"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 3v10.6A4 4 0 1 0 14 17V7h4V3h-6Z"/></svg></span><span><strong>Hook &amp; lyric starter</strong><small>Original hooks and song ideas</small></span></a></li><li><a href="/guides" data-track="ecosystem_click" data-label="guides"><span class="menu-icon"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5a1.5 1.5 0 0 0 0 3H20v0H6.5A2.5 2.5 0 0 1 4 19.5v-15ZM8 6v2h8V6H8Zm0 4v2h6v-2H8Z"/></svg></span><span><strong>Artist guides</strong><small>Prices, session prep, mixing vs mastering</small></span></a></li>`;
  const ecoMenu = memberMenu + ECO.filter((e) => e.id !== 'studio').map((e) => `<li><a href="${ecoHref(e)}"${ecoExternal(e) ? ' target="_blank" rel="noopener"' : ''} data-track="ecosystem_click" data-label="${e.id}"><span class="menu-icon">${ecoIcon[e.id]}</span><span><strong>${esc(e.name)}</strong><small>${esc(e.kicker)}</small></span>${ecoExternal(e) ? extIcon : ''}</a></li>`).join('');
  return `<!doctype html>
<html lang="en-US">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${(config.googleSiteVerification || []).map((v) => `<meta name="google-site-verification" content="${esc(v)}">`).join('\n')}
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
<script>document.documentElement.classList.add('js');try{var l=new URLSearchParams(location.search).get('lang')||localStorage.getItem('mrs_lang');if(l==='es'){document.documentElement.classList.add('lang-es','i18n-pending');document.documentElement.lang='es';setTimeout(function(){document.documentElement.classList.remove('i18n-pending')},1800)}}catch(e){}</script>
${[businessLD, ...jsonld].map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
${analyticsTags()}
</head>
<body class="${bodyClass}">
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header" data-i18n-scope data-header>
  <div class="container site-header__inner">
    <a class="brand" href="/">
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
    <button type="button" class="lang-toggle" data-lang-toggle aria-label="ES: ver en español" lang="es">ES</button>
    <a class="btn btn--primary btn--sm site-header__cta" href="/book" data-track="book_cta_click" data-label="header">Book now</a>
    <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="mobile-menu" data-menu-toggle><span class="sr-only">Open menu</span><span class="menu-toggle__bars" aria-hidden="true"></span></button>
  </div>
</header>
<div class="mobile-menu" id="mobile-menu" data-i18n-scope data-mobile-menu hidden>
  <a class="btn btn--primary btn--lg btn--block" href="/book" data-track="book_cta_click" data-label="mobile_menu">Book your session</a>
  <nav aria-label="Mobile">
    <ul class="mobile-menu__main"><li><a href="/"${pathname === '/' ? ' aria-current="page"' : ''}>Home</a></li>${navItems}<li><a href="/members"${pathname === '/members' ? ' aria-current="page"' : ''}>Members area</a></li><li><a href="/faq"${pathname === '/faq' ? ' aria-current="page"' : ''}>FAQ</a></li></ul>
    <p class="mobile-menu__h">Explore Disco Sundays</p>
    <ul class="mobile-menu__eco">${ecoMenu}</ul>
  </nav>
  <div class="mobile-menu__contact"><button type="button" class="lang-toggle lang-toggle--wide" data-lang-toggle lang="es">Español</button><a href="tel:${config.phoneE164}" data-track="phone_click">${config.phone}</a>${socialLinks()}</div>
</div>
<main id="main" tabindex="-1" data-page="${esc(pathname)}">
${body}
</main>
<footer class="site-footer" data-i18n-scope>
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
      <ul><li><a href="/studio">The Studio</a></li><li><a href="/services">Services</a></li><li><a href="/artist-development">Artist Development</a></li><li><a href="/book">Book now</a></li><li><a href="/members">Members area</a></li><li><a href="/submit-project">Send us your project</a></li><li><a href="/feedback">Free AI demo feedback</a></li><li><a href="/release-planner">Release planner</a></li><li><a href="/hook-starter">Hook &amp; lyric starter</a></li><li><a href="/recording-studio-cost-maryland">Studio pricing guide</a></li><li><a href="/guides">Artist guides</a></li><li><a href="/gallery">Gallery</a></li><li><a href="/faq">FAQ</a></li></ul>
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
<button type="button" class="ai-launch" data-ai-launch data-ai-open="chat" hidden><span class="ai-orb" aria-hidden="true"></span><span class="ai-launch__text">Ask our AI</span><span class="sr-only"> studio assistant</span></button>
<div class="mini-player" data-mini-player hidden>
  <button type="button" class="play-btn play-btn--sm" data-radio-toggle aria-label="Pause ${esc(config.radio.name)}"><span class="play-btn__icon" aria-hidden="true"></span></button>
  <div class="mini-player__text"><strong>${esc(config.radio.name)}</strong><span data-radio-now>${esc(config.radio.tagline)}</span></div>
  <a class="mini-player__link" href="/radio" aria-label="Open the radio page">Radio</a>
  <button type="button" class="mini-player__close" data-radio-close aria-label="Stop and close the radio player">×</button>
</div>
${hideStickyCta ? '' : stickyCta === 'ad' ? `<div class="sticky-cta" data-sticky-cta data-i18n-scope><a class="btn btn--primary btn--block" href="${config.artistDevelopment.checkoutUrl}" target="_blank" rel="noopener" data-track="ad_checkout_click" data-label="sticky_mobile_ad">Join Artist Development · ${config.artistDevelopment.price}<span class="sr-only"> (opens secure Square checkout)</span></a></div>` : `<div class="sticky-cta" data-sticky-cta data-i18n-scope><a class="btn btn--primary btn--block" href="/book" data-track="book_cta_click" data-label="sticky_mobile">Book a session</a></div>`}
<script>window.MRS_RADIO=${JSON.stringify({ stream: config.radio.streamUrl, info: config.radio.liveInfoUrl, name: config.radio.name, tagline: config.radio.tagline })}</script>
<script src="/assets/js/i18n.js?v=${BUILD_ID}" defer></script>
<script src="/assets/js/main.js?v=${BUILD_ID}" defer></script>
<script src="/assets/js/radio.js?v=${BUILD_ID}" defer></script>
<script src="/assets/js/alive.js?v=${BUILD_ID}" defer></script>
<script src="/assets/js/slots.js?v=${BUILD_ID}" defer></script>
${body.includes('data-google-reviews') ? `<script src="/assets/js/greviews.js?v=${BUILD_ID}" defer></script>` : ''}
${scripts.map((s) => `<script src="/assets/js/${s}?v=${BUILD_ID}" defer data-page-script></script>`).join('\n')}
</body>
</html>`;
}

// ---------- real product screenshots (captured by scripts/capture-ecosystem.mjs) ----------
function shot(name, { sizes, eager = false } = {}) {
  const sh = ecoShots.shots.find((x) => x.name === name);
  if (!sh) return '';
  const small = sh.device === 'phone' ? 390 : 800;
  const base = sh.webp.replace(/\.webp$/, '');
  const set = (ext) => `${base}-${small}.${ext} ${small}w, ${base}.${ext} ${sh.width}w`;
  return `<picture><source type="image/avif" srcset="${set('avif')}" sizes="${sizes}"><source type="image/webp" srcset="${set('webp')}" sizes="${sizes}"><img src="${sh.webp}" alt="${esc(sh.alt)}" width="${sh.width}" height="${sh.height}" ${eager ? '' : 'loading="lazy" '}decoding="async"></picture>`;
}
const phone = (name, cls = '') => `<figure class="device phone ${cls}"><span class="phone__notch" aria-hidden="true"></span><div class="phone__screen">${shot(name, { sizes: '(min-width: 1000px) 270px, (min-width: 600px) 30vw, 46vw' })}</div></figure>`;
const browserFrame = (name, url, cls = '') => `<figure class="device browser ${cls}"><div class="browser__bar" aria-hidden="true"><span></span><span></span><span></span><em>${esc(url.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</em></div><div class="browser__screen">${shot(name, { sizes: '(min-width: 1000px) 720px, 92vw' })}</div></figure>`;
const ecoUrl = (id) => ECO.find((e) => e.id === id)?.url;

function showcaseApp() {
  const url = ecoUrl('app');
  return `<section class="showcase showcase--app" aria-labelledby="sc-app"><div class="container showcase__grid">
    <div class="showcase__copy reveal">
      <p class="eyebrow eyebrow--dark">The Disco Sundays App</p>
      <h2 id="sc-app" class="display-2">The whole studio, in your pocket.</h2>
      <p class="lead">Start from what you're working on (recording, mixing, mastering or membership), book through Square, catch the latest drops and radio, and check your rewards. Add it to your home screen in one tap.</p>
      <ul class="ticks"><li>Book sessions and renew your membership</li><li>RAP Program, Radio and Artist Showcase in one place</li><li>Rewards built in</li></ul>
      <a class="btn btn--primary btn--lg" href="${url}" target="_blank" rel="noopener" data-track="ecosystem_click" data-label="app_showcase">Open app<span class="sr-only"> (opens in a new tab)</span></a>
    </div>
    <div class="showcase__stage showcase__stage--phones reveal" aria-label="Screens from the Disco Sundays app">
      ${phone('app-rap-and-radio', 'phone--back phone--left')}${phone('app-home', 'phone--front')}${phone('app-rewards-tab', 'phone--back phone--right')}
    </div>
  </div></section>`;
}
function showcaseRewards() {
  const url = ecoUrl('rewards');
  return `<section class="showcase showcase--rewards" aria-labelledby="sc-rewards"><div class="container showcase__grid showcase__grid--flip">
    <div class="showcase__stage showcase__stage--combo reveal" aria-label="Screens from Disco Rewards">
      ${browserFrame('rewards-desktop', url)}${phone('rewards-levels', 'phone--overlap')}
    </div>
    <div class="showcase__copy reveal">
      <p class="eyebrow">Disco Rewards</p>
      <h2 id="sc-rewards" class="display-2">Studio time that <em>pays you back.</em></h2>
      <p class="lead">Book on Square like always, and points stack up automatically on every session, renewal, performance and referral.</p>
      <ol class="levels"><li><strong>Newcomer</strong><span>0–99 pts</span></li><li><strong>Studio Regular</strong><span>100–299</span></li><li><strong>Studio Insider</strong><span>300–599</span></li><li><strong>Disco VIP</strong><span>600–999</span></li><li><strong>Disco Legend</strong><span>1000+</span></li></ol>
      <p class="muted">Redeem points for studio credit, event tickets and VIP experiences.</p>
      <a class="btn btn--primary btn--lg" href="${url}" target="_blank" rel="noopener" data-track="ecosystem_click" data-label="rewards_showcase">Explore rewards<span class="sr-only"> (opens in a new tab)</span></a>
    </div>
  </div></section>`;
}
function showcaseRap() {
  const url = ecoUrl('rap');
  return `<section class="showcase showcase--rap" aria-labelledby="sc-rap"><div class="container">
    <div class="rap-show__head reveal">
      <p class="rap-show__kicker">Create. Record. Perform. Grow.</p>
      <h2 id="sc-rap" class="rap-show__title">RAP Program</h2>
      <p class="lead">A music production program that helps young artists turn talent into professionally recorded music, creative projects and performance opportunities. It has its own packages and registration, separate from our Artist Development Program. Your first hour is free (a one-time introductory session).</p>
      <div class="btn-row"><a class="btn btn--rap btn--lg" href="${url}" target="_blank" rel="noopener" data-track="ecosystem_click" data-label="rap_showcase">Explore RAP Program<span class="sr-only"> (opens in a new tab)</span></a><a class="btn btn--ghost btn--lg" href="${url}packages" target="_blank" rel="noopener" data-track="ecosystem_click" data-label="rap_packages">View packages<span class="sr-only"> (opens in a new tab)</span></a></div>
    </div>
    <div class="rap-show__stage reveal" aria-label="Screens from the RAP Program website">
      ${browserFrame('rap-desktop', url, 'browser--rap')}
      <div class="rap-show__phones">${phone('rap-home')}${phone('rap-packages')}</div>
    </div>
    <ol class="rap-show__steps"><li><span>01</span>Register</li><li><span>02</span>Free first hour</li><li><span>03</span>Choose a package</li><li><span>04</span>Create, record &amp; grow</li></ol>
  </div></section>`;
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
  showcaseApp, showcaseRewards, showcaseRap,
  radioPlayer: () => radioPlayer(),
  logoLg: () => logo({ size: 'lg' }),
  serviceRows: () => `<ol class="svc-rows">${services.filter((s) => s.featured).map((s, i) => `<li class="svc-row reveal"${s.primary ? ` data-primary="${s.primary}"` : ''}><a href="/services/${s.slug}" data-track="service_card_click" data-label="${esc(s.name)}">
      <span class="svc-row__num">${String(i + 1).padStart(2, '0')}</span>
      <span class="svc-row__main"><span class="svc-row__cat">${esc(s.categoryLabel)}</span><span class="svc-row__name">${esc(s.name)}</span><span class="svc-row__tag">${esc(s.tagline || s.description)}</span></span>
      <span class="svc-row__meta">${esc(priceLine(s))}</span>
      <span class="svc-row__art" aria-hidden="true">${s.image ? picture(s.image) : art(s.seed, { bars: 28 })}</span>
      <span class="svc-row__go" aria-hidden="true">→</span></a></li>`).join('')}</ol>`,
  quickBook: () => [['unlimited-membership', 'Unlimited membership'], ['recording-session-1-hour', 'Recording session'], ['mixing', 'Mixing']].map(([slug, label]) => [services.find((s) => s.slug === slug), label]).filter(([s]) => s).map(([s, label]) => `<li><a href="${s.purchase ? s.purchase.url : '/book?service=' + s.slug}"${s.purchase ? ' target="_blank" rel="noopener" data-track="membership_checkout_click"' : ' data-track="book_cta_click"'} data-label="hero_quick_${s.slug}"><span class="qb__name">${esc(label)}</span><span class="qb__meta">${esc(priceLine(s))}${s.purchase ? ' · no booking needed' : ''}</span><span class="qb__go" aria-hidden="true">→</span></a></li>`).join(''),
  primaryTrio,
  faqCost: () => faqList(COST_FAQ),
  adCheckoutUrl: () => config.artistDevelopment.checkoutUrl,
  adPrice: () => config.artistDevelopment.price,
  faqAD: () => faqList((faqs.find((g) => g.group === 'Artist Development') || { items: [] }).items),
  googleReviews: () => {
    const g = greviews; const mon = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
    const star = (n) => `<span class="gr__stars" aria-hidden="true">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span><span class="sr-only">${n} out of 5 stars</span>`;
    const card = (r) => `<figure class="gr__item"><figcaption>${star(r.rating)}<span class="gr__who">${esc(r.author)}</span><time datetime="${r.date}">${mon(r.date)}</time></figcaption><blockquote><p>${esc(r.text).replace(/\n/g, '<br>')}</p></blockquote></figure>`;
    const first = g.reviews.slice(0, 6), rest = g.reviews.slice(6);
    return `<section class="section gr" aria-labelledby="gr-title" data-google-reviews data-reviews-url="${config.google.mapsUrl}" data-write-url="${config.google.writeReviewUrl}" data-i18n-scope><div class="container"><p class="eyebrow">Google reviews</p><h2 id="gr-title" class="display-2">What artists say</h2><div data-gr-body>
<p class="gr__sum"><span class="gr__stars" aria-hidden="true">★★★★★</span> <strong>${g.rating.toFixed(1)}</strong> on Google · ${g.count} reviews</p>
<div class="gr__list">${first.map(card).join('')}</div>${rest.length ? `<details class="gr__more"><summary>Show all ${g.withText} written reviews</summary><div class="gr__list">${rest.map(card).join('')}</div></details>` : ''}
<p class="gr__attr">Every written review from our Google listing, shown word for word, newest first (updated ${mon(g.asOf)}). <a href="${config.google.mapsUrl}" target="_blank" rel="noopener" data-track="ecosystem_click" data-label="google_reviews">Read them on Google<span class="sr-only"> (opens Google Maps)</span></a> · <a href="${config.google.writeReviewUrl}" target="_blank" rel="noopener" data-track="ecosystem_click" data-label="google_write">Write a review</a></p>
</div></div></section>`;
  },
  adReview: () => `<section class="section ad-quote" aria-label="What artists say"><div class="container narrow reveal"><figure class="ad-quote__fig"><blockquote><p>“Very professional delivery and awesome Artist Development Program. I’m always learning something new from Melvin and Xavier.”</p></blockquote><figcaption>Dara Kamilah · <a href="${config.google.mapsUrl}" target="_blank" rel="noopener" data-track="ecosystem_click" data-label="ad_review_google">Google review<span class="sr-only"> (opens Google Maps in a new tab)</span></a></figcaption></figure></div></section>`,
  spotlights: () => {
    const list = (media.spotlights || []).filter((x) => x.approved === true && (x.video || x.image));
    if (!list.length) return '';
    return `<section class="section spot" aria-labelledby="spot-title"><div class="container"><div class="section-head reveal"><p class="eyebrow">Artist spotlights</p><h2 id="spot-title" class="display-2">Made with Disco Sundays.</h2></div><div class="spot__row">${list.map((x) => `<figure class="spot__item reveal" data-ad-zoom>${x.video ? `<video muted loop playsinline preload="none" ${x.image ? `poster="${esc(x.image)}"` : ''} data-spot-video aria-label="${esc(x.alt || x.artist)}"><source src="${esc(x.video)}" type="video/mp4"></video>` : picture({ src: x.image, alt: x.alt || x.artist }, { sizes: '(min-width: 900px) 33vw, 90vw' })}<figcaption><strong>${esc(x.artist)}</strong>${x.caption ? `<span>${esc(x.caption)}</span>` : ''}</figcaption></figure>`).join('')}</div></div></section>`;
  },
  adFeature: () => `<section class="section ad-feature" data-anim aria-labelledby="adf-title">
  <div class="container ad-feature__grid">
    <div class="ad-feature__visual reveal" aria-hidden="true"><div class="ad-hero__lens ad-hero__lens--sm" data-ad-zoom><div class="ad-hero__rings"><i></i><i></i><i></i><i></i></div><div class="ad-hero__words"><span>Logic Pro</span><span>GarageBand</span><span>MIDI</span><span>Production</span><span>Mentorship</span></div></div></div>
    <div class="ad-feature__copy reveal">
      <p class="eyebrow">New · Artist Development Program</p>
      <h2 id="adf-title" class="display-2">Learn the craft behind <em>the record.</em></h2>
      <p class="lead">Mentorship and hands-on production skills: music production, Logic Pro and GarageBand, MIDI equipment and recording techniques, with creative guidance from the Disco Sundays team.</p>
      <div class="btn-row"><a class="btn btn--primary btn--lg" href="/artist-development" data-track="ecosystem_click" data-label="home_ad">Explore Artist Development</a><a class="btn btn--ghost btn--lg" href="${config.artistDevelopment.checkoutUrl}" target="_blank" rel="noopener" data-track="ad_checkout_click" data-label="home_ad_join">Join · ${config.artistDevelopment.price}<span class="sr-only"> (opens secure Square checkout)</span></a></div>
    </div>
  </div>
</section>`,
  estimator: () => {
    const bySlug = (x) => services.find((s) => s.slug === x);
    const m = bySlug('unlimited-membership'), r1 = bySlug('recording-session-1-hour'), mix = bySlug('mixing'), mas = bySlug('mastering');
    const P = { member: m.price.amount / 100, hour: r1.price.amount / 100 / (r1.durationMinutes / 60), mix: mix.price.amount / 100, master: mas.price.amount / 100, tax: 0.06 };
    return `<section class="est reveal" data-estimator data-prices='${JSON.stringify(P)}' aria-labelledby="est-title">
  <div class="est__in">
    <div class="est__copy"><p class="eyebrow">Estimator</p><h2 id="est-title" class="h2">Pay per session or become a member?</h2><p>Move the sliders to match how you work. Uses our real Square prices: recording $${P.hour}/hour, mixing $${P.mix} per 1-hour session, mastering $${P.master}, membership $${P.member}/month.</p></div>
    <div class="est__controls">
      <label class="est__ctl"><span>Studio hours a month <output data-out="hours">8</output></span><input type="range" min="1" max="40" value="8" data-in="hours"></label>
      <label class="est__ctl"><span>Mixing sessions a month <output data-out="mix">1</output></span><input type="range" min="0" max="10" value="1" data-in="mix"></label>
      <label class="est__ctl"><span>Masters a month <output data-out="master">1</output></span><input type="range" min="0" max="10" value="1" data-in="master"></label>
    </div>
    <div class="est__result" aria-live="polite">
      <div class="est__col"><span>Pay as you go</span><strong data-out="payg">$0</strong><small data-out="payg-note"></small></div>
      <div class="est__col est__col--m"><span>Unlimited membership</span><strong data-out="mem">$0</strong><small data-out="mem-note"></small></div>
      <p class="est__verdict" data-out="verdict"></p>
      <div class="btn-row"><a class="btn btn--primary" href="${m.purchase.url}" target="_blank" rel="noopener" data-track="membership_checkout_click" data-label="estimator" data-est-join>Join for $${P.member}/month<span class="sr-only"> (opens secure Square checkout)</span></a><a class="btn btn--ghost" href="/book?service=${r1.slug}" data-track="book_cta_click" data-label="estimator">Book a session</a></div>
      <p class="est__fine">Estimate only. Membership covers studio time (up to 4 hours a day, one location) and adds Maryland sales tax at checkout (shown here). Mixing and mastering are booked separately at the prices above. Final prices are always shown in Square.</p>
    </div>
  </div>
</section>`;
  },
  sessionFinder: () => `<section class="finder reveal" data-finder data-i18n-scope aria-labelledby="finder-title">
  <div class="finder__head"><span class="ai-orb" aria-hidden="true"></span><div><p class="eyebrow">AI session finder</p><h2 id="finder-title" class="h2">Find your perfect session in 30 seconds.</h2></div></div>
  <form class="finder__form" data-finder-form>
    <fieldset class="finder__q" data-q="goal"><legend>What are you working on?</legend>
      <div class="finder__opts">${[['record', 'Record a new song'], ['mix', 'Mix a recorded song'], ['master', 'Master a finished mix'], ['podcast', 'Podcast / video'], ['voiceover', 'Voice-over'], ['develop', 'Grow as an artist']].map(([v, l]) => `<label><input type="radio" name="goal" value="${v}"><span>${l}</span></label>`).join('')}</div></fieldset>
    <fieldset class="finder__q" data-q="freq" hidden><legend>How often do you want studio time?</legend>
      <div class="finder__opts">${[['once', 'Just this once'], ['few', 'A few times a month'], ['weekly', 'Every week or more']].map(([v, l]) => `<label><input type="radio" name="freq" value="${v}"><span>${l}</span></label>`).join('')}</div></fieldset>
    <fieldset class="finder__q" data-q="stage" hidden><legend>Where's the song at right now?</legend>
      <div class="finder__opts">${[['idea', 'Ideas / still writing'], ['ready', 'Beat + lyrics ready'], ['recorded', 'Vocals recorded'], ['polish', 'Done, needs polish']].map(([v, l]) => `<label><input type="radio" name="stage" value="${v}"><span>${l}</span></label>`).join('')}</div>
      <label class="finder__note"><span>Anything else? <span class="optional">(optional)</span></span><input name="note" maxlength="400" placeholder="e.g. first time in a studio, need it done by Friday"></label>
      <button class="btn btn--primary btn--lg" data-finder-go>Get my plan</button></fieldset>
  </form>
  <div class="finder__result" data-finder-result hidden aria-live="polite"></div>
</section>`,
  feedbackCta: () => `<a class="fb-cta reveal" data-i18n-scope href="/feedback" data-track="ecosystem_click" data-label="feedback_cta"><span class="ai-orb" aria-hidden="true"></span><span><strong>Free AI feedback on your demo</strong><span>Upload a song, get specific mix and performance notes in under a minute.</span></span><span class="fb-cta__go" aria-hidden="true">Try it →</span></a>`,
  memberSessions: () => `<ul class="member-sessions">${services.filter((s) => s.category === 'member-sessions' && s.slug !== 'visit-studio').map((s) => `<li><a href="/book?service=${s.slug}" data-track="book_cta_click" data-label="members_${s.slug}"><strong>${esc(s.name)}</strong><span>Members only · ${esc(fmtDuration(s.durationMinutes))}</span><span class="member-sessions__go" aria-hidden="true">Book →</span></a></li>`).join('')}</ul>`,
  rewardsUrl: () => ECO.find((e) => e.id === 'rewards').url,
  socialData: () => `<script type="application/json" id="social-data">${JSON.stringify({ instagram: social.instagram, facebook: config.social.facebook.url, instagramProfile: config.social.instagram.url, youtube: config.social.youtube.url, photos: (media.gallery || []).concat(media.studio || []) }).replace(/</g, '\\u003c')}</script>`,
  followButtons: () => `<div class="follow-row">${['instagram', 'facebook', 'youtube'].map((k) => `<a class="follow follow--${k}" href="${config.social[k].url}" target="_blank" rel="noopener" data-track="social_profile_click" data-label="${k}">Follow on ${k === 'youtube' ? 'YouTube' : k[0].toUpperCase() + k.slice(1)}<span class="sr-only"> (opens in a new tab)</span></a>`).join('')}</div>`,
  radioAppUrl: () => config.radio.appUrl,
  partners: () => `<section class="partners" aria-labelledby="partners-title"><div class="container"><h2 id="partners-title" class="partners__h">${esc(config.partners.heading)}</h2><ul class="partners__list">${config.partners.logos.map((l) => `<li class="partner" style="--pbg:${l.bg}"><img src="${l.src240 || l.src}"${l.src240 ? ` srcset="${l.src240} ${l.src240.includes('-160') ? 160 : 240}w, ${l.src} ${l.w}w" sizes="(min-width: 1024px) 140px, (min-width: 480px) 28vw, 40vw"` : ''} alt="${esc(l.name)}" width="${l.w}" height="${l.h}" loading="lazy" decoding="async"></li>`).join('')}</ul></div></section>`,
  rapProgram: () => { const r = ECO.find((e) => e.id === 'rap'); return `<section class="rap" aria-labelledby="rap-title"><div class="container rap__grid">
    <div class="rap__copy reveal"><p class="eyebrow">RAP Program</p><h2 id="rap-title" class="display-2">Create. Record. <em>Perform. Grow.</em></h2>
      <p class="lead">A music production program that helps young artists turn talent into professionally recorded music, creative projects and performance opportunities. It has its own packages and registration, separate from our Artist Development Program.</p>
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
  services: services.map((s) => ({ id: s.id, slug: s.slug, name: s.name, category: s.category, categoryLabel: s.categoryLabel, description: s.description, tagline: s.tagline, price: s.price, priceText: priceText(s), durationMinutes: s.hideDuration ? null : s.durationMinutes, bookUrl: s.bookUrl, featured: s.featured, primary: s.primary, purchase: s.purchase })),
};
await writeFile(path.join(dist, 'data/services.json'), JSON.stringify(publicCatalogue));

const gitDateFor = (files) => { try { const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', ...files], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null; } catch { return null; } };
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
  if (meta.schema === 'artistDevelopment') {
    const ad = config.artistDevelopment;
    const adFaq = (faqs.find((g) => g.group === 'Artist Development') || { items: [] }).items;
    jsonld.push({ '@context': 'https://schema.org', '@type': 'Service', '@id': `${SITE_URL}/artist-development#service`, name: ad.name, serviceType: 'Artist development and music production mentorship', description: 'Mentorship, creative guidance and practical music production education: music production, Logic Pro, GarageBand, MIDI equipment and recording and production techniques.', provider: { '@id': `${SITE_URL}/#business` }, areaServed: config.areaServed.map((n) => ({ '@type': 'Place', name: n })), url: `${SITE_URL}/artist-development`, offers: { '@type': 'Offer', name: ad.checkoutName, price: ad.amount.toFixed(2), priceCurrency: 'USD', url: ad.checkoutUrl, availability: 'https://schema.org/InStock' } });
    jsonld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: adFaq.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a.join(' ').replace(/<[^>]+>/g, '') } })) });
    jsonld.push({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` }, { '@type': 'ListItem', position: 2, name: 'Artist Development', item: `${SITE_URL}/artist-development` }] });
  }
  if (meta.schema === 'costGuide') {
    jsonld.push({ '@context': 'https://schema.org', '@type': 'Article', headline: meta.title, description: meta.description, dateModified: gitDateFor([`src/pages/${f}`]) || new Date().toISOString().slice(0, 10), author: { '@type': 'Organization', name: config.brand, url: 'https://discosundays.com/' }, publisher: { '@id': `${SITE_URL}/#business` }, mainEntityOfPage: `${SITE_URL}${meta.path}`, about: { '@id': `${SITE_URL}/#business` } });
    jsonld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: COST_FAQ.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a.join(' ').replace(/<[^>]+>/g, '') } })) });
  }
  if (meta.schema === 'guide') {
    jsonld.push({ '@context': 'https://schema.org', '@type': 'Article', headline: meta.title, description: meta.description, dateModified: gitDateFor([`src/pages/${f}`]) || new Date().toISOString().slice(0, 10), inLanguage: 'en-US', author: { '@type': 'Organization', name: config.brand, url: 'https://discosundays.com/' }, publisher: { '@id': `${SITE_URL}/#business` }, mainEntityOfPage: `${SITE_URL}${meta.path}`, isPartOf: { '@type': 'CollectionPage', name: 'Artist guides', url: `${SITE_URL}/guides` } });
    jsonld.push({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` }, { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE_URL}/guides` }, { '@type': 'ListItem', position: 3, name: meta.guideName || meta.title, item: `${SITE_URL}${meta.path}` }] });
  }
  if (meta.path === '/') jsonld.push({ '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${SITE_URL}/#website`, url: `${SITE_URL}/`, name: config.siteName, alternateName: `${config.siteName} by ${config.brand}`, publisher: { '@id': `${SITE_URL}/#business` }, inLanguage: ['en-US', 'es-US'] });
  if (meta.path === '/services') jsonld.push({ '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: services.map((s, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE_URL}/services/${s.slug}`, name: s.name })) });
  const html = layout({ ...meta, pathname: meta.path, body, jsonld });
  if (meta.path === '/404') await writeFile(path.join(dist, '404.html'), html);
  else { await writePage(meta.path, html); if (!meta.noindex) sitemap.push({ path: meta.path, sources: [`src/pages/${f}`, ...(meta.sources || [])], html }); }
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
    svcSlots: !s.purchase && s.price?.amount ? `<div class="svc-slots" data-slots="${s.slug}"></div>` : '',
    svcGuide: (() => { const g = /mix|master/.test(s.slug) ? ['/guides/mixing-vs-mastering', 'Mixing vs mastering: what each step does'] : /recording-session|membership-session|visit-studio/.test(s.slug) ? ['/guides/prepare-for-recording-session', 'How to prepare for a recording session'] : /membership/.test(s.slug) ? ['/recording-studio-cost-maryland', 'Is a membership cheaper? See the pricing guide'] : null; return g ? `<p class="svc-guide"><a href="${g[0]}">${g[1]} →</a></p>` : ''; })(),
    svcId: s.id,
    svcCategory: esc(s.categoryLabel),
    svcTagline: esc(s.tagline || ''),
    svcPrice: esc(priceText(s) || ''),
    svcDuration: esc(s.hideDuration ? 'Monthly' : fmtDuration(s.durationMinutes)),
    svcDurationLabel: s.hideDuration ? 'Billing' : 'Duration',
    svcActionHref: s.purchase ? s.purchase.url : `/book?service=${s.slug}`,
    svcActionAttrs: s.purchase ? `target="_blank" rel="noopener" data-track="membership_checkout_click" data-label="${esc(s.name)}"` : `data-track="book_cta_click" data-label="${esc(s.name)}"`,
    svcActionLabel: s.purchase ? esc(s.purchase.label) : (s.primary === 'recording' ? 'Book recording' : s.primary === 'mixing' ? 'Book mixing' : 'Book this service'),
    svcAsideTitle: s.purchase ? 'Become a member.' : 'Choose your appointment.',
    svcAsideText: s.purchase ? esc(s.purchase.note) : "Pick a date and time in the next step. You'll get an instant confirmation from Square.",
    svcVisual: s.image ? picture(s.image, { eager: true, sizes: '(min-width: 900px) 50vw, 100vw' }) : art(s.seed, { bars: 56 }),
    svcDescription: [s.description, ...(s.longDescription || [])].map((p) => `<p>${esc(p)}</p>`).join(''),
    svcIncludes: s.includes ? `<h2 class="h3">During your session</h2><ul class="ticks">${s.includes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '',
    svcOutcome: s.outcome ? `<p class="callout">${esc(s.outcome)}</p>` : '',
    svcVariations: s.variations?.length ? `<div class="variations"><h2 class="h3">Options</h2><p>Choose one of these options when you book. Pricing for each option is shown in the booking step.</p><ul class="pill-list">${s.variations.map((v) => `<li>${esc(v.name)}</li>`).join('')}</ul></div>` : '',
    svcTerms: s.membershipTerms ? `<details class="terms"><summary>Membership terms at a glance</summary><ul><li>Memberships are billed monthly and renew automatically unless canceled before the renewal date. Fees are non-refundable once charged.</li><li>Each membership includes a set number of studio hours per month. Hours must be used within the billing cycle and don't roll over unless agreed in writing.</li><li>Sessions are booked through the official Disco Sundays scheduling system. Booking priority and advance windows vary by tier, and availability isn't guaranteed.</li><li>Members are responsible for their conduct and for any damage to studio property.</li><li>Engineering, production, premium equipment and other add-ons may cost extra.</li></ul><p>The full terms are shown on the service in the booking step.</p></details>` : '',
    svcFaq: relevantFaqs.length ? `<section class="section section--tight"><div class="container narrow"><h2 class="h2">Questions about this service</h2>${faqList(relevantFaqs)}</div></section>` : '',
    svcRelated: relatedHtml,
    svcBookUrl: s.bookUrl,
    svcExtra: s.primary === 'membership' ? `<section class="section section--tight"><div class="container">${tokens.estimator()}</div></section>` : '',
  });
  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'Service', name: s.name, description: s.description, serviceType: 'Recording studio service', provider: { '@id': `${SITE_URL}/#business` }, areaServed: `${config.locality}, ${config.regionName}`, url: `${SITE_URL}/services/${s.slug}`, ...(typeof s.price?.amount === 'number' ? { offers: { '@type': 'Offer', price: (s.price.amount / 100).toFixed(2), priceCurrency: s.price.currency, url: `${SITE_URL}/book?service=${s.slug}` } } : {}) },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL + '/' }, { '@type': 'ListItem', position: 2, name: 'Services', item: `${SITE_URL}/services` }, { '@type': 'ListItem', position: 3, name: s.name, item: `${SITE_URL}/services/${s.slug}` }] },
  ];
  const html = layout({
    title: s.seoTitle || `${s.name} in Hanover, MD`,
    description: (s.seoDescription || s.description).slice(0, 158),
    pathname: `/services/${s.slug}`,
    body,
    jsonld,
    scripts: s.primary === 'membership' ? ['service.js', 'estimator.js'] : ['service.js'],
  });
  await writePage(`/services/${s.slug}`, html);
  sitemap.push({ path: `/services/${s.slug}`, sources: ['src/templates/service.html', 'data/services.json', 'content/services-editorial.json'], html });
}

// Static extras.
if (config.indexNowKey) await writeFile(path.join(dist, `${config.indexNowKey}.txt`), config.indexNowKey);
await writeFile(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
// Sitemap: lastmod = when that page's own source last changed (git history; falls back to the committed
// content/lastmod.json when the build machine has no git history). Images = real photos used on the page.
let lastmodCache = {}; try { lastmodCache = JSON.parse(await readFile(path.join(root, 'content/lastmod.json'), 'utf8')); } catch {}
const gitDate = gitDateFor;
const xmlEsc = (u) => u.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const lastmods = {};
const entries = sitemap.map(({ path: p, sources, html }) => {
  const d = gitDate(sources) || lastmodCache[p] || null; if (d) lastmods[p] = d;
  const imgs = [...new Set([...html.matchAll(/(?:src|content)="((?:https:\/\/www\.marylandrecordingstudio\.com)?\/assets\/photos[^"?\s]*\.(?:jpe?g|png|webp))/g)].map((m) => (m[1].startsWith('http') ? m[1] : SITE_URL + m[1])))].slice(0, 10);
  return `  <url><loc>${SITE_URL}${p === '/' ? '/' : p}</loc>${d ? `<lastmod>${d}</lastmod>` : ''}${imgs.map((u) => `<image:image><image:loc>${xmlEsc(u)}</image:loc></image:image>`).join('')}</url>`;
});
if (Object.keys(lastmods).length === sitemap.length) await writeFile(path.join(root, 'content/lastmod.json'), JSON.stringify(Object.fromEntries(Object.entries(lastmods).sort()), null, 1) + '\n');
await writeFile(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${entries.join('\n')}\n</urlset>\n`);
await writeFile(path.join(dist, 'site.webmanifest'), JSON.stringify({ name: config.siteName, short_name: 'Disco Sundays', start_url: '/', display: 'standalone', background_color: '#0a0a0b', theme_color: '#0a0a0b', icons: [{ src: '/assets/brand/icon-512.png', sizes: '512x512', type: 'image/png' }] }));

console.log(`[build] ${pageFiles.length} pages + ${services.length} service pages → dist/ (site URL ${SITE_URL})`);
