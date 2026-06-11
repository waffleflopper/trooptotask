# 009 - Make Calendar assignment replacement atomic

Status: TODO
Priority: P1
Effort: M
Created: 2026-06-11
Audit commit: `c99874d0`

## Problem

Calendar daily-assignment replacement paths delete existing rows before inserting replacements. Validation failures are handled before delete in some paths, but insert/storage failures after delete can leave the day or affected slots empty. This creates a data-loss window for a workflow that users naturally expect to be all-or-nothing.

## Evidence

In `src/lib/server/core/useCases/daily-assignment-slots/index.ts`:

- `replaceDailyAssignmentDay(...)` calls `deleteWhere(...)` for the day before `insertMany(...)`.
- `setDailyAssignmentSlot(...)` calls `clearDailyAssignmentSlot(...)` before `createDailyAssignmentSlot(...)`.
- `replaceDailyAssignmentSlotsBatch(...)` calls `deleteWhereAny(...)` for affected slots before `insertMany(...)`.

The HTTP routes expose these use cases through:

- `src/routes/org/[orgId]/api/daily-assignments/+server.ts`
- `src/routes/org/[orgId]/api/daily-assignments/batch/+server.ts`

Existing tests cover happy paths and validation-before-delete behavior, but they do not prove old assignments survive an insert failure after deletion.

## Goal

Daily assignment replacement operations either fully succeed or preserve the prior assignment rows for the affected day/slots when replacement insertion fails.

## Non-Goals

- Do not change the route response shapes.
- Do not redesign the Calendar UI.
- Do not modify duty-roster accepted-run sync behavior unless it directly calls these same use cases.
- Do not add a database migration or RPC without stopping for explicit review, because that changes the database contract.

## Files To Inspect

- `src/lib/server/core/useCases/daily-assignment-slots/index.ts`
- `src/lib/server/core/useCases/daily-assignment-slots/index.test.ts`
- `src/lib/server/core/ports.ts`
- `src/lib/server/adapters/inMemory.ts`
- `src/lib/server/adapters/supabaseDataStore.ts`
- `src/routes/org/[orgId]/api/daily-assignments/server.test.ts`
- `src/routes/org/[orgId]/api/daily-assignments/batch/server.test.ts`

## Implementation Plan

1. Add failing use-case tests before changing behavior.
   - Add a test for `replaceDailyAssignmentDay(...)` where `insertMany(...)` rejects after the day has old assignments. Assert the old rows remain.
   - Add a test for `setDailyAssignmentSlot(...)` where replacement insert rejects after the old slot exists. Assert the old row remains.
   - Add a test for `replaceDailyAssignmentSlotsBatch(...)` where batch insert rejects after affected slots have old rows. Assert the old rows remain.
   - Use the smallest available test seam. If the in-memory adapter cannot simulate insert failure cleanly, add a local test double rather than changing production code first.

2. Choose the narrowest atomicity strategy supported by current ports.
   - First check whether an existing store transaction or batch-replace seam already exists.
   - If a store-level transaction exists, use it.
   - If no transaction exists, implement an application-level rollback inside these use cases:
     - Load and keep the rows that match the affected delete filters.
     - Delete the affected rows.
     - Attempt the replacement insert.
     - If replacement insert fails, restore only the previously captured rows, then rethrow the original failure.
   - If a true fix requires a new database RPC or migration, stop and report that the plan needs explicit database-contract approval.

3. Keep filters exact.
   - For day replacement, capture only rows for the target `date`.
   - For single-slot replacement, capture only the target `date` plus `assignmentTypeId`.
   - For batch replacement, capture the rows matching the exact affected slot filters already computed by the use case.
   - Do not restore rows outside those filters.

4. Preserve existing validation behavior.
   - Validation and conflict checks that currently happen before deletion should stay before deletion.
   - Empty replacement inputs should keep their current semantics.
   - Multi-slot assignment rules should not be relaxed.

5. Add route-level regression coverage if route tests can cheaply simulate store failure.
   - At minimum, use-case tests must prove old rows survive insert failure.
   - Route tests should continue to prove the public endpoint delegates to the hardened use-case behavior.

## Suggested Tests

Run the narrow tests first:

```bash
npm run test -- src/lib/server/core/useCases/daily-assignment-slots/index.test.ts 'src/routes/org/[orgId]/api/daily-assignments/server.test.ts' 'src/routes/org/[orgId]/api/daily-assignments/batch/server.test.ts'
```

Before marking complete, run the full repo gate:

```bash
npm run format
npm run lint
npm run governance:check
npm run check
npm run test
```

## Acceptance Criteria

- Replacement insertion failure does not leave affected Calendar assignment slots deleted.
- Tests prove rollback/preservation for day replacement, single-slot replacement, and batch replacement.
- Existing successful replacement behavior is unchanged.
- No database schema or RPC change is introduced without explicit approval.
- All required verification commands pass.

## Risks And Notes

- Application-level rollback is still weaker than a real database transaction if the restore also fails. If a transaction can be introduced through an existing store abstraction, prefer that.
- If rollback restoration fails, the thrown error should make the partial-failure risk visible without exposing sensitive record values.
