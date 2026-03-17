# Production Polish Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add error pages, first-time onboarding checklist, OG/meta tags, `.single()` null-check fixes, and permission descriptions to polish the app for production launch.

**Architecture:** Five independent workstreams. Error pages and OG/meta tags are simple file additions. The getting started checklist requires a new DB table, server queries, API endpoint, and Svelte component. The `.single()` audit is a sweep across existing API routes. Permission descriptions are a small UI addition.

**Tech Stack:** SvelteKit 2.5, Svelte 5 (runes), Supabase (Postgres), pure CSS variables. No test framework (project has no existing tests — verification is manual via `npm run check` and browser testing).

**Spec:** `docs/plans/2026-03-12-production-polish-design.md`

---

## File Map

### New Files

| File                                                             | Purpose                                        |
| ---------------------------------------------------------------- | ---------------------------------------------- |
| `src/routes/+error.svelte`                                       | Root error page (404, 403, 500)                |
| `src/routes/org/[orgId]/+error.svelte`                           | Org-scoped error page with "Back to Dashboard" |
| `supabase/migrations/20260312_getting_started.sql`               | DB table for checklist dismissal state         |
| `src/routes/org/[orgId]/api/getting-started/+server.ts`          | API for dismiss/un-dismiss                     |
| `src/features/onboarding/components/GettingStartedBanner.svelte` | Checklist banner component                     |

### Modified Files

| File                                                              | Change                                                                                         |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/routes/org/[orgId]/+page.server.ts`                          | Add count queries for onboarding steps, rating entries, org members, getting started dismissal |
| `src/routes/org/[orgId]/+page.svelte`                             | Render GettingStartedBanner above dashboard cards                                              |
| `src/routes/org/[orgId]/calendar/+page.svelte`                    | Set localStorage flag for "explore calendar" step                                              |
| `src/routes/+page.svelte`                                         | Replace title/description, add OG + Twitter Card tags                                          |
| `src/routes/privacy/+page.svelte`                                 | Add meta description                                                                           |
| `src/routes/security/+page.svelte`                                | Add meta description                                                                           |
| `src/routes/help/+page.svelte`                                    | Add meta description                                                                           |
| `src/features/groups/components/OrganizationMemberManager.svelte` | Add permission descriptions below section headings                                             |
| ~20 API route files                                               | Add null checks after `.single()` calls where missing                                          |

---

## Chunk 1: Error Pages & OG/Meta Tags

### Task 1: Root Error Page

**Files:**

- Create: `src/routes/+error.svelte`

- [ ] **Step 1: Create root error page**

```svelte
<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>Error {page.status} - Troop to Task</title>
</svelte:head>

<div class="error-page">
	<h1>{page.status}</h1>
	<p class="error-message">
		{#if page.status === 404}
			Page not found. The page you're looking for doesn't exist or has been moved.
		{:else if page.status === 403}
			You don't have permission to view this page.
		{:else}
			Something went wrong. Please try again later.
		{/if}
	</p>
	<a href="/" class="btn btn-primary">Go Home</a>
</div>

<style>
	.error-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 60vh;
		text-align: center;
		padding: var(--spacing-xl);
	}

	h1 {
		font-size: 72px;
		font-weight: 700;
		color: var(--color-primary);
		margin: 0 0 var(--spacing-sm);
		line-height: 1;
	}

	.error-message {
		font-size: var(--font-size-lg);
		color: var(--color-text-secondary);
		margin: 0 0 var(--spacing-lg);
		max-width: 400px;
	}
</style>
```

- [ ] **Step 2: Verify no build errors**

Run: `npm run check`
Expected: No new errors (pre-existing ones are fine)

- [ ] **Step 3: Commit**

```bash
git add src/routes/+error.svelte
git commit -m "feat: add branded root error page"
```

---

### Task 2: Org-Scoped Error Page

**Files:**

- Create: `src/routes/org/[orgId]/+error.svelte`

- [ ] **Step 1: Create org-scoped error page**

```svelte
<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>Error {page.status} - Troop to Task</title>
</svelte:head>

