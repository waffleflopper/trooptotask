# Monetization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the existing user-based billing system with an organization-based, personnel-capped subscription model using Stripe, gated behind `PUBLIC_BILLING_ENABLED`.

**Architecture:** Subscriptions live on organizations (not users). Three tiers — Free (15 personnel), Team (80), Unit (unlimited) — with all features available at every tier. A `getEffectiveTier()` function resolves the org's current tier from Stripe subscription, admin gift, or free fallback. Read-only mode activates when an org exceeds its tier's personnel cap. Admin gifting pauses Stripe billing when the gift tier >= subscription tier.

**Tech Stack:** SvelteKit 2.5, Svelte 5 (runes), TypeScript, Supabase (Postgres), Stripe (Checkout + Customer Portal + Webhooks), Vercel

**Design doc:** `docs/plans/2026-03-06-monetization-design.md`

---

## Phase 1: Remove Old Billing System

### Task 1: Remove old billing database tables and functions

**Files:**

- Modify: `supabase/schema.sql`
- Create: `supabase/migrations/20260306_remove_old_billing.sql`

**Step 1: Create migration to drop old tables**

Create `supabase/migrations/20260306_remove_old_billing.sql` with:

```sql
-- Remove old billing system (user-based subscriptions)

-- Drop RLS policies first
DROP POLICY IF EXISTS "Users can read their own subscription" ON user_subscriptions;
DROP POLICY IF EXISTS "Platform admins can read all subscriptions" ON user_subscriptions;
DROP POLICY IF EXISTS "Anyone can read active plans" ON subscription_plans;
DROP POLICY IF EXISTS "Users can read their own payment history" ON payment_history;
DROP POLICY IF EXISTS "Admins can read all payment history" ON payment_history;
DROP POLICY IF EXISTS "Only admins can read webhook events" ON stripe_webhook_events;

-- Drop trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS create_default_subscription();

-- Drop RPC functions
DROP FUNCTION IF EXISTS get_user_subscription(uuid);
DROP FUNCTION IF EXISTS grant_subscription(uuid, text, integer, integer, integer);
DROP FUNCTION IF EXISTS extend_user_trial(uuid, integer);
DROP FUNCTION IF EXISTS update_admin_notes(uuid, text);
DROP FUNCTION IF EXISTS is_platform_admin();

-- Drop tables (order matters for foreign keys)
DROP TABLE IF EXISTS payment_history;
DROP TABLE IF EXISTS stripe_webhook_events;
DROP TABLE IF EXISTS admin_audit_log;
DROP TABLE IF EXISTS user_subscriptions;
DROP TABLE IF EXISTS subscription_plans;
-- Keep platform_admins table — we'll reuse it for admin gifting
```

**Step 2: Update schema.sql**

Remove the table definitions, RLS policies, functions, and triggers for the dropped tables from `supabase/schema.sql`. Keep the `platform_admins` table and `is_platform_admin()` function.

**Step 3: Verify and commit**

```bash
npm run check && npm run build
git add supabase/
git commit -m "chore: remove old user-based billing tables and functions"
```

---

### Task 2: Remove old billing application code

**Files:**

- Delete: `src/routes/billing/` (entire directory)
- Delete: `src/routes/api/webhooks/stripe/+server.ts`
- Delete: `src/routes/admin/revenue/` (entire directory)
- Delete: `src/lib/stores/subscription.svelte.ts`
- Delete: `src/lib/types/subscription.ts`
- Delete: `src/lib/server/subscription.ts`
- Delete: `src/lib/server/stripe.ts`
- Keep: `src/lib/config/billing.ts` (still needed for `PUBLIC_BILLING_ENABLED`)

**Step 1: Delete billing routes**

```bash
rm -rf src/routes/billing/
rm -rf src/routes/api/webhooks/stripe/
rm -rf src/routes/admin/revenue/
```

**Step 2: Delete old lib files**

```bash
rm src/lib/stores/subscription.svelte.ts
rm src/lib/types/subscription.ts
rm src/lib/server/subscription.ts
rm src/lib/server/stripe.ts
```

**Step 3: Remove subscription references from admin layout**

In `src/routes/admin/+layout.svelte`, remove the "Revenue" nav link from the sidebar nav.

**Step 4: Remove subscription references from admin users page**

In `src/routes/admin/users/[userId]/+page.svelte` and `+page.server.ts`, remove:

- Subscription display sections (plan info, trial extension, grant subscription form)
- Payment history section
- Audit log section (depends on dropped tables)
- Related server-side data loading (subscription, plans, payment history)

Keep the page functional — it should still show basic user info and org membership. Strip it down to the essentials.

**Step 5: Remove subscription imports from admin users list**

