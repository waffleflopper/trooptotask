# Personnel Archival System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **For Claude:** Use the Svelte MCP server tools (`svelte-autofixer`, `get-documentation`) when creating or editing `.svelte` files.
> **For Claude:** After all tasks complete, update `/Users/robertbaddeley/.claude/projects/-Users-robertbaddeley-projects-trooptotask/memory/MEMORY.md` with the archival system details.

**Goal:** Replace hard-delete of personnel with soft-archive, configurable retention, scheduled auto-cleanup, admin restore/permanent-delete, and Excel export of archived records.

**Architecture:** Add `archived_at` nullable timestamp column to `personnel` table, `archive_retention_months` integer to `organizations`. Filter archived personnel from all active queries at the layout level. Archived personnel visible only in a new Admin Hub tab. Vercel cron job auto-deletes expired archives.

**Tech Stack:** SvelteKit 2.5, Svelte 5 (runes), TypeScript, Supabase (Postgres), ExcelJS (already installed), Vercel Cron

**Design Doc:** `docs/plans/2026-03-09-personnel-archival-design.md`

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260309_personnel_archival.sql`

**Step 1: Write the migration file**

```sql
-- Add archived_at to personnel
ALTER TABLE personnel ADD COLUMN archived_at timestamptz DEFAULT NULL;
CREATE INDEX idx_personnel_archived ON personnel (organization_id, archived_at);

-- Add retention setting to organizations
ALTER TABLE organizations ADD COLUMN archive_retention_months integer DEFAULT 36;

-- Update count_org_personnel to exclude archived
CREATE OR REPLACE FUNCTION count_org_personnel(p_org_id uuid) RETURNS integer AS $$
  SELECT COUNT(*)::integer FROM public.personnel
  WHERE organization_id = p_org_id AND archived_at IS NULL;
$$ LANGUAGE sql SECURITY DEFINER;
```

**Step 2: Apply migration to local database**

Run: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/migrations/20260309_personnel_archival.sql`
Expected: Commands succeed with no errors.

**Step 3: Verify migration**

Run: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'personnel' AND column_name = 'archived_at';"`
Expected: Shows `archived_at | timestamp with time zone | NULL`

**Step 4: Commit**

```bash
git add supabase/migrations/20260309_personnel_archival.sql
git commit -m "feat: add archived_at column and retention setting migration"
```

---

### Task 2: Update TypeScript Types

**Files:**
- Modify: `src/lib/types.ts` (lines 1-10)

**Step 1: Add archivedAt to Personnel interface**

Add `archivedAt: string | null;` to the `Personnel` interface:

```typescript
export interface Personnel {
	id: string;
	rank: string;
	lastName: string;
	firstName: string;
	mos: string;
	clinicRole: string;
	groupId: string | null;
	groupName: string;
	archivedAt: string | null;
}
```

**Step 2: Find and update the transformPersonnel function**

Search for `transformPersonnel` in the codebase. It likely maps DB snake_case to camelCase. Add `archivedAt: p.archived_at ?? null` to the transform.

**Step 3: Run type check**

Run: `npm run check`
Expected: No new errors introduced (pre-existing errors are fine).

**Step 4: Commit**

```bash
git add src/lib/types.ts
# also add whatever file contains transformPersonnel
git commit -m "feat: add archivedAt to Personnel type and transform"
```

---

### Task 3: Filter Archived Personnel from Layout Query

**Files:**
- Modify: `src/routes/org/[orgId]/+layout.server.ts` (line ~20)

**Step 1: Add archived_at filter to personnel query**

In the `fetchSharedData` function, add `.is('archived_at', null)` to the personnel query:

```typescript
supabase
  .from('personnel')
  .select('*, groups(name)')
  .eq('organization_id', orgId)
  .is('archived_at', null)        // <-- add this line
  .order('last_name'),
```

This single change hides archived personnel from ALL downstream components (calendar, assignments, training, leaders-book, personnel page) since they all consume layout data.

**Step 2: Run the app and verify**

