# SEO log: marylandrecordingstudio.com

This is the running record of SEO work: what was done, the baseline, open items and next priorities. Add new entries at the top. Only record ranking or traffic changes when Search Console or analytics data shows them.

Google Business Profile: **out of scope; never edited.** The listing data (name, address, phone, place id, cid, rating) is used read-only, only to keep the website consistent with it.

## Baseline (2026-11-24)
- About 16 pages of the new site are indexed by Google, plus one legacy Shopify URL (`/products/...`). That URL now 308-redirects to /services.
- Google listing: "Disco Sundays, LLC", 5.0 from 23 reviews, Hanover MD 21076.
- Sitemap: 38 URLs. robots.txt allows crawling and points to the sitemap.
- Lighthouse, mobile, before this week's fixes: every page except the home page scored 98–100 on SEO, best practices and accessibility. The home page scored 84 because of layout shift (CLS 0.21) and a console error. Both have been fixed and re-measured; see the latest entry.
- There is no Search Console access yet, so there is no baseline for impressions, clicks or average position.

## 2026-11-25 (afternoon): ranking-improvement and authority campaign

### Verified status
- **Search Console Performance:** "Processing data, please check again in a day or so", with **no query data yet** (property verified this morning). Impressions, clicks and queries are not available, so none are reported.
- **Indexing:** before this morning's requests, 6 of the 10 key pages inspected were already "URL is on Google". `/services`, `/guides/mixing-vs-mastering` and `/guides/choose-recording-studio-near-baltimore` were not on Google, and the last two have since been queued. Google's daily request quota was reached; `/services` and the new guides are queued for tomorrow's follow-up (scheduled 2026-11-26 07:00 PT).
- **Bing:** 47 URLs submitted today (the 42 sitemap URLs plus the 5 new or updated pages). Bing Backlinks for our site says "No data available" (site added today).
- **Rankings:** last measured this morning (table above), not in the top 30 for any of the 8 target searches. Not re-measured this afternoon because no recrawl has happened yet; the next measurement is in tomorrow's follow-up.

### Why competitors outrank us (evidence)
1. **They are indexed with history; we were re-indexed today.** The old vercel.app copy still holds the Hanover #7 spot until Google processes the 308 and the noindex.
2. **Authority:** Omega has 163 referring domains and Stages 194 (top ones look spammy). The **beatable** ones are Wright Way (24) and Lineup Room (only 6, including wypr.org and studiorecord.world). Our verified referring domains: **0**.
3. **Exact-match titles and informational pages:** GDA ("Recording Studio in Maryland" title plus "What Is Mastering?"). We now have equivalent or deeper guides.
4. **Directory presence:** Yelp, Thumbtack, SoundBetter and Peerspace take many result slots. We appear only through the existing Yelp listing.

### Work completed this session (deployed and verified in production)
- **2 new link-worthy resources:** `/guides/release-checklist` (printable, save as PDF) and `/guides/logic-pro-garageband-for-beginners`. Logic Pro pricing was verified on Apple's App Store: Mac $199.99; iPad $4.99/mo or $49/yr. Both return 200 with correct titles, are linked from `/guides`, `/release-planner` and `/artist-development`, and were submitted to Bing.
- **Maryland relevance without fake locations:** the service area in the business details (`areaServed`) now includes Howard County and Maryland, and every service page uses the full list instead of just "Hanover, Maryland". No location pages were created.
- **Sitemap:** 44 URLs. Internal-link crawl: 0 broken links. Tests pass.
- **Backlink campaign files:**
  - `docs/backlink-prospects.csv`: **104 real prospects** (30 high priority), every one found via web search and checked.
  - `docs/outreach-messages.md`: **30 personalized messages**, **0 sent**, waiting for owner approval and a sending account.
  - `docs/backlink-acquisition-log.md`: baseline (**0 verified referring domains**), competitor gap analysis from Bing data, and **20 competitor-derived opportunities**.

