# Plan 049: Precompute DA6 matrix lookup maps

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 0a6e6000..HEAD -- src/features/duty-roster/components/shared/DA6Matrix.svelte src/features/duty-roster/components/shared/DutyRosterSharedWrappers.test.ts src/features/duty-roster/components/shared/DutyRosterSharedWrappersTest.svelte src/features/duty-roster/components/shared/da6MatrixPresenter.ts src/features/duty-roster/components/shared/da6MatrixPresenter.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `0a6e6000`, 2026-06-13

## Why this matters

The DA6 matrix renderer converts domain rows/columns to Operational Matrix rows
and columns, then repeatedly searches those converted arrays inside nested table
loops. For larger duty rosters, that adds avoidable work to every rendered cell
and footer cell.

After this plan, the component should precompute lookup maps once per input
change and use constant-time row/column lookup in the markup.

## Current state

- `src/features/duty-roster/components/shared/DA6Matrix.svelte:42-51` derives
  `matrixRows` and `matrixColumns`.
- `src/features/duty-roster/components/shared/DA6Matrix.svelte:114-116` looks
  up each header column with `.find`.
- `src/features/duty-roster/components/shared/DA6Matrix.svelte:126-143` looks
  up each row and each body column with `.find` inside nested loops.
- `src/features/duty-roster/components/shared/DA6Matrix.svelte:157-170`
  recreates footer row objects and looks up footer columns inside the footer
  loop.
- `src/features/duty-roster/components/shared/DutyRosterSharedWrappers.test.ts:44-56`
  renders the DA6 matrix and verifies accessible cells, metadata, footer rows,
  and legend text.

## Commands you will need

| Purpose                        | Command                                                                                          | Expected on success      |
| ------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------ |
| Install, if needed             | `npm ci`                                                                                         | exit 0                   |
| Svelte docs                    | Svelte MCP `list-sections` then `get-documentation` for relevant Svelte 5 derived-state sections | docs reviewed            |
| Svelte autofix                 | `svelte-autofixer src/features/duty-roster/components/shared/DA6Matrix.svelte`                   | no issues or suggestions |
| Focused shared component tests | `npx vitest run src/features/duty-roster/components/shared/DutyRosterSharedWrappers.test.ts`     | all pass                 |
| Presenter tests, if touched    | `npx vitest run src/features/duty-roster/components/shared/da6MatrixPresenter.test.ts`           | all pass                 |
| Format                         | `npm run format`                                                                                 | exit 0                   |
| Lint                           | `npm run lint`                                                                                   | exit 0                   |
| Governance                     | `npm run governance:check`                                                                       | exit 0                   |
| Typecheck                      | `npm run check`                                                                                  | exit 0                   |
| Full tests                     | `npm run test`                                                                                   | exit 0                   |

## Suggested executor toolkit

- Because this plan edits a Svelte component, use the Svelte MCP documentation
  flow required by `AGENTS.md`, then run `svelte-autofixer` until it reports no
  issues or suggestions.

## Scope

**In scope**:

- `src/features/duty-roster/components/shared/DA6Matrix.svelte`
- `src/features/duty-roster/components/shared/DutyRosterSharedWrappers.test.ts`
- `src/features/duty-roster/components/shared/DutyRosterSharedWrappersTest.svelte`
  only if a larger fixture is useful
- `src/features/duty-roster/components/shared/da6MatrixPresenter.ts` and test
  only if the presenter already has a better precomputed shape to reuse
- `plans/README.md` status row only

**Out of scope**:

- Do not change DA6 matrix presenter output.
- Do not change duty roster generation, acceptance, or correction behavior.
- Do not change Operational Matrix component APIs.
- Do not add virtualization in this plan.
- Do not add a migration.

## Git workflow

- Branch: `codex/049-precompute-da6-matrix-lookups`
- Commit style: short imperative subject. Suggested:
  `Precompute DA6 matrix lookup maps`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add derived lookup maps

In `DA6Matrix.svelte`, keep `matrixRows` and `matrixColumns`, then add derived
maps:

```ts
const matrixRowsById = $derived(new Map(matrixRows.map((row) => [row.id, row])));
const matrixColumnsById = $derived(new Map(matrixColumns.map((column) => [column.id, column])));
```

If Svelte autofixer suggests a different derived-state shape, prefer the
autofixer-compatible form.

### Step 2: Precompute footer operational rows

Avoid recreating footer row objects for each row header and cell. Add:

```ts
const matrixFooterRows = $derived(
	footerRows.map((footer): OperationalMatrixRow => ({ id: footer.label, label: footer.label, readOnly: true }))
);
const matrixFooterRowsById = $derived(new Map(matrixFooterRows.map((row) => [row.id, row])));
```

Use a helper only if it keeps the markup clearer.

### Step 3: Replace `.find` calls in markup

Replace header/body/footer lookups:

- `matrixColumns.find((item) => item.id === column.id)` becomes
  `matrixColumnsById.get(column.id)`,
- `matrixRows.find((item) => item.id === row.id)` becomes
  `matrixRowsById.get(row.id)`,
- footer rows use the precomputed footer row object.

Keep the existing fallback to the first row/column if a mismatch occurs. Do not
throw from the component; malformed matrix input should continue rendering as
defensively as it does today.

### Step 4: Add or strengthen component coverage

The existing wrapper test should still pass. If it does not prove the fallback
path, add a small fixture or component test that:

- renders a DA6 matrix with at least two rows and two columns,
- verifies the accessible labels still bind the intended row and column,
- verifies footer values still render under the correct dates.

**Verify**:
`npx vitest run src/features/duty-roster/components/shared/DutyRosterSharedWrappers.test.ts`
exits 0.

### Step 5: Run Svelte autofix and the full gate

Run `svelte-autofixer` on `DA6Matrix.svelte` and apply fixes until no issues or
suggestions remain.

**Verify**:
`npm run format && npm run lint && npm run governance:check && npm run check && npm run test`
all exit 0.

## Test plan

- Shared wrapper render test for DA6 matrix behavior.
- Presenter tests only if presenter code changes.
- Svelte autofixer.
- Full repo gate.

## Done criteria

- [ ] `DA6Matrix.svelte` no longer uses `.find` for row/column lookup inside
      header/body/footer loops.
- [ ] Footer operational rows are not recreated per footer cell.
- [ ] Accessible row/column labels and footer values still render correctly.
- [ ] Svelte autofixer reports no issues or suggestions.
- [ ] The full repo gate passes.
- [ ] `plans/README.md` status row for 049 is updated.

## STOP conditions

Stop and report back if:

- Operational Matrix APIs require referential behavior that the derived maps
  would break.
- Svelte derived-state constraints make the maps unstable or stale.
- The fix would require changing presenter output or duty roster domain logic.

## Maintenance notes

This is a component-level render optimization. If DA6 history pages are still
slow with very large accepted rosters, measure render cost before planning
virtualization or a paged matrix view.