In `src/routes/admin/users/+page.svelte` and `+page.server.ts`, remove subscription-related columns, filters, and data loading.

**Step 6: Remove feature gating from org routes**

In `src/routes/org/[orgId]/+layout.server.ts`:

- Remove `subscriptionLimits` from the returned data
- Remove the import and call to subscription helpers

In `src/routes/org/new/+page.server.ts` and `+page.svelte`:

- Remove `checkOrganizationLimit()` call and subscription limit loading
- Remove the "Limit Reached" modal
- Keep the basic org creation flow

In `src/routes/org/[orgId]/api/personnel/+server.ts`:

- Remove `checkPersonnelLimit()` call

In `src/routes/org/[orgId]/personnel/+page.svelte`:

- Remove conditional check around bulk import (`subscriptionLimits.hasBulkImport`)

In `src/routes/org/[orgId]/calendar/+page.svelte`:

- Remove conditional check around duty roster (`subscriptionLimits.hasDutyRoster`)

**Step 7: Verify nothing references deleted files**

```bash
# Search for any remaining imports of deleted modules
grep -r "subscription" src/ --include="*.ts" --include="*.svelte" -l
grep -r "from.*stripe" src/ --include="*.ts" --include="*.svelte" -l
```

Fix any remaining references.

**Step 8: Verify and commit**

```bash
npm run check && npm run build
git add -A
git commit -m "chore: remove old billing application code and feature gating"
```

---

### Task 3: Remove admin user detail subscription features

**Files:**

- Modify: `src/routes/admin/users/[userId]/+page.svelte`
- Modify: `src/routes/admin/users/[userId]/+page.server.ts`

This is split from Task 2 because the admin user detail page is complex. After removing subscription-related code, it should still show:

- User email and ID
- Organizations the user belongs to (with links)
- Admin notes field
- Basic user info

Remove:

- Plan/subscription display card
- Trial extension form
- Grant subscription form
- Payment history table
- Audit activity log
- All server-side loading for subscription, plans, payment history, audit log

**Step 1: Simplify the server load**

The load function should only fetch:

- User basic info (email from Supabase auth)
- Organizations the user belongs to
- Admin notes (keep this — useful for the new system too)

**Step 2: Simplify the page component**

Keep the user info card and org list. Remove everything subscription-related.

**Step 3: Verify and commit**

```bash
npm run check && npm run build
git add src/routes/admin/users/
git commit -m "chore: simplify admin user page — remove old subscription features"
```

---

## Phase 2: New Database Schema

### Task 4: Create new org subscription tables

**Files:**

- Create: `supabase/migrations/20260306_org_subscriptions.sql`
- Modify: `supabase/schema.sql`

**Step 1: Create migration**

Create `supabase/migrations/20260306_org_subscriptions.sql`:

