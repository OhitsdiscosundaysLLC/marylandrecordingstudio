# SEO log: marylandrecordingstudio.com

This is the running record of SEO work: what was done, the baseline, open items and next priorities. Add new entries at the top. Only record ranking or traffic changes when Search Console or analytics data shows them.

Google Business Profile: **out of scope; never edited.** The listing data (name, address, phone, place id, cid, rating) is used read-only, only to keep the website consistent with it.

## Baseline (2026-11-24)
- About 16 pages of the new site are indexed by Google, plus one legacy Shopify URL (`/products/...`). That URL now 308-redirects to /services.
- Google listing: "Disco Sundays, LLC", 5.0 from 23 reviews, Hanover MD 21076.
- Sitemap: 38 URLs. robots.txt allows crawling and points to the sitemap.
- Lighthouse, mobile, before this week's fixes: every page except the home page scored 98–100 on SEO, best practices and accessibility. The home page scored 84 because of layout shift (CLS 0.21) and a console error. Both have been fixed and re-measured; see the latest entry.
- There is no Search Console access yet, so there is no baseline for impressions, clicks or average position.

## Completed
| Date | Change | Why |
|---|---|---|
| 2026-11-24 | All 21 written Google reviews (verbatim, unfiltered, newest first, linked to the Google listing) rendered in the HTML of /, /services, /studio and /artist-development | Trust signals and fresh, unique on-page text for local intent. No review rich-snippet markup is used, because Google treats a business's own LocalBusiness reviews as self-serving |
| 2026-11-24 | Removed the home-page layout shift; fixed the language toggle's accessible name; `/api/reviews` and `/api/availability` return 200 when not configured | Core Web Vitals (CLS) and an error-free console |
| 2026-11-23 | New page /recording-studio-cost-maryland: real prices, sample budgets, estimator, FAQ, cited Peerspace market average | Targets "recording studio cost / prices Maryland / Baltimore" searches; Article and FAQPage schema |
| 2026-11-23 | Home title changed to "Recording Studio in Hanover, MD near Baltimore", with a new description | Puts primary local intent in the title |
| 2026-11-23 | WebSite schema on home. LocalBusiness schema gains streetAddress, geo, hasMap, parentOrganization (Disco Sundays) and sameAs (Google cid) | Entity consistency with the existing Google listing, read-only |
| 2026-11-23 | Canonical host is www. vercel.app and apex hosts redirect 308 to www | Avoids duplicate hosts |
| 2026-11-23 | Legacy Shopify paths `/products/*` and `/collections/*` redirect to /services; `/pages/*` and `/s/*` redirect to / | Recovers old indexed URLs |
| 2026-11-23 | IndexNow key and submission (HTTP 202) | Faster discovery on Bing and Yandex |
| 2026-11-23 | Descriptions written for thin member and AD session pages | Unique snippets |
| 2026-11-22 | /artist-development page with Service, FAQPage and BreadcrumbList schema; added to the nav; internal links from services, home and the pricing guide | New commercial page for "artist development Maryland" |
| 2026-11-22 | Free tools (release planner, hook starter, mix comparison, demo feedback) linked from the Explore menu and footer | Useful link-worthy assets; internal linking |

## Blocked: needs the owner
1. **Google Search Console.** Verify the domain property with a DNS TXT record at the domain registrar, then add the person doing SEO as a user. This doesn't touch the Business Profile. Without it there is no data on impressions or queries.
2. **Phone (NAP) consistency.** The site shows (443) 401-5425 and the Google listing shows (833) 559-7876. Decide which number the website should show, or confirm that both are intended.
3. **Bing Webmaster Tools.** Can be imported from Search Console once that is verified.
4. **Artist media permissions** (LeekOnnaComeUp, Lor Maud, Scuddle, Nana's video) for the AD spotlights and video SEO.

## Next priorities (in order)
1. Once Search Console is live: submit the sitemap, record baseline queries, and fix any coverage or indexing errors.
2. Service pages: add an "a session looks like…" section with real details only (equipment, process), each page answering one distinct question.
3. Citations: check that consistent NAP listings exist on Yelp, Apple Business Connect, Bing Places and music directories. Only claim listings the owner approves; do not create duplicates.
4. Digital PR: local Baltimore and Maryland music outlets, and features on artists the studio has worked with (with their permission).
5. Earn reviews through the honest post-session invite, once email is configured.
6. Each month: Lighthouse on the top pages, check for broken links, and review the Search Console query report for new page opportunities.