### Ongoing ranking-improvement plan
| Cadence | Action |
|---|---|
| Daily, until all are indexed | Search Console URL inspection and requests (quota of about 10/day): `/services`, `/guides`, `/guides/release-checklist`, `/guides/logic-pro-garageband-for-beginners`, `/book`, `/faq`, `/contact`, then the service pages |
| Weekly (Monday) | Record the 8 target searches (Google, manual observation) plus Search Console queries, impressions and positions once available; check Bing rankings and backlinks; run the outreach batch from the acquisition log |
| Weekly | Check new referring domains (Bing Backlinks, Search Console Links) and verify each acquired link |
| Monthly | Lighthouse and broken-link audit, refresh prices and facts, improve one page per the top Search Console queries |
| Next content (when the data supports it) | Expand pages Search Console shows impressions for; no thin pages |

## 2026-11-25: SEO recovery campaign

### Search Console (actual data source; property owner seunakinloye01@gmail.com)
- **Property:** URL-prefix `https://www.marylandrecordingstudio.com/`, **verified 2026-11-25** with the HTML meta tag. The tag is permanent and lives in `site.config.json` → `googleSiteVerification`.
  - A Domain property wasn't possible: the domain's DNS is at GoDaddy (ns53/ns54.domaincontrol.com), and I have no access there. To add it later, put a Google TXT record in GoDaddy DNS.
- **Sitemap:** `sitemap.xml` submitted 2026-11-25. Status **Success**, 42 pages discovered.
- **URL inspection (2026-11-25):**
  - `/`: URL is on Google, page indexed, HTTPS. **Indexing requested** (priority crawl queue).
  - `/artist-development`: URL is on Google, page indexed. **Indexing requested.**
  - Indexing requested 2026-11-25, each confirmed with "URL was added to a priority crawl queue":
    - Already on Google: `/services/mixing`, `/services/mastering`, `/recording-studio-cost-maryland`, `/studio`, `/guides/prepare-for-recording-session`.
    - Not yet on Google (new pages): `/guides/choose-recording-studio-near-baltimore`, `/guides/mixing-vs-mastering`.
  - `/services`: **URL is not on Google** (no last crawl). The request hit Google's daily quota ("Quota Exceeded"), so retry on 2026-11-26. The page is in the submitted sitemap, so Google can find it there meanwhile.
  - Running total: **9 pages queued for priority crawl** (/, /artist-development and the 7 above).
- Performance and Indexing reports say "Processing data", as expected for a property verified today. There are no impressions or clicks figures yet.

- **Users:** ohitsdiscosundays@gmail.com added as an **Owner** on 2026-11-25, with the owner's approval.
- **Follow-up:** a reminder is scheduled for 2026-11-26 07:00 PT to request indexing for `/services`, `/guides` and others once the daily quota resets.

### Manually observed rankings (Firecrawl Google results, top 30, 2026-11-25; not Search Console data)
| # | Search | Location | www.marylandrecordingstudio.com | Notes |
|---|---|---|---|---|
| 1 | recording studio Hanover MD | Hanover | not in top 30 | **#7 is the old vercel.app copy** (now 308 + noindex, waiting for recrawl). Linktree #5, Yelp list incl. Disco Sundays #3 |
| 2 | recording studio near Baltimore | Baltimore | not in top 30 | Stages Music Arts, BCPL, Wright Way, Lineup Room lead |
| 3 | Maryland Recording Studio | Maryland | not in top 30 | Omega #1, **GDA Productions (Millersville, near Hanover) #2**, Commodore uses the phrase in its title |
| 4 | recording studios Maryland | Maryland | not in top 30 | Omega, Stages, Wright Way |
| 5 | music recording studio near me | Hanover | not in top 30 | Results not localized in this tool; use Search Console and the Maps pack instead |
| 6 | music mixing services Maryland | Maryland | not in top 30 | SoundBetter and Thumbtack directories rank high |
| 7 | music mastering Maryland | Maryland | not in top 30 | GDA ranks with an informational page, "What Is Mastering?" |
| 8 | artist development Maryland | Maryland | not in top 30 | **Weak competition:** results are visual-arts grants, with no music studio in the top 30 |

