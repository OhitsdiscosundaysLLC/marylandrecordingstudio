# Bring a Friend referrals for Disco Rewards: implementation plan (awaiting approval)

Status: **planned, not built in the Rewards app**. The live Rewards app was not changed.

## What was inspected (read-only, 24 Nov 2026)
- Public Rewards site `https://disco-sundaysllc-club.base44.app/`: says points are earned on bookings, renewals,
  performances and **referrals**; levels are Newcomer 0–99, Studio Regular 100–299, Studio Insider 300–599,
  Disco VIP 600–999, Disco Legend 1000+. It does not publish how many points a referral earns.
- The Base44 account connected to this workspace does **not** contain the Rewards app (it lists PLAYVERSE,
  CEFAS Live Bible Competition, EmmaForYou and Billionaire Mind Team Canva Certification). The Rewards app's
  database, member accounts and point rules could therefore not be inspected.

## What I need from you
1. Access to the Rewards app (connect the Base44 account that owns `disco-sundaysllc-club`, or add the
   connected account as a collaborator).
2. The existing referral rule: points per qualifying referral, and what counts as qualifying (first paid
   booking? membership purchase? minimum spend?).
3. Approval to make the changes below in the Rewards app.

## Proposed design (extends Disco Rewards; no separate rewards system)
1. **Referral code per member**: a short, unique code stored on the existing member record
   (`referral_code`), generated once and never reused.
2. **Share link**: `https://www.marylandrecordingstudio.com/r/<code>`. The website already has the
   infrastructure for this. The link sets a 60-day first-party attribution cookie and sends the friend to the
   booking page. Share buttons for text message, WhatsApp, Instagram DM (copy) and email.
3. **Attribution**: a new `Referral` entity in the Rewards app: referrer, friend email/phone (hashed), status
   (`clicked`, `signed_up`, `booked`, `qualified`, `rewarded`, `rejected`), the Square booking ID and timestamps.
4. **Qualification from Square, not from clicks**: points are awarded only when Square shows a completed,
   paid booking or membership for the friend that meets your existing rule. This needs a Square access token
   (`SQUARE_ACCESS_TOKEN`), which is the same one used for live availability.
5. **Fraud prevention**:
   - No self-referrals (same email, phone or Square customer).
   - One reward per friend.
   - Reward only on the first qualifying booking.
   - A 7-day hold before points post, so refunds and cancellations can be caught.
   - Velocity limits per referrer.
   - Flags for review in the admin view.
6. **Member dashboard**: the member's link, referrals by status and points earned, in the existing Rewards
   portal.
7. **Admin view**: all referrals, attribution, points awarded and flagged activity, plus approve and reject
   actions.
8. **Data safety**:
   - Existing balances and records stay untouched; new fields and entities are additive.
   - Points are written with an idempotency key (`referral:<id>`), so a referral can never be paid twice.

## Rollout
Build it on a Base44 branch, test with labelled test accounts, show you the result, then deploy only after
your approval.
