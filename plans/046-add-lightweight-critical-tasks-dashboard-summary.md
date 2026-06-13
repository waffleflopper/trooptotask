# Plan 046: Add lightweight Critical Tasks dashboard summary

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 0a6e6000..HEAD -- 'src/routes/org/[orgId]/(dashboard)/+page.server.ts' 'src/routes/org/[orgId]/(dashboard)/page.server.test.ts' src/lib/server/core/useCases/criticalTasksReportsQuery.ts src/lib/server/core/useCases/criticalTasksReportsQuery.test.ts src/features/critical-tasks/utils/ictReports.ts src/features/critical-tasks/utils/ictReports.test.ts src/features/dashboard/dashboard.types.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `0a6e6000`, 2026-06-13

## Why this matters

The org dashboard only renders a compact Critical Tasks card, but the server
currently builds the full Critical Tasks report dashboard first. That includes
full readiness matrix rows, distribution data, expiration cliff data, and full
at-risk/task lists before the dashboard route slices most of it away.

After this plan, the dashboard route should call a dedicated lightweight summary
use case that computes only the fields needed by `DashboardIctlSummary`. The
Critical Tasks report page and workbook export should keep their full report
builder unchanged.

## Current state

- `src/routes/org/[orgId]/(dashboard)/+page.server.ts:21-65` trims a full
  `IctReportDashboard` down to `DashboardIctlSummary`.
- `src/routes/org/[orgId]/(dashboard)/+page.server.ts:68-75` calls
  `fetchCriticalTasksReportDashboard(ctx)` for the dashboard summary path:

```ts
const report = await fetchCriticalTasksReportDashboard(ctx);
return toDashboardIctlSummary(report);
```

- `src/lib/server/core/useCases/criticalTasksReportsQuery.ts:88-106` loads
  report completions and calls the full `buildIctReportDashboard`.
- `src/features/critical-tasks/utils/ictReports.ts:645-729` builds full report
  structures including `readinessTrend`, `expirationCliff`, `readinessMatrix`,
  `readinessDistribution`, `tasksBelowThreshold.rows`, and
  `atRiskSoldiers.rows`.
- `src/routes/org/[orgId]/(dashboard)/page.server.test.ts:110-188` mocks the
  full report shape, and lines 303 and 350 assert the Critical Tasks fetch is or
  is not called depending on access.

## Commands you will need

| Purpose                       | Command                                                                                                                              | Expected on success |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| Install, if needed            | `npm ci`                                                                                                                             | exit 0              |
| Focused dashboard route tests | `npx vitest run 'src/routes/org/[orgId]/(dashboard)/page.server.test.ts'`                                                            | all pass            |
| Focused Critical Tasks tests  | `npx vitest run src/lib/server/core/useCases/criticalTasksReportsQuery.test.ts src/features/critical-tasks/utils/ictReports.test.ts` | all pass            |
| Format                        | `npm run format`                                                                                                                     | exit 0              |
| Lint                          | `npm run lint`                                                                                                                       | exit 0              |
| Governance                    | `npm run governance:check`                                                                                                           | exit 0              |
| Typecheck                     | `npm run check`                                                                                                                      | exit 0              |
| Full tests                    | `npm run test`                                                                                                                       | exit 0              |

## Scope

**In scope**:

- `src/lib/server/core/useCases/criticalTasksReportsQuery.ts`
- `src/lib/server/core/useCases/criticalTasksReportsQuery.test.ts`
- `src/features/critical-tasks/utils/ictReports.ts`
- `src/features/critical-tasks/utils/ictReports.test.ts`
- `src/routes/org/[orgId]/(dashboard)/+page.server.ts`
- `src/routes/org/[orgId]/(dashboard)/page.server.test.ts`
- `src/features/dashboard/dashboard.types.ts` only if the summary type needs a
  small companion type
- `plans/README.md` status row only

**Out of scope**:

- Do not change the Critical Tasks report page shape.
- Do not change report workbook export output.
- Do not add a migration or alter Critical Tasks read models.
- Do not remove capability checks from the dashboard route.
- Do not change dashboard visual design.

## Git workflow

- Branch: `codex/046-lightweight-critical-tasks-dashboard-summary`
- Commit style: short imperative subject. Suggested:
  `Add lightweight Critical Tasks dashboard summary`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Introduce a dashboard-summary builder

