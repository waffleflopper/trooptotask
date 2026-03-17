# Status Notes & Bulk Status Removal — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add optional notes to status entries (shown in tooltips) and a bulk status removal modal for cancelling/correcting bulk status assignments.

**Architecture:** Two independent features sharing the same data layer. Feature 1 (notes) adds a column + passes it through the full stack. Feature 2 (bulk remove) adds a new batch delete endpoint + a new modal component with client-side match preview.

**Tech Stack:** SvelteKit 2.5, Svelte 5 runes, TypeScript, Supabase Postgres, CSS variables

---

### Task 1: Database Migration — Add `note` Column

**Files:**

- Create: `supabase/migrations/20260310_status_notes.sql`

**Step 1: Write the migration**

```sql
-- Add optional note field to availability entries
ALTER TABLE availability_entries
  ADD COLUMN note text;

-- Enforce max length
ALTER TABLE availability_entries
  ADD CONSTRAINT availability_entries_note_length CHECK (char_length(note) <= 200);
```

**Step 2: Apply migration to local database**

Run: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/migrations/20260310_status_notes.sql`
Expected: `ALTER TABLE` x2, no errors

**Step 3: Commit**

```bash
git add supabase/migrations/20260310_status_notes.sql
git commit -m "feat: add note column to availability_entries"
```

---

### Task 2: Type & Transform Updates for `note`

**Files:**

- Modify: `src/lib/types.ts:162-168` (AvailabilityEntry interface)
- Modify: `src/lib/server/transforms.ts:66-74` (transformAvailabilityEntries)

**Step 1: Add `note` to AvailabilityEntry type**

In `src/lib/types.ts`, update the `AvailabilityEntry` interface (line 162-168):

```typescript
export interface AvailabilityEntry {
	id: string;
	personnelId: string;
	statusTypeId: string;
	startDate: string;
	endDate: string;
	note?: string | null;
}
```

**Step 2: Update the transform function**

In `src/lib/server/transforms.ts`, update `transformAvailabilityEntries` (line 66-74):

```typescript
export function transformAvailabilityEntries(data: any[]): AvailabilityEntry[] {
	return data.map((a: any) => ({
		id: a.id,
		personnelId: a.personnel_id,
		statusTypeId: a.status_type_id,
		startDate: a.start_date,
		endDate: a.end_date,
		note: a.note ?? null
	}));
}
```

**Step 3: Verify types compile**

Run: `npx svelte-check --threshold warning 2>&1 | head -30`
Expected: No new errors related to `note` or `AvailabilityEntry`

**Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/server/transforms.ts
git commit -m "feat: add note field to AvailabilityEntry type and transform"
```

---

### Task 3: API & Store — Pass `note` Through

**Files:**

- Modify: `src/lib/stores/availability.svelte.ts` (add, addBatch, removeBatch)
- Modify: `src/routes/org/[orgId]/api/availability/+server.ts` (CRUD config)
- Modify: `src/routes/org/[orgId]/api/availability/batch/+server.ts` (POST handler + new DELETE handler)

**Step 1: Update CRUD config for single availability endpoint**

In `src/routes/org/[orgId]/api/availability/+server.ts`, add `note` to the fields mapping (line 12-15):

```typescript
	fields: {
		personnelId: 'personnel_id',
		statusTypeId: 'status_type_id',
		startDate: 'start_date',
		endDate: 'end_date',
		note: 'note'
	},
```

Also update the `auditDetailFields` array to include `'note'`:

```typescript
auditDetailFields: ['personnel_id', 'status_type_id', 'start_date', 'end_date', 'note'];
```

**Step 2: Update batch POST to include `note`**

In `src/routes/org/[orgId]/api/availability/batch/+server.ts`:

Update the `BatchAvailabilityRecord` interface (line 8-13):

```typescript
interface BatchAvailabilityRecord {
	personnelId: string;
	statusTypeId: string;
	startDate: string;
	endDate: string;
	note?: string | null;
}
```

Update the `rows` mapping (line 62-68) to include `note`:

```typescript
const rows = records.map((r) => ({
	organization_id: orgId,
	personnel_id: r.personnelId,
	status_type_id: r.statusTypeId,
	start_date: r.startDate,
	end_date: r.endDate,
	note: r.note ?? null
}));
```

Update the result mapping (line 90-96) to include `note`:

```typescript
const result = (inserted ?? []).map((d) => ({
	id: d.id,
	personnelId: d.personnel_id,
	statusTypeId: d.status_type_id,
	startDate: d.start_date,
	endDate: d.end_date,
	note: d.note ?? null
}));
```

**Step 3: Add DELETE handler to batch endpoint**

In the same file (`src/routes/org/[orgId]/api/availability/batch/+server.ts`), add a new `DELETE` export after the existing `POST`:

```typescript
export const DELETE: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'calendar');
	}

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const body = await request.json();
	const ids: string[] = body.ids;

	if (!Array.isArray(ids) || ids.length === 0) {
		throw error(400, 'ids array is required');
	}

	if (ids.length > 500) {
		throw error(400, 'Maximum 500 ids per batch');
	}

	// Validate all IDs are UUIDs
	for (const id of ids) {
		if (!validateUUID(id)) {
			throw error(400, 'Invalid ID format');
		}
	}

	// Enforce group scope if user is scoped
	let scopedGroupId: string | null = null;
	if (!isSandbox && userId) {
		scopedGroupId = await getScopedGroupId(supabase, orgId, userId);
	}

	if (scopedGroupId) {
		// Fetch the entries to verify group access
		const { data: entries } = await supabase
			.from('availability_entries')
			.select('id, personnel_id')
			.eq('organization_id', orgId)
			.in('id', ids);

		const personnelIds = [...new Set((entries ?? []).map((e) => e.personnel_id))];
		const { data: personnelData } = await supabase
			.from('personnel')
			.select('id, group_id')
			.eq('organization_id', orgId)
			.in('id', personnelIds);

		const groupMap = new Map((personnelData ?? []).map((p) => [p.id, p.group_id]));
		for (const entry of entries ?? []) {
			const groupId = groupMap.get(entry.personnel_id);
			if (groupId !== scopedGroupId) {
				throw error(403, 'Personnel not in your assigned group');
			}
		}
	}

	const { error: dbError, count } = await supabase
		.from('availability_entries')
		.delete()
		.eq('organization_id', orgId)
		.in('id', ids);

	if (dbError) throw error(500, dbError.message);

	auditLog(
		{
			action: 'availability.bulk_deleted',
			resourceType: 'availability',
			orgId,
			details: {
				actor: locals.user?.email ?? userId,
				count: count ?? ids.length
			}
		},
		{ userId }
	);

	return json({ deleted: count ?? ids.length });
};
```

Note: You'll need to add `validateUUID` to the imports at the top of the file:

```typescript
import { validateUUID } from '$lib/server/validation';
```

**Step 4: Update availability store**

In `src/lib/stores/availability.svelte.ts`, the existing `add()` and `addBatch()` methods already pass through `Omit<AvailabilityEntry, 'id'>` which now includes `note`. No changes needed for those.

Add a `removeBatch` method after the existing `addBatch` method (after line 89):

```typescript
	async removeBatch(ids: string[]): Promise<boolean> {
		// Optimistic: remove all matching entries
		const removedEntries = this.#entries.filter(e => ids.includes(e.id));
		this.#entries = this.#entries.filter(e => !ids.includes(e.id));

		try {
			const res = await fetch(`/org/${this.#orgId}/api/availability/batch`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids })
			});
			if (!res.ok) throw new Error('Failed to delete availability batch');
			return true;
		} catch {
			// Rollback on failure
			this.#entries = [...this.#entries, ...removedEntries];
			return false;
		}
	}
