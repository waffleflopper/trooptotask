# Status Notes & Bulk Status Removal — Design

**Date**: 2026-03-10
**Features**: Status entry notes with tooltip display, bulk status deletion

---

## Feature 1: Status Notes

### Summary

Add an optional note field to availability entries so users can add context to a status (e.g., TDY → "JRTC rotation at Fort Johnson"). Notes display in the existing DateCell tooltip on hover.

### Database

- Add `note` column to `availability_entries`: `text`, nullable, `CHECK (char_length(note) <= 200)`
- No new tables, indexes, or RLS policy changes needed

### Type Changes

- `AvailabilityEntry` interface: add `note?: string | null`

### API Changes

- **POST `/org/[orgId]/api/availability`**: accept optional `note` field
- **POST `/org/[orgId]/api/availability/batch`**: accept optional `note` field per record (same note applied to all entries in a bulk add)
- Transform functions: `note` maps directly (no snake_case conversion needed)

### Store Changes

- `availabilityStore.add(data)`: pass `note` through to API
- `availabilityStore.addBatch(entries)`: pass `note` through to API

### UI Changes

#### PersonStatusModal

- Add optional "Note" text input below date range fields
- Single-line `<input>`, max 200 characters, placeholder: "Optional note (e.g., JRTC rotation)"
- Populated with existing note in edit mode

#### BulkStatusModal

- Add optional "Note" text input below date range fields
- Same single-line input, same 200 char limit
- Note applies to all entries in the batch

#### DateCell (Tooltip)

- Current tooltip: shows status name(s), assignment names, holiday name
- Enhanced: append note below status name when present
- Format: `"TDY — JRTC rotation"` (em dash separator)
- Multiple statuses with notes: each on its own line

---

## Feature 2: Bulk Status Removal

### Summary

Add a "Bulk Remove" button + modal on the calendar toolbar. Mirrors the BulkStatusModal selection UI (status type, date range, personnel) but finds and deletes matching entries. Shows a confirmation preview that warns about partial overlaps before deleting.

### API — New Batch Delete Endpoint

**DELETE `/org/[orgId]/api/availability/batch`**

- Request body: `{ ids: string[] }`
- Max 500 IDs per request
- Validates all IDs belong to the organization
- Enforces `canEditCalendar` permission
- Enforces group scope via `requireGroupAccess()` per entry
- Checks read-only state via `checkReadOnly()`
- Deletes all matching entries in one query
- Audits as `availability.bulk_deleted` with count
- Returns `{ deleted: number }`

### Store Changes

- Add `removeBatch(ids: string[])` to `availabilityStore`
- Optimistic removal of all entries by ID
- Calls DELETE `/api/availability/batch`
- Rollback on failure (re-insert removed entries)

### UI — Calendar Toolbar

- New "Bulk Remove" button next to existing "Bulk Status" button
- Visible when `canEditCalendar` is true and not read-only
- Opens `BulkStatusRemoveModal`

### UI — BulkStatusRemoveModal

#### Selection Step

Mirrors BulkStatusModal layout:

- Status type dropdown (required)
- Date range picker: start date + end date (required)
- Searchable personnel list organized by group
- Group-level checkboxes (all/some/none states)
- Collapsible groups
- Select All / Select None buttons
- "Find Matching" button (disabled until status type + dates + at least one person selected)

#### Preview/Confirmation Step

After "Find Matching" is clicked:

1. **Client-side filtering**: scan `availabilityStore.list` for entries where:
   - `personnelId` is in selected personnel
   - `statusTypeId` matches selected status type
   - Date range overlaps selected range (entry.startDate <= selectedEnd AND entry.endDate >= selectedStart)

2. **Categorize results**:
   - **Exact matches**: entry date range falls entirely within selected range (entry.startDate >= selectedStart AND entry.endDate <= selectedEnd)
   - **Partial overlaps**: entry extends beyond selected range on one or both sides

3. **Display confirmation**:
   - Section 1: "**X exact matches** will be removed" (count only)
   - Section 2 (if any): "**Y partial overlaps** will also be removed entirely. These entries extend beyond your selected date range:" followed by a scrollable list showing:
     - Person name (rank + last, first)
     - Actual date range of the entry (startDate – endDate)
   - If no matches found: "No matching status entries found for the selected criteria"

4. **Actions**:
   - "Confirm Removal" button (danger style) — calls `availabilityStore.removeBatch(ids)`
   - "Back" button — returns to selection step
   - "Cancel" button — closes modal

### Permission Enforcement

- Button visibility: `canEditCalendar && !isReadOnly`
- API endpoint: `canEditCalendar` permission check
- Group scope: entries filtered to user's scoped group (if applicable)
- Full-editor not required (same permission level as single status add/remove)

---

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Note required vs optional | Optional | Most statuses are self-explanatory; avoid friction |
| Note display method | Existing tooltip | Simple, consistent, notes are short |
| Bulk remove UI | Separate modal | Different enough flow (confirmation step) to warrant separation |
| Partial overlap handling | Delete entirely + warn | Simplest; user can re-add partial ranges after |
| Note max length | 200 chars | Enough for context, fits in tooltip |
| Note input type | Single-line | Notes are brief descriptions, not paragraphs |
| Preview filtering | Client-side | All data already loaded in store; no server round-trip needed |

---

## Files to Create/Modify

### New Files
- `supabase/migrations/20260310_status_notes.sql` — add note column
- `src/lib/components/BulkStatusRemoveModal.svelte` — bulk remove modal

### Modified Files
- `src/lib/types.ts` — add `note` to AvailabilityEntry
- `src/lib/stores/availability.svelte.ts` — add `removeBatch()`, pass `note` in add/addBatch
- `src/routes/org/[orgId]/api/availability/+server.ts` — accept `note` field
- `src/routes/org/[orgId]/api/availability/batch/+server.ts` — accept `note` in POST, add DELETE handler
- `src/lib/components/PersonStatusModal.svelte` — add note input
- `src/lib/components/BulkStatusModal.svelte` — add note input
- `src/lib/components/DateCell.svelte` — show note in tooltip
- `src/routes/org/[orgId]/calendar/+page.svelte` — add Bulk Remove button, import modal
- `src/lib/server/transforms.ts` — include `note` in availability transform (if not already passed through)