### Competitor observations
- **GDA Productions (Millersville):** the closest geographic competitor. Wins with "Recording Studio in Maryland" in its title plus informational pages ("What Is Mastering?"). The new mixing vs mastering guide answers the same intent more completely, with prices and file specs.
- **Omega (Rockville):** the strongest authority (multi-studio plus an engineering school). Hard to beat statewide; the realistic local wins are Hanover, Anne Arundel and "near Baltimore".
- **Directories** (Yelp, Thumbtack, SoundBetter, Peerspace) take many Maryland results. Being listed on them, with consistent details, is a legitimate way to appear.
- **"artist development Maryland"** has no music competitor, so `/artist-development` is the best near-term opportunity once Google recrawls it.

### Keyword-to-page map (one destination per intent)
| Intent | Page |
|---|---|
| recording studio Hanover MD / Maryland Recording Studio / recording studios Maryland | `/` (title: "Recording Studio in Hanover, MD near Baltimore") |
| recording studio near Baltimore (commercial) | `/` ; informational: `/guides/choose-recording-studio-near-baltimore` |
| music mixing services Maryland | `/services/mixing` (title now "Music Mixing Services in Maryland (Hanover, MD)") |
| music mastering Maryland | `/services/mastering` (title now "Music Mastering in Maryland (Hanover, MD)") |
| mixing vs mastering (informational) | `/guides/mixing-vs-mastering` (links to both service pages) |
| artist development Maryland | `/artist-development` |
| recording studio cost/prices Maryland | `/recording-studio-cost-maryland` |
| prepare for recording session / vocal prep | `/guides/prepare-for-recording-session` |
| recording studio membership | `/services/unlimited-membership` (title now "Unlimited Recording Studio Membership in Maryland") |
| release planning | `/release-planner` |

### Technical fixes, deployed and verified in production on 2026-11-25
- **Official phone +1 (833) 559-7876 everywhere** on the site:
  - `site.config.json`, contact page, contact form errors, FAQ, AI handoff default, and the live AI settings row in Supabase.
  - Every page now carries `tel:`/`sms:` `+18335597876`, and the schema telephone is `+18335597876`.
  - Production scan of all 42 sitemap URLs: no 443/410 numbers anywhere.
- **Sitemap:**
  - All 42 URLs return 200 and are self-canonical; the XML is valid and has no vercel.app references.
  - `lastmod` now uses each page's real last change (from git history, falling back to `content/lastmod.json`).
  - The image sitemap namespace is ready, but there are no first-party photos (`/assets/photos` is empty), so there are no image entries. Video isn't justified either: the videos are YouTube embeds loaded by script.
- **robots.txt:** allows all except `/api/` and references `https://www.marylandrecordingstudio.com/sitemap.xml`.
- **Redirects, all single-hop 308:**
  - vercel.app, apex and http go to `https://www.`; a trailing slash goes to the page without it.
  - Legacy Shopify paths: `/products/*` and `/collections/*` → `/services`; `/pages/contact|about|services|gallery|projects|remote-mixing|faq` → the matching page; `/blogs/*` and `/policies/*` → discosundays.com; `/cart` → `/book`; `/account` → `/members`.
- **The `*.vercel.app` host sends `X-Robots-Tag: noindex`**, so the old copy drops out of Google.
- **New content:** `/guides` hub plus 3 guides (session prep, mixing vs mastering, choosing a studio near Baltimore), each with Article and BreadcrumbList schema.
  - Each guide links to the matching service; service pages link back to their guide.
  - "Artist guides" added to the Explore menu and footer.