```

**Step 5: Verify types compile**

Run: `npx svelte-check --threshold warning 2>&1 | head -30`
Expected: No new errors

**Step 6: Commit**

```bash
git add src/lib/stores/availability.svelte.ts src/routes/org/\[orgId\]/api/availability/+server.ts src/routes/org/\[orgId\]/api/availability/batch/+server.ts
git commit -m "feat: add note to availability API and add batch delete endpoint"
```

---

### Task 4: UI — Add Note Input to AvailabilityModal

**Files:**

- Modify: `src/lib/components/AvailabilityModal.svelte`

**Step 1: Add note state and pass through**

Add `note` state variable (around line 38, after `editingEntry`):

```typescript
let note = $state('');
```

In the `startEdit` function (line 70-75), add note initialization:

```typescript
function startEdit(entry: AvailabilityEntry) {
	editingEntry = entry;
	selectedStatusId = entry.statusTypeId;
	startDate = entry.startDate;
	endDate = entry.endDate;
	note = entry.note ?? '';
}
```

In `cancelEdit` (line 77-82), reset note:

```typescript
function cancelEdit() {
	editingEntry = null;
	selectedStatusId = statusTypes[0]?.id ?? '';
	startDate = dateStr;
	endDate = dateStr;
	note = '';
}
```

In `handleSubmit` (line 84-113), include note in `newData`:

```typescript
const newData = {
	personnelId: person.id,
	statusTypeId: selectedStatusId,
	startDate,
	endDate,
	note: note.trim() || null
};
```

Also include `note` in the temp entry created on line 103:

```typescript
if (dateStr >= newData.startDate && dateStr <= newData.endDate) {
	const tempEntry: AvailabilityEntry = { id: `temp-${crypto.randomUUID()}`, ...newData };
	localEntries = [...localEntries, tempEntry];
}
```

And reset note after submit (around line 111-112):

```typescript
// Reset form
selectedStatusId = statusTypes[0]?.id ?? '';
startDate = dateStr;
endDate = dateStr;
note = '';
```

**Step 2: Add note display in existing entries list**

In the template, update the `.entry-item` block (around line 172-205). After the `.entry-details` div, add a note display if the entry has one. Update the entry-item content:

After the `<div class="entry-details">` block (line 175-180), add:

```svelte
{#if entry.note}
	<span class="entry-note" title={entry.note}>{entry.note}</span>
{/if}
```

**Step 3: Add note input to the form**

After the date range section (after the `{#if dateError}` block, around line 253-254), add the note input:

```svelte
<div class="form-group">
	<label class="label" for="statusNote">Note</label>
	<input
		id="statusNote"
		type="text"
		class="input"
		bind:value={note}
		maxlength={200}
		placeholder="Optional note (e.g., JRTC rotation)"
	/>
</div>
```

**Step 4: Add CSS for note display**

Add to the `<style>` section:

```css
.entry-note {
	font-size: var(--font-size-xs);
	color: var(--color-text-muted);
	font-style: italic;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	max-width: 120px;
}
```

**Step 5: Verify**

Run: `npx svelte-check --threshold warning 2>&1 | head -30`
Expected: No new errors

**Step 6: Commit**

```bash
git add src/lib/components/AvailabilityModal.svelte
git commit -m "feat: add note input to AvailabilityModal"
```

---

### Task 5: UI — Add Note Input to BulkStatusModal

**Files:**

- Modify: `src/lib/components/BulkStatusModal.svelte`

**Step 1: Update onApply callback signature**

Update the `Props` interface (line 14) to include note:

```typescript
onApply: (personnelIds: string[], statusTypeId: string, startDate: string, endDate: string, note: string | null) =>
	Promise<void>;
```

**Step 2: Add note state**

After the `isSubmitting` state (line 31), add:

```typescript
let note = $state('');
```

**Step 3: Pass note in handleSubmit**

Update `handleSubmit` (line 146-156):

```typescript
async function handleSubmit() {
	if (!isValid || isSubmitting) return;

	isSubmitting = true;
	try {
		await onApply([...selectedIds], selectedStatusId, startDate, endDate, note.trim() || null);
		onClose();
	} finally {
		isSubmitting = false;
	}
}
```

**Step 4: Add note input to template**

After the `{#if dateError}` block (line 207-209), add the note input inside `.config-section`:

```svelte
<div class="config-row">
	<div class="form-group" style="flex: 1;">
		<label class="label" for="bulkNote">Note</label>
		<input
			id="bulkNote"
			type="text"
			class="input"
			bind:value={note}
			maxlength={200}
			placeholder="Optional note (e.g., JRTC rotation)"
		/>
	</div>
</div>
```

**Step 5: Update calendar page to pass note through**

In `src/routes/org/[orgId]/calendar/+page.svelte`, update `handleBulkStatusApply` (line 110-114):

```typescript
async function handleBulkStatusApply(
	personnelIds: string[],
	statusTypeId: string,
	startDate: string,
	endDate: string,
	note: string | null
) {
	await availabilityStore.addBatch(
		personnelIds.map((personnelId) => ({ personnelId, statusTypeId, startDate, endDate, note }))
	);
}
```

**Step 6: Verify**

Run: `npx svelte-check --threshold warning 2>&1 | head -30`
Expected: No new errors

**Step 7: Commit**

```bash
git add src/lib/components/BulkStatusModal.svelte src/routes/org/\[orgId\]/calendar/+page.svelte
git commit -m "feat: add note input to BulkStatusModal"
```

---

### Task 6: UI — Show Notes in DateCell Tooltip

**Files:**

- Modify: `src/lib/components/DateCell.svelte`

**Step 1: Update statusColors derived to include note**

Update the `statusColors` derived (line 31-38) to carry the note:

```typescript
const statusColors = $derived(
	entries
		.map((entry) => {
			const status = statusTypeMap.get(entry.statusTypeId);
			return status ? { color: status.color, name: status.name, textColor: status.textColor, note: entry.note } : null;
		})
		.filter((s): s is { color: string; name: string; textColor: string; note?: string | null } => s !== null)
);
```

**Step 2: Update tooltipText to show notes**

Update the `tooltipText` derived (line 40-52) to include notes:

```typescript
const tooltipText = $derived.by(() => {
	const parts: string[] = [];
	if (assignments.length > 0) {
		parts.push(...assignments.map((a) => a.type.name));
	}
	if (holidayName) {
		parts.push(holidayName);
	}
	if (statusColors.length > 0) {
		parts.push(...statusColors.map((s) => (s.note ? `${s.name} — ${s.note}` : s.name)));
	}
	return parts.join('\n');
});
```

**Step 3: Verify**

Run: `npx svelte-check --threshold warning 2>&1 | head -30`
Expected: No new errors

**Step 4: Commit**

```bash
git add src/lib/components/DateCell.svelte
git commit -m "feat: show status notes in DateCell tooltip"
```

---

### Task 7: UI — BulkStatusRemoveModal Component

**Files:**

- Create: `src/lib/components/BulkStatusRemoveModal.svelte`

**Step 1: Create the modal component**

Create `src/lib/components/BulkStatusRemoveModal.svelte` with the following content.

This component has two steps:

1. **Selection step**: pick status type, date range, and personnel (mirrors BulkStatusModal)
2. **Confirmation step**: shows exact matches and partial overlaps, confirm or go back

```svelte
<script lang="ts">
	import type { Personnel, StatusType, AvailabilityEntry } from '../types';
	import { formatDate } from '../utils/dates';
	import { toastStore } from '$lib/stores/toast.svelte';
	import Modal from './Modal.svelte';
	import Spinner from './ui/Spinner.svelte';

	interface GroupData {
		group: string;
		personnel: Personnel[];
	}

	interface MatchResult {
		exact: AvailabilityEntry[];
		partial: AvailabilityEntry[];
	}

	interface Props {
		personnelByGroup: GroupData[];
		statusTypes: StatusType[];
		availabilityEntries: AvailabilityEntry[];
		personnelList: Personnel[];
		onRemove: (ids: string[]) => Promise<boolean>;
		onClose: () => void;
	}

	let { personnelByGroup, statusTypes, availabilityEntries, personnelList, onRemove, onClose }: Props = $props();

	const todayStr = formatDate(new Date());

	// Selection state
	let selectedStatusId = $state('');
	let startDate = $state(todayStr);
	let endDate = $state(todayStr);
	let selectedIds = $state<Set<string>>(new Set());
	let searchQuery = $state('');
	let collapsedGroups = $state<Set<string>>(new Set());

	// Step state
	let step = $state<'select' | 'confirm'>('select');
	let matchResult = $state<MatchResult>({ exact: [], partial: [] });
	let isSubmitting = $state(false);

	$effect(() => {
		selectedStatusId = statusTypes[0]?.id ?? '';
	});

	const allPersonnel = $derived(personnelByGroup.flatMap((g) => g.personnel));

	const filteredGroups = $derived.by(() => {
		if (!searchQuery.trim()) return personnelByGroup;
		const query = searchQuery.toLowerCase();
		return personnelByGroup
			.map((g) => ({
				...g,
				personnel: g.personnel.filter(
					(p) =>
						p.lastName.toLowerCase().includes(query) ||
						p.firstName.toLowerCase().includes(query) ||
						p.rank.toLowerCase().includes(query) ||
						p.mos.toLowerCase().includes(query) ||
						p.clinicRole.toLowerCase().includes(query)
				)
			}))
			.filter((g) => g.personnel.length > 0);
	});

	const dateError = $derived.by(() => {
		if (startDate && endDate && startDate > endDate) {
			return 'End date must be on or after start date';
		}
		return null;
	});

	const dayCount = $derived.by(() => {
		if (!startDate || !endDate || startDate > endDate) return 0;
		const start = new Date(startDate + 'T00:00:00');
		const end = new Date(endDate + 'T00:00:00');
		return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
	});

	const isValid = $derived(selectedStatusId && startDate && endDate && startDate <= endDate && selectedIds.size > 0);

	const selectedStatus = $derived(statusTypes.find((s) => s.id === selectedStatusId));

	// Personnel lookup for confirmation display
	const personnelMap = $derived(new Map(personnelList.map((p) => [p.id, p])));

	function togglePerson(id: string) {
		const newSet = new Set(selectedIds);
		if (newSet.has(id)) {
			newSet.delete(id);
		} else {
			newSet.add(id);
		}
		selectedIds = newSet;
	}

	function selectAll() {
		const visibleIds = filteredGroups.flatMap((g) => g.personnel.map((p) => p.id));
		selectedIds = new Set(visibleIds);
	}

	function selectNone() {
		selectedIds = new Set();
	}

	function getGroupPersonnel(groupName: string): Personnel[] {
		return allPersonnel.filter((p) => p.groupName === groupName);
	}

	function getGroupSelectionState(groupName: string): 'none' | 'some' | 'all' {
		const groupPersonnel = getGroupPersonnel(groupName);
		const selectedCount = groupPersonnel.filter((p) => selectedIds.has(p.id)).length;
		if (selectedCount === 0) return 'none';
		if (selectedCount === groupPersonnel.length) return 'all';
		return 'some';
	}

	function toggleGroup(groupName: string) {
		const groupPersonnel = getGroupPersonnel(groupName);
		const state = getGroupSelectionState(groupName);
		const newSet = new Set(selectedIds);
		if (state === 'all') {
			for (const p of groupPersonnel) {
				newSet.delete(p.id);
			}
		} else {
			for (const p of groupPersonnel) {
				newSet.add(p.id);
			}
		}
		selectedIds = newSet;
	}

	function toggleGroupCollapse(groupName: string) {
		const newSet = new Set(collapsedGroups);
		if (newSet.has(groupName)) {
			newSet.delete(groupName);
		} else {
			newSet.add(groupName);
		}
		collapsedGroups = newSet;
	}

	function clearSearch() {
		searchQuery = '';
	}

	function formatDateDisplay(dateStr: string): string {
		const date = new Date(dateStr + 'T00:00:00');
		return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
	}

	function handleFindMatching() {
		if (!isValid) return;

		const matching = availabilityEntries.filter(
			(e) =>
				selectedIds.has(e.personnelId) &&
				e.statusTypeId === selectedStatusId &&
				e.startDate <= endDate &&
				e.endDate >= startDate
		);

		const exact: AvailabilityEntry[] = [];
		const partial: AvailabilityEntry[] = [];

		for (const entry of matching) {
			if (entry.startDate >= startDate && entry.endDate <= endDate) {
				exact.push(entry);
			} else {
				partial.push(entry);
			}
		}

		matchResult = { exact, partial };
		step = 'confirm';
	}

	function handleBack() {
		step = 'select';
		matchResult = { exact: [], partial: [] };
	}

	async function handleConfirmRemoval() {
		if (isSubmitting) return;
		const allIds = [...matchResult.exact.map((e) => e.id), ...matchResult.partial.map((e) => e.id)];
		if (allIds.length === 0) return;

		isSubmitting = true;
		try {
			const success = await onRemove(allIds);
			if (success) {
				toastStore.success(`Removed ${allIds.length} status ${allIds.length === 1 ? 'entry' : 'entries'}`);
				onClose();
			} else {
				toastStore.error('Failed to remove status entries');
			}
		} finally {
			isSubmitting = false;
		}
	}

	function getPersonName(personnelId: string): string {
		const p = personnelMap.get(personnelId);
		return p ? `${p.rank} ${p.lastName}, ${p.firstName}` : 'Unknown';
	}
</script>

<Modal title="Bulk Remove Status" {onClose} width="600px" titleId="bulk-remove-status-title">
	{#if step === 'select'}
		<div class="modal-content">
			<!-- Status & Date Configuration -->
			<div class="config-section">
				<div class="config-row">
					<div class="form-group status-select">
						<label class="label" for="removeStatusType">Status Type</label>
						<select id="removeStatusType" class="select" bind:value={selectedStatusId}>
							{#each statusTypes as status}
								<option value={status.id}>{status.name}</option>
							{/each}
						</select>
					</div>
					{#if selectedStatus}
						<div class="status-preview">
							<span
								class="status-badge"
								style="background-color: {selectedStatus.color}; color: {selectedStatus.textColor}"
							>
								{selectedStatus.name}
							</span>
						</div>
					{/if}
				</div>

				<div class="config-row dates-row">
					<div class="form-group">
						<label class="label" for="removeStartDate">Start Date</label>
						<input id="removeStartDate" type="date" class="input" bind:value={startDate} />
					</div>
					<span class="date-arrow">→</span>
					<div class="form-group">
						<label class="label" for="removeEndDate">End Date</label>
						<input id="removeEndDate" type="date" class="input" bind:value={endDate} />
					</div>
					{#if dayCount > 0}
						<div class="day-count">
							<span class="day-count-number">{dayCount}</span>
							<span class="day-count-label">{dayCount === 1 ? 'day' : 'days'}</span>
						</div>
					{/if}
				</div>

				{#if dateError}
					<div class="date-error">{dateError}</div>
				{/if}
			</div>

			<!-- Personnel Selection -->
			<div class="personnel-section">
				<div class="section-header">
					<h3>Select Personnel</h3>
					<div class="selection-info">
						<span class="selected-count">{selectedIds.size} selected</span>
						<div class="selection-actions">
							<button class="btn btn-secondary btn-sm" onclick={selectAll}>All</button>
							<button class="btn btn-secondary btn-sm" onclick={selectNone}>None</button>
						</div>
					</div>
				</div>

				<div class="search-bar">
					<div class="search-input-wrapper">
						<svg class="search-icon" viewBox="0 0 20 20" fill="currentColor">
							<path
								fill-rule="evenodd"
								d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
								clip-rule="evenodd"
							/>
						</svg>
						<input
							type="text"
							class="input search-input"
							placeholder="Search by name, rank, MOS, or role..."
							bind:value={searchQuery}
						/>
						{#if searchQuery}
							<button class="clear-search" onclick={clearSearch} aria-label="Clear search">
								<svg viewBox="0 0 20 20" fill="currentColor">
									<path
										fill-rule="evenodd"
										d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
										clip-rule="evenodd"
									/>
								</svg>
							</button>
						{/if}
					</div>
				</div>

				<div class="personnel-list">
					{#each filteredGroups as grp (grp.group)}
						{@const selectionState = getGroupSelectionState(grp.group)}
						{@const isCollapsed = collapsedGroups.has(grp.group)}
						<div class="group-section">
							<div class="group-header">
								<button
									class="group-collapse-btn"
									onclick={() => toggleGroupCollapse(grp.group)}
									aria-label={isCollapsed ? 'Expand group' : 'Collapse group'}
								>
									<svg class="collapse-icon" class:collapsed={isCollapsed} viewBox="0 0 20 20" fill="currentColor">
										<path
											fill-rule="evenodd"
											d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
											clip-rule="evenodd"
										/>
									</svg>
								</button>
								<label class="group-checkbox-label">
									<input
										type="checkbox"
										checked={selectionState === 'all'}
										indeterminate={selectionState === 'some'}
										onchange={() => toggleGroup(grp.group)}
									/>
									<span class="group-name">{grp.group}</span>
									<span class="group-count">({grp.personnel.length})</span>
								</label>
							</div>
							{#if !isCollapsed}
								<div class="group-personnel">
									{#each grp.personnel as person (person.id)}
										{@const isSelected = selectedIds.has(person.id)}
										<label class="person-item" class:selected={isSelected}>
											<input type="checkbox" checked={isSelected} onchange={() => togglePerson(person.id)} />
											<span class="rank">{person.rank}</span>
											<span class="name">{person.lastName}, {person.firstName}</span>
											{#if person.mos}
												<span class="mos">{person.mos}</span>
											{/if}
										</label>
									{/each}
								</div>
							{/if}
						</div>
					{/each}

					{#if filteredGroups.length === 0}
						<div class="empty-state">
							{#if searchQuery}
								<p>No personnel match "{searchQuery}"</p>
								<button class="btn btn-secondary btn-sm" onclick={clearSearch}>Clear search</button>
							{:else}
								<p>No personnel available</p>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</div>

		{#snippet footer()}
			<div class="footer-summary">
				{#if selectedIds.size > 0 && selectedStatus && !dateError}
					<span
						class="summary-badge"
						style="background-color: {selectedStatus.color}; color: {selectedStatus.textColor}"
					>
						{selectedStatus.name}
					</span>
					<span class="summary-text">
						for <strong>{selectedIds.size}</strong>
						{selectedIds.size === 1 ? 'person' : 'people'}
						&middot;
						{#if startDate === endDate}
							{formatDateDisplay(startDate)}
						{:else}
							{formatDateDisplay(startDate)} – {formatDateDisplay(endDate)}
						{/if}
					</span>
				{:else if selectedIds.size === 0}
					<span class="summary-hint">Select personnel to continue</span>
				{:else if dateError}
					<span class="summary-error">{dateError}</span>
				{/if}
			</div>
			<div class="footer-actions">
				<button class="btn btn-secondary" onclick={onClose}>Cancel</button>
				<button class="btn btn-danger" disabled={!isValid} onclick={handleFindMatching}> Find Matching </button>
			</div>
		{/snippet}
	{:else}
		<!-- Confirmation Step -->
		<div class="confirm-content">
			{#if matchResult.exact.length === 0 && matchResult.partial.length === 0}
				<div class="no-matches">
					<p>No matching status entries found for the selected criteria.</p>
				</div>
			{:else}
				{#if matchResult.exact.length > 0}
					<div class="match-section">
						<h4 class="match-heading">
							<span class="match-count">{matchResult.exact.length}</span>
							exact {matchResult.exact.length === 1 ? 'match' : 'matches'} will be removed
						</h4>
					</div>
				{/if}

				{#if matchResult.partial.length > 0}
					<div class="match-section partial-section">
						<h4 class="match-heading warning">
							<svg class="warning-icon" viewBox="0 0 20 20" fill="currentColor">
								<path
									fill-rule="evenodd"
									d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
									clip-rule="evenodd"
								/>
							</svg>
							<span class="match-count">{matchResult.partial.length}</span>
							partial {matchResult.partial.length === 1 ? 'overlap' : 'overlaps'} will also be removed entirely
						</h4>
						<p class="partial-explanation">These entries extend beyond your selected date range:</p>
						<div class="partial-list">
							{#each matchResult.partial as entry (entry.id)}
								<div class="partial-item">
									<span class="partial-person">{getPersonName(entry.personnelId)}</span>
									<span class="partial-dates"
										>{formatDateDisplay(entry.startDate)} – {formatDateDisplay(entry.endDate)}</span
									>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<div class="total-summary">
					<strong>{matchResult.exact.length + matchResult.partial.length}</strong> total {matchResult.exact.length +
						matchResult.partial.length ===
					1
						? 'entry'
						: 'entries'} will be permanently removed.
				</div>
			{/if}
		</div>

		{#snippet footer()}
			<button class="btn btn-secondary" onclick={handleBack}>Back</button>
			<div class="spacer"></div>
			<button class="btn btn-secondary" onclick={onClose}>Cancel</button>
			{#if matchResult.exact.length > 0 || matchResult.partial.length > 0}
				<button class="btn btn-danger" disabled={isSubmitting} onclick={handleConfirmRemoval}>
					{#if isSubmitting}
						<Spinner />
						Removing...
					{:else}
						Confirm Removal
					{/if}
				</button>
			{/if}
		{/snippet}
	{/if}
</Modal>

<style>
	/* === Selection Step Styles (mirrors BulkStatusModal) === */
	.modal-content {
		display: flex;
		flex-direction: column;
		max-height: 60vh;
		overflow: hidden;
		margin: calc(-1 * var(--spacing-lg));
	}

	.config-section {
		padding: var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
		background: var(--color-bg);
	}

	.config-row {
		display: flex;
		gap: var(--spacing-md);
		align-items: flex-end;
		margin-bottom: var(--spacing-md);
	}

	.config-row:last-child {
		margin-bottom: 0;
	}

	.status-select {
		flex: 1;
	}

	.status-preview {
		display: flex;
		align-items: center;
		padding-bottom: var(--spacing-sm);
	}

	.status-badge {
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		font-weight: 500;
		font-size: var(--font-size-sm);
	}

	.dates-row {
		align-items: center;
	}

	.dates-row .form-group {
		flex: 1;
		margin-bottom: 0;
	}

	.date-arrow {
		color: var(--color-text-muted);
		font-size: var(--font-size-lg);
		padding-bottom: var(--spacing-xs);
	}

	.day-count {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: var(--spacing-xs) var(--spacing-sm);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		min-width: 50px;
	}

	.day-count-number {
		font-size: var(--font-size-lg);
		font-weight: 700;
		color: var(--color-primary);
		line-height: 1;
	}

	.day-count-label {
		font-size: 10px;
		color: var(--color-text-muted);
		text-transform: uppercase;
	}

	.date-error {
		color: #dc2626;
		font-size: var(--font-size-sm);
		margin-top: var(--spacing-sm);
		padding: var(--spacing-xs) var(--spacing-sm);
		background: #fef2f2;
		border-radius: var(--radius-sm);
	}

	.personnel-section {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-md) var(--spacing-lg);
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
	}

	.section-header h3 {
		font-size: var(--font-size-base);
		font-weight: 600;
		margin: 0;
	}

	.selection-info {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	.selected-count {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		font-weight: 500;
	}

	.selection-actions {
		display: flex;
		gap: var(--spacing-xs);
	}

	.search-bar {
		padding: var(--spacing-sm) var(--spacing-lg);
		background: var(--color-surface);
	}

	.search-input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}

	.search-icon {
		position: absolute;
		left: var(--spacing-sm);
		width: 16px;
		height: 16px;
		color: var(--color-text-muted);
		pointer-events: none;
	}

	.search-input {
		padding-left: calc(var(--spacing-sm) + 20px);
		padding-right: calc(var(--spacing-sm) + 24px);
	}

	.clear-search {
		position: absolute;
		right: var(--spacing-xs);
		padding: var(--spacing-xs);
		color: var(--color-text-muted);
		border-radius: var(--radius-sm);
		transition: color 0.15s ease;
	}

	.clear-search:hover {
		color: var(--color-text);
	}

	.clear-search svg {
		width: 16px;
		height: 16px;
	}

	.personnel-list {
		flex: 1;
		overflow-y: auto;
		padding: var(--spacing-sm) var(--spacing-lg);
		padding-bottom: var(--spacing-md);
	}

	.group-section {
		margin-bottom: var(--spacing-sm);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.group-header {
		display: flex;
		align-items: center;
		background: var(--color-primary);
		color: #0f0f0f;
	}

	.group-collapse-btn {
		padding: var(--spacing-sm);
		color: #0f0f0f;
		opacity: 0.8;
		transition: opacity 0.15s ease;
	}

	.group-collapse-btn:hover {
		opacity: 1;
	}

	.collapse-icon {
		width: 16px;
		height: 16px;
		transition: transform 0.15s ease;
	}

	.collapse-icon.collapsed {
		transform: rotate(-90deg);
	}

	.group-checkbox-label {
		flex: 1;
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm);
		padding-left: 0;
		cursor: pointer;
		font-weight: 600;
		font-size: var(--font-size-sm);
	}

	.group-checkbox-label input[type='checkbox'] {
		cursor: pointer;
		accent-color: #0f0f0f;
	}

	.group-name {
		flex: 1;
	}

	.group-count {
		opacity: 0.8;
		font-weight: 400;
	}

	.group-personnel {
		border-top: 1px solid rgba(0, 0, 0, 0.1);
	}

	.person-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		cursor: pointer;
		font-size: var(--font-size-sm);
		transition: background-color 0.1s ease;
		border-bottom: 1px solid var(--color-border);
	}

	.person-item:last-child {
		border-bottom: none;
	}

	.person-item:hover {
		background: var(--color-bg);
	}

	.person-item.selected {
		background: #ebf8ff;
	}

	.person-item input[type='checkbox'] {
		cursor: pointer;
		accent-color: var(--color-primary);
	}

	.person-item .rank {
		font-weight: 600;
		color: var(--color-primary);
		min-width: 35px;
	}

	.person-item .name {
		flex: 1;
	}

	.person-item .mos {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.empty-state {
		text-align: center;
		color: var(--color-text-muted);
		padding: var(--spacing-xl);
	}

	.empty-state p {
		margin-bottom: var(--spacing-sm);
	}

	/* Footer */
	.footer-summary {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: var(--font-size-sm);
		flex: 1;
		min-width: 0;
	}

	.summary-badge {
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		font-weight: 500;
		font-size: var(--font-size-sm);
		flex-shrink: 0;
	}

	.summary-text {
		color: var(--color-text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.summary-text strong {
		color: var(--color-text);
	}

	.summary-hint {
		color: var(--color-text-muted);
		font-style: italic;
	}

	.summary-error {
		color: #dc2626;
	}

	.footer-actions {
		display: flex;
		gap: var(--spacing-sm);
		flex-shrink: 0;
	}

	/* === Confirmation Step Styles === */
	.confirm-content {
		min-height: 200px;
	}

	.no-matches {
		text-align: center;
		color: var(--color-text-muted);
		padding: var(--spacing-xl);
	}

	.match-section {
		margin-bottom: var(--spacing-lg);
	}

	.match-heading {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: var(--font-size-base);
		font-weight: 600;
		margin: 0 0 var(--spacing-sm) 0;
	}

	.match-heading.warning {
		color: #b45309;
	}

	.warning-icon {
		width: 20px;
		height: 20px;
		color: #f59e0b;
		flex-shrink: 0;
	}

	.match-count {
		font-weight: 700;
		font-size: var(--font-size-lg);
	}

	.partial-explanation {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin: 0 0 var(--spacing-sm) 0;
	}

	.partial-list {
		max-height: 200px;
		overflow-y: auto;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.partial-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--spacing-sm) var(--spacing-md);
		font-size: var(--font-size-sm);
		border-bottom: 1px solid var(--color-border);
	}

	.partial-item:last-child {
		border-bottom: none;
	}

	.partial-person {
		font-weight: 500;
	}

	.partial-dates {
		color: var(--color-text-muted);
		white-space: nowrap;
	}

	.partial-section {
		padding: var(--spacing-md);
		background: #fffbeb;
		border: 1px solid #fde68a;
		border-radius: var(--radius-md);
	}

	.total-summary {
		padding: var(--spacing-md);
		background: var(--color-bg);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		text-align: center;
	}
</style>
```

**Step 2: Verify**

Run: `npx svelte-check --threshold warning 2>&1 | head -30`
Expected: No errors for the new component

**Step 3: Commit**

```bash
git add src/lib/components/BulkStatusRemoveModal.svelte
git commit -m "feat: add BulkStatusRemoveModal component"
```

---

### Task 8: Wire Up BulkStatusRemoveModal in Calendar Page

**Files:**

- Modify: `src/routes/org/[orgId]/calendar/+page.svelte`

**Step 1: Add import and state**

Add import (around line 23, with other imports):

```typescript
import BulkStatusRemoveModal from '$lib/components/BulkStatusRemoveModal.svelte';
```

Add state variable (around line 58, near `showBulkStatusModal`):

```typescript
let showBulkRemoveModal = $state(false);
```

**Step 2: Add handler function**

After `handleBulkStatusApply` (around line 114), add:

```typescript
async function handleBulkStatusRemove(ids: string[]): Promise<boolean> {
	return await availabilityStore.removeBatch(ids);
}
```

**Step 3: Add Bulk Remove to overflow menu**

In the `calendarOverflowItems` derived (around line 187), add the Bulk Remove item right after the Bulk Status item:

```typescript
items.push({ label: 'Bulk Remove', onclick: () => (showBulkRemoveModal = true), disabled: readOnly });
```

**Step 4: Add modal rendering**

After the `{#if showBulkStatusModal}` block (around line 338-345), add:

```svelte
{#if showBulkRemoveModal}
	<BulkStatusRemoveModal
		{personnelByGroup}
		statusTypes={statusTypesStore.list}
		availabilityEntries={availabilityStore.list}
		personnelList={calendarPersonnel}
		onRemove={handleBulkStatusRemove}
		onClose={() => (showBulkRemoveModal = false)}
	/>
{/if}
```

**Step 5: Verify build**

Run: `npx svelte-check --threshold warning 2>&1 | head -30`
Expected: No new errors

**Step 6: Commit**

```bash
git add src/routes/org/\[orgId\]/calendar/+page.svelte
git commit -m "feat: wire up BulkStatusRemoveModal in calendar page"
```

---

### Task 9: Final Verification

**Step 1: Run full type check**

Run: `npx svelte-check --threshold warning`
Expected: Only pre-existing errors (TrainingType missing expirationDateOnly, AssignmentType missing exemptPersonnelIds, etc.)

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit any remaining fixes if needed**

---

## Summary of All Changes

| File                                               | Action | Purpose                                |
| -------------------------------------------------- | ------ | -------------------------------------- |
| `supabase/migrations/20260310_status_notes.sql`    | Create | Add `note` column                      |
| `src/lib/types.ts`                                 | Modify | Add `note` to AvailabilityEntry        |
| `src/lib/server/transforms.ts`                     | Modify | Include `note` in transform            |
| `src/routes/.../api/availability/+server.ts`       | Modify | Add `note` to CRUD fields              |
| `src/routes/.../api/availability/batch/+server.ts` | Modify | Add `note` to POST, add DELETE handler |
| `src/lib/stores/availability.svelte.ts`            | Modify | Add `removeBatch()`                    |
| `src/lib/components/AvailabilityModal.svelte`      | Modify | Add note input + display               |
| `src/lib/components/BulkStatusModal.svelte`        | Modify | Add note input                         |
| `src/lib/components/DateCell.svelte`               | Modify | Show note in tooltip                   |
| `src/lib/components/BulkStatusRemoveModal.svelte`  | Create | New bulk remove modal                  |
| `src/routes/.../calendar/+page.svelte`             | Modify | Wire up bulk remove modal + pass note  |
