# Plan 005: Include existing duty events in template previews

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. Do not improvise.
>
> **Drift check (run first)**: `git diff --stat 679b6113..HEAD -- src/features/duty-roster/templates/dutyRosterTemplatePreview.ts src/features/duty-roster/templates/dutyRosterTemplatePreview.test.ts src/lib/server/core/useCases/duty-roster/templatePreviewAssembly.ts src/lib/server/core/useCases/dutyRosterTemplates.test.ts src/lib/server/core/useCases/dutyEventCrud.ts`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding. On a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `679b6113`, 2026-06-10

## Why This Matters

The DA6 engine already blocks Soldiers with overlapping advanced duty or cooldown, but duty-roster template previews currently pass `advancedDutyEvents: []`. A reviewed preview can therefore assign someone who is already blocked by existing duty, and acceptance may not catch the conflict because the reviewed preview and current preview are both missing the same input.

## Current State

- Template preview discards duty events:

```ts
// src/features/duty-roster/templates/dutyRosterTemplatePreview.ts:116
const generated = buildDutyRosterRunSnapshot({
	assignmentType: templateAssignmentType(input.template),
	personnel: resolvedPool.map(toPersonnel),
	assignments: [],
	rosterHistory: input.continuationHistory ?? [],
	advancedDutyEvents: [],
	availabilityEntries: input.availabilityEntries,
```

- Server preview assembly fetches personnel, statuses, availability, special days, and count history, but no duty events:

```ts
// src/lib/server/core/useCases/duty-roster/templatePreviewAssembly.ts:149
const personnel = await listActiveDutyRosterPersonnel(ctx);
const [statusTypeRows, availabilityRows, specialDayRows, countReadModel] = await Promise.all([
```

- The DA6 engine already handles duty/cooldown blocks if events are present:

```ts
// src/features/duty-roster/run/dutyRosterRun.ts:592
const advancedDutyBlock = indexes
	? getAdvancedDutyBlockFromIndex(indexes, personnelId, date)
	: getAdvancedDutyBlock(input, personnelId, date);
if (advancedDutyBlock) {
	return {
		selectable: false,
		code: advancedDutyBlock === 'duty' ? 'blocked-by-duty' : 'blocked-by-cooldown',
```

- Existing server helper to load events in a calendar range:

```ts
// src/lib/server/core/useCases/dutyEventCrud.ts:77
export async function listDutyEventsInRange(
	ctx: QueryPorts,
	input: { rangeStart: string; rangeEnd: string }
): Promise<DutyEvent[]> {
```

## Commands You Will Need

| Purpose                | Command                                                                                                                                         | Expected on success |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Targeted preview tests | `npm run test -- src/features/duty-roster/templates/dutyRosterTemplatePreview.test.ts src/lib/server/core/useCases/dutyRosterTemplates.test.ts` | pass                |
| Format                 | `npm run format`                                                                                                                                | exits 0             |
| Lint                   | `npm run lint`                                                                                                                                  | exits 0             |
| Governance             | `npm run governance:check`                                                                                                                      | exits 0             |
| Typecheck              | `npm run check`                                                                                                                                 | exits 0             |
| Unit tests             | `npm run test`                                                                                                                                  | exits 0             |

## Scope

**In scope**:

- `src/features/duty-roster/templates/dutyRosterTemplatePreview.ts`
- `src/features/duty-roster/templates/dutyRosterTemplatePreview.test.ts`
- `src/lib/server/core/useCases/duty-roster/templatePreviewAssembly.ts`
- `src/lib/server/core/useCases/dutyRosterTemplates.test.ts`
- `src/lib/server/core/useCases/dutyEventCrud.ts` only if a reusable duty-event window loader is needed

**Out of scope**:

- DA6 engine fairness or selection algorithm changes.
- Accepted-run history, invalidation, rollback, or correction behavior.
- Calendar duty-event CRUD semantics.
- UI redesign of the duty-roster template workspace.

## Git Workflow

- Branch: `codex/005-include-duty-events-in-template-previews`
- Commit message style: short imperative, for example `Include duty events in template previews`
- Do not push or open a PR unless the operator asks.

## Steps

### Step 1: Extend the template preview input contract

In `src/features/duty-roster/templates/dutyRosterTemplatePreview.ts`, add `advancedDutyEvents` to `DutyRosterTemplatePreviewInput`.

Update `buildDutyRosterTemplatePreview(...)` to pass `input.advancedDutyEvents` into `buildDutyRosterRunSnapshot(...)` instead of `[]`.

Keep the input required unless many test builders become unreasonably noisy. If you choose an optional default, document why and ensure server assembly still passes a real array.

**Verify**:

```bash
npm run test -- src/features/duty-roster/templates/dutyRosterTemplatePreview.test.ts
```

