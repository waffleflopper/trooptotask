# Plan 065: Retire dormant dashboard tab configuration

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 9a1e439b..HEAD -- src/features/dashboard/components/DashboardPageView.svelte src/features/dashboard/components/DashboardPageView.svelte.test.ts src/features/dashboard/components/tabs src/features/dashboard/stores/dashboardTabStore.svelte.ts src/features/dashboard/stores/dashboardTabStore.svelte.test.ts src/features/dashboard/dashboard.types.ts src/features/dashboard/index.ts src/features/dashboard/read-model/dashboardScreenModel.svelte.ts src/routes/org/[orgId]/api/dashboard-config/+server.ts src/routes/org/[orgId]/api/dashboard-config/server.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `9a1e439b`, 2026-06-14

## Why this matters

The dashboard page now renders only `OverviewTab`, but the codebase still has a
persisted dashboard tab preference store, `/api/dashboard-config` route, old
tab components, and config types for a multi-tab/widget dashboard shape. That
dead runtime surface adds API/tests/types to maintain and can mislead future
dashboard work into reviving the obsolete shape. This plan removes the unused
runtime pieces without dropping database tables or changing the overview page.

## Current state

- `DashboardPageView.svelte` imports and renders only `OverviewTab`.
- `dashboardTabStore.svelte.ts` still fetches and persists a default tab via
  `/api/dashboard-config`.
- `/org/[orgId]/api/dashboard-config` still reads/writes `dashboard_configs`.
- `dashboard.types.ts` still defines `DashboardTabId`, `DashboardConfig`,
  `DEFAULT_DASHBOARD_CONFIG`, and normalizers.
- `PeopleDutyTab.svelte`, `TrainingEvalsTab.svelte`, and
  `UnitReadinessTab.svelte` are not imported by the active page.
- `OverviewTab.svelte` still uses `ctx.unitReadiness`, so do not remove that
  read-model getter unless Overview no longer needs it.

Current excerpts:

```svelte
<!-- src/features/dashboard/components/DashboardPageView.svelte:3 -->
import OverviewTab from './tabs/OverviewTab.svelte';

<!-- src/features/dashboard/components/DashboardPageView.svelte:28 -->
<OverviewTab {ctx} />
```

```ts
// src/features/dashboard/stores/dashboardTabStore.svelte.ts:9
const ALL_TABS: DashboardTabId[] = ['overview', 'unit-readiness', 'people-duty', 'training-evals'];

// src/features/dashboard/stores/dashboardTabStore.svelte.ts:42
const res = await fetch(`/org/${orgId}/api/dashboard-config`);
```

```ts
// src/routes/org/[orgId]/api/dashboard-config/+server.ts:24
export const _getConfig: RouteConfig<void, DashboardConfigResponse> = {
```

```ts
// src/features/dashboard/dashboard.types.ts:8
export type DashboardTabId = 'overview' | 'unit-readiness' | 'people-duty' | 'training-evals';
```