```sql
-- New org-based subscription system

-- Add subscription fields to organizations table
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'free'
    CHECK (tier IN ('free', 'team', 'unit')),
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'active'
    CHECK (subscription_status IN ('active', 'canceled', 'past_due', 'paused')),
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS gift_tier text
    CHECK (gift_tier IS NULL OR gift_tier IN ('team', 'unit')),
  ADD COLUMN IF NOT EXISTS gift_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS gifted_by uuid REFERENCES auth.users(id);

-- Data exports tracking (rate-limited on free tier)
CREATE TABLE IF NOT EXISTS data_exports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  file_path text,
  file_size_bytes bigint,
  created_at timestamptz DEFAULT now() NOT NULL,
  completed_at timestamptz
);

-- Index for rate limiting queries
CREATE INDEX IF NOT EXISTS idx_data_exports_org_created
  ON data_exports(org_id, created_at DESC);

-- Stripe webhook events (recreate for new system)
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  data jsonb NOT NULL,
  processed boolean DEFAULT false NOT NULL,
  processed_at timestamptz,
  error text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- RLS policies
ALTER TABLE data_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Org members can read their org's exports
CREATE POLICY "Org members can read exports"
  ON data_exports FOR SELECT
  USING (org_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- Only org owner can create exports
CREATE POLICY "Org owner can create exports"
  ON data_exports FOR INSERT
  WITH CHECK (org_id IN (
    SELECT id FROM organizations WHERE created_by = auth.uid()
  ));

-- Webhook events: service role only (no user access)
CREATE POLICY "Service role only for webhooks"
  ON stripe_webhook_events FOR ALL
  USING (false);

-- Function: get effective tier for an org
CREATE OR REPLACE FUNCTION get_effective_tier(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org record;
  v_tier text;
  v_source text;
  v_personnel_count integer;
  v_cap integer;
  v_is_read_only boolean;
BEGIN
  SELECT * INTO v_org FROM organizations WHERE id = p_org_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'org_not_found');
  END IF;

  -- Priority: active Stripe > active gift > free
  IF v_org.stripe_subscription_id IS NOT NULL
     AND v_org.subscription_status = 'active'
     AND v_org.tier != 'free' THEN
    -- Check if gift overrides (gift >= sub tier)
    IF v_org.gift_tier IS NOT NULL
       AND v_org.gift_expires_at > now() THEN
      -- Compare tiers: unit > team > free
      IF (CASE v_org.gift_tier WHEN 'unit' THEN 3 WHEN 'team' THEN 2 ELSE 1 END)
         >= (CASE v_org.tier WHEN 'unit' THEN 3 WHEN 'team' THEN 2 ELSE 1 END) THEN
        v_tier := v_org.gift_tier;
        v_source := 'gift';
      ELSE
        v_tier := v_org.tier;
        v_source := 'subscription';
      END IF;
    ELSE
      v_tier := v_org.tier;
      v_source := 'subscription';
    END IF;
  ELSIF v_org.gift_tier IS NOT NULL
        AND v_org.gift_expires_at > now() THEN
    v_tier := v_org.gift_tier;
    v_source := 'gift';
  ELSE
    v_tier := 'free';
    v_source := 'default';
  END IF;

  -- Get personnel count
  SELECT count(*) INTO v_personnel_count
  FROM personnel WHERE organization_id = p_org_id;

  -- Determine cap
  v_cap := CASE v_tier
    WHEN 'free' THEN 15
    WHEN 'team' THEN 80
    WHEN 'unit' THEN 999999
    ELSE 15
  END;

  v_is_read_only := v_personnel_count > v_cap;

  RETURN jsonb_build_object(
    'tier', v_tier,
    'source', v_source,
    'personnelCount', v_personnel_count,
    'personnelCap', v_cap,
    'isReadOnly', v_is_read_only,
    'giftExpiresAt', v_org.gift_expires_at,
    'giftTier', v_org.gift_tier
  );
END;
$$;
```

**Step 2: Update schema.sql**

Add the new columns to the `organizations` table definition and add the `data_exports` table, `stripe_webhook_events` table, RLS policies, and `get_effective_tier` function.

**Step 3: Verify and commit**

```bash
npm run check && npm run build
git add supabase/
git commit -m "feat: add org subscription columns, data_exports table, and get_effective_tier function"
```

---

## Phase 3: Core Application Code

### Task 5: Create new subscription types and tier resolution

**Files:**

- Create: `src/lib/types/subscription.ts`
- Create: `src/lib/server/subscription.ts`
- Modify: `src/lib/config/billing.ts` (keep as-is — already correct)

**Step 1: Create subscription types**

Create `src/lib/types/subscription.ts`:

```typescript
export type Tier = 'free' | 'team' | 'unit';
export type TierSource = 'subscription' | 'gift' | 'default';
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'paused';

export interface EffectiveTier {
	tier: Tier;
	source: TierSource;
	personnelCount: number;
	personnelCap: number;
	isReadOnly: boolean;
	giftExpiresAt: string | null;
	giftTier: Tier | null;
}

export interface TierConfig {
	name: string;
	personnelCap: number;
	maxOrgsOwned: number;
	bulkExportsPerMonth: number;
	priceMonthly: number;
	stripePriceId: string | null;
}

export const TIER_CONFIG: Record<Tier, TierConfig> = {
	free: {
		name: 'Free',
		personnelCap: 15,
		maxOrgsOwned: 1,
		bulkExportsPerMonth: 3,
		priceMonthly: 0,
		stripePriceId: null
	},
	team: {
		name: 'Team',
		personnelCap: 80,
		maxOrgsOwned: 1,
		bulkExportsPerMonth: Infinity,
		priceMonthly: 1500, // cents
		stripePriceId: null // set via env or config when ready
	},
	unit: {
		name: 'Unit',
		personnelCap: Infinity,
		maxOrgsOwned: Infinity,
		bulkExportsPerMonth: Infinity,
		priceMonthly: 3000, // cents
		stripePriceId: null
	}
};
```

**Step 2: Create server subscription helpers**

