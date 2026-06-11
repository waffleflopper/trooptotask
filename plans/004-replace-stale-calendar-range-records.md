# Plan 004: Replace stale calendar range records

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. Do not improvise.
>
> **Drift check (run first)**: `git diff --stat 679b6113..HEAD -- src/features/calendar/utils/calendarRangeLoader.ts src/features/calendar/utils/calendarRangeLoader.test.ts src/features/calendar/contexts/CalendarRangeCoordinator.svelte.ts src/features/calendar/contexts/CalendarRangeCoordinator.svelte.test.ts src/lib/server/core/useCases/calendarQuery.ts`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding. On a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `679b6113`, 2026-06-10

## Why This Matters

The calendar range endpoint returns a bounded slice. Daily assignments already remove stale in-range rows before merging incoming data, but availability, special days, and advanced-duty events are only merged by id. If a record is deleted or moves out of the visible range, it can stay visible after a range refresh.

## Current State

- Server range query returns bounded slices:

```ts
// src/lib/server/core/useCases/calendarQuery.ts:153
export async function fetchCalendarRangeData(ctx: QueryPorts, input: CalendarQueryInput): Promise<CalendarRangeData> {
```

- Availability and special days merge without removing stale in-range rows:

```ts
// src/features/calendar/utils/calendarRangeLoader.ts:22
export function mergeCalendarRangeIntoStores(orgId: string, data: CalendarRangeData): void {
	const availabilityEntries =
		availabilityStore.orgId === orgId
			? mergeById(availabilityStore.items, data.availabilityEntries)
			: data.availabilityEntries;
	const specialDays =
		specialDaysStore.orgId === orgId ? mergeById(specialDaysStore.items, data.specialDays) : data.specialDays;
	const dailyAssignments =
		dailyAssignmentsStore.orgId === orgId
			? mergeById(
					dailyAssignmentsStore.assignments.filter(
						(assignment) => assignment.date < data.rangeStart || assignment.date > data.rangeEnd
					),
```

- Advanced-duty events merge without stale removal:

```ts
// src/features/calendar/contexts/CalendarRangeCoordinator.svelte.ts:149
#mergeRangeDataSets(orgId: string, rangeDataSets: CalendarRangeData[]): void {
	for (const rangeData of rangeDataSets) {
		const loadedRange = untrack(() => this.loadedRange);
		const advancedDutyEvents = untrack(() => this.advancedDutyEvents);
		this.#mergeRangeIntoStores(orgId, rangeData);
		this.advancedDutyEvents = mergeById(advancedDutyEvents, rangeData.advancedDutyEvents);
```

- Existing tests to extend:
  - `src/features/calendar/utils/calendarRangeLoader.test.ts`
  - `src/features/calendar/contexts/CalendarRangeCoordinator.svelte.test.ts`

## Commands You Will Need

| Purpose        | Command                                                                                                                                          | Expected on success |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| Targeted tests | `npm run test -- src/features/calendar/utils/calendarRangeLoader.test.ts src/features/calendar/contexts/CalendarRangeCoordinator.svelte.test.ts` | pass                |
| Format         | `npm run format`                                                                                                                                 | exits 0             |
| Lint           | `npm run lint`                                                                                                                                   | exits 0             |
| Governance     | `npm run governance:check`                                                                                                                       | exits 0             |
| Typecheck      | `npm run check`                                                                                                                                  | exits 0             |
| Unit tests     | `npm run test`                                                                                                                                   | exits 0             |

## Scope

**In scope**:

- `src/features/calendar/utils/calendarRangeLoader.ts`
- `src/features/calendar/utils/calendarRangeLoader.test.ts`
- `src/features/calendar/contexts/CalendarRangeCoordinator.svelte.ts`
- `src/features/calendar/contexts/CalendarRangeCoordinator.svelte.test.ts`

**Out of scope**:

- Server query semantics in `calendarQuery.ts` unless tests prove the server is returning the wrong range.
- Calendar UI redesign.
- Daily assignment behavior, except to preserve its current stale-removal behavior.
- Advanced-duty CRUD or duty-roster generation logic.

## Git Workflow

- Branch: `codex/004-replace-stale-calendar-range-records`
- Commit message style: short imperative, for example `Replace stale calendar range records`
- Do not push or open a PR unless the operator asks.

## Steps

### Step 1: Add range-replacement helpers for store-backed calendar data

In `src/features/calendar/utils/calendarRangeLoader.ts`, add small pure helpers near `mergeCalendarRangeIntoStores`.

Target behavior:

- Availability entry is inside the refreshed range if `entry.endDate >= rangeStart` and `entry.startDate <= rangeEnd`.
- Special day is inside the refreshed range if `date >= rangeStart` and `date <= rangeEnd`.
- Before merging incoming range data, keep only existing rows that are outside the refreshed range, then `mergeById(outOfRangeExisting, incomingRows)`.
- Preserve current behavior when `availabilityStore.orgId`, `specialDaysStore.orgId`, or `dailyAssignmentsStore.orgId` does not match `orgId`: load the incoming rows directly.

Do not move these helpers into a shared module unless the tests force it; keep the fix narrow.

**Verify**: targeted calendar tests still compile after adding failing expectations in Step 2.

### Step 2: Extend calendar range loader tests

In `src/features/calendar/utils/calendarRangeLoader.test.ts`, extend the existing "merges ranged calendar data" test or add a new one.

Cover:

- An existing availability entry overlapping the incoming range but missing from `data.availabilityEntries` is removed.
- An existing availability entry outside the incoming range remains.
- An existing special day in range but missing from `data.specialDays` is removed.
- An existing special day outside the range remains.
- Daily assignment behavior remains unchanged: in-range stale removed, out-of-range kept.

**Verify**:

```bash
npm run test -- src/features/calendar/utils/calendarRangeLoader.test.ts
```

Expected: all tests pass.

### Step 3: Replace stale advanced-duty events in coordinator state

In `src/features/calendar/contexts/CalendarRangeCoordinator.svelte.ts`, replace the simple `mergeById(advancedDutyEvents, rangeData.advancedDutyEvents)` call with range-aware replacement.

Use the same overlap semantics as the server's `listDutyEventsInRange`:

- The server includes events where `coverage_start < rangeEndNextDay` and `coverage_end > rangeStart`.
- For the client stale-removal helper, treat an existing advanced-duty event as inside the refreshed range when:
  - `event.coverageStart < nextDay(rangeEnd)` and
  - `event.coverageEnd > rangeStart`
- Keep existing events outside that window, then merge incoming events.
- Use date helpers already present in the repo, such as `parseDate` and `formatDate` from `$lib/utils/dates`, rather than ad hoc string slicing if date math is needed.

**Verify**:

```bash
npm run test -- src/features/calendar/contexts/CalendarRangeCoordinator.svelte.test.ts
```

Expected: all tests pass.

### Step 4: Extend coordinator tests

In `src/features/calendar/contexts/CalendarRangeCoordinator.svelte.test.ts`, add coverage that:

- A bootstrap advanced-duty event inside a later loaded range is removed if the loaded range does not return it.
- A bootstrap advanced-duty event outside the later loaded range remains.
- An incoming event with the same id replaces the existing event.

Keep tests at the coordinator seam. Do not inspect private fields directly; assert public `advancedDutyEvents` and `loadedRange`.

**Verify**:

```bash
npm run test -- src/features/calendar/utils/calendarRangeLoader.test.ts src/features/calendar/contexts/CalendarRangeCoordinator.svelte.test.ts
```

Expected: all tests pass.

### Step 5: Run the repo gate

**Verify**:

```bash
npm run format
npm run lint
npm run governance:check
npm run check
npm run test
```

All commands exit 0.

## Test Plan

- Extend `calendarRangeLoader.test.ts` for availability and special-day stale removal.
- Extend `CalendarRangeCoordinator.svelte.test.ts` for advanced-duty stale removal.
- Keep tests at public module seams: `mergeCalendarRangeIntoStores(...)` and coordinator public state.

## Done Criteria

- [ ] Availability, special days, daily assignments, and advanced-duty events all replace the refreshed range instead of only appending/merging.
- [ ] Out-of-range existing records remain intact.
- [ ] Same-id incoming records still replace existing records.
- [ ] Targeted calendar tests pass.
- [ ] Full npm gate passes: `format`, `lint`, `governance:check`, `check`, `test`.
- [ ] No files outside the in-scope list are modified.
- [ ] `plans/README.md` status row updated.

## STOP Conditions

Stop and report if:

- The server range query is no longer bounded by `rangeStart` and `rangeEnd`.
- Advanced-duty event date fields have changed names or semantics.
- Fixing this requires changing calendar UI rendering or route loading.
- Tests require inspecting Svelte private fields instead of public behavior.

## Maintenance Notes

Any future range-loaded calendar collection should define a replacement window, not just an id merge. Reviewers should look for stale in-range fixture rows in tests whenever a new collection is added to `CalendarRangeData`.