```svelte
<!-- src/features/dashboard/components/tabs/OverviewTab.svelte:17 -->
const view = $derived(ctx.unitReadiness);
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Svelte docs flow | Svelte MCP `list-sections`, then `get-documentation` for relevant sections | docs read before Svelte edits |
| Dashboard tests | `npx vitest run src/features/dashboard/components/DashboardPageView.svelte.test.ts src/features/dashboard/read-model/dashboardScreenModel.svelte.test.ts` | exits 0 |
| Removed surface grep | `rg -n -e 'dashboardTabStore' -e 'dashboard-config' -e 'DashboardTabId' -e 'DashboardConfig' -e 'DEFAULT_DASHBOARD_CONFIG' -e 'normalizeDashboardConfig' -e 'WidgetInstance' -e 'isDashboardTabId' -e 'resolveDashboardTab' -e 'PeopleDutyTab' -e 'TrainingEvalsTab' -e 'UnitReadinessTab' src` | no runtime matches except intentional historical/data-store notes |
| Svelte autofix | `svelte-autofixer` on edited Svelte files | no issues or suggestions |
| Format | `npm run format` | exits 0 |
| Lint | `npm run lint` | exits 0 |
| Governance | `npm run governance:check` | exits 0 |
| Typecheck | `npm run check` | exits 0 |
| Unit tests | `npm run test` | exits 0 |

## Suggested executor toolkit

- Because this touches Svelte files, follow `docs/agents/svelte.md`: call the
  Svelte MCP `list-sections`, read every relevant returned `use_cases` section
  with `get-documentation`, and run `svelte-autofixer` until clean.

## Scope

**In scope**:

- `src/features/dashboard/components/DashboardPageView.svelte`
- `src/features/dashboard/components/DashboardPageView.svelte.test.ts`
- `src/features/dashboard/components/tabs/PeopleDutyTab.svelte`
- `src/features/dashboard/components/tabs/TrainingEvalsTab.svelte`
- `src/features/dashboard/components/tabs/UnitReadinessTab.svelte`
- `src/features/dashboard/components/tabs/UnitReadinessTab.svelte.test.ts`
- `src/features/dashboard/stores/dashboardTabStore.svelte.ts`
- `src/features/dashboard/stores/dashboardTabStore.svelte.test.ts`
- `src/features/dashboard/dashboard.types.ts`
- `src/features/dashboard/index.ts`
- `src/features/dashboard/read-model/dashboardScreenModel.svelte.ts`, only for
  unused people-duty/training-evals view types/getters
- `src/routes/org/[orgId]/api/dashboard-config/+server.ts`
- `src/routes/org/[orgId]/api/dashboard-config/server.test.ts`
- `plans/README.md` status row only

**Out of scope**:

- Do not drop or migrate the `dashboard_configs` table.
- Do not remove `dashboard_configs` support from generic DataStore adapters.
- Do not remove the organization export manifest entry in this plan.
- Do not redesign the Overview dashboard.
- Do not run this in parallel with plan 057 or other dashboard read-model work.

## Git workflow

- Branch: `codex/065-retire-dormant-dashboard-tab-configuration`
- Commit style: short imperative subject. Suggested: `Retire dormant dashboard tab configuration`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm the dormant surface

Run:

```bash
rg -n "dashboardTabStore|dashboard-config|DashboardTabId|DashboardConfig|DEFAULT_DASHBOARD_CONFIG|normalizeDashboardConfig|PeopleDutyTab|TrainingEvalsTab|UnitReadinessTab" src
```

Confirm the references are limited to the store/API/types/unused tab components
listed in this plan. If an active route or component imports one of these
symbols, stop and report back.

**Verify**: the reference set matches this plan's "Current state".

### Step 2: Remove dashboard config API and store

Delete:

- `src/features/dashboard/stores/dashboardTabStore.svelte.ts`,
- `src/features/dashboard/stores/dashboardTabStore.svelte.test.ts`,
- `src/routes/org/[orgId]/api/dashboard-config/+server.ts`,
- `src/routes/org/[orgId]/api/dashboard-config/server.test.ts`.

Update `src/features/dashboard/index.ts` so it no longer exports
`dashboardTabStore`, `DashboardConfig`, `DashboardTabId`, or
`DEFAULT_DASHBOARD_CONFIG`.

**Verify**:
`rg -n -e 'dashboardTabStore' -e 'dashboard-config' -e 'DashboardTabId' -e 'DashboardConfig' -e 'DEFAULT_DASHBOARD_CONFIG' -e 'normalizeDashboardConfig' -e 'WidgetInstance' -e 'isDashboardTabId' -e 'resolveDashboardTab' src/features/dashboard src/routes`
has no matches.

### Step 3: Remove obsolete dashboard config types

In `src/features/dashboard/dashboard.types.ts`, remove only the persisted
dashboard config/tab identity block:

- `DashboardTabId`,
- `WidgetInstance`,
- `DashboardConfig`,
- `DEFAULT_DASHBOARD_CONFIG`,
- `isDashboardTabId`,
- `resolveDashboardTab`,
- `normalizeDashboardConfig`.

Keep `DashboardPageData`, training issue types, and all dashboard data types
used by `OverviewTab` and the screen model.

**Verify**:
`npx vitest run src/features/dashboard/read-model/dashboardScreenModel.svelte.test.ts`
exits 0.

### Step 4: Delete unmounted legacy tab components

Delete old tab components that are not imported by `DashboardPageView`:

- `PeopleDutyTab.svelte`,
- `TrainingEvalsTab.svelte`,
- `UnitReadinessTab.svelte`,
- `UnitReadinessTab.svelte.test.ts`.

Do not delete `OverviewTab.svelte`. Do not delete `ctx.unitReadiness` if
`OverviewTab` still uses it.

If `DashboardScreenModel` people-duty or training-evals getters become unused
after component deletion, remove those interfaces/getters and their tests in the
same slice. Leave any getters still used by `OverviewTab`.

**Verify**:
`rg -n -e 'PeopleDutyTab' -e 'TrainingEvalsTab' -e 'UnitReadinessTab' -e 'ctx\\.peopleDuty' -e 'ctx\\.trainingEvals' src`
has no matches.

### Step 5: Keep the active dashboard covered

Run the active dashboard component tests and update snapshots/assertions only if
they referenced deleted tabs/config APIs. Do not change visible Overview
behavior.

**Verify**:
`npx vitest run src/features/dashboard/components/DashboardPageView.svelte.test.ts src/features/dashboard/read-model/dashboardScreenModel.svelte.test.ts`
exits 0.

### Step 6: Run Svelte autofix and full gate

Run `svelte-autofixer` on any edited Svelte files until it reports no issues or
suggestions.

Then run:

```bash
npm run format
npm run lint
npm run governance:check
npm run check
npm run test
```

**Verify**: every command exits 0.

## Test plan

- Active dashboard component tests remain green.
- Dashboard screen-model tests remain green.
- Removed-store/API tests are deleted with the removed runtime surface.
- Grep verifies old config and tab symbols are gone.
- Full repo gate.

## Done criteria

- [ ] No runtime code fetches `/api/dashboard-config`.
- [ ] Dashboard tab preference store/API/types are removed.
- [ ] Unmounted legacy tab components are removed.
- [ ] Overview dashboard behavior is unchanged.
- [ ] Svelte MCP/autofixer workflow completed for Svelte edits.
- [ ] Full repo gate passes.
- [ ] `plans/README.md` status row for 065 is updated.

## STOP conditions

Stop and report back if:

- Any active user-facing dashboard control still lets users choose tabs or save a
  default tab.
- Product direction says dashboard customization is coming back soon.
- Removing the API requires a database migration.
- `OverviewTab` depends on code that would be removed by deleting old tab view
  models.

## Maintenance notes

The `dashboard_configs` table can be retired later in a migration-specific
schema cleanup plan. This plan only removes the unused runtime surface.