<div class="error-page">
	<h1>{page.status}</h1>
	<p class="error-message">
		{#if page.status === 404}
			Page not found. The page you're looking for doesn't exist or has been moved.
		{:else if page.status === 403}
			You don't have permission to view this page.
		{:else}
			Something went wrong. Please try again later.
		{/if}
	</p>
	<a href="/org/{page.params.orgId}" class="btn btn-primary">Back to Dashboard</a>
</div>

<style>
	.error-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 60vh;
		text-align: center;
		padding: var(--spacing-xl);
	}

	h1 {
		font-size: 72px;
		font-weight: 700;
		color: var(--color-primary);
		margin: 0 0 var(--spacing-sm);
		line-height: 1;
	}

	.error-message {
		font-size: var(--font-size-lg);
		color: var(--color-text-secondary);
		margin: 0 0 var(--spacing-lg);
		max-width: 400px;
	}
</style>
```

- [ ] **Step 2: Verify no build errors**

Run: `npm run check`

- [ ] **Step 3: Commit**

```bash
git add src/routes/org/[orgId]/+error.svelte
git commit -m "feat: add org-scoped error page"
```

---

### Task 3: OG/Meta Tags — Landing Page

**Files:**

- Modify: `src/routes/+page.svelte` — the `<svelte:head>` block (lines ~133-136)

- [ ] **Step 1: Read current landing page head section**

Read `src/routes/+page.svelte` to find the exact existing `<svelte:head>` block.

- [ ] **Step 2: Replace title/description and add OG + Twitter tags**

**Important:** The existing `<svelte:head>` block also contains Google Fonts preconnect and stylesheet links. Keep those intact. Only replace the `<title>` and `<meta name="description">` lines, and add the new OG/Twitter tags after them.

```svelte
<svelte:head>
	<title>Troop to Task — Military Unit Management</title>
	<meta
		name="description"
		content="Modern military unit management software. Track personnel, training, availability, counseling, and daily assignments — all in one secure platform."
	/>

	<!-- Open Graph -->
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Troop to Task" />
	<meta property="og:title" content="Troop to Task — Military Unit Management" />
	<meta
		property="og:description"
		content="Modern military unit management software. Track personnel, training, availability, counseling, and daily assignments."
	/>
	<meta property="og:url" content="https://trooptotask.org" />
	<meta property="og:image" content="https://trooptotask.org/og-image.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />

	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="Troop to Task — Military Unit Management" />
	<meta
		name="twitter:description"
		content="Modern military unit management software. Track personnel, training, availability, counseling, and daily assignments."
	/>
	<meta name="twitter:image" content="https://trooptotask.org/og-image.png" />
</svelte:head>
```

**Note:** The OG image (`static/og-image.png`) needs to be created separately. The meta tags can be deployed now and will work once the image is added.

- [ ] **Step 3: Verify no build errors**

Run: `npm run check`

- [ ] **Step 4: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat: add OG and Twitter Card meta tags to landing page"
```

---

### Task 4: Meta Descriptions for Public Pages

**Files:**

- Modify: `src/routes/privacy/+page.svelte`
- Modify: `src/routes/security/+page.svelte`
- Modify: `src/routes/help/+page.svelte`

- [ ] **Step 1: Read each file to find existing `<svelte:head>` blocks**

Read all three files. Each should already have a `<title>` tag. Add `<meta name="description">` inside the existing `<svelte:head>`.

- [ ] **Step 2: Add meta descriptions**

For each file, add inside `<svelte:head>`:

**privacy:**

```html
<meta name="description" content="Privacy policy for Troop to Task military unit management software." />
```

**security:**

```html
<meta name="description" content="Security practices and NIST 800-171 compliance information for Troop to Task." />
```

**help:**

```html
<meta name="description" content="Help and platform guide for Troop to Task." />
```

- [ ] **Step 3: Verify no build errors**

Run: `npm run check`

- [ ] **Step 4: Commit**

```bash
git add src/routes/privacy/+page.svelte src/routes/security/+page.svelte src/routes/help/+page.svelte
git commit -m "feat: add meta descriptions to public pages"
```

