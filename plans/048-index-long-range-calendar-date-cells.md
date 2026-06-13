# Plan 048: Index long-range Calendar date cells

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 0a6e6000..HEAD -- src/features/calendar/utils/calendarRenderState.ts src/features/calendar/utils/calendarRenderState.test.ts src/features/calendar/components/LongRangeView.svelte src/features/calendar/components/LongRangeView.test.ts`
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

The long-range Calendar view virtualizes personnel rows, but each visible cell
still asks the render state for one person/date pair. That lookup currently
scans the person's cached date-cell array. With a three-month date window, every
visible roster row repeats a linear search for every day.

After this plan, `personDateCell(personId, dateKey)` should be constant-time
while preserving the existing `personDateCells(personId)` array API.

## Current state

- `src/features/calendar/utils/calendarRenderState.ts:191-233` lazily builds and
  caches each person's date-cell array.
- `src/features/calendar/utils/calendarRenderState.ts:235-237` resolves a
  single date cell with `.find`:

```ts
function personDateCell(personnelId: string, dateKey: CalendarDateKey): CalendarPersonDateCellState | undefined {
	return personDateCells(personnelId)?.find((cell) => cell.dateKey === dateKey);
}
```

- `src/features/calendar/components/LongRangeView.svelte:343-348` calls that
  lookup inside nested month/date loops for each visible person row:

```svelte
{@const dateKey = formatDate(date)}
{@const cell = renderState.personDateCell(row.person.id, dateKey)}
```

- `src/features/calendar/utils/calendarRenderState.test.ts:171-207` already
  covers person/date cell content and unknown lookup behavior.
- `src/features/calendar/components/LongRangeView.test.ts:262-320` covers the
  large-roster virtualized long-range view.

## Commands you will need

| Purpose                           | Command                                                                                      | Expected on success      |
| --------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------ |
| Install, if needed                | `npm ci`                                                                                     | exit 0                   |
| Svelte docs, if editing Svelte    | Svelte MCP `list-sections` then `get-documentation` for relevant Svelte 5 component sections | docs reviewed            |
| Focused render-state tests        | `npx vitest run src/features/calendar/utils/calendarRenderState.test.ts`                     | all pass                 |
| Focused long-range tests          | `npx vitest run src/features/calendar/components/LongRangeView.test.ts`                      | all pass                 |
| Svelte autofix, if editing Svelte | `svelte-autofixer src/features/calendar/components/LongRangeView.svelte`                     | no issues or suggestions |
| Format                            | `npm run format`                                                                             | exit 0                   |
| Lint                              | `npm run lint`                                                                               | exit 0                   |
| Governance                        | `npm run governance:check`                                                                   | exit 0                   |
| Typecheck                         | `npm run check`                                                                              | exit 0                   |
| Full tests                        | `npm run test`                                                                               | exit 0                   |

## Suggested executor toolkit

- This plan can probably be completed in `calendarRenderState.ts` only. If you
  edit `LongRangeView.svelte`, use the Svelte MCP documentation flow required
  by `AGENTS.md`, then run `svelte-autofixer` until it reports no issues or
  suggestions.

## Scope

**In scope**:

- `src/features/calendar/utils/calendarRenderState.ts`
- `src/features/calendar/utils/calendarRenderState.test.ts`
- `src/features/calendar/components/LongRangeView.svelte` only if the state API
  needs a tiny call-site adjustment
- `src/features/calendar/components/LongRangeView.test.ts` only if the component
  changes
- `plans/README.md` status row only

**Out of scope**:

- Do not change Calendar data fetching.
- Do not change duty-event coverage semantics.
- Do not change virtualization behavior or row heights.
- Do not add a migration.

## Git workflow

- Branch: `codex/048-index-long-range-calendar-date-cells`
- Commit style: short imperative subject. Suggested:
  `Index long-range calendar date cells`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a per-person date-cell index

In `calendarRenderState.ts`, keep the existing row cache but add a lookup cache
beside it.

One safe shape:

```ts
const rowCache = new Map<string, CalendarPersonDateCellState[]>();
const rowCellLookupCache = new Map<string, Map<CalendarDateKey, CalendarPersonDateCellState>>();
```

When `personDateCells(personnelId)` builds a row, also build and store:

```ts
rowCellLookupCache.set(personnelId, new Map(cells.map((cell) => [cell.dateKey, cell])));
```

If the row is already cached, return it without rebuilding either structure.

### Step 2: Replace the `.find` lookup

Update `personDateCell` to use the map:

```ts
function personDateCell(personnelId: string, dateKey: CalendarDateKey): CalendarPersonDateCellState | undefined {
	if (!personnelById.has(personnelId)) return undefined;
	personDateCells(personnelId);
	return rowCellLookupCache.get(personnelId)?.get(dateKey);
}
```

Preserve the current behavior for:

- unknown personnel: `undefined`,
- known personnel with unknown date: `undefined`,
- `personDateCells` returning the full array in date order.

### Step 3: Add focused regression coverage

Extend `calendarRenderState.test.ts`:

- `personDateCell` returns the same object instance as the matching entry from
  `personDateCells`,
- a second `personDateCell` call for a different date does not rebuild the row
  array,
- unknown person and unknown date behavior remains unchanged.

Use observable behavior rather than brittle implementation spies where possible.

**Verify**:
`npx vitest run src/features/calendar/utils/calendarRenderState.test.ts` exits 0.

### Step 4: Re-run long-range component coverage

If only the render-state utility changed, still run the existing long-range
component test to catch integration drift:

**Verify**:
`npx vitest run src/features/calendar/components/LongRangeView.test.ts` exits 0.

If `LongRangeView.svelte` changed, run `svelte-autofixer` until no issues or
suggestions remain.

### Step 5: Run the full gate

**Verify**:
`npm run format && npm run lint && npm run governance:check && npm run check && npm run test`
all exit 0.

## Test plan

- Render-state unit tests for lookup identity and fallback behavior.
- Existing LongRangeView virtualization/integration tests.
- Svelte autofixer only if a Svelte file changes.
- Full repo gate.

## Done criteria

- [ ] `personDateCell` no longer scans the row array with `.find`.
- [ ] `personDateCells` still returns the same public array shape in date order.
- [ ] Unknown person/date behavior is unchanged.
- [ ] LongRangeView tests still pass.
- [ ] The full repo gate passes.
- [ ] `plans/README.md` status row for 048 is updated.

## STOP conditions

Stop and report back if:

- The render state API has been redesigned and this plan no longer matches the
  live call sites.
- The lookup map would duplicate mutable cell objects in a way that changes
  identity-sensitive behavior.
- The change requires a broader Calendar virtualization rewrite.

## Maintenance notes

This is a small render-loop optimization. If long-range Calendar remains slow
after this, measure browser render time before planning broader virtualization
or column-windowing changes.