Expected initially: compile failures in tests until call sites are updated. After updates, tests pass.

### Step 2: Add direct preview coverage for advanced-duty blocks

In `src/features/duty-roster/templates/dutyRosterTemplatePreview.test.ts`, add a test showing that an advanced-duty event passed into the preview input produces a blocked DA6 cell and prevents normal selection for that Soldier.

Use `src/features/duty-roster/run/dutyRosterRun.test.ts` around the existing `blocked-by-duty` and `blocked-by-cooldown` assertions as the structural pattern.

Cover at least:

- Existing duty overlap blocks the Soldier with `code: 'blocked-by-duty'`.
- Existing cooldown blocks the Soldier with `code: 'blocked-by-cooldown'` if the preview input includes a prior event whose cooldown reaches the preview date.

**Verify**:

```bash
npm run test -- src/features/duty-roster/templates/dutyRosterTemplatePreview.test.ts
```

Expected: pass.

### Step 3: Load relevant duty events for server-generated previews

In `src/lib/server/core/useCases/duty-roster/templatePreviewAssembly.ts`, load relevant duty events alongside the existing preview inputs.

Important: do not fetch only events whose coverage overlaps the preview dates. Cooldown from prior duty can block the first preview date. Match the existing max-cooldown rule from `src/lib/server/core/useCases/dutyAvailability.ts`, where `MAX_DUTY_EVENT_COOLDOWN_HOURS` is `168`.

Acceptable implementation shape:

- Add an exported helper in `src/lib/server/core/useCases/dutyEventCrud.ts`, for example `listDutyEventsForRosterPreviewWindow(ctx, { startDate, endDate })`.
- It should fetch `duty_events` whose `coverage_start` is before the day after `endDate` and whose `coverage_end` is after `startDate` minus 168 hours.
- Hydrate slots with the same `hydrateDutyEventRows(...)` path already used by `listDutyEventsInRange(...)`.
- Use an explicit constant name and comment so the 168-hour preview lookback stays tied to cooldown semantics.

Then pass the loaded events into `buildDutyRosterTemplatePreview(...)`.

**Verify**:

```bash
npm run test -- src/lib/server/core/useCases/dutyRosterTemplates.test.ts
```

Expected: pass after Step 4 coverage is added.

### Step 4: Add server seam coverage

In `src/lib/server/core/useCases/dutyRosterTemplates.test.ts`, add tests near the existing preview generation tests.

Use the existing in-memory arrays:

- `dutyEventRows`
- `dutyEventSlotRows`

Cover:

- `generateDutyRosterTemplatePreview(...)` includes an existing duty event and blocks the assigned Soldier.
- A duty event before the preview start still blocks the first preview day when its cooldown reaches the preview window.
- `acceptDutyRosterTemplatePreview(...)` rejects a reviewed preview if a new blocking duty event appears between review and acceptance. This protects the review/acceptance seam.

Keep assertions at the public use-case seam. Do not assert private helper internals.

**Verify**:

```bash
npm run test -- src/features/duty-roster/templates/dutyRosterTemplatePreview.test.ts src/lib/server/core/useCases/dutyRosterTemplates.test.ts
```

Expected: pass.

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

- Direct builder tests in `dutyRosterTemplatePreview.test.ts` for duty and cooldown blocks.
- Server use-case tests in `dutyRosterTemplates.test.ts` for generated preview and stale reviewed preview rejection.
- Existing DA6 engine tests remain the lower-level proof that `advancedDutyEvents` produce `blocked-by-duty` and `blocked-by-cooldown`.

## Done Criteria

- [ ] `DutyRosterTemplatePreviewInput` carries `advancedDutyEvents`.
- [ ] `buildDutyRosterTemplatePreview(...)` passes actual duty events into `buildDutyRosterRunSnapshot(...)`.
- [ ] Server preview assembly fetches duty events with a cooldown lookback, not only same-date overlap.
- [ ] Acceptance rejects a reviewed preview when a new duty event changes the current preview.
- [ ] Targeted duty-roster tests pass.
- [ ] Full npm gate passes: `format`, `lint`, `governance:check`, `check`, `test`.
- [ ] No files outside the in-scope list are modified.
- [ ] `plans/README.md` status row updated.

## STOP Conditions

Stop and report if:

- Duty-event types or hydration helpers have moved since this plan was written.
- The fix requires changing DA6 selection policy rather than passing missing inputs.
- The preview input is now generated through a different module than `templatePreviewAssembly.ts`.
- Correct cooldown coverage cannot be implemented without changing stored duty-event semantics.

## Maintenance Notes

Future preview inputs should mirror the accepted-run engine inputs. When a DA6 engine input is added, reviewers should verify that template preview, reviewed-preview comparison, and acceptance all receive the same data.
