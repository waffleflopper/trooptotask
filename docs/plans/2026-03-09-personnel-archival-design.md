# Personnel Archival System Design

## Problem

Deleting personnel currently hard-deletes them and all related data (training, counseling, development goals, availability, onboarding, rating scheme entries, extended info). This is irreversible and loses valuable historical records. We need a soft-delete/archival system with configurable retention and eventual automatic cleanup.

## Decisions

- **Approach:** `archived_at` nullable timestamp column on `personnel` table (Approach A — simplest, one column gives both flag and timestamp)
- **Retention setting:** Column on `organizations` table (`archive_retention_months INTEGER DEFAULT 36`)
- **Scheduled cleanup:** Vercel Cron Job hitting a protected API endpoint (matches existing `cleanup-demo-sandboxes` pattern)
- **Archived personnel do NOT count** toward subscription personnel cap
- **Archived personnel are completely hidden** from all active views (calendar, assignments, training, leaders-book)
- **Only admins/owners** can see archived personnel, restore them, or permanently delete them
- **Same permission model** for archiving as current deletion — non-privileged members go through the deletion approval system
- **All related data preserved** during archival — restore brings back everything
- **In-app notifications** sent to org admins/owners when scheduled cleanup permanently deletes archived personnel
- **Export button** on archived personnel view generates a human-readable Excel file (UUIDs replaced with names)

## Database Schema Changes

### `personnel` table — add column

```sql
ALTER TABLE personnel ADD COLUMN archived_at timestamptz DEFAULT NULL;
CREATE INDEX idx_personnel_archived ON personnel (organization_id, archived_at);
```

### `organizations` table — add column

```sql
ALTER TABLE organizations ADD COLUMN archive_retention_months integer DEFAULT 36;
```

### Update `count_org_personnel()` function

```sql
CREATE OR REPLACE FUNCTION count_org_personnel(p_org_id uuid) RETURNS integer AS $$
  SELECT COUNT(*)::integer FROM public.personnel
  WHERE organization_id = p_org_id AND archived_at IS NULL;
$$ LANGUAGE sql SECURITY DEFINER;
```

### RLS

No new RLS policies needed. Existing policies gate on `organization_id`. Filtering archived vs active happens at the application query level since admins/owners need to see archived records from the same table.

## Archive & Restore Operations

### Archiving (replaces current hard-delete for active personnel)

- Current `DELETE /api/personnel` endpoint changes behavior: `UPDATE personnel SET archived_at = now() WHERE id = $id`
- Same permission model: full-editors/admins/owners archive directly, non-privileged members go through deletion approval system
- When a deletion approval request is approved, it now archives instead of hard-deletes
- Audit log event: `personnel.archived`

### Restoring (new, admin/owner only)

- New endpoint: `PATCH /api/personnel` with `{ action: 'restore', id }`
- Sets `archived_at = NULL`
- Must check personnel cap — reject if restoring would exceed org's tier limit
- Only admins/owners can restore (not full-editor members)
- Audit log event: `personnel.restored`

### Permanent deletion (admin/owner only)

- `DELETE /api/personnel` repurposed: only works on archived personnel
- Hard-deletes the record and all cascading data
- Only accessible from the archived personnel view
- Only admins/owners can permanently delete
- Audit log event: `personnel.permanently_deleted`

### Deletion approval system update

- Approved requests archive instead of hard-delete
- `resource_type` stays `'personnel'` — no changes to approval table
- UI language changes from "Delete" to "Archive" in the approval flow

## Query Changes

### Layout server (`+layout.server.ts`)

All existing personnel queries add `.is('archived_at', null)` to only load active personnel. Since all downstream components work off layout data, they need zero changes.

### Personnel store

- `remove()` method changes to update `archived_at` instead of deleting
- Returns `'archived'` instead of `'deleted'`
- Approval flow returns `'approval_required'` unchanged

## UI Changes

### Active personnel views

- "Delete" button label changes to "Archive" throughout
- Confirmation dialog: "Are you sure you want to archive [Name]? They will be hidden from all active views and automatically deleted after [X] months."
- Deletion approval request wording updates similarly

### Archived Personnel view (Admin Hub)

- New tab in Admin Hub: `Approvals | Archived Personnel | Audit Log`
- Route: `/org/[orgId]/admin/archived`
- Queries personnel where `archived_at IS NOT NULL`
- Displays: name, rank, group, archived date, days until auto-deletion
- Actions per person: "Restore" button, "Permanently Delete" button, "Export" button
- Restore checks personnel cap before allowing
- No detail/drill-down view for v1

### Org settings UI

- New section in Admin Hub settings: "Archive Retention"
- Number input: "Automatically delete archived personnel after ___ months" (default 36)
- Min: 1 month, max: 120 months (10 years)

## Scheduled Cleanup (Vercel Cron)

### New endpoint: `/api/cleanup-archived-personnel`

- Same auth pattern as `cleanup-demo-sandboxes` (CRON_SECRET + CLEANUP_SECRET + admin user)
- Runs daily at 5am UTC (`0 5 * * *`)
- Logic:
  1. Query all personnel where `archived_at IS NOT NULL AND archived_at + (archive_retention_months || ' months')::interval < now()` (joined with org for retention setting)
  2. Hard-delete expired archived personnel (cascade handles related data)
  3. Create in-app notifications for org admins/owners listing who was permanently deleted
  4. Audit log: `personnel.auto_deleted` for each person removed
- Returns: `{ deletedCount, orgsAffected }`

### vercel.json

```json
{
  "path": "/api/cleanup-archived-personnel",
  "schedule": "0 5 * * *"
}
```

## Export

### Endpoint: `/api/personnel/[id]/export`

- Admin/owner only
- Generates Excel file with archived person's complete data
- Joins UUIDs to human-readable names (group names, training type names, counseling type names, etc.)
- Sheets: Personnel Info, Training Records, Counseling Records, Development Goals, Availability History
- Uses a lightweight Excel library (e.g., `exceljs`)

## Impact on Existing Systems

| System | Change Required |
|--------|----------------|
| Personnel queries (layout) | Add `.is('archived_at', null)` filter |
| `count_org_personnel()` | Exclude archived |
| Personnel store `remove()` | Soft-archive instead of hard-delete |
| Deletion approval "approve" | Archive instead of hard-delete |
| Personnel UI (delete buttons) | Rename to "Archive", update confirmation text |
| Admin Hub | Add "Archived Personnel" tab |
| Org settings | Add retention period setting |
| vercel.json | Add new cron entry |
| Personnel type (TypeScript) | Add `archivedAt: string | null` |
| Downstream components | No changes (filtered at layout level) |
