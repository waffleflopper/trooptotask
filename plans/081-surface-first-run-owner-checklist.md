# Plan 081: Surface the first-run owner setup checklist on the dashboard

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. This plan edits Svelte files, so follow the repo's Svelte MCP and
> `svelte-autofixer` workflow. If anything in the "STOP conditions" section
> occurs, stop and report. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 03af64cb..HEAD -- src/routes/org/[orgId]/api/getting-started/+server.ts 'src/routes/org/[orgId]/(dashboard)' src/features/dashboard/read-model/dashboardScreenModel.svelte.ts src/features/dashboard/read-model/dashboardScreenModel.svelte.test.ts src/features/dashboard/components src/features/dashboard/dashboard.types.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plan 080
- **Category**: direction
- **Planned at**: commit `03af64cb`, 2026-06-15

## Why this matters

Paid or reviewed-launch users need a clear first-run path once they land in a
new Organization. The dashboard already fetches support data for a
getting-started checklist, and the read model already supports dismissal, but
the main dashboard view does not surface a checklist. This is a contained
launch-readiness improvement that helps owners/admins configure the workspace
without requiring a broad onboarding redesign.

## Current state

- `src/routes/org/[orgId]/api/getting-started/+server.ts` returns counts for
  onboarding template steps, rating scheme entries, organization members, and
  whether the current user dismissed the checklist.
- `DashboardScreenModel` stores support data, exposes getters, and has
  `dismissGettingStarted()`.
- `src/routes/org/[orgId]/(dashboard)/+page.svelte` lazily fetches support data
  for owners/admins and applies it to the model.
- `DashboardPageView.svelte` renders `OverviewTab` when hydrated.
- `OverviewTab.svelte` renders the main cards but has no visible
  getting-started checklist.

Current excerpts:

```ts
// src/routes/org/[orgId]/api/getting-started/+server.ts
return {
	onboardingTemplateStepCount: onboardingTemplateStepCount.count ?? 0,
	ratingSchemeEntryCount: ratingSchemeEntryCount.count ?? 0,
	orgMemberCount: orgMemberCount.count ?? 0,
	gettingStartedDismissed: gettingStartedData?.dismissed_at != null
};
```

```ts
// src/features/dashboard/read-model/dashboardScreenModel.svelte.ts
gettingStartedDismissed = $state(false);
private supportData = $state<DashboardSupportData | null>(null);
...
async dismissGettingStarted() {
	this.gettingStartedDismissed = true;
	const response = await fetch(`/org/${this.data.orgId}/api/getting-started`, { method: 'POST' });
```

```svelte
<!-- src/routes/org/[orgId]/(dashboard)/+page.svelte -->
{#if canLoadSupport && supportLoading && !ctx.hasSupportData}
	<section class="workspace-support-notice">Loading workspace support...</section>
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Svelte docs | Svelte MCP `list-sections`, then `get-documentation` for relevant Svelte/SvelteKit sections | docs read before editing `.svelte` files |
| Svelte autofix | `svelte-autofixer` on edited Svelte files | no issues or suggestions remain |
| Read-model tests | `npx vitest run src/features/dashboard/read-model/dashboardScreenModel.svelte.test.ts src/features/dashboard/read-model/dashboardScreenModelBanner.svelte.test.ts` | all pass |
| Dashboard component tests | `npx vitest run src/features/dashboard/components/DashboardPageView.svelte.test.ts 'src/routes/org/[orgId]/(dashboard)/page.svelte.test.ts' 'src/routes/org/[orgId]/(dashboard)/page.server.test.ts'` | all pass |
| Full repo gate | `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` | all exit 0 |

## Scope

**In scope**:

- `src/features/dashboard/read-model/dashboardScreenModel.svelte.ts`
- `src/features/dashboard/read-model/dashboardScreenModel.svelte.test.ts`
- `src/features/dashboard/read-model/dashboardScreenModelBanner.svelte.test.ts`
- `src/features/dashboard/components/DashboardPageView.svelte`
- `src/features/dashboard/components/tabs/OverviewTab.svelte`
- A new dashboard component such as
  `src/features/dashboard/components/GettingStartedCard.svelte`
- Dashboard component/page tests
- `src/features/dashboard/dashboard.types.ts` only if the checklist item type
  needs to be exported
- `plans/README.md` status row only

**Out of scope**:

- No database schema changes unless the existing `getting_started_progress`
  table is proven insufficient. If schema changes appear necessary, STOP.
- No route redesign or dashboard layout overhaul.
- No changes to Organization provisioning.
- No new auth, billing, or access-request behavior.
- No route-local visual system. Use shared UI primitives and Tailwind utility
  composition that matches the current dashboard cards.

## Git workflow

- Branch: `codex/081-first-run-owner-checklist`
- Commit style: short imperative subject, for example
  `Surface dashboard getting started checklist`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 0: Follow the Svelte workflow before editing

Read `docs/agents/svelte.md` and use the Svelte MCP documentation flow:

1. `list-sections`
2. `get-documentation` for sections relevant to Svelte components, event
   handlers, and runes/state.
3. After edits, run `svelte-autofixer` on edited Svelte files until it reports
   no issues or suggestions.

**Verify**:
You can name the Svelte docs sections read in the PR/plan notes.

### Step 1: Add a small read-model checklist view

Add a derived checklist view to `DashboardScreenModel` rather than duplicating
logic in Svelte. Suggested shape:

```ts
export interface DashboardGettingStartedItem {
	id: string;
	label: string;
	description: string;
	href: string;
	complete: boolean;
}