Run: `npm run dev`
Verify: App loads normally. No archived personnel appear (there won't be any yet, so just confirm no errors).

**Step 3: Commit**

```bash
git add src/routes/org/[orgId]/+layout.server.ts
git commit -m "feat: filter archived personnel from layout query"
```

---

### Task 4: Change DELETE Endpoint to Archive

**Files:**
- Modify: `src/routes/org/[orgId]/api/personnel/+server.ts` (lines 128-190)

**Step 1: Change the DELETE handler to soft-archive**

Replace the `.delete()` call with an `.update()` that sets `archived_at`:

```typescript
// BEFORE (around line 180):
const { error: dbError } = await supabase
  .from('personnel')
  .delete()
  .eq('id', id)
  .eq('organization_id', orgId);

// AFTER:
const { error: dbError } = await supabase
  .from('personnel')
  .update({ archived_at: new Date().toISOString() })
  .eq('id', id)
  .eq('organization_id', orgId);
```

**Step 2: Update the audit log event name**

Change `'personnel.deleted'` to `'personnel.archived'` in the `auditLog()` call.

**Step 3: Run type check**

Run: `npm run check`
Expected: No new errors.

**Step 4: Commit**

```bash
git add src/routes/org/[orgId]/api/personnel/+server.ts
git commit -m "feat: change personnel DELETE to soft-archive"
```

---

### Task 5: Update Personnel Store remove() Method

**Files:**
- Modify: `src/lib/stores/personnel.svelte.ts` (lines 66-96)

**Step 1: Update return type and method behavior**

The `remove()` method currently returns `'deleted' | 'approval_required' | 'error'`. Change `'deleted'` to `'archived'` in the return value:

```typescript
async remove(id: string): Promise<DeleteResult> {
  // ... existing optimistic removal code stays the same ...

  try {
    const res = await fetch(`/org/${this.#orgId}/api/personnel`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });

    if (res.status === 202) {
      const data = await res.json();
      if (data.requiresApproval) {
        this.#personnel = [...this.#personnel, original];
        return 'approval_required';
      }
    }

    if (!res.ok) throw new Error('Failed to archive personnel');
    return 'deleted';  // keep as 'deleted' for now — the store consumer handles the toast message
  } catch {
    this.#personnel = [...this.#personnel, original];
    return 'error';
  }
}
```

Actually, the `DeleteResult` type is defined in `src/lib/utils/deletionRequests.ts` as `'deleted' | 'approval_required' | 'error'`. To minimize changes, keep the return value as `'deleted'` — the semantic difference (archive vs hard-delete) is handled server-side. Just update toast messages in the UI consumers.

**Step 2: No code change needed in the store itself — the behavior is correct as-is**

The store optimistically removes the person from the UI list (which is correct — archived people shouldn't show). The server now archives instead of deletes. The return types are still valid.

**Step 3: Commit (skip if no changes)**

---

### Task 6: Update UI Labels and Confirmation Text

**Files:**
- Modify: `src/lib/components/PersonnelModal.svelte` (lines 49-59, 159-189)
- Modify: `src/routes/org/[orgId]/personnel/+page.svelte` (lines 148-188)

**Step 1: Update PersonnelModal — button label and confirmation**

In `PersonnelModal.svelte`, change:
- Button text from `Remove` to `Archive` (around line 162)
- `ConfirmDialog` title from `"Remove Personnel"` to `"Archive Personnel"`
- `ConfirmDialog` message from `"Remove {personnel.rank} {personnel.lastName}? This action cannot be undone."` to `"Archive {personnel.rank} {personnel.lastName}? They will be hidden from all active views."`
- `confirmLabel` from `"Remove"` to `"Archive"`

**Step 2: Update personnel page toast messages**

In `+page.svelte`, find where `handleRemove` shows toast on success. Change `'Personnel removed'` to `'Personnel archived'`.

Also update `submitDeletionRequest` description text if it says "delete" — change to "archive".

**Step 3: Update bulk delete handler text similarly**

In the `handleBulkDelete` function, update any toast messages from delete/remove language to archive language.

**Step 4: Search for any other "Delete" / "Remove" references in personnel context**

Run: Search for `Remove Personnel`, `Personnel removed`, `delete personnel` across all `.svelte` and `.ts` files to catch any stragglers.

**Step 5: Use Svelte MCP autofixer on modified .svelte files**

Run svelte-autofixer on `PersonnelModal.svelte` and `personnel/+page.svelte` to validate Svelte 5 syntax.

**Step 6: Run type check**

Run: `npm run check`

**Step 7: Commit**

```bash
git add src/lib/components/PersonnelModal.svelte src/routes/org/[orgId]/personnel/+page.svelte
git commit -m "feat: update delete UI to archive language"
```

---

### Task 7: Update Deletion Approval to Archive Instead of Hard-Delete

**Files:**
- Modify: `src/routes/org/[orgId]/api/deletion-requests/review/+server.ts` (lines 75-84)

**Step 1: Change approve action from delete to archive for personnel**

In the approve block, instead of always deleting, check if the resource type is `personnel` and archive instead:

```typescript
if (action === 'approve') {
  const tableName = RESOURCE_TYPE_TABLE_MAP[request_record.resource_type];
  if (tableName) {
    if (request_record.resource_type === 'personnel') {
      // Archive instead of hard-delete for personnel
      const { error: archiveError } = await adminClient
        .from('personnel')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', request_record.resource_id)
        .eq('organization_id', orgId);

      if (archiveError) {
        console.error('Failed to archive personnel:', archiveError.message);
      }
    } else {
      // Hard-delete for other resource types
      const { error: deleteError } = await adminClient
        .from(tableName)
        .delete()
        .eq('id', request_record.resource_id)
        .eq('organization_id', orgId);

      if (deleteError) {
        console.error('Failed to delete resource:', deleteError.message);
      }
    }
  }
}
```

**Step 2: Update notification message for personnel archival**

When the resource type is `personnel`, change the notification message from "deleted" to "archived":

```typescript
const notificationMessage =
  action === 'approve'
    ? request_record.resource_type === 'personnel'
      ? `Your request to archive "${request_record.resource_description}" has been approved.`
      : `Your request to delete "${request_record.resource_description}" has been approved.`
    : `Your request to delete "${request_record.resource_description}" has been denied.${denialReason ? ` Reason: ${denialReason}` : ''}`;