Create `src/lib/server/subscription.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import { isBillingEnabled } from '$lib/config/billing';
import { TIER_CONFIG, type EffectiveTier, type Tier } from '$lib/types/subscription';

/**
 * Get the effective tier for an org.
 * When billing is disabled, returns unlimited tier.
 */
export async function getEffectiveTier(supabase: SupabaseClient, orgId: string): Promise<EffectiveTier> {
	if (!isBillingEnabled) {
		return {
			tier: 'unit',
			source: 'default',
			personnelCount: 0,
			personnelCap: Infinity,
			isReadOnly: false,
			giftExpiresAt: null,
			giftTier: null
		};
	}

	const { data, error } = await supabase.rpc('get_effective_tier', { p_org_id: orgId });
	if (error) throw error;
	return data as EffectiveTier;
}

/**
 * Check if an org can add more personnel.
 * Returns { allowed: true } or { allowed: false, message: string }.
 */
export async function canAddPersonnel(
	supabase: SupabaseClient,
	orgId: string
): Promise<{ allowed: boolean; message?: string }> {
	if (!isBillingEnabled) return { allowed: true };

	const tier = await getEffectiveTier(supabase, orgId);
	if (tier.isReadOnly) {
		return { allowed: false, message: 'Organization is in read-only mode. Please subscribe or remove personnel.' };
	}
	if (tier.personnelCount >= tier.personnelCap) {
		return { allowed: false, message: `Personnel limit reached (${tier.personnelCap}). Upgrade to add more.` };
	}
	return { allowed: true };
}

/**
 * Check if an org is in read-only mode.
 */
export async function isOrgReadOnly(supabase: SupabaseClient, orgId: string): Promise<boolean> {
	if (!isBillingEnabled) return false;
	const tier = await getEffectiveTier(supabase, orgId);
	return tier.isReadOnly;
}

/**
 * Check how many orgs a user owns (for limiting org creation).
 */
export async function getUserOwnedOrgCount(supabase: SupabaseClient, userId: string): Promise<number> {
	const { count, error } = await supabase
		.from('organizations')
		.select('*', { count: 'exact', head: true })
		.eq('created_by', userId);
	if (error) throw error;
	return count ?? 0;
}

/**
 * Check if user can create a new org based on their highest tier.
 */
export async function canCreateOrg(
	supabase: SupabaseClient,
	userId: string
): Promise<{ allowed: boolean; message?: string }> {
	if (!isBillingEnabled) return { allowed: true };

	const ownedCount = await getUserOwnedOrgCount(supabase, userId);

	// Get user's highest tier across all owned orgs
	const { data: orgs } = await supabase
		.from('organizations')
		.select('id, tier, gift_tier, gift_expires_at, stripe_subscription_id, subscription_status')
		.eq('created_by', userId);

	let highestMaxOrgs = TIER_CONFIG.free.maxOrgsOwned; // default: 1
	for (const org of orgs ?? []) {
		const tierResult = await getEffectiveTier(supabase, org.id);
		const config = TIER_CONFIG[tierResult.tier];
		if (config.maxOrgsOwned > highestMaxOrgs) {
			highestMaxOrgs = config.maxOrgsOwned;
		}
	}

	if (ownedCount >= highestMaxOrgs) {
		return { allowed: false, message: `You can own up to ${highestMaxOrgs} organization(s) on your current plan.` };
	}
	return { allowed: true };
}

/**
 * Count bulk data exports this month for an org.
 */
export async function getMonthlyExportCount(supabase: SupabaseClient, orgId: string): Promise<number> {
	const startOfMonth = new Date();
	startOfMonth.setDate(1);
	startOfMonth.setHours(0, 0, 0, 0);

	const { count, error } = await supabase
		.from('data_exports')
		.select('*', { count: 'exact', head: true })
		.eq('org_id', orgId)
		.gte('created_at', startOfMonth.toISOString());
	if (error) throw error;
	return count ?? 0;
}
```

**Step 3: Verify and commit**

```bash
npm run check && npm run build
git add src/lib/types/subscription.ts src/lib/server/subscription.ts
git commit -m "feat: add new org-based subscription types and tier resolution"
```

---

### Task 6: Create new Stripe integration

**Files:**

- Create: `src/lib/server/stripe.ts`

**Step 1: Create Stripe server helpers**

Create `src/lib/server/stripe.ts`:

