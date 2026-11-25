# Responsive audit and repair (15 Nov 2026)

Method: **audit → diagnose → repair → verify**, measured with Playwright (Chromium) against the production build using the site's real (now self-hosted) fonts. The audit tool is `scripts/audit/responsive_audit.py`; re-run it after any layout change.

## Scope

- **14 routes**: `/`, `/studio`, `/services`, 2 service pages (`crash-test-artist-evaluation`, `creator-membership-200`, the longest name), `/book`, `/book?service=…`, `/gallery`, `/radio`, `/explore` (App, Rewards and RAP Program showcases), `/about`, `/contact`, `/faq`, 404.
- **25 viewports**: 320, 344, 360, 375, 390, 393, 414, 430, 480, 540, 640, 768, 820, 912, 1024, 1100, 1280, 1366, 1440, 1600, 1920 wide, plus landscape 667×375, 844×390, 932×430 and 1180×820. That makes **350 route×viewport checks**.
- **Shared components reviewed (24)**: header/brand, desktop nav, Explore dropdown, mobile menu, sticky Book CTA, radio mini player, footer, container, page hero, hero + quick-book card, marquee, partners row, manifesto list, service rows, service cards + catalogue filters/search, service page hero/facts/aside, booking picker + Square panel, social feed tiles, gallery wall + lightbox, radio player, ecosystem cards, App/Rewards/RAP showcases (phone + browser frames), forms, FAQ accordion.
- **Interaction states**: mobile menu open (320×640, 390×844, 820×1180), Explore dropdown (1280+), booking service selection, catalogue filters.

For each check the tool records `innerWidth`, `clientWidth` and `scrollWidth` with any `overflow-x` concealment switched off, plus:

- elements whose edges leave the viewport and aren't clipped by an ancestor;
- elements wider than their parent's content box;
- text overflowing its own box;
- touch targets under 44×44 at phone widths;
- text under 13px;
- console errors.

## Findings and exact causes

| # | Problem | Where | Exact cause |
|---|---|---|---|
| 1 | **Menu button off-screen** (partly or fully), 112 occurrences | Every page, 320–430px | `.brand { flex-shrink: 0 }` kept the logo and one-line title at its full width (359px) inside a 335px header. `.menu-toggle` could shrink, so it was squeezed to 32px and pushed past the right edge. The header is `position: fixed`, so this never made the page scroll sideways, which is why earlier scroll-width checks missed it. |
| 2 | Header invisible over light background | `/explore`, all widths | The transparent header (white text) sits over the cream first section. |
| 3 | Overflow was being concealed | Global | `body { overflow-x: hidden }` would hide any future overflow instead of exposing it. |
| 4 | Breakpoint conflict | `/explore` at ≤760px | The phone `.section { padding }` rule came later in the file and overrode `.eco-section--page`'s top padding, so the logo slid under the header. |
| 5 | Oversized tiles at small desktop | Partners row at 901–1024px | The 3-column breakpoint was set at 1024px, so tiles grew to about 300px wide. |
| 6 | Long email didn't wrap | FAQ at 320px | No `overflow-wrap` on body text. |
| 7 | Touch targets under 44px (1,833 flags) | Footer links (36px), `.link-arrow` (33px), radio volume slider (16px), "Open Radio Drops" and booking "Open in a new tab" links (23px), gallery "Expand" (36px), follow buttons (43px), header brand (36–40px), "See all services" (24px) | Inline links with small padding; a native range input; small button heights. |
| 8 | Text under 13px (3,800 flags) | Eyebrows, footer headings, card labels, badges, level ladder, RAP labels | Label sizes set at .68–.8rem. |
| 9 | Menu legibility | Mobile menu | A 96%-opaque background let hero text show through. A short phone screen cut the ecosystem list with no cue that it scrolls. The phone number wrapped at 320px. |

## Repairs (all in `assets/css/site.css` unless noted)

1. Header: `.brand` is now `flex: 0 1 auto; min-width: 0` with a `min-width: 0` text column. The title uses fluid `clamp()` sizing and may wrap to two lines. `.menu-toggle` is `flex: none` (always 46×46). The gap is fluid. Duplicate brand rules were removed.
2. `/explore` gets `bodyClass: page-light-top` (`src/pages/explore.html`), giving the header its own dark surface.
3. `body { overflow-x: hidden }` removed. Re-measured: zero overflow without it.
4. `.section.eco-section--page` raises specificity so the page's top padding survives the phone section rule.
5. Partners switch to 3 columns at ≤900px instead of ≤1024px.
6. `p, li, dd, figcaption { overflow-wrap: break-word }`.
7. 44px minimum height for footer links, `.link-arrow` (now an underline, not a padded border), radio and booking external links, the range input, "Expand", follow buttons, the brand link and "See all services".
8. Labels raised to at least 13px (`.8125rem`). Count badges and fine print stay at 12–12.5px by design.
9. Solid mobile menu background, a scroll fade on the nav list, and a non-wrapping 44px phone link.

Other files:

- `scripts/build.mjs` now inlines the self-hosted fonts from `assets/fonts/`, vendored by `scripts/vendor-fonts.mjs` through a GitHub Action. The build no longer fetches fonts at build time, and local tests render with the exact production fonts.
- New `scripts/audit/responsive_audit.py` (the audit tool).

## Results

| Metric (350 checks) | Before | After |
|---|---|---|
| Pages that scroll sideways (concealment disabled) | 0 | 0 |
| Elements outside the viewport (unclipped) | 112 | **0** |
| Elements wider than their parent | 43 | **0** |
| Text overflowing its box | 1 | **0** |
| Touch-target flags (≤480px) | 1,833 | 126 (all short footer words like "FAQ": 44px tall, 33px wide) |
| Text-under-13px flags | 3,800 | 401 (count badges, the "Live 24/7" badge, fine print) |
| Console errors | 0 | 0 |

## Screenshots

In this folder, cropped to the first 2,400px of each page:

- `320px-all-routes.jpg` … `1920px-all-routes.jpg`: all 12 main routes side by side at each of the 10 regression widths;
- `menus.jpg`: mobile menu at 320, 390 and 820, and the Explore dropdown at 1280.

Third-party content (Square booking, Instagram/Facebook embeds, YouTube thumbnails, the radio's now-playing text) can't load in the offline test environment, so those areas show placeholders in these images. They were verified separately on the live site.

## Remaining

- Third-party embeds have their own internal layouts. The Square panel is a full-width iframe (82vh on phones), Instagram embeds are fixed-height tiles, and the Facebook plugin is capped at 500px wide. None of them overflow.
- Short footer text links are 33px wide (44px tall). That's above the WCAG 2.2 AA 24px minimum.