---

### Task 5: Permission Descriptions

**Files:**

- Modify: `src/features/groups/components/OrganizationMemberManager.svelte` — permission grid section (lines ~305-401)

- [ ] **Step 1: Read the permission grid section**

Read `src/features/groups/components/OrganizationMemberManager.svelte` lines 290-420 to see the exact current markup for each permission section.

- [ ] **Step 2: Add description `<p>` tags below each section `<h4>`**

After each `<h4>` heading in the permission grid, add a `<p class="permission-description">` with the appropriate text:

| After `<h4>`  | Description text                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| Calendar      | View the unit calendar and personnel statuses. Edit allows setting statuses, assignments, and availability. |
| Personnel     | View the personnel roster and details. Edit allows adding, updating, and removing personnel records.        |
| Training      | View training records and compliance status. Edit allows logging training completions and managing records. |
| Onboarding    | View onboarding progress for new personnel. Edit allows starting onboardings and updating step progress.    |
| Leader's Book | View counseling records and development goals. Edit allows creating and updating counseling entries.        |
| Members       | Invite, remove, and manage permissions for other organization members.                                      |

- [ ] **Step 3: Add CSS for `.permission-description`**

Add in the component's `<style>` block:

```css
.permission-description {
	font-size: var(--font-size-xs);
	color: var(--color-text-muted);
	margin: 0 0 var(--spacing-xs);
	line-height: 1.4;
}
```

- [ ] **Step 4: Verify no build errors**

Run: `npm run check`

- [ ] **Step 5: Commit**

```bash
git add src/features/groups/components/OrganizationMemberManager.svelte
git commit -m "feat: add permission descriptions to member management UI"
```

---

## Chunk 2: `.single()` Null Check Audit

### Task 6: Audit and Fix All `.single()` Calls

**Files:**

- Modify: All files containing `.single()` calls (~20 API route files)

This task is a sweep. The implementer should:

- [ ] **Step 1: Get the full list of `.single()` calls**

Run: `grep -rn '\.single()' src/` to get every file and line number.

- [ ] **Step 2: For each file, read the surrounding context (5-10 lines)**

Check if the `.single()` result is guarded. A call is **safe** if one of these patterns exists after it:

```typescript
// Pattern A: error/data destructure with check
const { data, error } = await supabase.from(...).single();
if (error || !data) { /* return error response or throw */ }

// Pattern B: error thrown by SvelteKit
const { data } = await supabase.from(...).single();
if (!data) throw error(404, 'Not found');

// Pattern C: used in a context where null is acceptable
// (e.g., optional lookup where null means "create new")
```

A call is **unsafe** if the result is used directly without checking:

```typescript
const { data } = await supabase.from(...).single();
return json(data); // data could be null!
```

- [ ] **Step 3: Fix each unsafe call**

For API route handlers (`+server.ts`), use this pattern:

```typescript
const { data, error: dbError } = await supabase.from('table').select('*').eq('id', id).single();
if (dbError || !data) {
	return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
}
```

For page server loads (`+page.server.ts` / `+layout.server.ts`), use:

```typescript
const { data, error: dbError } = await supabase.from('table').select('*').eq('id', id).single();
if (dbError || !data) {
	throw error(404, 'Not found');
}
```

**Important:** Some `.single()` calls are intentionally used for upsert results or in contexts where the prior query guarantees a row exists (e.g., immediately after an INSERT). Use judgment — don't add a null check where it's impossible for the data to be null.

- [ ] **Step 4: Verify no build errors**

Run: `npm run check`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: add null checks to unguarded .single() calls across API routes"
```

---

## Chunk 3: Getting Started Checklist

### Task 7: Database Migration

**Files:**

- Create: `supabase/migrations/20260312_getting_started.sql`

- [ ] **Step 1: Write migration file**

```sql
-- Getting Started checklist dismissal tracking
CREATE TABLE getting_started_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

ALTER TABLE getting_started_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own getting started progress"
  ON getting_started_progress FOR ALL
  USING (auth.uid() = user_id);
