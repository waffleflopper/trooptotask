# Bulk Status CSV/Excel Import — Design Spec

**Date:** 2026-03-13
**Status:** Approved

## Overview

Add the ability to import personnel statuses from a CSV/Excel file into the calendar system. This allows leaders to bring in historic status data they've been tracking elsewhere. The import supports column mapping, fuzzy status name resolution, and personnel matching by name (with optional rank disambiguation).

## User Flow

4-step state machine: **Upload → Preview → Resolve → Results**

### Step 1 — Upload

- File upload (CSV/XLSX) or text paste, same pattern as BulkPersonnelManager
- Uses `csvParser.parseFile()` / `parseCSVText()` from `$lib/utils/csvParser.ts`
- On successful parse, transitions to Preview

### Step 2 — Preview (Column Mapping & Validation)

Renders the shared `BulkImportTable` component with column mapping dropdowns.

**Column Definitions:**

| Field      | Required | Aliases                                |
| ---------- | -------- | -------------------------------------- |
| Last Name  | yes      | `last name, last, surname, lname`      |
| First Name | yes      | `first name, first, fname, given name` |
| Start Date | yes      | `start date, start, from, begin`       |
| End Date   | yes      | `end date, end, to, through`           |
| Status     | yes      | `status, status type, type`            |
| Rank       | no       | `rank, grade, pay grade`               |
| Note       | no       | `note, notes, comment, remarks`        |

**Validation:**

- **Personnel matching:** Case-insensitive `(lastName, firstName)` lookup against org personnel. If rank column is mapped, uses rank to disambiguate. Multiple matches even with rank = cell error. Multiple matches with no rank = cell error. No match = cell error.
- **Date parsing:** Uses existing csvParser date logic (ISO, MM/DD/YYYY, Excel serial numbers). Invalid dates = cell error. Start date > end date = cell error.
- **Status name:** Captured as raw text — resolution happens in Step 3.
- **Start/end dates are inclusive** — the status applies on both the start and end dates.

User checks/unchecks rows, fixes inline errors, then clicks "Next."

### Step 3 — Resolve Unmatched Statuses

After clicking "Next," all unique status names from checked rows are matched case-insensitively against the org's status types.

- **If all statuses match:** Skip this step entirely, proceed to import.
- **If unmatched statuses exist:** Show a resolution screen.

**Resolution UI:**

Each unmatched status is displayed as a row:

- Raw CSV value (e.g., "vacation")
- Row count using this status (e.g., "12 rows")
- Dropdown of org status types with color badge previews
- "Skip" option in dropdown — rows with skipped statuses won't be imported

**This mapping is applied once per unique unmatched status** — if "vacation" appears in 50 rows, the user picks the mapping once and it applies to all 50.

"Continue" button is disabled until every unmatched status has a selection (mapped or skipped). Mappings are applied back to the validated row data before import.

### Step 4 — Import & Results

**Import process:**

- For each checked, valid row: create an `availability_entry` with matched `personnelId`, resolved `statusTypeId`, `startDate`, `endDate`, optional `note`
- Batch insert via a single API call

**Results screen:**

- Success count: "15 status entries created"
- Error list: any rows that failed server-side, with row number and reason
- "Done" button closes the modal

## Component

**File:** `src/features/calendar/components/BulkStatusImportModal.svelte`

New modal component using `Modal.svelte` wrapper. Reuses:

- `BulkImportTable` for preview/mapping
- `columnMapping.ts` for auto-detection and manual column mapping
- `csvParser.ts` for file parsing and date handling
- `Badge.svelte` for status type color previews in the resolution step
- `Spinner.svelte` for async import feedback

## API Endpoint

**Reuses existing endpoint:** `POST /org/[orgId]/api/availability/batch/+server.ts`

This endpoint already accepts the exact payload shape needed (`BatchAvailabilityRecord[]`) and includes all required server-side protections: permission checks, group scoping, read-only guard (`checkReadOnly()`), audit logging, UUID validation, sandbox mode handling, and a 500-record batch cap.

The component formats its payload to match the existing `BatchAvailabilityRecord` shape:

```typescript
{
	records: Array<{
		personnelId: string;
		statusTypeId: string;
		startDate: string; // YYYY-MM-DD
		endDate: string; // YYYY-MM-DD
		note?: string;
	}>;
}
```

No new API endpoint is needed.

## Entry Points

### BulkStatusModal Link

Add a subtle link at the bottom of `BulkStatusModal`: "Have a spreadsheet? Import from file"

- Triggers an `onImport` callback prop
- Parent page handles closing BulkStatusModal and opening BulkStatusImportModal

### Calendar Page

The parent calendar page manages modal state. `BulkStatusModal` receives an `onImport` callback. When triggered, BulkStatusModal closes and BulkStatusImportModal opens.

## Permissions

Same as BulkStatusModal — restricted to full-editor, admin, or owner. This is a config/power feature per the permission system design.

## Edge Cases & Notes

- **Duplicate/overlapping entries:** The existing availability system allows overlapping status entries for the same person and date range. Importing rows that overlap with existing entries will create additional entries, not overwrite. This matches existing behavior.
- **Batch size limit:** The existing batch API enforces a 500-record cap per request. If the import exceeds 500 checked rows, the component should batch into multiple requests.
- **Column definitions constant:** Add `STATUS_IMPORT_COLUMNS` to `$lib/utils/columnMapping.ts` alongside existing `PERSONNEL_COLUMNS` and `TRAINING_COLUMNS`.
- **New prop on BulkStatusModal:** Add `onImport` callback prop (existing props are `onApply` and `onClose`).

## Existing Infrastructure Reused

- `$lib/utils/csvParser.ts` — file parsing, date parsing
- `$lib/utils/columnMapping.ts` — `ColumnDef`, `autoMapColumns()`, `detectHeaderRow()`, `getMissingRequired()`
- `$lib/components/ui/BulkImportTable.svelte` — preview table with column mapping, cell editing, validation display
- `$lib/components/ui/Badge.svelte` — status type color pills
- `$lib/components/ui/Spinner.svelte` — loading state
- `$lib/components/Modal.svelte` — modal wrapper
