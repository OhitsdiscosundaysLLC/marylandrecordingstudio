# Maryland Recording Studio · Disco Sundays

The website for Disco Sundays LLC's recording studio in Hanover, MD: a dark, cinematic, mobile-first site with a full service catalogue and booking embedded from Square Appointments.

**Square is the source of truth.** Service names, prices, durations, availability, payments and confirmations all come from Square. The site never shows a booking it can't complete.

## Pages

| Route | What it is |
|---|---|
| `/` | Home: hero, why us, studio bento, featured services, Crash Test story, YouTube, FAQ, booking CTA |
| `/studio` | The studio and the membership paths |
| `/services` | Full catalogue with category filters, search, and deep links (`/services#other`, `?q=artist`) |
| `/services/<slug>` | One page per Square service, generated at build time (price, duration, options, terms, related services, FAQ) |
| `/book` | Embedded Square booking. `?service=<slug>` or `?id=<SquareItemId>` opens that service directly |
| `/gallery` | YouTube videos plus studio photos from `content/media.json` |
| `/social` | Unified wall with All / Instagram / Facebook / YouTube filters |
| `/about`, `/contact`, `/faq` | Story, contact form + phone/email/map, FAQ (with FAQPage schema) |

## How booking works

Every service links to its own Square booking URL (`https://book.squareup.com/appointments/fk5phm6o38fjpy/location/LBRQ3J5MYKNYX/services/<itemId>`). The `/book` page shows the service list and embeds that official Square page in a panel, so customers pick a time, enter details, pay any deposit and get Square's confirmation without leaving the site. The selected service is kept in the URL, so refresh, Back and shared links work. If a browser blocks the embed, a "Continue booking in a new tab" fallback appears after 12 seconds, and an "Open in a new tab" link is always visible.

## Keeping services in sync

- `data/services.json` is a snapshot of the Square catalogue (taken from the public booking page on 15 Nov 2026).
- With `SQUARE_ACCESS_TOKEN` set, every build runs `scripts/sync-square.mjs`, which pulls the live catalogue from the Square Catalog API and regenerates the service pages. `/api/services` also serves the live catalogue (cached for 5 minutes), and the services page and service pages update prices and flag removed services between deploys. New services appear in the catalogue straight away with a working booking button, and get their own page on the next deploy.
- To rebuild automatically when Square changes, create a Vercel Deploy Hook and call it on a schedule, or redeploy after editing services.
- `content/services-editorial.json` adds things Square doesn't hold, keyed by Square item ID: URL slug, featured flag, tagline, SEO description and image. Never put prices there.

## Photos and video

There's no stock photography. Until real photos are added, the site uses generated brand artwork in the logo's colours. To add real media:

1. Put files in `assets/photos/` (WebP or AVIF at about 2000px wide is ideal).
2. List them in `content/media.json`: `hero.image` / `hero.video` (MP4, which only plays on larger screens and never with reduced motion), `studio[]` for the bento grid (`{ "src": "/assets/photos/control-room.webp", "alt": "...", "caption": "..." }`), and `gallery[]`.
3. Optionally set `"image"` on a service in `content/services-editorial.json`.

## App, Rewards and RAP Program screenshots

The Explore page and homepage show real screenshots of the Disco Sundays App, Disco Rewards and the RAP Program. They're captured with Playwright by `scripts/capture-ecosystem.mjs`, which runs in GitHub Actions (**Actions → Capture ecosystem screenshots → Run workflow**) and commits:

- `assets/ecosystem/<app|rewards|rap-program>/*.webp|.avif`: optimised images used by the site (phone captures at 3× pixel density, desktop at 2×)
- `media-originals/ecosystem/**.png`: full-resolution originals (not deployed)
- `content/ecosystem-shots.json`: the manifest the build reads (alt text, sizes, source URL)

Re-run the workflow whenever those apps change. Login-only screens, such as the Rewards member dashboard, aren't captured.

## Environment variables

See `.env.example`. Everything works without them; each one turns on a live integration.

| Variable | Turns on |
|---|---|
| `SQUARE_ACCESS_TOKEN` | Live catalogue sync (Square Developer Dashboard, production token, `ITEMS_READ`) |
| `RESEND_API_KEY`, `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL` | Contact form email delivery. Without them the form says it can't send and points to phone/email; it never fakes success |
| `INSTAGRAM_ACCESS_TOKEN` | Real Instagram posts on the social wall (Business/Creator account, `instagram_business_basic`). Without it the wall shows a link to @discosundays |
| `YOUTUBE_API_KEY` | Optional. The public channel feed already provides the latest 15 videos |
| `SITE_URL` | Canonical URLs, sitemap and Open Graph links |

Analytics: set `analytics.plausibleDomain` or `analytics.ga4MeasurementId` in `site.config.json`. Booking clicks, service card clicks, Square visits, form submissions, phone, email and social clicks, and video plays are already pushed to `window.dataLayer`.

## Develop

Node 18+ is required, and the project has no npm dependencies.

```bash
npm run dev     # build + preview at http://localhost:3000 (API functions included)
npm test        # build, crawl every page, check SEO tags, links, deep links and APIs
```

## Deploy (Vercel)

1. Import the GitHub repo in Vercel. `vercel.json` sets the build command (`npm run build`), output (`dist`), clean URLs, caching and security headers.
2. Add the environment variables above.
3. Add your domain, and set `SITE_URL` to it.

Other static hosts will serve `dist/` fine, but the contact form, live Square sync and social feeds need the `api/` functions (Vercel or a compatible Node runtime).