```

- [ ] **Step 2: Apply migration to local database**

Run: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/migrations/20260312_getting_started.sql`
Expected: `CREATE TABLE`, `ALTER TABLE`, `CREATE POLICY` — no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260312_getting_started.sql
git commit -m "feat: add getting_started_progress table for onboarding checklist"
```

---

### Task 8: Getting Started API Endpoint

**Files:**

- Create: `src/routes/org/[orgId]/api/getting-started/+server.ts`

- [ ] **Step 1: Create the API endpoint**

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validateUUID } from '$lib/server/validation';

// POST: dismiss the getting started checklist
export const POST: RequestHandler = async ({ locals, params }) => {
	const supabase = locals.supabase;
	const userId = locals.user?.id;

	if (!userId) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
	}

	if (!validateUUID(params.orgId)) {
		return new Response(JSON.stringify({ error: 'Invalid org ID' }), { status: 400 });
	}

	const { error } = await supabase.from('getting_started_progress').upsert(
		{
			organization_id: params.orgId,
			user_id: userId,
			dismissed_at: new Date().toISOString()
		},
		{ onConflict: 'organization_id,user_id' }
	);

	if (error) {
		return new Response(JSON.stringify({ error: 'Failed to dismiss' }), { status: 500 });
	}

	return json({ success: true });
};

// DELETE: un-dismiss (show checklist again)
export const DELETE: RequestHandler = async ({ locals, params }) => {
	const supabase = locals.supabase;
	const userId = locals.user?.id;

	if (!userId) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
	}

	if (!validateUUID(params.orgId)) {
		return new Response(JSON.stringify({ error: 'Invalid org ID' }), { status: 400 });
	}

	const { error } = await supabase
		.from('getting_started_progress')
		.update({ dismissed_at: null })
		.eq('organization_id', params.orgId)
		.eq('user_id', userId);

	if (error) {
		return new Response(JSON.stringify({ error: 'Failed to un-dismiss' }), { status: 500 });
	}

	return json({ success: true });
};
```

- [ ] **Step 2: Add route to rate limiting config**

Read `src/lib/server/rateLimit.ts` to find where routes are configured, then add an entry for the getting-started endpoint. This is a low-traffic endpoint, so use a generous limit (e.g., 20 requests/minute).

- [ ] **Step 3: Verify no build errors**

Run: `npm run check`

- [ ] **Step 4: Commit**

```bash
git add src/routes/org/[orgId]/api/getting-started/+server.ts src/lib/server/rateLimit.ts
git commit -m "feat: add getting-started dismiss/un-dismiss API endpoint"
```

---

### Task 9: Dashboard Server — Add Checklist Count Queries

**Files:**

- Modify: `src/routes/org/[orgId]/+page.server.ts`

- [ ] **Step 1: Read the current dashboard server load**

Read `src/routes/org/[orgId]/+page.server.ts` to see the existing `load` function and its queries.

- [ ] **Step 2: Add count queries for checklist steps**

Inside the `load` function, add these queries alongside the existing `Promise.all` batch (or in a separate parallel batch). These are lightweight count queries that run fast:

```typescript
// Getting Started checklist data
const [
	{ count: onboardingTemplateStepCount },
	{ count: ratingSchemeEntryCount },
	{ count: orgMemberCount },
	{ data: gettingStartedData }
] = await Promise.all([
	supabase.from('onboarding_template_steps').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
	supabase.from('rating_scheme_entries').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
	supabase.from('organization_memberships').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
	supabase
		.from('getting_started_progress')
		.select('dismissed_at')
		.eq('organization_id', orgId)
		.eq('user_id', userId)
		.maybeSingle()
]);
```

**Important:** Use `.maybeSingle()` (not `.single()`) for the getting_started_progress query since the row may not exist yet. This returns `null` instead of an error when no row is found.

- [ ] **Step 3: Add to return object**

Add these to the returned data object:

```typescript
return {
	// ... existing fields ...
	onboardingTemplateStepCount: onboardingTemplateStepCount ?? 0,
	ratingSchemeEntryCount: ratingSchemeEntryCount ?? 0,
	orgMemberCount: orgMemberCount ?? 0,
	gettingStartedDismissed: gettingStartedData?.dismissed_at != null
};
```

