# Performance Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve perceived and actual page navigation speed within the org layout.

**Architecture:** Five independent enhancements: navigation progress bar (visual), tier query cache (server), notification query parallelization (server), streamed page data (server+client), and nav link preloading (client).

**Tech Stack:** SvelteKit (navigating store, streaming), Svelte 5, TypeScript, Supabase

---

### Task 1: Navigation Progress Bar

**Files:**
- Create: `src/lib/components/ui/NavigationProgress.svelte`
- Modify: `src/routes/org/[orgId]/+layout.svelte`

**Step 1: Create NavigationProgress component**

Create `src/lib/components/ui/NavigationProgress.svelte`:

```svelte
<script lang="ts">
  import { navigating } from '$app/stores';
</script>

{#if $navigating}
  <div class="nav-progress">
    <div class="nav-progress-bar"></div>
  </div>
{/if}

<style>
  .nav-progress {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 3px;
    z-index: 9999;
    overflow: hidden;
  }

  .nav-progress-bar {
    height: 100%;
    background: #B8943E;
    animation: progress 1.5s ease-in-out infinite;
  }

  @keyframes progress {
    0% { width: 0%; margin-left: 0%; }
    50% { width: 60%; margin-left: 20%; }
    100% { width: 0%; margin-left: 100%; }
  }
</style>
```

**Step 2: Add to org layout**

In `src/routes/org/[orgId]/+layout.svelte`, add import and render above `<DemoBanner />`:

```svelte
import NavigationProgress from '$lib/components/ui/NavigationProgress.svelte';
```

```svelte
<NavigationProgress />
<DemoBanner />
```

**Step 3: Commit**

```
feat: add navigation progress bar during page transitions
```

---

### Task 2: Tier Query Cache

**Files:**
- Modify: `src/lib/server/subscription.ts`

**Step 1: Add in-memory TTL cache to getEffectiveTier**

Add a cache Map and TTL constant at the top of `src/lib/server/subscription.ts`:

```typescript
const tierCache = new Map<string, { data: EffectiveTier; expiresAt: number }>();
const TIER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function invalidateTierCache(orgId: string) {
  tierCache.delete(orgId);
}
```

Modify `getEffectiveTier` to check cache before querying:

```typescript
export async function getEffectiveTier(
  supabase: SupabaseClient,
  orgId: string
): Promise<EffectiveTier> {
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

  const cached = tierCache.get(orgId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  const { data, error } = await supabase.rpc('get_effective_tier', { p_org_id: orgId });
  if (error) throw error;

  const result = data as EffectiveTier;
  tierCache.set(orgId, { data: result, expiresAt: Date.now() + TIER_CACHE_TTL });
  return result;
}
```

**Step 2: Add cache invalidation calls in billing mutation routes**

Search for routes that modify billing/subscription state and add `invalidateTierCache(orgId)` calls. Key files:
- `src/routes/org/[orgId]/billing/` — any POST/PATCH handlers
- `src/routes/org/[orgId]/api/personnel/batch/+server.ts` — if it modifies personnel count

**Step 3: Commit**

```
perf: cache tier query with 5-minute TTL
```

---

### Task 3: Parallelize Notification Count

**Files:**
- Modify: `src/routes/org/[orgId]/+layout.server.ts`

**Step 1: Move notification count into the main Promise.all**

In the authenticated user path (line 168), the notification count query at line 217 runs after the Promise.all. Move it into the parallel batch:

Change the main Promise.all to include the notification count:

```typescript
const [membershipsRes, shared, effectiveTier, notificationCountRes] = await Promise.all([
  locals.supabase
    .from('organization_memberships')
    .select(/* existing select */)
    .eq('user_id', user.id),
  fetchSharedData(supabase, orgId),
  getEffectiveTier(supabase, orgId),
  locals.supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('organization_id', orgId)
    .eq('read', false)
]);
```

Then use `notificationCountRes.count ?? 0` in the return instead of the separate `unreadNotificationCount` variable.

Remove the standalone notification query block (lines 217-222).

**Step 2: Commit**

```
perf: parallelize notification count query in layout load
```

---

### Task 4: Stream Non-Critical Page Data (Dashboard)

**Files:**
- Modify: `src/routes/org/[orgId]/+page.server.ts`
- Modify: `src/routes/org/[orgId]/+page.svelte` (if needed for Awaiting streamed data)

**Step 1: Stream onboarding step progress on Dashboard**

The dashboard currently fetches onboardings, then sequentially fetches step progress. Instead, return the enriched onboardings as a promise that SvelteKit will stream.

In `src/routes/org/[orgId]/+page.server.ts`, split into immediate data and streamed data:

```typescript
// Return immediately available data + streamed promise for onboardings
const onboardings = onboardingsRes.data ?? [];

async function enrichOnboardings() {
  if (onboardings.length === 0) return [];
  const onboardingIds = onboardings.map((o: any) => o.id);
  const { data: steps } = await supabase
    .from('onboarding_step_progress')
    .select('*')
    .in('onboarding_id', onboardingIds)
    .order('sort_order');

  const stepsByOnboarding = new Map<string, any[]>();
  for (const step of (steps ?? [])) {
    const existing = stepsByOnboarding.get(step.onboarding_id) ?? [];
    existing.push(step);
    stepsByOnboarding.set(step.onboarding_id, existing);
  }

  return onboardings.map((o: any) => ({
    id: o.id,
    personnelId: o.personnel_id,
    status: o.status,
    startedAt: o.started_at,
    steps: (stepsByOnboarding.get(o.id) ?? []).map((s: any) => ({
      id: s.id,
      stepName: s.step_name,
      stepType: s.step_type,
      trainingTypeId: s.training_type_id,
      completed: s.completed,
      sortOrder: s.sort_order
    }))
  }));
}

return {
  orgId,
  availabilityEntries,
  assignmentTypes,
  todayAssignments,
  pinnedGroups,
  activeOnboardings: enrichOnboardings(), // streamed promise
  ratingSchemeEntries
};
```

**Step 2: Update Dashboard page.svelte to handle streamed data**

Where the dashboard consumes `data.activeOnboardings`, wrap in `{#await}`:

```svelte
{#await data.activeOnboardings}
  <!-- loading state for onboarding widget -->
{:then activeOnboardings}
  <!-- existing onboarding rendering using activeOnboardings -->
{/await}
```

**Step 3: Commit**

```
perf: stream onboarding step data on dashboard for faster initial render
```

---

### Task 5: Stream Non-Critical Page Data (Onboarding)

**Files:**
- Modify: `src/routes/org/[orgId]/onboarding/+page.server.ts`
- Modify: `src/routes/org/[orgId]/onboarding/+page.svelte` (if needed)

**Step 1: Stream onboarding step progress**

Same pattern as Dashboard — the onboarding page fetches onboardings then sequentially fetches steps. Return step-enriched onboardings as a streamed promise.

**Step 2: Update page.svelte with {#await} blocks**

**Step 3: Commit**

```
perf: stream onboarding step data on onboarding page
```

---

### Task 6: Verify and Test

**Step 1: Run type checking**

```bash
npm run check
```

**Step 2: Run build**

```bash
npm run build
```

**Step 3: Manual testing checklist**
- Navigate between all pages — progress bar appears
- Progress bar is gold and animates smoothly
- No layout data flash/reload when switching pages within same org
- Dashboard loads immediately, onboarding widget fills in shortly after
- Onboarding page loads immediately, steps fill in shortly after

**Step 4: Final commit if any fixes needed**
