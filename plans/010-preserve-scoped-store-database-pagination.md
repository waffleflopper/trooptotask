# 010 - Preserve database pagination for scoped personnel tables

Status: TODO
Priority: P2
Effort: M
Created: 2026-06-11
Audit commit: `c99874d0`

## Problem

`src/lib/server/adapters/scopedDataStore.ts` strips pagination for personnel-scoped tables, fetches all matching rows for the organization, filters them in memory by in-scope personnel IDs, and then reapplies pagination. That preserves visible semantics, but it can turn paginated reads into full-table reads for high-volume scoped tables.

The store port already supports `inFilters`, and the Supabase adapter applies `inFilters` before `range`/`limit`. Scoped personnel filtering can use that existing database-side filter instead of dropping pagination.

## Evidence

- `src/lib/server/adapters/scopeRules.ts` marks these tables as personnel-scoped:
  - `availability_entries`
  - `counseling_records`
  - `personnel_trainings`
  - `personnel_ict_completions`
  - `rating_scheme_entries`
- `src/lib/server/adapters/scopedDataStore.ts` has `stripPagination(...)` and comments saying it fetches all rows for personnel filtering.
- `findMany(...)` and `findManyWithCount(...)` remove `range` and `limit` before delegating, then call `applyPagination(...)` in memory.
- `src/lib/server/core/ports.ts` already includes `inFilters?: Record<string, unknown[]>`.
- `src/lib/server/adapters/supabaseDataStore.ts` applies `inFilters` as part of the database query.

## Goal

Personnel-scoped reads preserve database-side filtering and pagination by translating personnel scope into `inFilters` on the scoped personnel column.

## Non-Goals

- Do not redesign personnel-scope rules.
- Do not change which records are visible to which users.
- Do not optimize every report or page in this slice.
- Do not add Supabase migrations or indexes unless verification proves an existing query cannot work without them. Stop for review if that happens.

## Files To Inspect

- `src/lib/server/adapters/scopedDataStore.ts`
- `src/lib/server/adapters/scopedDataStore.test.ts`
- `src/lib/server/adapters/scopeRules.ts`
- `src/lib/server/core/ports.ts`
- `src/lib/server/adapters/supabaseDataStore.ts`
- `src/lib/server/adapters/supabaseDataStore.test.ts`

## Implementation Plan

1. Add tests that prove pagination is delegated.
   - In `scopedDataStore.test.ts`, add a spy/fake inner store test for a personnel-scoped table.
   - Assert `findMany(...)` passes the caller's original `range` or `limit` to the inner store.
   - Assert `findManyWithCount(...)` also passes the original pagination options.
   - Assert the delegated options include an `inFilters` entry for the table's personnel column.
   - Keep an existing semantic test that returned rows remain scoped correctly.

2. Build a helper to merge personnel scope into query options.
   - Resolve in-scope personnel IDs once for the request.
   - Add those IDs to `options.inFilters[personnelColumn]`.
   - If the caller already supplied an `inFilters` value for that same column, intersect it with the in-scope IDs.
   - Preserve all other caller options, including `range`, `limit`, sort, filters, and other `inFilters`.

3. Handle empty scope efficiently and correctly.
   - If the scoped ID list is empty, return `[]` for `findMany(...)`.
   - For `findManyWithCount(...)`, return `{ data: [], count: 0 }`.
   - Do not ask the inner store to read the whole table just to discover that no rows are visible.

4. Replace in-memory pagination for scoped personnel reads.
   - In the personnel-scope branch of `findMany(...)`, delegate to the inner store with scoped `inFilters` and the original pagination intact.
   - In the personnel-scope branch of `findManyWithCount(...)`, delegate to `inner.findManyWithCount(...)` with the same scoped options.
   - Keep non-personnel scope behavior unchanged.

5. Re-check `findOne(...)`.
   - If `findOne(...)` currently performs an in-memory scope check after fetching one record, keep it if changing it would increase risk.
   - If it can cheaply use the same scoped options without changing behavior, add a focused test and update it.

## Suggested Tests

Run the narrow adapter tests first:

```bash
npm run test -- src/lib/server/adapters/scopedDataStore.test.ts src/lib/server/adapters/supabaseDataStore.test.ts
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

- Personnel-scoped `findMany(...)` delegates pagination to the inner store.
- Personnel-scoped `findManyWithCount(...)` delegates database-side count and pagination to the inner store.
- Existing authorization semantics remain unchanged.
- Existing caller `inFilters` are preserved or intersected correctly.
- Empty scope returns empty results without a full-table read.
- All required verification commands pass.

## Risks And Notes

- Intersecting caller filters with scope filters is the main correctness point. A union would leak data.
- If Supabase has a practical limit on very large `in` lists, note it in the completion summary. Do not introduce batching unless tests or production constraints prove it is needed.