- [ ] **Step 4: Verify no build errors**

Run: `npm run check`

- [ ] **Step 5: Commit**

```bash
git add src/routes/org/[orgId]/+page.server.ts
git commit -m "feat: add getting-started checklist count queries to dashboard server"
```

---

### Task 10: Calendar Page — Set localStorage Flag

**Files:**

- Modify: `src/routes/org/[orgId]/calendar/+page.svelte`

- [ ] **Step 1: Read the calendar page**

Read `src/routes/org/[orgId]/calendar/+page.svelte` to find where to add the localStorage set. Look for existing `$effect` blocks and the `data` prop.

- [ ] **Step 2: Add an `$effect` to set the "explored" flag**

In the `<script>` section, add after existing effects:

```typescript
import { browser } from '$app/environment';

// Mark calendar as explored for Getting Started checklist
$effect(() => {
	if (browser) {
		localStorage.setItem(`gettingStarted_calendarVisited_${data.orgId}`, 'true');
	}
});
```

**Note:** The `browser` import may already exist in this file. Check before adding a duplicate import.

- [ ] **Step 3: Verify no build errors**

Run: `npm run check`

- [ ] **Step 4: Commit**

```bash
git add src/routes/org/[orgId]/calendar/+page.svelte
git commit -m "feat: set localStorage flag when user visits calendar page"
```

---

### Task 11: GettingStartedBanner Component

**Files:**

- Create: `src/features/onboarding/components/GettingStartedBanner.svelte`

- [ ] **Step 1: Create the banner component**

This component receives all completion data as props and derives step completion client-side. It handles the localStorage-based "explore calendar" step after hydration.

