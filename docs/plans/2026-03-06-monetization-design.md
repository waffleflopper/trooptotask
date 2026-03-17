# Monetization Design — Organization-Based Personnel-Capped Tiers

**Date**: 2026-03-06
**Status**: Approved

## Overview

Subscription-based monetization tied to organizations, with personnel count as the sole gating mechanism. All features available on all tiers. Existing billing code is removed and replaced from scratch.

## Tier Structure

|                        | Free      | Team ($15/mo) | Unit ($30/mo) |
| ---------------------- | --------- | ------------- | ------------- |
| Personnel cap          | 15        | 80            | Unlimited     |
| Orgs owned             | 1         | 1             | Unlimited     |
| Features               | All       | All           | All           |
| Bulk data exports/mo   | 3         | Unlimited     | Unlimited     |
| Per-page CSV/PDF/Excel | Unlimited | Unlimited     | Unlimited     |

- Subscription lives on the **organization**, not the user account.
- The org owner (creator) is the billing contact.
- An org with no active subscription defaults to Free tier.
- Any user can be a **member** of unlimited orgs regardless of their own org's tier. The org's plan covers everyone working in it.

## Subscription Lifecycle

```
[No subscription] → Free tier (default)
        ↓
[Subscribe via Stripe] → Active (Team or Unit)
        ↓
[Payment fails / cancels] → Immediately lapsed (no grace period)
        ↓
  If over personnel cap → Read-Only mode
  If under cap → Back to Free tier
```

### Gifted Subscriptions

```
[Admin gifts tier + duration] → Gifted (active, with expiry date)
        ↓
[14 days before expiry] → Warning banner
        ↓
[3 days before expiry] → Urgent warning banner
        ↓
[Gift expires] → Lapsed (read-only if over cap, free if under)
```

## Effective Tier Resolution

The system checks in priority order:

1. **Active Stripe subscription** — if exists, use that tier
2. **Active gift** — if gift tier >= sub tier, gift wins and Stripe is paused (no charges). If gift tier < sub tier, sub wins and gift is irrelevant.
3. **Free** — fallback when neither exists

```
getEffectiveTier(org) → { tier, source, isReadOnly, personnelCap }
```

### Gift + Subscription Interaction

- Gift >= sub tier → Stripe subscription **paused**, no charges until gift expires
- Gift < sub tier → Gift irrelevant, subscription charges normally
- No subscription + gift → Gift controls tier; falls to free on expiry
- This means gifting is a genuine reward — the user isn't charged while the gift covers them

## Read-Only Mode

Triggered when an org's personnel count exceeds its effective tier's cap (on lapse or downgrade).

**Blocked in read-only:**

- Creating/editing/deleting: availability, training records, counseling records, assignments, onboarding steps, calendar events
- Creating/editing: org settings, types (status types, training types, etc.)

**Allowed in read-only:**

- Viewing all data (calendar, personnel, training, etc.)
- Deleting personnel (to get under cap)
- Bulk data export ("Export All Org Data")
- Subscribing/upgrading to reactivate

## Banners

Three banner types shown at top of every org page:

1. **Gift expiring (14 days)**: Yellow/info — "Your complimentary [Team/Unit] plan expires in X days. Set up a subscription to keep your data."
2. **Gift expiring (3 days)**: Red/urgent — "Your complimentary plan expires in 3 days. Subscribe now or your org will be limited to [15/80] personnel."
3. **Read-only mode**: Red/blocking — "Your org has [X] personnel but your current plan allows [15/80]. Your data is read-only. Subscribe, remove personnel, or export your data." CTAs: Subscribe, Manage Personnel, Export Data.

## Admin Gifting

Platform admin panel (in `/admin`):

- Gift a tier to any org: select org → choose tier → set duration → apply
- View active gifts with expiry dates
- Revoke or extend gifts at any time
- Stored as: `gift_tier`, `gift_expires_at`, `gifted_by` on the org/subscription record

## Data Export

**"Export All Org Data"** in org settings:

- Bundles all org data into downloadable archive (JSON/CSV zip)
- Rate-limited: 3/month on Free tier, unlimited on paid
- Tracked via `data_exports` table

**Per-page exports** (CSV, PDF, Excel) remain unlimited on all tiers — these are not bulk exports.

## Personnel Cap Enforcement

- Server-side: every mutating API route/form action checks `isReadOnly` and `personnelCap`
- Client-side: UI disables buttons/forms when read-only, shows upgrade prompts when at cap
- Adding personnel (manual or bulk import): check count against cap, block if at/over, show upgrade prompt

## Billing Feature Flag

**`PUBLIC_BILLING_ENABLED`** environment variable:

- `false` (default): all billing UI hidden, all orgs treated as unlimited tier. No upgrade prompts, no subscription pages, no banners.
- `true`: full billing system active with tier enforcement, Stripe integration, banners, etc.

This allows the entire monetization system to be built and tested without affecting production users until ready.

## Stripe Integration

- **Stripe Checkout**: redirect to Stripe-hosted payment page, return to app on success/cancel
- **Stripe Customer Portal**: manage/cancel subscription (Stripe-hosted, linked from org settings)
- **Webhook endpoint**: handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- **Two Stripe Price IDs**: Team monthly, Unit monthly
- **Stripe Customer**: created per org (not per user)

## Migration Plan

1. Remove all existing billing code (old Stripe integration, subscription store, billing routes, feature gating)
2. Build new system from scratch following this design
3. Deploy with `PUBLIC_BILLING_ENABLED=false`
4. Test with `PUBLIC_BILLING_ENABLED=true` in staging
5. Flip to `true` in production when ready

## Database

- Subscription data on orgs: `stripe_subscription_id`, `stripe_customer_id`, `tier`, `status`, `current_period_end`
- Gift fields: `gift_tier`, `gift_expires_at`, `gifted_by`
- `data_exports` table: `org_id`, `created_at`, `status`, `file_path`
- RLS policies to protect subscription data

## Rule for Future Features

**All new features must be personnel-cap-aware.** Any feature that creates, modifies, or manages data within an org must respect the read-only state and personnel cap enforcement. No feature should exist outside the tier/billing system.