In `src/features/critical-tasks/utils/ictReports.ts`, add a builder that returns
only the compact fields the org dashboard needs.

Accept the same core inputs as `buildIctReportDashboard`:

- personnel,
- active tasks,
- completions,
- settings,
- optional `asOf`.

The result should be a Critical Tasks feature type, not an app-route type. A
reasonable name is `IctDashboardSummarySource` or `IctReportDashboardSummary`.
The dashboard route can map that type into `DashboardIctlSummary`.

Compute only:

- KPI values used by the dashboard card,
- top 3 MOS readiness rows,
- last 6 readiness trend points,
- top 3 tasks below threshold,
- top 3 at-risk soldiers,
- projected readiness at month 6.

Do not build `readinessDistribution`. Do not build a full
`readinessMatrix` object if the summary can compute top MOS readiness directly.
Do not materialize full task/person rows if the helper can sort and keep only
the top 3.

If an existing utility only returns full rows, it is acceptable to add an
optional limit parameter to that utility, but keep existing call sites
behavior-compatible by default.

### Step 2: Add a lightweight use case

In `criticalTasksReportsQuery.ts`, export a new use case, for example:

```ts
export async function fetchCriticalTasksDashboardSummary(
	ctx: QueryPorts,
	input: CriticalTasksReportInput = {}
): Promise<IctReportDashboardSummary> {
	const source = await loadCriticalTasksReportSource(ctx);
	const filteredPersonnel = filterIctReportPersonnel(source.personnel, input.filters ?? {});
	const completions = await loadReportCompletions(
		ctx,
		filteredPersonnel.map((person) => person.id),
		source.tasks.map((task) => task.id)
	);
	return buildIctReportDashboardSummary({ ... });
}
```

Keep `fetchCriticalTasksReportDashboard`, `fetchCriticalTasksReportsPageModel`,
and exports on the existing full builder.

### Step 3: Switch the dashboard route to the summary use case

Update `src/routes/org/[orgId]/(dashboard)/+page.server.ts` so
`loadDashboardIctlSummary` calls the new lightweight use case.

Keep the existing access behavior:

- return `null` when the member cannot view Critical Tasks,
- do not call the Critical Tasks use case without access,
- preserve the returned `DashboardIctlSummary` shape.

### Step 4: Add equivalence and route tests

Add or update focused tests:

- a Critical Tasks utility/use-case test proving the new summary matches the
  dashboard-facing fields from `buildIctReportDashboard` for a seeded fixture,
- a test proving the summary builder does not populate `readinessDistribution`
  or a full matrix-only payload,
- dashboard route test now mocks the new lightweight use case, not
  `fetchCriticalTasksReportDashboard`,
- existing "no Critical Tasks access" test still proves the use case is not
  called.

**Verify**:
`npx vitest run src/lib/server/core/useCases/criticalTasksReportsQuery.test.ts src/features/critical-tasks/utils/ictReports.test.ts 'src/routes/org/[orgId]/(dashboard)/page.server.test.ts'`
exits 0.

### Step 5: Run the full gate

**Verify**:
`npm run format && npm run lint && npm run governance:check && npm run check && npm run test`
all exit 0.

## Test plan

- Utility equivalence tests against the existing full report builder.
- Use-case tests for the new lightweight fetch path.
- Dashboard route tests for access gating and returned summary shape.
- Full repo gate.

## Done criteria

- [ ] The org dashboard no longer calls `fetchCriticalTasksReportDashboard`.
- [ ] A dedicated Critical Tasks dashboard-summary use case returns the same
      dashboard-facing values.
- [ ] Full report page and workbook export behavior remain unchanged.
- [ ] No migration is added.
- [ ] Focused and full verification commands pass.
- [ ] `plans/README.md` status row for 046 is updated.

## STOP conditions

Stop and report back if:

- Matching dashboard values requires building the complete full report anyway.
- The summary change would alter report/export data contracts.
- The implementation would require a database migration or production data
  access.
- The route capability gate becomes harder to prove in tests.

## Maintenance notes

This plan targets dashboard waste only. A separate read-model plan can still be
valuable for Critical Tasks report/export workloads that need bounded completion
history or aggregate SQL.