```typescript
import Stripe from 'stripe';
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from '$env/static/private';
import { isBillingEnabled } from '$lib/config/billing';

function getStripe(): Stripe {
	if (!STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not set');
	return new Stripe(STRIPE_SECRET_KEY);
}

export async function createCheckoutSession(options: {
	orgId: string;
	orgName: string;
	tier: 'team' | 'unit';
	customerEmail: string;
	existingCustomerId?: string;
	successUrl: string;
	cancelUrl: string;
}): Promise<string> {
	const stripe = getStripe();

	// Import TIER_CONFIG to get price ID
	const { TIER_CONFIG } = await import('$lib/types/subscription');
	const priceId = TIER_CONFIG[options.tier].stripePriceId;
	if (!priceId) throw new Error(`No Stripe price ID configured for tier: ${options.tier}`);

	let customerId = options.existingCustomerId;
	if (!customerId) {
		const customer = await stripe.customers.create({
			email: options.customerEmail,
			metadata: { orgId: options.orgId, orgName: options.orgName }
		});
		customerId = customer.id;
	}

	const session = await stripe.checkout.sessions.create({
		customer: customerId,
		mode: 'subscription',
		line_items: [{ price: priceId, quantity: 1 }],
		success_url: options.successUrl,
		cancel_url: options.cancelUrl,
		metadata: { orgId: options.orgId, tier: options.tier },
		subscription_data: {
			metadata: { orgId: options.orgId, tier: options.tier }
		}
	});

	return session.url!;
}

export async function createPortalSession(customerId: string, returnUrl: string): Promise<string> {
	const stripe = getStripe();
	const session = await stripe.billingPortal.sessions.create({
		customer: customerId,
		return_url: returnUrl
	});
	return session.url;
}

export async function pauseSubscription(subscriptionId: string): Promise<void> {
	const stripe = getStripe();
	await stripe.subscriptions.update(subscriptionId, {
		pause_collection: { behavior: 'void' }
	});
}

export async function resumeSubscription(subscriptionId: string): Promise<void> {
	const stripe = getStripe();
	await stripe.subscriptions.update(subscriptionId, {
		pause_collection: ''
	});
}

export function verifyWebhookSignature(payload: string, signature: string): Stripe.Event {
	const stripe = getStripe();
	return stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
}
```

**Step 2: Verify and commit**

```bash
npm run check && npm run build
git add src/lib/server/stripe.ts
git commit -m "feat: add new org-based Stripe integration"
```

---

### Task 7: Create subscription store (client-side)

**Files:**

- Create: `src/lib/stores/subscription.svelte.ts`

**Step 1: Create the store**

This is a simple Svelte 5 rune-based store that holds the `EffectiveTier` for the current org and provides reactive accessors. It's loaded from the org layout server data — no client-side fetches.

```typescript
import { isBillingEnabled } from '$lib/config/billing';
import { TIER_CONFIG, type EffectiveTier, type Tier } from '$lib/types/subscription';

function createSubscriptionStore() {
	let effectiveTier = $state<EffectiveTier | null>(null);

	return {
		get tier() {
			return effectiveTier;
		},
		get isReadOnly() {
			return effectiveTier?.isReadOnly ?? false;
		},
		get personnelCount() {
			return effectiveTier?.personnelCount ?? 0;
		},
		get personnelCap() {
			return effectiveTier?.personnelCap ?? Infinity;
		},
		get currentTier() {
			return effectiveTier?.tier ?? ('free' as Tier);
		},
		get tierConfig() {
			return TIER_CONFIG[effectiveTier?.tier ?? 'free'];
		},
		get isGifted() {
			return effectiveTier?.source === 'gift';
		},
		get giftExpiresAt() {
			return effectiveTier?.giftExpiresAt ? new Date(effectiveTier.giftExpiresAt) : null;
		},
		get giftDaysRemaining() {
			if (!effectiveTier?.giftExpiresAt) return null;
			const diff = new Date(effectiveTier.giftExpiresAt).getTime() - Date.now();
			return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
		},
		get billingEnabled() {
			return isBillingEnabled;
		},

		load(tier: EffectiveTier) {
			effectiveTier = tier;
		},

		clear() {
			effectiveTier = null;
		}
	};
}

export const subscriptionStore = createSubscriptionStore();
```

**Step 2: Verify and commit**

```bash
npm run check && npm run build
git add src/lib/stores/subscription.svelte.ts
git commit -m "feat: add org-based subscription store"
```

---

## Phase 4: Integration Points

### Task 8: Wire tier data into org layout

**Files:**

- Modify: `src/routes/org/[orgId]/+layout.server.ts`
- Modify: `src/routes/org/[orgId]/+layout.svelte`

**Step 1: Load effective tier in layout server**

In `+layout.server.ts`, import `getEffectiveTier` from `$lib/server/subscription` and call it with the org ID. Add the result to the returned data as `effectiveTier`.

Replace any existing subscription loading logic with:

```typescript
import { getEffectiveTier } from '$lib/server/subscription';

// Inside the load function, after org is validated:
const effectiveTier = await getEffectiveTier(supabase, orgId);
```

Add `effectiveTier` to the returned object alongside existing fields.

**Step 2: Load tier into subscription store in layout svelte**

In `+layout.svelte`, import the store and load the tier data:

```svelte
<script lang="ts">
	import { subscriptionStore } from '$lib/stores/subscription.svelte';

	// In the script, after data is available:
	$effect(() => {
		if (data.effectiveTier) {
			subscriptionStore.load(data.effectiveTier);
		}
	});
</script>
```

**Step 3: Verify and commit**

