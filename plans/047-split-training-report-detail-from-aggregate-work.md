# Plan 047: Split Training report detail from aggregate work

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 0a6e6000..HEAD -- src/lib/server/core/useCases/trainingReportsQuery.ts src/lib/server/core/useCases/trainingReportsQuery.test.ts 'src/routes/org/[orgId]/training/reports/+page.server.ts' 'src/routes/org/[orgId]/api/training-reports/+server.ts' 'src/routes/org/[orgId]/api/training-reports/server.test.ts' 'src/routes/org/[orgId]/api/training-reports/reportInput.ts' src/features/training/components/TrainingReportsPage.svelte src/features/training/components/TrainingReportsPage.test.ts src/features/training/read-model/trainingReportScreenModel.ts src/features/training/read-model/trainingReportScreenModel.test.ts`
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

Training report pagination currently rebuilds the whole server report, including
dashboard aggregates and filter metadata, before slicing the requested page of
detail rows. The UI also fetches that full shape for every page request and sort
change.

After this plan, initial load and aggregate-changing filters can keep using the
full report endpoint, while page-only detail requests should fetch and replace
only `detail`. This reduces repeated aggregate work for large rosters without
changing export output or first-load semantics.

## Current state

- `src/lib/server/core/useCases/trainingReportsQuery.ts:141-210` loads active
  personnel, groups, training types, and all `personnel_trainings`, builds the
  matrix, computes the dashboard, builds pivot rows, filters, and sorts.
- `src/lib/server/core/useCases/trainingReportsQuery.ts:212-250` calls
  `buildTrainingReport`, then slices rows for the requested page.
- `src/routes/org/[orgId]/training/reports/+page.server.ts:30-35` uses
  `fetchTrainingReportPage` for initial page data.
- `src/routes/org/[orgId]/api/training-reports/+server.ts:13-20` returns full
  `TrainingReportData` for API page requests.
- `src/features/training/components/TrainingReportsPage.svelte:173-188`
  fetches `/api/training-reports` for page changes and casts the response to
  `TrainingReportData`.
- `src/features/training/components/TrainingReportsPage.svelte:145-153`,
  `252-275`, and `452-501` route sort/filter changes through
  `reloadFirstReportPage`.
- `src/features/training/read-model/trainingReportScreenModel.ts:128-137`
  treats server-backed reports as the source for dashboard and detail rows.

## Commands you will need

| Purpose                            | Command                                                                                                                                          | Expected on success      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| Install, if needed                 | `npm ci`                                                                                                                                         | exit 0                   |
| Svelte docs                        | Svelte MCP `list-sections` then `get-documentation` for relevant Svelte 5 / SvelteKit form and load sections                                     | docs reviewed            |
| Focused use-case tests             | `npx vitest run src/lib/server/core/useCases/trainingReportsQuery.test.ts`                                                                       | all pass                 |
| Focused route tests                | `npx vitest run 'src/routes/org/[orgId]/api/training-reports/server.test.ts'`                                                                    | all pass                 |
| Focused component/read-model tests | `npx vitest run src/features/training/read-model/trainingReportScreenModel.test.ts src/features/training/components/TrainingReportsPage.test.ts` | all pass                 |
| Svelte autofix                     | `svelte-autofixer src/features/training/components/TrainingReportsPage.svelte`                                                                   | no issues or suggestions |
| Format                             | `npm run format`                                                                                                                                 | exit 0                   |
| Lint                               | `npm run lint`                                                                                                                                   | exit 0                   |
| Governance                         | `npm run governance:check`                                                                                                                       | exit 0                   |
| Typecheck                          | `npm run check`                                                                                                                                  | exit 0                   |
| Full tests                         | `npm run test`                                                                                                                                   | exit 0                   |

## Suggested executor toolkit

- Because this plan edits a Svelte component, use the Svelte MCP documentation
  flow required by `AGENTS.md`, then run `svelte-autofixer` until it reports no
  issues or suggestions.

## Scope

**In scope**:

- `src/lib/server/core/useCases/trainingReportsQuery.ts`
- `src/lib/server/core/useCases/trainingReportsQuery.test.ts`
- `src/routes/org/[orgId]/api/training-reports/+server.ts`
- A new route under `src/routes/org/[orgId]/api/training-reports/detail/` if
  that is the cleanest route split
- `src/routes/org/[orgId]/api/training-reports/server.test.ts`
- `src/routes/org/[orgId]/api/training-reports/reportInput.ts`
- `src/features/training/read-model/trainingReportScreenModel.ts`
- `src/features/training/read-model/trainingReportScreenModel.test.ts`
- `src/features/training/components/TrainingReportsPage.svelte`
- `src/features/training/components/TrainingReportsPage.test.ts`
- `plans/README.md` status row only

**Out of scope**:

- Do not change Training report workbook export semantics.
- Do not change initial page load output.
- Do not change training status calculations.
- Do not add a migration.
- Do not rewrite the Training reports UI.
- Do not remove the full `/api/training-reports` endpoint; keep compatibility
  for aggregate-changing requests.

## Git workflow

- Branch: `codex/047-split-training-report-detail-from-aggregate-work`
- Commit style: short imperative subject. Suggested:
  `Split Training report detail fetches`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extract reusable detail construction

In `trainingReportsQuery.ts`, refactor without changing output:

- keep `fetchTrainingReportPage` returning the existing `TrainingReportData`,
- extract the detail pagination/sort/slice work into a helper that returns
  `TrainingReportDetail`,
- keep dashboard and filter metadata construction in the full report path.

Add an exported use case similar to:

```ts
export async function fetchTrainingReportDetailPage(
	ctx: QueryPorts,
	input: TrainingReportInput = {}
): Promise<TrainingReportDetail> {
	// require policy, load the source data needed for rows, sort, filter, and page,
	// then return only the detail object.
}
```

The first implementation may still load personnel, training types, and
personnel trainings because detail cells need them. The win for this slice is
skipping dashboard aggregate construction, filter option construction, and full
`TrainingReportData` serialization on page-only requests.

### Step 2: Add a detail API route

Add either:

- `src/routes/org/[orgId]/api/training-reports/detail/+server.ts`, or
- an explicit `detailOnly=true` branch in the existing route.

Prefer the new route if it keeps route contracts easy to test. It should:

- use the same `POLICY_ACTION_CATALOG.training.viewRecords` policy,
- reuse `parseTrainingReportInput` and `toTrainingReportInput`,
- return `TrainingReportDetail`,
- use `PRIVATE_REPORT_HEADERS`.

Add route tests that mirror the existing access-denied and private-cache tests
for the detail endpoint.

### Step 3: Add URL/read-model helpers

In `trainingReportScreenModel.ts`, add a helper such as
`buildTrainingReportDetailUrl` that points at the detail route and preserves the
same filters, sort, page, and pageSize query parameters.

Add tests beside the existing URL helper tests proving:

- the detail URL points at `/api/training-reports/detail`,
- pagination is included,
- export URLs still omit pagination.

### Step 4: Merge detail responses into the active report

In `TrainingReportsPage.svelte`, update page-only loading so it fetches the
detail endpoint, then merges the returned detail into the existing aggregate
report:

```ts
const nextDetail = (await response.json()) as TrainingReportDetail;
const nextReport = { ...activeReport, detail: nextDetail };
```

Use the detail endpoint for:

- next/previous page,
- sort changes,
- status-only filter changes if the existing dashboard intentionally remains
  status-independent.

Keep the full endpoint for changes that alter dashboard/filter metadata:

- group,
- MOS,
- role,
- rank,
- training type filters,
- clear filters when it changes any of those aggregate-affecting filters.

If distinguishing those paths inside the component becomes too tangled, stop and
report rather than rewriting the screen state model.

### Step 5: Add component regression tests

Update `TrainingReportsPage.test.ts`:

- next page fetches `/api/training-reports/detail`,
- returned `detail` replaces the active report detail while keeping the existing
  dashboard, trainingTypes, and filterOptions,
- aggregate-changing filter changes still fetch `/api/training-reports`,
- export still uses `/api/training-reports/export`.

**Verify**:
`npx vitest run src/features/training/read-model/trainingReportScreenModel.test.ts src/features/training/components/TrainingReportsPage.test.ts`
exits 0.

### Step 6: Run Svelte autofix and the full gate

Run `svelte-autofixer` on the edited Svelte file and apply fixes until no issues
or suggestions remain.

**Verify**:
`npm run format && npm run lint && npm run governance:check && npm run check && npm run test`
all exit 0.

## Test plan

- Use-case tests for full report output and detail-only output.
- API route tests for policy, response shape, and private headers.
- Read-model URL helper tests.
- Svelte component tests for detail merge and full-route fallback.
- Svelte autofixer.
- Full repo gate.

## Done criteria

- [ ] Full report initial load still returns unchanged `TrainingReportData`.
- [ ] A detail-only server path returns `TrainingReportDetail`.
- [ ] Page navigation uses the detail endpoint and preserves existing dashboard
      metadata client-side.
- [ ] Aggregate-changing filters still use the full endpoint.
- [ ] Training report export output is unchanged.
- [ ] Svelte autofixer reports no issues or suggestions.
- [ ] The full repo gate passes.
- [ ] `plans/README.md` status row for 047 is updated.

## STOP conditions

Stop and report back if:

- The screen state cannot safely distinguish detail-only changes from
  aggregate-changing changes without a broader UI rewrite.
- Detail-only output changes the meaning of dashboard status counts.
- Export behavior would change.
- The implementation would require a migration or production database access.

## Maintenance notes

This plan deliberately stops short of SQL-level report aggregation. Once the UI
has a detail-only contract, a later plan can push more of the row filtering,
sorting, and pagination into database-backed read models.