- **Fact check:** the Peerspace Baltimore average was re-verified at **$69/hr** (it was $71 earlier) and updated on the pricing guide.
- **IndexNow:** all URLs resubmitted earlier (HTTP 200). Bing Webmaster Tools isn't connected yet; it can import the verified Search Console property in one click.

### Business information audit (read-only)
- **Google Business Profile** (read-only, not edited): shows (833) 559-7876, which **matches** the site now.
- **Linktree:** shows no phone number. It lists the Unlimited membership at **$150/month** versus $200 on Square and the site. This is the owner's to fix; I didn't touch it.
- **Yelp:** a "Disco Sundays" listing appears in the Hanover results. Its phone wasn't checked because Yelp needs the browser.

### Backlink and digital PR opportunities (legitimate, owner action)
1. Directory listings with consistent name, address and phone, claimed by the owner: Yelp (exists), Apple Business Connect, Bing Places (can import from Google), Thumbtack, SoundBetter, EngineEars, StudioRecord.world (lists 170 MD studios), Peerspace.
2. Features on artists who recorded here, with their permission, such as Jason Geise's "Houston 2 El Paso" EP.
3. Baltimore music outlets and community groups that compile studio lists (for example independentradio.fm's Baltimore studio list).

### Next steps
1. On 2026-11-26, request indexing for `/services` and `/guides` (daily quota), then `/book`, `/faq` and `/contact`.
2. ~~Bing Webmaster Tools~~: done on 2026-11-25. The property was imported from Google Search Console, so it's verified and the sitemap came with it. **All 42 sitemap URLs were submitted** through URL Submission ("Success: 42 URLs submitted successfully"; quota 100/day).
3. Re-check this table weekly, and record Search Console impressions and positions once its data appears (about 2 to 3 days).

## Ranking check (2026-11-24, Google results via public search, top 20)
| Search | Location | Where we appear |
|---|---|---|
| recording studio Hanover MD | Hanover | #7, but as the old **marylandrecordingstudio.vercel.app** copy (now 308-redirects to www). Linktree is #5, Yelp list (includes Disco Sundays) #3 |
| recording studio near Baltimore | Baltimore | not in top 20 |
| Maryland Recording Studio | Maryland | not in top 20 (competitors with "Maryland Recording Studio" in their titles rank) |
| site:marylandrecordingstudio.com | — | 16 www pages indexed; home snippet is still the OLD description; 1 old Shopify product URL (now 308) |

Notes: discosundays.com (Shopify) does not link to marylandrecordingstudio.com. The Google listing's website field points to linktr.ee/discosundays (owner decision; listing not touched). IndexNow resubmitted 38 URLs (HTTP 200).

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
1. ~~Google Search Console~~: URL-prefix property verified and sitemap submitted on 2026-11-25. Still open: a Domain property via a GoDaddy TXT record. Original note: Verify the domain property with a DNS TXT record at the domain registrar, then add the person doing SEO as a user. This doesn't touch the Business Profile. Without it there is no data on impressions or queries.
2. ~~Phone (NAP) consistency~~: resolved on 2026-11-25. The site uses +1 (833) 559-7876, matching the Google listing.
3. **Bing Webmaster Tools.** Can be imported from Search Console once that is verified.
4. **Artist media permissions** (LeekOnnaComeUp, Lor Maud, Scuddle, Nana's video) for the AD spotlights and video SEO.

## Next priorities (in order)
1. Once Search Console is live: submit the sitemap, record baseline queries, and fix any coverage or indexing errors.
2. Service pages: add an "a session looks like…" section with real details only (equipment, process), each page answering one distinct question.
3. Citations: check that consistent NAP listings exist on Yelp, Apple Business Connect, Bing Places and music directories. Only claim listings the owner approves; do not create duplicates.
4. Digital PR: local Baltimore and Maryland music outlets, and features on artists the studio has worked with (with their permission).
5. Earn reviews through the honest post-session invite, once email is configured.
6. Each month: Lighthouse on the top pages, check for broken links, and review the Search Console query report for new page opportunities.
