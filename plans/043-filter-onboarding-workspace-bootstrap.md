# Plan 043: Filter onboarding workspace bootstrap by route mode

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 0a6e6000..HEAD -- src/lib/server/core/useCases/onboardingQuery.ts src/lib/server/core/useCases/onboardingQuery.test.ts src/features/onboarding/server/onboardingWorkspaceBootstrap.ts src/features/onboarding/server/onboardingWorkspaceBootstrap.test.ts src/routes/org/[orgId]/onboarding src/features/onboarding/contexts/OnboardingPageContext.svelte.ts src/features/onboarding/onboardingWorkspaceHydration.svelte.ts supabase/migrations/20260413001158_remote_schema.sql`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `0a6e6000`, 2026-06-13

## Why this matters

The onboarding workspace bootstrap currently loads every historical onboarding plus nested step
progress before the active board filters to `in_progress` in the browser. That makes the normal
`/onboarding` page scale with completed/cancelled history even though the database already has an
active-onboarding partial index. After this plan, the active board should stream only active
onboardings, while the history route still gets completed/cancelled records.

## Current state

- `src/routes/org/[orgId]/onboarding/+layout.server.ts:18-22` streams onboarding data for the
  whole onboarding route subtree.
- `src/features/onboarding/server/onboardingWorkspaceBootstrap.ts:92-105` always calls
  `fetchOnboardingBootstrap(ctx)` and hydrates the shared onboarding stores.
- `src/lib/server/core/useCases/onboardingQuery.ts:86-95` loads all onboarding rows:

```ts
const [templateRows, templateStepRows, onboardingRows, personnel, groupRows, trainingTypeRows] = await Promise.all([
	ctx.store.findMany<Record<string, unknown>>('personnel_onboardings', orgId, undefined, {
		select: PersonnelOnboardingEntity.select
	})
]);
```

- `src/lib/server/entities/personnelOnboarding.ts:16-20` eagerly selects nested step progress:

```ts
export const PersonnelOnboardingEntity = defineEntity<PersonnelOnboarding>({
	table: 'personnel_onboardings',
	groupScope: 'none',
	select: '*, onboarding_step_progress(*)',
```

- `src/features/onboarding/contexts/OnboardingPageContext.svelte.ts:221-223` filters active rows
  after hydration:

```ts
get filteredOnboardings(): PersonnelOnboarding[] {
	return onboardingStore.items.filter((o) => o.status === 'in_progress');
}
```

- `src/routes/org/[orgId]/onboarding/history/+page.svelte:34-36` uses the same hydrated store and
  filters completed/cancelled rows in the browser.
- The schema has an active partial index:

```sql
CREATE UNIQUE INDEX "personnel_onboardings_active_idx" ON "public"."personnel_onboardings" USING "btree" ("organization_id", "personnel_id") WHERE ("status" = 'in_progress'::"text");
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Install, if needed | `npm ci` | exit 0 |
| Focused onboarding use-case tests | `npx vitest run src/lib/server/core/useCases/onboardingQuery.test.ts` | all pass |
| Focused bootstrap/route tests | `npx vitest run src/features/onboarding/server/onboardingWorkspaceBootstrap.test.ts src/routes/org/[orgId]/onboarding` | all pass |
| Focused Svelte tests | `npx vitest run src/features/onboarding src/routes/org/[orgId]/onboarding` | all pass |
| Format | `npm run format` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Governance | `npm run governance:check` | exit 0 |
| Typecheck | `npm run check` | exit 0 |
| Full tests | `npm run test` | exit 0 |

## Suggested executor toolkit

- When editing Svelte files, use the Svelte MCP documentation flow required by `AGENTS.md`, then run
  `svelte-autofixer` until it reports no issues or suggestions.

## Scope

**In scope**:

- `src/lib/server/core/useCases/onboardingQuery.ts`
- `src/lib/server/core/useCases/onboardingQuery.test.ts`
- `src/features/onboarding/server/onboardingWorkspaceBootstrap.ts`
- `src/features/onboarding/server/onboardingWorkspaceBootstrap.test.ts`
- `src/routes/org/[orgId]/onboarding/+layout.server.ts`
- `src/routes/org/[orgId]/onboarding/onboarding-layout.server.test.ts`
- `src/routes/org/[orgId]/onboarding/history/+page.svelte` and its test only if the data contract changes
- `plans/README.md` status row only

**Out of scope**:

- Do not change onboarding lifecycle mutations.
- Do not change step-progress storage.
- Do not change retention cleanup behavior from plan 022.
- Do not add a migration; the active partial index already exists.
- Do not remove history functionality.

## Git workflow

- Branch: `codex/043-filter-onboarding-workspace-bootstrap`
- Commit style: short imperative subject. Suggested: `Filter onboarding bootstrap by route mode`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add an explicit bootstrap mode

In `src/lib/server/core/useCases/onboardingQuery.ts`, add an options type:

```ts
export type OnboardingBootstrapMode = 'all' | 'active' | 'history';

export interface FetchOnboardingBootstrapOptions {
	mode?: OnboardingBootstrapMode;
}
```

Keep the default mode as `all` so direct tests and any unreviewed callers do not silently change.
Add a helper that converts mode to onboarding filters:

- `active`: `filters: { status: 'in_progress' }`,
- `history`: `inFilters: { status: ['completed', 'cancelled'] }`,
- `all`: no status filter.

Use `ctx.store.findMany('personnel_onboardings', orgId, filters, { select, inFilters })` so active
mode can use the existing partial active index in Supabase.

**Verify**:
`npx vitest run src/lib/server/core/useCases/onboardingQuery.test.ts` exits 0 after tests are
updated.

### Step 2: Add query tests for active and history modes

Extend `onboardingQuery.test.ts` with tests that spy on `ctx.store.findMany` and seed a mix of
`in_progress`, `completed`, and `cancelled` rows.

Required cases:

- default `fetchOnboardingBootstrap(ctx)` still returns all onboardings,
- `fetchOnboardingBootstrap(ctx, { mode: 'active' })` returns only `in_progress`,
- active mode passes `{ status: 'in_progress' }` to the `personnel_onboardings` query,
- `fetchOnboardingBootstrap(ctx, { mode: 'history' })` returns only completed/cancelled,
- group-scoped filtering still applies after the status-filtered query,
- training completion hydration still runs only for active training-backed onboardings.

### Step 3: Thread route mode through the streamed workspace

Update `src/features/onboarding/server/onboardingWorkspaceBootstrap.ts` so
`streamOnboardingWorkspaceBootstrap` accepts an optional mode and passes it to
`fetchOnboardingBootstrap`.

Update `src/routes/org/[orgId]/onboarding/+layout.server.ts` to choose the mode from the route:

- history route: `mode: 'history'`,
- all other onboarding subtree routes: `mode: 'active'`.

Use `event.url.pathname` for this first slice. If the route tree has changed enough that pathname
mode selection is fragile, stop and report rather than reshaping the route hierarchy.

**Verify**:
`npx vitest run src/features/onboarding/server/onboardingWorkspaceBootstrap.test.ts src/routes/org/[orgId]/onboarding/onboarding-layout.server.test.ts`
exits 0.

### Step 4: Confirm page/store behavior

The active page may keep `OnboardingPageContext.filteredOnboardings`; it becomes a harmless guard
after active-mode hydration. The history page may keep its browser-side completed/cancelled filter;
it becomes a harmless guard after history-mode hydration.

Add or update tests to prove:

- `/onboarding` receives active mode,
- `/onboarding/history` receives history mode,
- history still renders completed/cancelled rows,
- active board does not render completed/cancelled rows when mixed data is seeded.

**Verify**:
`npx vitest run src/routes/org/[orgId]/onboarding src/features/onboarding`
exits 0.

### Step 5: Run the full gate

**Verify**:
`npm run format && npm run lint && npm run governance:check && npm run check && npm run test`
all exit 0.

## Test plan

- Use-case tests for `all`, `active`, and `history` bootstrap modes.
- Server bootstrap/layout tests for route-mode threading.
- Existing Svelte tests for onboarding active and history pages.
- Full repo gate.

## Done criteria

- [ ] Active onboarding route streams only `in_progress` onboardings.
- [ ] History onboarding route still streams completed/cancelled onboardings.
- [ ] Default use-case behavior remains `all` for unreviewed direct callers.
- [ ] Group-scoped filtering still applies.
- [ ] Training completion hydration remains correct for active training steps.
- [ ] No migration is added.
- [ ] The full repo gate passes.
- [ ] `plans/README.md` status row for 043 is updated.

## STOP conditions

Stop and report back if:

- The onboarding route tree changed and parent layout mode selection is no longer reliable.
- The history page requires all active rows to render correctly.
- The fix requires changing onboarding mutation APIs.
- Tests show scoped users can see onboardings outside their personnel scope.

## Maintenance notes

This plan deliberately keeps the shared store hydration pattern. If onboarding history grows beyond
what a single history route should load, the next step should be paginated history, not reverting
the active board to full-history hydration.