```svelte
<script lang="ts">
	import { browser } from '$app/environment';
	import { toastStore } from '$lib/stores/toast.svelte';

	interface Props {
		orgId: string;
		personnelCount: number;
		statusTypeCount: number;
		trainingTypeCount: number;
		assignmentTypeCount: number;
		onboardingTemplateStepCount: number;
		ratingSchemeEntryCount: number;
		orgMemberCount: number;
		dismissed: boolean;
		onDismiss: () => void;
	}

	let {
		orgId,
		personnelCount,
		statusTypeCount,
		trainingTypeCount,
		assignmentTypeCount,
		onboardingTemplateStepCount,
		ratingSchemeEntryCount,
		orgMemberCount,
		dismissed,
		onDismiss
	}: Props = $props();

	let calendarVisited = $state(false);
	let confirmingDismiss = $state(false);
	let hasBeenVisible = $state(false);

	// Hydrate localStorage-based step
	$effect(() => {
		if (browser) {
			calendarVisited = localStorage.getItem(`gettingStarted_calendarVisited_${orgId}`) === 'true';
		}
	});

	interface Step {
		label: string;
		complete: boolean;
		link: string;
	}

	const steps: Step[] = $derived([
		{ label: 'Add your first personnel', complete: personnelCount > 0, link: `/org/${orgId}/personnel` },
		{ label: 'Set up your status types', complete: statusTypeCount > 0, link: `/org/${orgId}/calendar` },
		{ label: 'Set up assignment types', complete: assignmentTypeCount > 0, link: `/org/${orgId}/calendar` },
		{ label: 'Configure training types', complete: trainingTypeCount > 0, link: `/org/${orgId}/training` },
		{
			label: 'Set up your onboarding flow',
			complete: onboardingTemplateStepCount > 0,
			link: `/org/${orgId}/onboarding`
		},
		{ label: 'Configure your rating scheme', complete: ratingSchemeEntryCount > 0, link: `/org/${orgId}/leaders-book` },
		{ label: 'Invite a team member', complete: orgMemberCount > 1, link: `/org/${orgId}/settings` },
		{ label: 'Explore the calendar', complete: calendarVisited, link: `/org/${orgId}/calendar` }
	]);

	const completedCount = $derived(steps.filter((s) => s.complete).length);
	const allComplete = $derived(completedCount === steps.length);
	const progressPct = $derived((completedCount / steps.length) * 100);

	// Track that the banner was actually rendered (prevents toast for established orgs)
	$effect(() => {
		if (!dismissed && !allComplete) {
			hasBeenVisible = true;
		}
	});

	// Auto-hide and toast when all complete (only if banner was visible this session)
	$effect(() => {
		if (allComplete && hasBeenVisible && !dismissed) {
			toastStore.success("You're all set! Your organization is configured.");
			onDismiss();
		}
	});

	async function handleDismiss() {
		if (!confirmingDismiss) {
			confirmingDismiss = true;
			return;
		}
		onDismiss();
	}
</script>

{#if !dismissed && !allComplete}
	<div class="getting-started">
		<div class="getting-started-header">
			<h3>Getting Started</h3>
			{#if confirmingDismiss}
				<div class="dismiss-confirm">
					<span>Hide checklist?</span>
					<button class="btn btn-sm btn-secondary" onclick={() => (confirmingDismiss = false)}>No</button>
					<button class="btn btn-sm btn-primary" onclick={handleDismiss}>Yes</button>
				</div>
			{:else}
				<button class="dismiss-btn" onclick={handleDismiss} aria-label="Dismiss getting started checklist">
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
						<path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
					</svg>
				</button>
			{/if}
		</div>
		<p class="getting-started-subtitle">Complete these steps to set up your organization</p>

		<ul class="step-list">
			{#each steps as step}
				<li class="step" class:complete={step.complete}>
					<span class="step-icon">
						{#if step.complete}
							<svg width="18" height="18" viewBox="0 0 18 18" fill="none">
								<circle cx="9" cy="9" r="9" fill="var(--color-success)" />
								<path
									d="M5 9L8 12L13 6"
									stroke="white"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
						{:else}
							<svg width="18" height="18" viewBox="0 0 18 18" fill="none">
								<circle cx="9" cy="9" r="8" stroke="var(--color-border)" stroke-width="2" />
							</svg>
						{/if}
					</span>
					<span class="step-label">{step.label}</span>
					{#if !step.complete}
						<a href={step.link} class="step-link">Go &rarr;</a>
					{/if}
				</li>
			{/each}
		</ul>

		<div class="progress-section">
			<div class="progress-bar">
				<div class="progress-fill" style="width: {progressPct}%"></div>
			</div>
			<span class="progress-text">{completedCount} of {steps.length} complete</span>
		</div>
	</div>
{/if}

<style>
	.getting-started {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--spacing-lg);
		margin-bottom: var(--spacing-lg);
	}

	.getting-started-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--spacing-xs);
	}

	.getting-started-header h3 {
		margin: 0;
		font-size: var(--font-size-lg);
	}

	.getting-started-subtitle {
		color: var(--color-text-secondary);
		font-size: var(--font-size-sm);
		margin: 0 0 var(--spacing-md);
	}

	.dismiss-btn {
		background: none;
		border: none;
		cursor: pointer;
		padding: var(--spacing-xs);
		color: var(--color-text-muted);
		border-radius: var(--radius-sm);
		display: flex;
		align-items: center;
	}

	.dismiss-btn:hover {
		color: var(--color-text);
		background: var(--color-surface-variant);
	}

	.dismiss-confirm {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
	}

	.step-list {
		list-style: none;
		padding: 0;
		margin: 0 0 var(--spacing-md);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.step {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: var(--font-size-base);
	}

	.step.complete .step-label {
		color: var(--color-text-muted);
	}

	.step-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
	}

	.step-label {
		flex: 1;
	}

	.step-link {
		font-size: var(--font-size-sm);
		color: var(--color-primary);
		text-decoration: none;
		white-space: nowrap;
	}

	.step-link:hover {
		text-decoration: underline;
	}

	.progress-section {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	.progress-bar {
		flex: 1;
		height: 6px;
		background: var(--color-surface-variant);
		border-radius: var(--radius-full);
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--color-success);
		border-radius: var(--radius-full);
		transition: width 0.3s ease;
	}

	.progress-text {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		white-space: nowrap;
	}
</style>
```

