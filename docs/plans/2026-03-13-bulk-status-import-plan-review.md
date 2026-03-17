# Bulk Status Import Plan Review

**Reviewer:** Code Review Agent
**Date:** 2026-03-13
**Plan:** `docs/plans/2026-03-13-bulk-status-import-plan.md`
**Spec:** `docs/plans/2026-03-13-bulk-status-import-design.md`

---

## Summary

The plan is well-structured and closely follows existing codebase patterns (BulkTrainingImporter, BulkPersonnelManager). Task ordering and dependencies are correct. However, there are several issues that range from critical (will cause build failures) to important (behavioral bugs).

---

## Critical Issues (Must Fix)

### 1. `parseDateString` is NOT exported from csvParser.ts

**Plan references (Task 3, Task 4, Task 6):**

```typescript
import { parseFile, parseCSVText, parseDateString } from '$lib/utils/csvParser';
```

**Reality:** `parseDateString` is a **private function** (line 84 of csvParser.ts, no `export` keyword). Only three functions are exported: `parseCSVText`, `parseFile`, and `parseTrainingStatus`.

**Fix options:**

- (a) Export `parseDateString` from csvParser.ts (preferred — it's a general utility).
- (b) Reimplement date parsing inline in the component.

The plan must add a step to export this function, or use a different date parsing approach.

### 2. `RowValidation` type uses wrong field names

**Plan defines (Task 4):**

```typescript
return { valid, errors, warnings: {} };
//             ^^^^^^  ^^^^^^^^
```

**Actual `RowValidation` interface in BulkImportTable.svelte (lines 7-11):**

```typescript
interface RowValidation {
	valid: boolean;
	cellErrors: Record<string, string>; // NOT "errors"
	cellWarnings: Record<string, string>; // NOT "warnings"
}
```

The `validateRow` function in Task 4 returns `{ valid, errors, warnings }` but must return `{ valid, cellErrors, cellWarnings }`. This will cause validation to silently fail (no cell errors displayed, no rows auto-unchecked).

### 3. `RowValidation` import will fail

**Plan (Task 3):**

```typescript
import type { RowValidation } from '$lib/components/ui/BulkImportTable.svelte';
```

**Reality:** `RowValidation` is defined as a plain `interface` inside BulkImportTable's `<script>` block. It is NOT exported from the module. In Svelte 5, component-internal interfaces are not importable.

**Fix:** Define the `RowValidation` interface locally in the new component (same pattern as BulkTrainingImporter, which defines its own copy at lines 18-22).

### 4. `tableRef` binding type is wrong

**Plan (Task 3):**

```typescript
let tableRef = $state<BulkImportTable>();
```

**Existing pattern in BulkTrainingImporter:**

```typescript
let bulkTable: ReturnType<typeof BulkImportTable> | undefined = $state();
```

The plan's approach may work in practice since Svelte 5 component types can be inferred, but the established codebase pattern uses `ReturnType<typeof BulkImportTable> | undefined`. Follow the existing pattern for consistency and type safety.

---

## Important Issues (Should Fix)

### 5. `onImportComplete` bypasses the availability store

**Plan (Task 6):** The component calls `fetch('/org/${orgId}/api/availability/batch')` directly, then calls `onImportComplete()` which the calendar page wires to `availabilityStore.reload(orgId)`.

**Reality:** The availability store has no `reload` method. It has `load(entries, orgId)` which takes pre-fetched entries. The plan's Task 7 acknowledges this uncertainty (Step 5 note) but the default code uses `availabilityStore.reload(orgId)` which does not exist.

**Better approach:** Use `invalidateAll()` from `$app/navigation` to trigger a full page data reload (the plan mentions this as an alternative). OR even better: use `availabilityStore.addBatch()` directly instead of raw fetch, which handles optimistic updates and store synchronization automatically. This would also eliminate the need for manual 500-record batching since the store already calls the same endpoint.

### 6. Personnel variable name mismatch in calendar page integration

**Plan (Task 7, Step 4):**

```svelte
<BulkStatusImportModal personnel={allPersonnel} ... />
```

**Reality:** The calendar page has `calendarPersonnel` (line 39: `const calendarPersonnel = $derived(data.allPersonnel ?? data.personnel)`). There is no variable called `allPersonnel` on the calendar page. The plan's Step 4 note acknowledges this may need adjustment but provides the wrong default.

**Fix:** Use `personnel={calendarPersonnel}` or flatten from `personnelByGroup` as the note suggests.

### 7. Batch response parsing assumes wrong shape

**Plan (Task 6):**

```typescript
totalInserted += data.inserted?.length || 0;
```

**Reality (batch endpoint line 102):** The endpoint returns `json({ inserted: result })` where `result` is an array of mapped objects. So `data.inserted` IS an array and `.length` works. This is actually correct, but note that using `?.length || 0` will treat a length of 0 as falsy and default to 0, which is fine. No issue here after verification.

### 8. Missing 500-record batching consideration for store approach

If the fix for issue #5 switches to using `availabilityStore.addBatch()`, note that `addBatch` calls the same `/api/availability/batch` endpoint which has the 500-record cap. The component should still batch into groups of 500 before calling the store method.

---

## Suggestions (Nice to Have)

### 9. Plan skips the "last" column alias

**Spec column definition:** `last name, last, surname, lname`
**Plan column definition:** `['last name', 'lastname', 'surname', 'lname']`

The plan adds `'lastname'` (no space) which is good, but drops `'last'` from the aliases. Same for first name — spec has `'first'` but plan omits it. Consider adding both for better auto-mapping.

### 10. Missing `'last'` and `'first'` standalone aliases

The spec explicitly lists `last` and `first` as standalone aliases. The plan should include these.

### 11. No loading state during file parse

The upload step has no loading indicator while parsing large XLSX files. The BulkPersonnelManager pattern could be followed for consistency.

### 12. Consider using `parseTrainingStatus` pattern for date parsing

Since `parseDateString` is private, another approach would be to create a new exported `parseDateValue(value: string): string | null` function in csvParser.ts that wraps the private `parseDateString`, similar to how `parseTrainingStatus` wraps internal parsing logic.

---

## Spec Coverage Verification

| Spec Requirement                   | Covered in Plan? | Notes                                                                         |
| ---------------------------------- | ---------------- | ----------------------------------------------------------------------------- |
| 4-step state machine               | Yes              | upload, preview, resolve, results                                             |
| File upload (CSV/XLSX)             | Yes              | Task 3                                                                        |
| Text paste                         | Yes              | Task 3                                                                        |
| Column mapping via BulkImportTable | Yes              | Task 4                                                                        |
| Personnel matching (name + rank)   | Yes              | Task 4 validateRow                                                            |
| Date validation                    | Yes\*            | \*Depends on parseDateString fix                                              |
| Status resolution step             | Yes              | Task 5                                                                        |
| Skip option for unmatched statuses | Yes              | Task 5                                                                        |
| Badge color preview in resolution  | Yes              | Task 5                                                                        |
| Batch API call                     | Yes              | Task 6                                                                        |
| 500-record batching                | Yes              | Task 6                                                                        |
| Results screen with counts         | Yes              | Task 6                                                                        |
| Entry point in BulkStatusModal     | Yes              | Task 2                                                                        |
| Calendar page integration          | Yes\*            | \*Variable names need fixing                                                  |
| Permission gating                  | Partial          | Relies on calendar page's existing `canManageConfig` — not explicitly checked |
| Changelog entry                    | Yes              | Task 9                                                                        |

---

## Task Ordering Assessment

The task ordering is correct. Dependencies flow properly:

1. Column definitions (Task 1) -- no dependencies
2. BulkStatusModal entry point (Task 2) -- no dependencies
   3-6. BulkStatusImportModal built incrementally (Tasks 3-6) -- depends on Task 1
3. Calendar page wiring (Task 7) -- depends on Tasks 2, 3-6
4. Testing (Task 8) -- depends on all above
5. Changelog (Task 9) -- independent

Tasks 1 and 2 could run in parallel. Otherwise the ordering is sound.