get gettingStartedItems(): DashboardGettingStartedItem[] { ... }
get shouldShowGettingStarted(): boolean { ... }
```

Use existing data and support counts:

- personnel added: `personnelCount > 0`,
- status/training/assignment setup: existing dashboard counts,
- invite at least one other Organization Member: `orgMemberCount > 1`,
- onboarding template configured: `onboardingTemplateStepCount > 0`,
- rating scheme configured: `ratingSchemeEntryCount > 0`.

Keep billing/security review as copy/link only if plan 080/079 made it relevant;
do not invent new support data fields.

**Verify**:
Add read-model tests for complete/incomplete items, support data arriving after
construction, dismissal hiding the checklist, and member role behavior if role
is represented in the model.

### Step 2: Render the checklist in the dashboard

Create a focused component, for example
`src/features/dashboard/components/GettingStartedCard.svelte`, and render it
near the top of `OverviewTab.svelte` when:

- support data has loaded,
- the checklist is not dismissed,
- at least one item is incomplete,
- the user is owner/admin if the model exposes role or the route only loads
  support data for owner/admin.

Use shared components already present in the dashboard (`Card`, `Badge`,
`Button`, `Progress` if useful). Include a dismiss action that calls
`ctx.dismissGettingStarted()`.

Do not use visible instructional text about keyboard shortcuts or internal
implementation. Keep copy task-oriented: add roster, configure statuses, invite
leaders, set up onboarding, configure evals.

**Verify**:
`npx vitest run src/features/dashboard/components/DashboardPageView.svelte.test.ts`
passes with new assertions that incomplete checklist items render and dismissal
calls the model method.

### Step 3: Preserve lazy support loading behavior

Do not move the support query back into the page server load. The current
server test asserts dashboard summary streams without starting non-critical
support queries in page server load.

If the checklist needs a loading state, keep the existing
`workspace-support-notice` behavior or render nothing until `ctx.hasSupportData`
is true.

**Verify**:
`npx vitest run 'src/routes/org/[orgId]/(dashboard)/page.server.test.ts' 'src/routes/org/[orgId]/(dashboard)/page.svelte.test.ts'`
passes.

### Step 4: Run Svelte and repo verification

Run `svelte-autofixer` on every edited Svelte file until clean, then run focused
tests and the full repo gate.

**Verify**:

- Svelte autofixer reports no issues/suggestions.
- `npx vitest run src/features/dashboard/read-model/dashboardScreenModel.svelte.test.ts src/features/dashboard/read-model/dashboardScreenModelBanner.svelte.test.ts src/features/dashboard/components/DashboardPageView.svelte.test.ts 'src/routes/org/[orgId]/(dashboard)/page.svelte.test.ts' 'src/routes/org/[orgId]/(dashboard)/page.server.test.ts'` -> all pass.
- `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` -> all exit 0.

## Test plan

- Read-model tests:
  - checklist item completion by count,
  - support data applied after construction,
  - dismissed checklist hides,
  - no support data means no checklist.
- Component tests:
  - checklist renders incomplete items,
  - complete items show as complete,
  - dismiss button calls `dismissGettingStarted`,
  - dismissed checklist is not visible.
- Route tests:
  - support data remains lazy,
  - retry notice remains available on support failure.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Owners/admins with incomplete setup see a getting-started checklist on the
      dashboard after support data loads.
- [ ] Non-privileged members do not trigger support loading or see owner/admin
      setup prompts.
- [ ] Dismiss persists via `POST /org/[orgId]/api/getting-started` and rolls
      back on failure.
- [ ] No new database tables or migrations are added.
- [ ] Svelte autofixer is clean for edited Svelte files.
- [ ] Focused dashboard tests and required repo checks pass.
- [ ] `plans/README.md` status row for 081 updated.

## STOP conditions

Stop and report back if:

- Implementing the checklist requires new persisted state beyond
  `getting_started_progress`.
- The dashboard support data endpoint no longer matches the current-state
  excerpts.
- The UI requires a route-level visual redesign or new component-system API.
- Svelte MCP docs or autofixer are unavailable.
- A checklist item would require changing billing, access request, or
  provisioning behavior.

## Maintenance notes

- Keep the checklist as a light dashboard card. Do not turn it into a tour or
  a second onboarding system.
- If future setup items require more support data, add them through the
  `getting-started` endpoint and read model rather than fetching ad hoc from the
  component.
- Revisit the checklist after the first paid-launch users complete setup; the
  highest-friction item should drive the next iteration.