- [ ] **Step 2: Verify no build errors**

Run: `npm run check`

- [ ] **Step 3: Commit**

```bash
git add src/features/onboarding/components/GettingStartedBanner.svelte
git commit -m "feat: add GettingStartedBanner component"
```

---

### Task 12: Wire Banner into Dashboard Page

**Files:**

- Modify: `src/routes/org/[orgId]/+page.svelte`

- [ ] **Step 1: Read the dashboard page**

Read `src/routes/org/[orgId]/+page.svelte` to find:

1. The import section
2. Where `data` is destructured or used
3. Where the welcome banner renders (lines ~388-402)
4. The `userRole` / `isOwner` / `isAdmin` check pattern

- [ ] **Step 2: Add import for GettingStartedBanner**

In the `<script>` imports section, add:

```typescript
import GettingStartedBanner from '$features/onboarding/components/GettingStartedBanner.svelte';
```

- [ ] **Step 3: Add dismiss handler**

In the `<script>` section, add a function to call the dismiss API:

```typescript
let gettingStartedDismissed = $state(data.gettingStartedDismissed);

async function dismissGettingStarted() {
	gettingStartedDismissed = true;
	await fetch(`/org/${data.orgId}/api/getting-started`, { method: 'POST' });
}
```

- [ ] **Step 4: Render the banner**

Place it **after the welcome banner** and **before the dashboard cards section**. Only show for owner/admin roles:

```svelte
{#if (data.userRole === 'owner' || data.userRole === 'admin') && !data.isDemoSandbox && !data.isDemoReadOnly}
	<GettingStartedBanner
		orgId={data.orgId}
		personnelCount={data.personnel?.length ?? 0}
		statusTypeCount={data.statusTypes?.length ?? 0}
		trainingTypeCount={data.trainingTypes?.length ?? 0}
		assignmentTypeCount={data.assignmentTypes?.length ?? 0}
		onboardingTemplateStepCount={data.onboardingTemplateStepCount}
		ratingSchemeEntryCount={data.ratingSchemeEntryCount}
		orgMemberCount={data.orgMemberCount}
		dismissed={gettingStartedDismissed}
		onDismiss={dismissGettingStarted}
	/>
{/if}
```

**Note:** `personnel`, `statusTypes`, and `trainingTypes` come from the layout data (accessible via `data`). `assignmentTypes`, `onboardingTemplateStepCount`, `ratingSchemeEntryCount`, `orgMemberCount`, and `gettingStartedDismissed` come from the page server load added in Task 9.

- [ ] **Step 5: Verify no build errors**

Run: `npm run check`

- [ ] **Step 6: Manual browser test**

1. Navigate to an org dashboard
2. Verify the Getting Started banner appears for owner/admin users
3. Verify completed steps show green checkmarks
4. Verify incomplete steps show "Go →" links
5. Verify dismiss confirmation works
6. Verify the banner hides after dismissal
7. Verify it does NOT appear for demo orgs

- [ ] **Step 7: Commit**

```bash
git add src/routes/org/[orgId]/+page.svelte
git commit -m "feat: wire GettingStartedBanner into dashboard page"
```

---

### Task 13: Update Changelog

**Files:**

- Modify: `src/lib/data/changelog.ts`

- [ ] **Step 1: Read current changelog**

Read `src/lib/data/changelog.ts` to see the current entries and format.

- [ ] **Step 2: Add new entry at the top of the array**

Add a new entry as the first item. Drop the oldest entry if there are already 5:

```typescript
{
	id: '2026-03-12-production-polish',
	date: '2026-03-12',
	title: 'Production Polish',
	items: [
		'Added a Getting Started checklist to help new organizations set up quickly',
		'Improved error pages so you see a friendly message instead of a blank screen when something goes wrong',
		'Added helpful descriptions to each permission setting so you know exactly what you\'re granting',
		'Various stability improvements under the hood'
	]
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/changelog.ts
git commit -m "feat: add production polish changelog entry"
```