```bash
npm run check && npm run build
git add src/routes/org/[orgId]/+layout.server.ts src/routes/org/[orgId]/+layout.svelte
git commit -m "feat: wire effective tier into org layout"
```

---

### Task 9: Add personnel cap enforcement

**Files:**

- Modify: `src/routes/org/[orgId]/api/personnel/+server.ts` (POST handler)
- Modify: `src/routes/org/new/+page.server.ts` (org creation)

**Step 1: Enforce personnel cap on POST**

In the personnel API POST handler, add a check before creating personnel:

```typescript
import { canAddPersonnel } from '$lib/server/subscription';

// Before inserting:
const check = await canAddPersonnel(supabase, orgId);
if (!check.allowed) {
	return json({ error: check.message }, { status: 403 });
}
```

**Step 2: Enforce org creation limit**

In `src/routes/org/new/+page.server.ts`, add a check in the POST action:

```typescript
import { canCreateOrg } from '$lib/server/subscription';

// Before creating org:
const check = await canCreateOrg(supabase, userId);
if (!check.allowed) {
	return fail(403, { error: check.message });
}
```

Also add `canCreateOrg` check to the load function so the UI can show a warning.

**Step 3: Verify and commit**

```bash
npm run check && npm run build
git add src/routes/org/[orgId]/api/personnel/+server.ts src/routes/org/new/
git commit -m "feat: enforce personnel cap and org creation limit"
```

---

### Task 10: Add read-only enforcement to mutating routes

**Files:**

- Modify: All API routes under `src/routes/org/[orgId]/api/` that handle POST/PUT/PATCH/DELETE
- Create: `src/lib/server/read-only-guard.ts`

**Step 1: Create a reusable read-only guard**

Create `src/lib/server/read-only-guard.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import { isOrgReadOnly } from '$lib/server/subscription';
import { json } from '@sveltejs/kit';

/**
 * Check if org is read-only. Returns a Response to send if blocked, or null if allowed.
 * Use in API routes: const blocked = await checkReadOnly(supabase, orgId); if (blocked) return blocked;
 */
export async function checkReadOnly(supabase: SupabaseClient, orgId: string): Promise<Response | null> {
	const readOnly = await isOrgReadOnly(supabase, orgId);
	if (readOnly) {
		return json(
			{ error: 'Organization is in read-only mode. Subscribe or remove personnel to continue.' },
			{ status: 403 }
		);
	}
	return null;
}
```

**Step 2: Add guard to all mutating API routes**

Search for all POST/PUT/PATCH/DELETE handlers in `src/routes/org/[orgId]/api/` and add the read-only check at the top of each handler.

Pattern for each route:

```typescript
import { checkReadOnly } from '$lib/server/read-only-guard';

// In POST/PUT/PATCH/DELETE handler:
const blocked = await checkReadOnly(locals.supabase, params.orgId);
if (blocked) return blocked;
```

**Exception**: Personnel DELETE should still work in read-only mode (users need to delete personnel to get under cap).

List of routes to modify (find all files in `src/routes/org/[orgId]/api/`):

- `personnel/+server.ts` — guard POST only (not DELETE)
- `availability/+server.ts` — guard all mutations
- `daily-assignments/+server.ts` — guard all mutations
- `training/+server.ts` — guard all mutations
- `counseling/+server.ts` — guard all mutations
- `onboarding/+server.ts` — guard all mutations
- `groups/+server.ts` — guard all mutations
- `status-types/+server.ts` — guard all mutations
- `training-types/+server.ts` — guard all mutations
- `assignment-types/+server.ts` — guard all mutations
- `rating-scheme/+server.ts` — guard all mutations
- Any other mutating routes found

**Step 3: Verify and commit**

```bash
npm run check && npm run build
git add src/lib/server/read-only-guard.ts src/routes/org/
git commit -m "feat: add read-only enforcement to all mutating API routes"
```

---

## Phase 5: UI Components

### Task 11: Create subscription banner component

**Files:**

- Create: `src/lib/components/SubscriptionBanner.svelte`

**Step 1: Create the banner component**

The banner renders at the top of the org layout (next to DemoBanner). It shows contextual messages based on subscription state. Uses the `subscriptionStore` for reactive data.

Three states:

1. **Gift expiring (14 days)**: yellow info banner
2. **Gift expiring (3 days)**: red urgent banner
3. **Read-only mode**: red blocking banner with action buttons

Props: `orgId: string`

Structure:

```svelte
<script lang="ts">
	import { subscriptionStore } from '$lib/stores/subscription.svelte';
	import { isBillingEnabled } from '$lib/config/billing';

	let { orgId }: { orgId: string } = $props();

	const daysRemaining = $derived(subscriptionStore.giftDaysRemaining);
	const showGiftWarning = $derived(subscriptionStore.isGifted && daysRemaining !== null && daysRemaining <= 14);
	const isUrgent = $derived(daysRemaining !== null && daysRemaining <= 3);
	const isReadOnly = $derived(subscriptionStore.isReadOnly);
	const showBanner = $derived(isBillingEnabled && (showGiftWarning || isReadOnly));
</script>

{#if showBanner}
	<div class="subscription-banner" class:urgent={isUrgent || isReadOnly}>
		<!-- Banner content based on state -->
	</div>
{/if}
```

Style the banner similarly to DemoBanner: full-width, fixed height, colored background, centered text with action links.

**Step 2: Wire into org layout**

In `src/routes/org/[orgId]/+layout.svelte`, add `<SubscriptionBanner orgId={data.orgId} />` after `<DemoBanner />`. Adjust the `.app-content` padding to account for the additional banner when visible.

**Step 3: Verify and commit**

```bash
npm run check && npm run build
git add src/lib/components/SubscriptionBanner.svelte src/routes/org/[orgId]/+layout.svelte
git commit -m "feat: add subscription banner for gift warnings and read-only mode"
```

---

### Task 12: Create billing/pricing page

**Files:**

- Create: `src/routes/org/[orgId]/billing/+page.svelte`
- Create: `src/routes/org/[orgId]/billing/+page.server.ts`

**Step 1: Create server load**

The billing page is accessible only to org owners. It shows the current tier, subscription status, and upgrade options.

`+page.server.ts` loads: effective tier, org details (Stripe customer ID for portal link), tier configs for comparison.

**Step 2: Create billing page**

The page shows:

- Current plan card (tier name, personnel count/cap, status)
- If subscribed: "Manage Subscription" button (opens Stripe portal)
- If free/gift: pricing comparison cards for Team and Unit
- Each card: tier name, price, personnel cap, "Subscribe" button
- If read-only: prominent banner explaining the situation

Use the same design patterns as the rest of the app (CSS variables, `.btn` classes, `.form-group`, etc.).

**Step 3: Create checkout API endpoint**

Create `src/routes/org/[orgId]/billing/checkout/+server.ts` — POST endpoint that creates a Stripe Checkout session for the selected tier and redirects.

**Step 4: Create portal API endpoint**

Create `src/routes/org/[orgId]/billing/portal/+server.ts` — POST endpoint that creates a Stripe Customer Portal session and redirects.

**Step 5: Create success/cancel pages**

Create `src/routes/org/[orgId]/billing/success/+page.svelte` and `canceled/+page.svelte` — simple confirmation pages.

**Step 6: Verify and commit**

```bash
npm run check && npm run build
git add src/routes/org/[orgId]/billing/
git commit -m "feat: add org billing page with Stripe checkout and portal"
```

---

### Task 13: Create Stripe webhook handler

**Files:**

- Create: `src/routes/api/webhooks/stripe/+server.ts`

**Step 1: Create webhook endpoint**

POST endpoint at `/api/webhooks/stripe`. Handles:

1. `checkout.session.completed` → set org's `stripe_customer_id`, `stripe_subscription_id`, `tier`, `subscription_status = 'active'`
2. `customer.subscription.updated` → sync tier, status, `current_period_end`. Check if gift should pause billing.
3. `customer.subscription.deleted` → reset org to `tier = 'free'`, clear Stripe fields, `subscription_status = 'canceled'`
4. `invoice.payment_failed` → set `subscription_status = 'past_due'`

Use the `stripe_webhook_events` table for idempotency. Use Supabase service role client (from `SUPABASE_SERVICE_ROLE_KEY`) to bypass RLS.

Extract `orgId` from subscription metadata (set during checkout).

**Step 2: Handle gift/subscription pause logic**

When a subscription event comes in, check if the org has an active gift that's >= the subscription tier. If so, call `pauseSubscription()`. If the gift has expired or is lower tier, call `resumeSubscription()`.

**Step 3: Verify and commit**

```bash
npm run check && npm run build
git add src/routes/api/webhooks/stripe/
git commit -m "feat: add Stripe webhook handler for org subscriptions"
```

---

## Phase 6: Admin Gifting

### Task 14: Add admin gifting UI and API

**Files:**

- Create: `src/routes/admin/gifting/+page.svelte`
- Create: `src/routes/admin/gifting/+page.server.ts`
- Modify: `src/routes/admin/+layout.svelte` (add nav link)

**Step 1: Create admin gifting page**

Server load: fetch all organizations with their current tier info, gift status, and owner email. Allow filtering/searching.

Page UI:

- Table of organizations: name, owner email, current tier, gift status, personnel count
- "Gift Tier" action per org: opens inline form with tier dropdown (Team/Unit) and duration input (days)
- "Revoke Gift" and "Extend Gift" actions for orgs with active gifts
- Shows gift expiry dates

Form actions:

- `giftTier`: updates org's `gift_tier`, `gift_expires_at`, `gifted_by`
- `revokeGift`: clears org's gift fields
- `extendGift`: updates `gift_expires_at`

When gifting, check if org has an active Stripe subscription and the gift tier >= sub tier. If so, call `pauseSubscription()`.

**Step 2: Add nav link**

In `src/routes/admin/+layout.svelte`, add a "Gifting" nav item pointing to `/admin/gifting`.

**Step 3: Verify and commit**

```bash
npm run check && npm run build
git add src/routes/admin/gifting/ src/routes/admin/+layout.svelte
git commit -m "feat: add admin gifting page for org tier management"
```

---

## Phase 7: Data Export

### Task 15: Add bulk data export

**Files:**

- Create: `src/routes/org/[orgId]/api/export/+server.ts`
- Modify: `src/routes/org/[orgId]/settings/+page.svelte` (add export button)

**Step 1: Create export API endpoint**

POST endpoint that:

1. Checks rate limit (3/month on free tier using `getMonthlyExportCount`)
2. Queries all org data: personnel, groups, availability, training records, counseling records, assignments, onboarding, rating scheme
3. Packages as JSON (or CSV zip if preferred)
4. Records the export in `data_exports` table
5. Returns the file as a download

This runs synchronously since the data set is bounded by org size. For very large orgs (hundreds of personnel), it may take a few seconds but should be fine as a direct download.

**Step 2: Add export button to settings**

In the org settings page, add an "Export All Org Data" section with:

- Button to trigger export
- Shows remaining exports this month (on free tier)
- Loading state while generating
- Rate limit warning if exhausted

**Step 3: Verify and commit**

```bash
npm run check && npm run build
git add src/routes/org/[orgId]/api/export/ src/routes/org/[orgId]/settings/
git commit -m "feat: add bulk org data export with rate limiting"
```

---

## Phase 8: Final Integration & Cleanup

### Task 16: Client-side read-only UX

**Files:**

- Modify: Various page components that have mutating actions

**Step 1: Add read-only awareness to key pages**

In each main page (calendar, personnel, training, leaders-book, onboarding), check `subscriptionStore.isReadOnly` and:

- Disable "Add" buttons (grey them out)
- Show tooltip or small text: "Upgrade to edit"
- Keep all data visible and navigable

This is UI-only polish — the server-side enforcement from Task 10 is the real gate.

Use a pattern like:

```svelte
<script lang="ts">
	import { subscriptionStore } from '$lib/stores/subscription.svelte';
</script>

<button disabled={subscriptionStore.isReadOnly} class="btn btn-primary"> Add Personnel </button>
{#if subscriptionStore.isReadOnly}
	<span class="text-muted">Upgrade to edit</span>
{/if}
```

**Step 2: Verify and commit**

```bash
npm run check && npm run build
git add src/routes/org/
git commit -m "feat: add read-only UX to all org pages"
```

---

### Task 17: Final verification and cleanup

**Step 1: Full build check**

```bash
npm run check && npm run build
```

**Step 2: Search for stale references**

```bash
# Ensure no references to old billing code remain
grep -r "user_subscriptions\|subscription_plans\|payment_history" src/ --include="*.ts" --include="*.svelte" -l
grep -r "hasBulkImport\|hasExcelExport\|hasDutyRoster\|hasPrioritySupport" src/ --include="*.ts" --include="*.svelte" -l
```

**Step 3: Verify PUBLIC_BILLING_ENABLED=false behavior**

With `PUBLIC_BILLING_ENABLED=false`:

- All orgs should behave as unlimited
- No banners, no upgrade prompts, no billing pages visible
- All features available, no personnel caps

**Step 4: Test checklist**

- [ ] Can create org (free tier, 1 org limit when billing enabled)
- [ ] Can add personnel up to cap (15 on free)
- [ ] Cannot add personnel beyond cap (shows upgrade prompt)
- [ ] Read-only mode activates when over cap
- [ ] Can delete personnel in read-only mode
- [ ] Banner shows for gift expiring (14 days, 3 days)
- [ ] Banner shows for read-only mode
- [ ] Billing page shows tier comparison and checkout buttons
- [ ] Stripe checkout redirects correctly
- [ ] Webhook processes subscription events
- [ ] Admin can gift/revoke/extend tiers
- [ ] Bulk export works and is rate-limited
- [ ] `PUBLIC_BILLING_ENABLED=false` bypasses everything

**Step 5: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup and verification for new billing system"
```