```

**Step 3: Run type check**

Run: `npm run check`

**Step 4: Commit**

```bash
git add src/routes/org/[orgId]/api/deletion-requests/review/+server.ts
git commit -m "feat: approval system archives personnel instead of hard-deleting"
```

---

### Task 8: Add Admin Hub "Archived Personnel" Tab and Page Server

**Files:**
- Create: `src/routes/org/[orgId]/admin/archived/+page.server.ts`
- Modify: `src/routes/org/[orgId]/admin/+layout.svelte` (lines 9-15)

**Step 1: Add the "Archived" tab to admin layout**

In `+layout.svelte`, add a new tab between Approvals and Audit Log:

```svelte
<a href="/org/{orgId}/admin/archived" class="tab" class:active={currentPath.includes('/archived')}>
    Archived Personnel
</a>
```

**Step 2: Create the page server to load archived personnel and org settings**

```typescript
// src/routes/org/[orgId]/admin/archived/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const [personnelRes, orgRes] = await Promise.all([
		locals.supabase
			.from('personnel')
			.select('id, rank, first_name, last_name, mos, group_id, archived_at, groups(name)')
			.eq('organization_id', params.orgId)
			.not('archived_at', 'is', null)
			.order('archived_at', { ascending: false }),
		locals.supabase
			.from('organizations')
			.select('archive_retention_months')
			.eq('id', params.orgId)
			.single()
	]);

	const archivedPersonnel = (personnelRes.data ?? []).map((p: any) => ({
		id: p.id,
		rank: p.rank,
		firstName: p.first_name,
		lastName: p.last_name,
		mos: p.mos,
		groupName: p.groups?.name ?? '',
		archivedAt: p.archived_at,
		groupId: p.group_id
	}));

	return {
		archivedPersonnel,
		retentionMonths: orgRes.data?.archive_retention_months ?? 36
	};
};
```

**Step 3: Use Svelte MCP autofixer on the modified layout.svelte**

**Step 4: Run type check**

Run: `npm run check`

**Step 5: Commit**

```bash
git add src/routes/org/[orgId]/admin/archived/+page.server.ts src/routes/org/[orgId]/admin/+layout.svelte
git commit -m "feat: add archived personnel tab and page server in admin hub"
```

---

### Task 9: Create Archived Personnel Page UI

**Files:**
- Create: `src/routes/org/[orgId]/admin/archived/+page.svelte`

**Step 1: Create the archived personnel page**

Build a page that shows:
- A table/list of archived personnel with columns: Name (Rank Last, First), MOS, Group, Archived Date, Auto-Delete Date, Actions
- Auto-Delete Date = archivedAt + retentionMonths
- Actions: "Restore" button, "Permanently Delete" button, "Export" button
- Empty state using `<EmptyState message="No archived personnel." />` when list is empty

Key component structure:

```svelte
<script lang="ts">
  import { page } from '$app/stores';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
  import { toastStore } from '$lib/stores/toast.svelte';
  import { invalidateAll } from '$app/navigation';

  let { data } = $props();

  const orgId = $derived($page.params.orgId);

  let restoring = $state<string | null>(null);
  let permanentlyDeleting = $state<string | null>(null);
  let exporting = $state<string | null>(null);
  let confirmPermanentDelete = $state<{id: string, name: string} | null>(null);

  function daysUntilAutoDelete(archivedAt: string, retentionMonths: number): number {
    const archiveDate = new Date(archivedAt);
    const deleteDate = new Date(archiveDate);
    deleteDate.setMonth(deleteDate.getMonth() + retentionMonths);
    const now = new Date();
    return Math.max(0, Math.ceil((deleteDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  }

  async function handleRestore(id: string) {
    restoring = id;
    try {
      const res = await fetch(`/org/${orgId}/api/personnel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', id })
      });
      if (!res.ok) {
        const data = await res.json();
        toastStore.error(data.message ?? 'Failed to restore');
        return;
      }
      toastStore.success('Personnel restored to active status');
      await invalidateAll();
    } catch {
      toastStore.error('Failed to restore personnel');
    } finally {
      restoring = null;
    }
  }

  async function handlePermanentDelete(id: string) {
    permanentlyDeleting = id;
    try {
      const res = await fetch(`/org/${orgId}/api/personnel/permanent`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (!res.ok) throw new Error();
      toastStore.success('Personnel permanently deleted');
      confirmPermanentDelete = null;
      await invalidateAll();
    } catch {
      toastStore.error('Failed to permanently delete');
    } finally {
      permanentlyDeleting = null;
    }
  }

  async function handleExport(id: string, name: string) {
    exporting = id;
    try {
      const res = await fetch(`/org/${orgId}/api/personnel/${id}/export`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}-records.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toastStore.error('Failed to export records');
    } finally {
      exporting = null;
    }
  }
</script>
```

For the template, render a table with the archived personnel list. Each row has Restore, Export, and Permanently Delete buttons. Use the project's CSS design system (`.btn`, `.btn-primary`, `.btn-danger`, `.btn-sm`, `var(--spacing-*)`, `var(--color-*)`, `var(--font-size-*)`, `var(--radius-*)`).

Style the auto-delete countdown: show in red if < 30 days, yellow/warning if < 90 days.

**Step 2: Use Svelte MCP autofixer to validate the component**

**Step 3: Run type check**

Run: `npm run check`

**Step 4: Commit**

```bash
git add src/routes/org/[orgId]/admin/archived/+page.svelte
git commit -m "feat: create archived personnel page UI"
```

---

### Task 10: Create Restore Endpoint (PATCH /api/personnel)

**Files:**
- Modify: `src/routes/org/[orgId]/api/personnel/+server.ts`

**Step 1: Add a PATCH handler for restore**

```typescript
export const PATCH: RequestHandler = async ({ params, request, locals, cookies }) => {
  const { orgId } = params;
  const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

  if (isSandbox) throw error(403, 'Not available in sandbox mode');
  if (!userId) throw error(401, 'Unauthorized');

  // Only admins/owners can restore
  const { data: mem } = await supabase
    .from('organization_memberships')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .single();

  if (!mem || !isPrivilegedRole(mem.role)) {
    throw error(403, 'Only admins and owners can restore archived personnel');
  }

  const body = await request.json();
  const { action, id } = body;

  if (action !== 'restore') throw error(400, 'Invalid action');
  if (!id) throw error(400, 'Missing id');

  // Check personnel cap before restoring
  const capCheck = await canAddPersonnel(supabase, orgId);
  if (!capCheck.allowed) {
    return json({ message: capCheck.message }, { status: 422 });
  }

  // Verify this person is actually archived
  const { data: person } = await supabase
    .from('personnel')
    .select('rank, first_name, last_name, archived_at')
    .eq('id', id)
    .eq('organization_id', orgId)
    .single();

  if (!person) throw error(404, 'Personnel not found');
  if (!person.archived_at) throw error(400, 'Personnel is not archived');

  const { error: dbError } = await supabase
    .from('personnel')
    .update({ archived_at: null })
    .eq('id', id)
    .eq('organization_id', orgId);

  if (dbError) throw error(500, dbError.message);

  auditLog(
    {
      action: 'personnel.restored',
      resourceType: 'personnel',
      resourceId: id,
      orgId,
      details: {
        actor: locals.user?.email ?? userId,
        name: `${person.rank} ${person.last_name}, ${person.first_name}`
      }
    },
    { userId }
  );

  return json({ success: true });
};
```

Import `canAddPersonnel` from `$lib/server/subscription` and `isPrivilegedRole` from `$lib/server/permissions` (check existing imports at top of file).

**Step 2: Run type check**

Run: `npm run check`

**Step 3: Commit**

```bash
git add src/routes/org/[orgId]/api/personnel/+server.ts
git commit -m "feat: add PATCH endpoint for restoring archived personnel"
```

---

### Task 11: Create Permanent Delete Endpoint

**Files:**
- Create: `src/routes/org/[orgId]/api/personnel/permanent/+server.ts`

**Step 1: Create the endpoint**

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getApiContext } from '$lib/server/supabase';
import { isPrivilegedRole } from '$lib/server/permissions';
import { auditLog } from '$lib/server/auditLog';

export const DELETE: RequestHandler = async ({ params, request, locals, cookies }) => {
  const { orgId } = params;
  const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

  if (isSandbox) throw error(403, 'Not available in sandbox mode');
  if (!userId) throw error(401, 'Unauthorized');

  // Only admins/owners can permanently delete
  const { data: mem } = await supabase
    .from('organization_memberships')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .single();

  if (!mem || !isPrivilegedRole(mem.role)) {
    throw error(403, 'Only admins and owners can permanently delete personnel');
  }

  const body = await request.json();
  const { id } = body;
  if (!id) throw error(400, 'Missing id');

  // Verify this person is archived (can only permanently delete archived personnel)
  const { data: person } = await supabase
    .from('personnel')
    .select('rank, first_name, last_name, archived_at')
    .eq('id', id)
    .eq('organization_id', orgId)
    .single();

  if (!person) throw error(404, 'Personnel not found');
  if (!person.archived_at) throw error(400, 'Can only permanently delete archived personnel');

  const { error: dbError } = await supabase
    .from('personnel')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId);

  if (dbError) throw error(500, dbError.message);

  auditLog(
    {
      action: 'personnel.permanently_deleted',
      resourceType: 'personnel',
      resourceId: id,
      orgId,
      details: {
        actor: locals.user?.email ?? userId,
        name: `${person.rank} ${person.last_name}, ${person.first_name}`
      }
    },
    { userId }
  );

  return json({ success: true });
};
```

**Step 2: Run type check**

Run: `npm run check`

**Step 3: Commit**

```bash
git add src/routes/org/[orgId]/api/personnel/permanent/+server.ts
git commit -m "feat: add permanent delete endpoint for archived personnel"
```

---

### Task 12: Create Excel Export Endpoint

**Files:**
- Create: `src/routes/org/[orgId]/api/personnel/[id]/export/+server.ts`

**Step 1: Create the export endpoint**

This endpoint generates an Excel workbook with the archived person's complete data. Use `exceljs` (already installed).

```typescript
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getApiContext } from '$lib/server/supabase';
import { isPrivilegedRole } from '$lib/server/permissions';
import ExcelJS from 'exceljs';

export const GET: RequestHandler = async ({ params, locals, cookies }) => {
  const { orgId, id } = params;
  const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

  if (isSandbox) throw error(403, 'Not available in sandbox mode');
  if (!userId) throw error(401, 'Unauthorized');

  // Only admins/owners can export
  const { data: mem } = await supabase
    .from('organization_memberships')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .single();

  if (!mem || !isPrivilegedRole(mem.role)) {
    throw error(403, 'Only admins and owners can export personnel records');
  }

  // Fetch all data in parallel
  const [personRes, trainingsRes, counselingRes, goalsRes, availabilityRes, extendedRes, trainingTypesRes, counselingTypesRes, statusTypesRes, groupsRes] = await Promise.all([
    supabase.from('personnel').select('*, groups(name)').eq('id', id).eq('organization_id', orgId).single(),
    supabase.from('personnel_trainings').select('*').eq('personnel_id', id),
    supabase.from('counseling_records').select('*').eq('personnel_id', id).eq('organization_id', orgId),
    supabase.from('development_goals').select('*').eq('personnel_id', id).eq('organization_id', orgId),
    supabase.from('availability_entries').select('*').eq('personnel_id', id).eq('organization_id', orgId).order('date', { ascending: false }),
    supabase.from('personnel_extended_info').select('*').eq('personnel_id', id).maybeSingle(),
    supabase.from('training_types').select('id, name').eq('organization_id', orgId),
    supabase.from('counseling_types').select('id, name').eq('organization_id', orgId),
    supabase.from('status_types').select('id, name').eq('organization_id', orgId),
  ]);

  const person = personRes.data;
  if (!person) throw error(404, 'Personnel not found');

  // Build lookup maps for human-readable names
  const trainingTypeMap = new Map((trainingTypesRes.data ?? []).map((t: any) => [t.id, t.name]));
  const counselingTypeMap = new Map((counselingTypesRes.data ?? []).map((t: any) => [t.id, t.name]));
  const statusTypeMap = new Map((statusTypesRes.data ?? []).map((t: any) => [t.id, t.name]));

  const workbook = new ExcelJS.Workbook();

  // Sheet 1: Personnel Info
  const infoSheet = workbook.addWorksheet('Personnel Info');
  infoSheet.columns = [
    { header: 'Field', key: 'field', width: 25 },
    { header: 'Value', key: 'value', width: 40 }
  ];
  infoSheet.addRows([
    { field: 'Rank', value: person.rank },
    { field: 'Last Name', value: person.last_name },
    { field: 'First Name', value: person.first_name },
    { field: 'MOS', value: person.mos },
    { field: 'Clinic Role', value: person.clinic_role },
    { field: 'Group', value: person.groups?.name ?? '' },
    { field: 'Archived At', value: person.archived_at ? new Date(person.archived_at).toLocaleDateString() : 'Active' },
    { field: 'Created At', value: new Date(person.created_at).toLocaleDateString() },
  ]);
  // Add extended info if exists
  const ext = extendedRes.data;
  if (ext) {
    infoSheet.addRows([
      { field: 'Phone', value: ext.phone ?? '' },
      { field: 'Email', value: ext.email ?? '' },
      { field: 'Address', value: ext.address ?? '' },
      { field: 'Emergency Contact', value: ext.emergency_contact ?? '' },
      { field: 'Emergency Phone', value: ext.emergency_phone ?? '' },
      { field: 'Notes', value: ext.notes ?? '' },
    ]);
  }

  // Sheet 2: Training Records
  const trainingSheet = workbook.addWorksheet('Training Records');
  trainingSheet.columns = [
    { header: 'Training Type', key: 'type', width: 30 },
    { header: 'Completed Date', key: 'completed', width: 15 },
    { header: 'Expiration Date', key: 'expiration', width: 15 },
    { header: 'Notes', key: 'notes', width: 40 },
  ];
  for (const t of (trainingsRes.data ?? [])) {
    trainingSheet.addRow({
      type: trainingTypeMap.get(t.training_type_id) ?? t.training_type_id,
      completed: t.completed_date ? new Date(t.completed_date).toLocaleDateString() : '',
      expiration: t.expiration_date ? new Date(t.expiration_date).toLocaleDateString() : '',
      notes: t.notes ?? '',
    });
  }

  // Sheet 3: Counseling Records
  const counselingSheet = workbook.addWorksheet('Counseling Records');
  counselingSheet.columns = [
    { header: 'Type', key: 'type', width: 25 },
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Summary', key: 'summary', width: 50 },
    { header: 'Key Points', key: 'keyPoints', width: 50 },
    { header: 'Action Plan', key: 'actionPlan', width: 50 },
  ];
  for (const c of (counselingRes.data ?? [])) {
    counselingSheet.addRow({
      type: c.counseling_type_id ? (counselingTypeMap.get(c.counseling_type_id) ?? c.counseling_type_id) : '',
      date: c.counseling_date ? new Date(c.counseling_date).toLocaleDateString() : '',
      summary: c.summary ?? '',
      keyPoints: c.key_points ?? '',
      actionPlan: c.action_plan ?? '',
    });
  }

  // Sheet 4: Development Goals
  const goalsSheet = workbook.addWorksheet('Development Goals');
  goalsSheet.columns = [
    { header: 'Goal', key: 'goal', width: 40 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Target Date', key: 'targetDate', width: 15 },
    { header: 'Notes', key: 'notes', width: 40 },
  ];
  for (const g of (goalsRes.data ?? [])) {
    goalsSheet.addRow({
      goal: g.description ?? g.title ?? '',
      status: g.status ?? '',
      targetDate: g.target_date ? new Date(g.target_date).toLocaleDateString() : '',
      notes: g.notes ?? '',
    });
  }

  // Sheet 5: Availability History
  const availSheet = workbook.addWorksheet('Availability History');
  availSheet.columns = [
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Status', key: 'status', width: 25 },
    { header: 'Notes', key: 'notes', width: 40 },
  ];
  for (const a of (availabilityRes.data ?? [])) {
    availSheet.addRow({
      date: a.date ? new Date(a.date).toLocaleDateString() : '',
      status: a.status_type_id ? (statusTypeMap.get(a.status_type_id) ?? a.status_type_id) : '',
      notes: a.notes ?? '',
    });
  }

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `${person.rank}_${person.last_name}_${person.first_name}_records.xlsx`;

  return new Response(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};
```

Note: The exact column names for counseling_records, development_goals, etc. may differ. Check the actual table schemas and adjust the field names accordingly during implementation.

**Step 2: Run type check**

Run: `npm run check`

**Step 3: Commit**

```bash
git add src/routes/org/[orgId]/api/personnel/[id]/export/+server.ts
git commit -m "feat: add Excel export endpoint for archived personnel"
```

---

### Task 13: Add Archive Retention Settings UI

**Files:**
- Create: `src/routes/org/[orgId]/admin/settings/+page.server.ts`
- Create: `src/routes/org/[orgId]/admin/settings/+page.svelte`
- Modify: `src/routes/org/[orgId]/admin/+layout.svelte`

**Step 1: Add "Settings" tab to admin layout**

Add a new tab in `+layout.svelte`:

```svelte
<a href="/org/{orgId}/admin/settings" class="tab" class:active={currentPath.includes('/settings')}>
    Settings
</a>
```

**Step 2: Create the settings page server**

```typescript
// src/routes/org/[orgId]/admin/settings/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const { data } = await locals.supabase
    .from('organizations')
    .select('archive_retention_months')
    .eq('id', params.orgId)
    .single();

  return {
    retentionMonths: data?.archive_retention_months ?? 36
  };
};
```

**Step 3: Create the settings page UI**

Build a simple form with:
- A heading "Organization Settings"
- A section "Archive Retention"
- A number input for retention months (min 1, max 120, default 36)
- A "Save" button with Spinner
- On save, PATCH to a new endpoint or use a form action

The save calls `PATCH /org/{orgId}/api/organization` (or similar existing endpoint). Check if there's already an endpoint for updating org settings — if not, create a minimal one.

**Step 4: Create or update the org API endpoint to handle retention setting**

Check if there's already a `PATCH` handler on the org API. If not, add one that updates `archive_retention_months`:

```typescript
// In the appropriate org API route
const { error: dbError } = await supabase
  .from('organizations')
  .update({ archive_retention_months: retentionMonths })
  .eq('id', orgId);
```

Validate: `retentionMonths` is an integer between 1 and 120.

**Step 5: Use Svelte MCP autofixer on the settings page**

**Step 6: Run type check**

Run: `npm run check`

**Step 7: Commit**

```bash
git add src/routes/org/[orgId]/admin/settings/ src/routes/org/[orgId]/admin/+layout.svelte
git commit -m "feat: add archive retention settings page in admin hub"
```

---

### Task 14: Create Vercel Cron Job for Auto-Cleanup

**Files:**
- Create: `src/routes/api/cleanup-archived-personnel/+server.ts`
- Modify: `vercel.json`

**Step 1: Create the cron endpoint**

Follow the same pattern as `cleanup-old-data/+server.ts`:

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminClient } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ request }) => {
  const authHeader = request.headers.get('authorization');
  const cleanupSecret = env.CLEANUP_SECRET;
  const cronSecret = env.CRON_SECRET;

  const isAuthorized =
    (authHeader === `Bearer ${cleanupSecret}`) ||
    (authHeader === `Bearer ${cronSecret}`);

  if (!isAuthorized) {
    throw error(401, 'Unauthorized');
  }

  const admin = getAdminClient();

  // Find all expired archived personnel with their org's retention setting
  const { data: expiredPersonnel, error: queryError } = await admin
    .from('personnel')
    .select('id, rank, first_name, last_name, organization_id, archived_at, organizations!inner(archive_retention_months)')
    .not('archived_at', 'is', null);

  if (queryError) {
    throw error(500, queryError.message);
  }

  const now = new Date();
  const toDelete = (expiredPersonnel ?? []).filter((p: any) => {
    const archivedAt = new Date(p.archived_at);
    const retentionMonths = p.organizations?.archive_retention_months ?? 36;
    const expiresAt = new Date(archivedAt);
    expiresAt.setMonth(expiresAt.getMonth() + retentionMonths);
    return now > expiresAt;
  });

  if (toDelete.length === 0) {
    return json({ deletedCount: 0, orgsAffected: 0 });
  }

  // Group by org for notifications
  const byOrg = new Map<string, Array<{ id: string; name: string }>>();
  for (const p of toDelete) {
    const orgId = p.organization_id;
    if (!byOrg.has(orgId)) byOrg.set(orgId, []);
    byOrg.get(orgId)!.push({
      id: p.id,
      name: `${p.rank} ${p.last_name}, ${p.first_name}`
    });
  }

  // Delete expired personnel
  const idsToDelete = toDelete.map((p: any) => p.id);
  const { error: deleteError } = await admin
    .from('personnel')
    .delete()
    .in('id', idsToDelete);

  if (deleteError) {
    throw error(500, deleteError.message);
  }

  // Create notifications for org admins/owners
  for (const [orgId, people] of byOrg.entries()) {
    // Get admin/owner user IDs for this org
    const { data: admins } = await admin
      .from('organization_memberships')
      .select('user_id')
      .eq('organization_id', orgId)
      .in('role', ['owner', 'admin']);

    const nameList = people.map(p => p.name).join(', ');
    const message = `${people.length} archived personnel auto-deleted after retention period: ${nameList}`;

    for (const adm of (admins ?? [])) {
      await admin.from('notifications').insert({
        user_id: adm.user_id,
        organization_id: orgId,
        type: 'archive_auto_deleted',
        title: 'Archived Personnel Auto-Deleted',
        message,
        link: null
      });
    }
  }

  return json({
    deletedCount: idsToDelete.length,
    orgsAffected: byOrg.size
  });
};
```

**Step 2: Add cron entry to vercel.json**

```json
{
  "crons": [
    {
      "path": "/api/cleanup-demo-sandboxes",
      "schedule": "0 3 * * *"
    },
    {
      "path": "/api/cleanup-old-data",
      "schedule": "0 4 * * 0"
    },
    {
      "path": "/api/cleanup-archived-personnel",
      "schedule": "0 5 * * *"
    }
  ]
}
```

**Step 3: Run type check**

Run: `npm run check`

**Step 4: Commit**

```bash
git add src/routes/api/cleanup-archived-personnel/+server.ts vercel.json
git commit -m "feat: add Vercel cron job for auto-deleting expired archived personnel"
```

---

### Task 15: Build and Verify

**Step 1: Run full type check**

Run: `npm run check`
Expected: No new errors (pre-existing errors are acceptable per MEMORY.md).

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Manual verification checklist**

- [ ] App loads normally, no errors in console
- [ ] Active personnel page shows no archived people
- [ ] "Archive" button appears where "Delete"/"Remove" used to be
- [ ] Archiving a person removes them from active views
- [ ] Admin Hub shows "Archived Personnel" tab (admin/owner only)
- [ ] Archived personnel page lists archived people with dates
- [ ] Restore button works and person reappears in active views
- [ ] Permanent delete button works with confirmation
- [ ] Export downloads an Excel file with readable data
- [ ] Settings page allows changing retention months
- [ ] Personnel cap does not count archived personnel

**Step 4: Commit any fixes**

---

### Task 16: Update Memory File

**Files:**
- Modify: `/Users/robertbaddeley/.claude/projects/-Users-robertbaddeley-projects-trooptotask/memory/MEMORY.md`

**Step 1: Add archival system section to MEMORY.md**

Add a section documenting:
- The archival system design and key decisions
- Key files: migration, archived page, cron endpoint, export endpoint, settings page
- Rules for new features: respect archived_at filtering, use `.is('archived_at', null)` in personnel queries
- Admin-only access to archived personnel
- Reference to design doc: `docs/plans/2026-03-09-personnel-archival-design.md`
