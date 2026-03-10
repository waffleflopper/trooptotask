# Bulk Import Redesign

**Date:** 2026-03-09
**Scope:** BulkPersonnelManager + BulkTrainingImporter
**Goal:** Make bulk imports forgiving, informative, and fast.

---

## Problems

1. **Positional columns** — columns must be in exact order, no header mapping
2. **All-or-nothing** — one bad row can derail the import; no partial success
3. **No per-record progress** — spinner on button during sequential DB writes
4. **Sequential API calls** — each record is a separate HTTP request (200 records = 200 calls)
5. **No inline editing** — can't fix errors without going back to the source data

## Design

### Import Flow

```
Paste/Upload → Column Mapping → Editable Preview Table → Import → Results Summary
```

Five steps, all within the existing modal UI.

### Step 1: Input

Unchanged. CSV paste textarea or file upload (.xlsx/.xls/.csv). On input, parse into raw 2D array of strings.

### Step 2: Column Mapping

- Auto-detect columns by matching headers (case-insensitive, fuzzy)
- If no headers detected (first row looks like data), fall back to positional mapping
- Show a row of dropdowns, one per detected column, pre-filled with best guess
- User can reassign columns or mark as "Skip"
- Required columns highlighted red if unmapped

#### Recognized Headers — Personnel

| Field | Matches |
|-------|---------|
| Rank | rank, grade, pay grade, paygrade |
| Last Name | last name, lastname, last, surname, family name |
| First Name | first name, firstname, first, given name |
| MOS | mos, military occupational specialty, job, afsc |
| Role | role, clinic role, duty position, position, billet |
| Group | group, unit, section, team, platoon, squad |

Required: Rank, Last Name, First Name. Optional: MOS, Role, Group.

#### Recognized Headers — Training

| Field | Matches |
|-------|---------|
| Last Name | (same as personnel) |
| First Name | (same as personnel) |
| Training Type | training, training type, type, course, certification |
| Status/Date | date, completion date, completed, date completed, status |
| Notes | notes, comments, remarks |

Required: Last Name, First Name, Training Type, Status/Date. Optional: Notes.

### Step 3: Editable Preview Table

Spreadsheet-like table showing all parsed rows.

- Each cell editable inline (click to edit)
- Row-level validation runs on every change
- Invalid cells: red border + tooltip with error message
- Valid rows: green checkbox. Invalid rows: red X
- Checkbox column on left — invalid rows auto-unchecked, user can manually uncheck valid rows
- Summary bar: "142 ready, 8 errors, 3 unchecked"
- Errors sorted to top of table for easy fixing

#### Personnel Validation Rules

- Rank: must match `ALL_RANKS` constant (case-insensitive)
- Last Name: required, non-empty
- First Name: required, non-empty
- MOS: optional, no validation
- Role: optional, no validation
- Group: optional, case-insensitive match to existing groups. Warning (yellow) if unmatched — will import as unassigned

#### Training Validation Rules

- Last Name + First Name: must match an existing person (case-insensitive)
- Training Type: must match an existing training type name (case-insensitive)
- Status/Date column accepts three value types:

| Value | Meaning |
|-------|---------|
| A date (`2025-06-15`, `06/15/2025`, Excel serial) | Completed on that date |
| `yes`, `complete`, `done`, `true`, `x`, `1` | Completed today (non-expiring types only) |
| `exempt`, `exempted`, `e` | Mark as exempt |

**Training cross-validation:**

- Date + non-expiring type: valid (uses provided date, no expiration)
- Yes/true + expiring type: error — "CPR/BLS requires a completion date, not yes/no"
- Exempt + `canBeExempted: false`: error — "CPR/BLS does not allow exemptions"
- Exempt + `canBeExempted: true`: valid — adds person to type's `exemptPersonnelIds`
- No/false/empty: row skipped (unchecked)

#### Preview Table Display

- Date rows: show the parsed date
- Yes/complete rows: show "Completed (today)" in green
- Exempt rows: show "Exempt" badge in date column
- Invalid cells: red border + tooltip with error message

### Step 4: Import

- Button: "Import N Records" (count updates live based on checked valid rows)
- Sends all checked+valid rows to batch API endpoint in a single request
- Progress bar during server processing
- Button disabled until at least 1 valid row is checked

### Step 5: Results Summary

Replace the preview table with results:

- **Green section:** "142 records imported successfully"
- **Blue section (training only):** "5 records updated (existing training replaced)"
- **Purple section (training only):** "3 personnel marked as exempt"
- **Yellow section:** "3 rows skipped (unchecked)"
- **Red section:** "2 records failed — [reason]" with per-row details
- "Done" button closes modal

---

## Batch API Endpoints

### `POST /org/[orgId]/api/personnel/batch`

**Request:**
```typescript
{
  records: Array<{
    rank: string;
    lastName: string;
    firstName: string;
    mos?: string;
    clinicRole?: string;
    groupName?: string;
  }>
}
```

**Server-side:**
1. Permission check: `canEditPersonnel`
2. Read-only check
3. Personnel cap check: current count + records.length <= tier limit
4. Group scope: non-privileged users can only add to their assigned group
5. Resolve `groupName` to `groupId` (case-insensitive match)
6. Validate all records (rank against `ALL_RANKS`, required fields)
7. Single `.insert()` for all valid records
8. Single audit log entry: "Bulk imported N personnel"

**Response:**
```typescript
{
  inserted: Array<Personnel>;
  errors: Array<{ index: number; message: string }>;
}
```

### `POST /org/[orgId]/api/personnel-trainings/batch`

**Request:**
```typescript
{
  records: Array<{
    personnelId: string;
    trainingTypeId: string;
    completionDate: string | null; // null for exempt
    notes?: string;
    status: 'completed' | 'exempt';
  }>
}
```

**Server-side:**
1. Permission check: `canEditTraining`
2. Read-only check
3. Group scope: validate all personnel are in user's group (if scoped)
4. Split records by status:
   - `completed`: upsert training records (check existing, update or insert)
   - `exempt`: update training type's `exempt_personnel_ids` array
5. For completed records: calculate expiration dates where applicable
6. Bulk insert new records, bulk update existing records
7. Bulk update exempt arrays on training types
8. Single audit log entry: "Bulk imported N training records, M exemptions"

**Response:**
```typescript
{
  inserted: Array<PersonnelTraining>;
  updated: Array<PersonnelTraining>;
  exempted: Array<{ index: number; personnelId: string; trainingTypeId: string }>;
  errors: Array<{ index: number; message: string }>;
}
```

---

## What Stays The Same

- File upload supports .xlsx/.xls/.csv via XLSX library
- CSV paste textarea as primary input method
- Modal-based UI using existing Modal.svelte
- Training date parsing (ISO, US, Excel serial, "yes" for non-expiring)
- All existing permission checks, read-only guards, group scoping
- Archive tab in BulkPersonnelManager (untouched — UI selection, not CSV import)
- BulkStatusModal (untouched — different pattern, works fine)

## What Changes

| Aspect | Before | After |
|--------|--------|-------|
| Column matching | Positional (hardcoded order) | Header-based with mapping UI |
| Preview | Read-only list | Editable table with per-cell validation |
| Error handling | Block all on any error | Per-row validation, skip/fix |
| API | Sequential single-record calls | Single batch endpoint |
| Progress | Spinner on button | Progress bar with record count |
| Results | Modal closes silently | Results summary before close |
| Exemptions | Not supported in import | "exempt" keyword in status column |
