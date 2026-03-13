# Bulk Status CSV/Excel Import — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CSV/Excel import of personnel statuses to the calendar, with column mapping, personnel matching, and unmatched status resolution.

**Architecture:** New `BulkStatusImportModal` component with a 4-step state machine (upload → preview → resolve → results). Reuses existing `BulkImportTable`, `columnMapping.ts`, `csvParser.ts`, and the `/api/availability/batch` endpoint. Entry point via "Import from file" link in existing `BulkStatusModal`.

**Tech Stack:** SvelteKit 2.5, Svelte 5 (runes), TypeScript, existing bulk import infrastructure.

**Spec:** `docs/plans/2026-03-13-bulk-status-import-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/features/calendar/components/BulkStatusImportModal.svelte` | Main import modal — 4-step state machine, status resolution UI, import execution |
| Modify | `src/lib/utils/columnMapping.ts` | Add `STATUS_IMPORT_COLUMNS` constant |
| Modify | `src/features/calendar/components/BulkStatusModal.svelte` | Add `onImport` prop and "Import from file" link |
| Modify | `src/routes/org/[orgId]/calendar/+page.svelte` | Add import modal state, wire up open/close between modals |

---

## Chunk 1: Column Definitions & BulkStatusModal Entry Point

### Task 1: Add STATUS_IMPORT_COLUMNS to columnMapping.ts

**Files:**
- Modify: `src/lib/utils/columnMapping.ts:116-137` (after TRAINING_COLUMNS)

- [ ] **Step 1: Add the column definitions**

Add after `TRAINING_COLUMNS` (line ~137):

```typescript
export const STATUS_IMPORT_COLUMNS: ColumnDef[] = [
	{ key: 'lastName', label: 'Last Name', required: true, aliases: ['last name', 'lastname', 'surname', 'lname'] },
	{ key: 'firstName', label: 'First Name', required: true, aliases: ['first name', 'firstname', 'fname', 'given name'] },
	{ key: 'startDate', label: 'Start Date', required: true, aliases: ['start date', 'start', 'from', 'begin'] },
	{ key: 'endDate', label: 'End Date', required: true, aliases: ['end date', 'end', 'to', 'through'] },
	{ key: 'statusType', label: 'Status', required: true, aliases: ['status', 'status type', 'type'] },
	{ key: 'rank', label: 'Rank', required: false, aliases: ['rank', 'grade', 'pay grade'] },
	{ key: 'note', label: 'Note', required: false, aliases: ['note', 'notes', 'comment', 'remarks'] }
];
```

- [ ] **Step 2: Verify no type errors**

Run: `npx svelte-check --threshold error 2>&1 | tail -5`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/utils/columnMapping.ts
git commit -m "feat: add STATUS_IMPORT_COLUMNS to columnMapping"
```

---

### Task 2: Add onImport prop and link to BulkStatusModal

**Files:**
- Modify: `src/features/calendar/components/BulkStatusModal.svelte:12-17` (Props interface)

- [ ] **Step 1: Add onImport to the Props interface**

Change the Props interface (line 12-17) to add optional `onImport`:

```typescript
interface Props {
	personnelByGroup: GroupData[];
	statusTypes: StatusType[];
	onApply: (personnelIds: string[], statusTypeId: string, startDate: string, endDate: string, note: string | null) => Promise<void>;
	onClose: () => void;
	onImport?: () => void;
}
```

Update the destructure to include it:
```typescript
let { personnelByGroup, statusTypes, onApply, onClose, onImport }: Props = $props();
```

- [ ] **Step 2: Add "Import from file" link**

Add a link near the bottom of the modal body (above the footer), after the personnel selection section. Look for the closing of the personnel selection area and add before the footer snippet:

```svelte
{#if onImport}
	<button class="btn-link import-link" onclick={onImport}>
		Have a spreadsheet? Import from file
	</button>
{/if}
```

Add styling:

```css
.import-link {
	display: block;
	text-align: center;
	margin-top: var(--spacing-md);
	color: var(--color-text-secondary);
	font-size: var(--font-size-sm);
	background: none;
	border: none;
	cursor: pointer;
	text-decoration: underline;
	padding: var(--spacing-xs);
}

.import-link:hover {
	color: var(--color-primary);
}
```

- [ ] **Step 3: Verify no type errors**

Run: `npx svelte-check --threshold error 2>&1 | tail -5`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add src/features/calendar/components/BulkStatusModal.svelte
git commit -m "feat: add onImport prop and import link to BulkStatusModal"
```

---

## Chunk 2: BulkStatusImportModal Component

### Task 3: Create BulkStatusImportModal — Upload Step

**Files:**
- Create: `src/features/calendar/components/BulkStatusImportModal.svelte`

**Reference files to study:**
- `src/features/training/components/BulkTrainingImporter.svelte` — closest pattern to follow
- `src/features/personnel/components/BulkPersonnelManager.svelte` — alternate pattern reference
- `src/lib/components/ui/BulkImportTable.svelte` — props interface
- `src/features/calendar/calendar.types.ts` — StatusType, AvailabilityEntry types

- [ ] **Step 1: Create the component with upload step**

Create `src/features/calendar/components/BulkStatusImportModal.svelte`:

```svelte
<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import BulkImportTable from '$lib/components/ui/BulkImportTable.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { parseFile, parseCSVText } from '$lib/utils/csvParser';
	import { STATUS_IMPORT_COLUMNS } from '$lib/utils/columnMapping';
	import type { StatusType } from '$features/calendar/calendar.types';
	import type { Personnel } from '$lib/types';

	// Define locally — matches BulkImportTable's internal interface
	interface RowValidation {
		valid: boolean;
		cellErrors: Record<string, string>;
		cellWarnings: Record<string, string>;
	}

	interface Props {
		personnel: Personnel[];
		statusTypes: StatusType[];
		orgId: string;
		onImportComplete: () => void;
		onClose: () => void;
	}

	let { personnel, statusTypes, orgId, onImportComplete, onClose }: Props = $props();

	// State machine
	type Step = 'upload' | 'preview' | 'resolve' | 'results';
	let step = $state<Step>('upload');

	// Upload state
	let rawRows = $state<string[][]>([]);
	let uploadedFileName = $state('');
	let pasteText = $state('');
	let parseError = $state('');

	// Preview state
	let tableRef: ReturnType<typeof BulkImportTable> | undefined = $state();

	// Resolve state
	type StatusMapping = { csvName: string; count: number; resolvedId: string | null };
	let unmatchedStatuses = $state<StatusMapping[]>([]);

	// Import state
	let importing = $state(false);
	let importResult = $state<{ inserted: number; errors: { row: number; message: string }[] } | null>(null);

	// Personnel lookup map: "lastname|firstname" -> Personnel[]
	const personnelMap = $derived.by(() => {
		const map = new Map<string, Personnel[]>();
		for (const p of personnel) {
			const key = `${p.lastName.toLowerCase()}|${p.firstName.toLowerCase()}`;
			const existing = map.get(key) || [];
			existing.push(p);
			map.set(key, existing);
		}
		return map;
	});

	// Status type lookup map: lowercase name -> StatusType
	const statusTypeMap = $derived.by(() => {
		const map = new Map<string, StatusType>();
		for (const st of statusTypes) {
			map.set(st.name.toLowerCase(), st);
		}
		return map;
	});

	// Local date parser — parseDateString is not exported from csvParser
	// Handles YYYY-MM-DD, MM/DD/YYYY, and M/D/YYYY formats
	function parseDateString(str: string): string | null {
		if (!str) return null;
		// YYYY-MM-DD
		if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
		// MM/DD/YYYY or M/D/YYYY
		const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
		if (slashMatch) {
			const [, m, d, y] = slashMatch;
			return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
		}
		// Try JS Date.parse as fallback
		const ts = Date.parse(str);
		if (!isNaN(ts)) {
			const d = new Date(ts);
			return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		}
		return null;
	}

	async function handleFileUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		parseError = '';
		try {
			rawRows = await parseFile(file);
			uploadedFileName = file.name;
			if (rawRows.length < 2) {
				parseError = 'File appears to be empty or has no data rows.';
				rawRows = [];
				return;
			}
			step = 'preview';
		} catch (err) {
			parseError = err instanceof Error ? err.message : 'Failed to parse file.';
		}
	}

	function handlePaste() {
		if (!pasteText.trim()) return;
		parseError = '';
		try {
			rawRows = parseCSVText(pasteText);
			uploadedFileName = '';
			if (rawRows.length < 2) {
				parseError = 'No data rows found in pasted text.';
				rawRows = [];
				return;
			}
			step = 'preview';
		} catch (err) {
			parseError = err instanceof Error ? err.message : 'Failed to parse text.';
		}
	}
</script>

<Modal title="Import Statuses from File" {onClose} width="800px" titleId="bulk-status-import-title">
	{#if step === 'upload'}
		<div class="upload-section">
			<div class="upload-option">
				<h4>Upload a file</h4>
				<p class="text-muted">CSV or Excel (.xlsx) file</p>
				<input type="file" accept=".csv,.xlsx,.xls" onchange={handleFileUpload} />
			</div>

			<div class="divider-row">
				<div class="divider-line"></div>
				<span class="divider-text text-muted">or</span>
				<div class="divider-line"></div>
			</div>

			<div class="upload-option">
				<h4>Paste CSV data</h4>
				<textarea
					class="input"
					rows="6"
					placeholder="last name, first name, start date, end date, status&#10;Smith, John, 2026-01-01, 2026-01-05, Leave&#10;..."
					bind:value={pasteText}
				></textarea>
				<button class="btn btn-primary btn-sm" onclick={handlePaste} disabled={!pasteText.trim()}>
					Parse
				</button>
			</div>

			{#if parseError}
				<p class="text-error">{parseError}</p>
			{/if}
		</div>
	{/if}

	{#snippet footer()}
		<button class="btn btn-secondary" onclick={onClose}>Cancel</button>
	{/snippet}
</Modal>

<style>
	.upload-section {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.upload-option {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.upload-option h4 {
		margin: 0;
		font-size: var(--font-size-base);
	}

	.upload-option p {
		margin: 0;
	}

	.upload-option textarea {
		resize: vertical;
		font-family: monospace;
		font-size: var(--font-size-sm);
	}

	.divider-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	.divider-line {
		flex: 1;
		height: 1px;
		background: var(--color-border);
	}

	.divider-text {
		font-size: var(--font-size-sm);
	}
</style>
```

- [ ] **Step 2: Verify no type errors**

Run: `npx svelte-check --threshold error 2>&1 | tail -5`
Expected: No new errors (may have pre-existing errors, no NEW ones)

- [ ] **Step 3: Commit**

```bash
git add src/features/calendar/components/BulkStatusImportModal.svelte
git commit -m "feat: create BulkStatusImportModal with upload step"
```

---

### Task 4: Add Preview Step with Validation

**Files:**
- Modify: `src/features/calendar/components/BulkStatusImportModal.svelte`

- [ ] **Step 1: Add the validateRow function**

Add after the `statusTypeMap` derived, before `handleFileUpload`:

```typescript
function validateRow(row: Record<string, string>): RowValidation {
	const errors: Record<string, string> = {};

	// Personnel matching
	const lastName = (row.lastName || '').trim();
	const firstName = (row.firstName || '').trim();
	if (!lastName) {
		errors.lastName = 'Required';
	} else if (!firstName) {
		errors.firstName = 'Required';
	} else {
		const key = `${lastName.toLowerCase()}|${firstName.toLowerCase()}`;
		const matches = personnelMap.get(key) || [];
		if (matches.length === 0) {
			errors.lastName = 'Person not found';
		} else if (matches.length > 1) {
			const rank = (row.rank || '').trim().toLowerCase();
			if (rank) {
				const rankMatches = matches.filter(
					(p) => p.rank?.toLowerCase() === rank
				);
				if (rankMatches.length === 0) {
					errors.rank = 'Rank does not match any person with this name';
				} else if (rankMatches.length > 1) {
					errors.lastName = 'Multiple people match this name and rank';
				}
			} else {
				errors.lastName = 'Multiple people with this name — add Rank column to disambiguate';
			}
		}
	}

	// Date validation
	const startDate = parseDateString((row.startDate || '').trim());
	const endDate = parseDateString((row.endDate || '').trim());
	if (!row.startDate?.trim()) {
		errors.startDate = 'Required';
	} else if (!startDate) {
		errors.startDate = 'Invalid date';
	}
	if (!row.endDate?.trim()) {
		errors.endDate = 'Required';
	} else if (!endDate) {
		errors.endDate = 'Invalid date';
	}
	if (startDate && endDate && startDate > endDate) {
		errors.endDate = 'End date must be on or after start date';
	}

	// Status — just check it's present (resolution happens in Step 3)
	if (!(row.statusType || '').trim()) {
		errors.statusType = 'Required';
	}

	return {
		valid: Object.keys(errors).length === 0,
		cellErrors: errors,
		cellWarnings: {}
	};
}
```

- [ ] **Step 2: Add the preview step UI and "Next" handler**

Add the `handlePreviewNext` function after `handlePaste`:

```typescript
function handlePreviewNext() {
	if (!tableRef) return;
	const checkedRows = tableRef.getCheckedRows();
	if (checkedRows.length === 0) return;

	// Collect unique status names and check matches
	const statusCounts = new Map<string, number>();
	for (const row of checkedRows) {
		const name = (row.statusType || '').trim();
		if (name) {
			const lower = name.toLowerCase();
			statusCounts.set(lower, (statusCounts.get(lower) || 0) + 1);
		}
	}

	// Build unmatched list
	const unmatched: StatusMapping[] = [];
	for (const [lower, count] of statusCounts) {
		const matched = statusTypeMap.get(lower);
		if (!matched) {
			// Find the original casing from the first occurrence
			const originalName = checkedRows.find(
				(r) => (r.statusType || '').trim().toLowerCase() === lower
			)?.statusType?.trim() || lower;
			unmatched.push({ csvName: originalName, count, resolvedId: null });
		}
	}

	unmatchedStatuses = unmatched;
	step = unmatched.length > 0 ? 'resolve' : 'results';

	// If no unmatched, go straight to import
	if (unmatched.length === 0) {
		handleImport();
	}
}
```

Add the preview step in the template, after the upload `{#if}` block:

```svelte
{#if step === 'preview'}
	<BulkImportTable
		bind:this={tableRef}
		{rawRows}
		columnDefs={STATUS_IMPORT_COLUMNS}
		{validateRow}
	/>
{/if}
```

Update the footer snippet to include the Next button when on preview:

```svelte
{#snippet footer()}
	{#if step === 'preview'}
		<button class="btn btn-secondary" onclick={() => { step = 'upload'; rawRows = []; }}>Back</button>
		<div class="spacer"></div>
		<button class="btn btn-secondary" onclick={onClose}>Cancel</button>
		<button class="btn btn-primary" onclick={handlePreviewNext}>Next</button>
	{:else if step === 'results'}
		<button class="btn btn-primary" onclick={onClose}>Done</button>
	{:else}
		<button class="btn btn-secondary" onclick={onClose}>Cancel</button>
	{/if}
{/snippet}
```

- [ ] **Step 3: Verify no type errors**

Run: `npx svelte-check --threshold error 2>&1 | tail -5`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add src/features/calendar/components/BulkStatusImportModal.svelte
git commit -m "feat: add preview step with validation to BulkStatusImportModal"
```

---

### Task 5: Add Resolve Unmatched Statuses Step

**Files:**
- Modify: `src/features/calendar/components/BulkStatusImportModal.svelte`

- [ ] **Step 1: Add the resolve step UI**

Add a derived for whether all statuses are resolved:

```typescript
const allResolved = $derived(
	unmatchedStatuses.length === 0 ||
	unmatchedStatuses.every((s) => s.resolvedId !== null)
);
```

Add the resolve step in the template after the preview `{#if}` block:

```svelte
{#if step === 'resolve'}
	<div class="resolve-section">
		<p>The following status names from your file don't match any status types in your organization. Please select which status each should map to, or choose "Skip" to exclude those rows.</p>

		<div class="resolve-list">
			{#each unmatchedStatuses as mapping, i}
				<div class="resolve-row">
					<div class="resolve-info">
						<span class="resolve-name">"{mapping.csvName}"</span>
						<span class="text-muted">({mapping.count} {mapping.count === 1 ? 'row' : 'rows'})</span>
					</div>
					<span class="resolve-arrow">→</span>
					<select
						class="select"
						value={mapping.resolvedId ?? ''}
						onchange={(e) => {
							const val = (e.target as HTMLSelectElement).value;
							unmatchedStatuses[i].resolvedId = val || null;
						}}
					>
						<option value="">— Select —</option>
						<option value="__skip__">Skip (don't import)</option>
						{#each statusTypes as st}
							<option value={st.id}>{st.name}</option>
						{/each}
					</select>
					{#if mapping.resolvedId && mapping.resolvedId !== '__skip__'}
						{@const resolved = statusTypes.find((s) => s.id === mapping.resolvedId)}
						{#if resolved}
							<Badge label={resolved.name} color={resolved.color} textColor={resolved.textColor} />
						{/if}
					{/if}
				</div>
			{/each}
		</div>
	</div>
{/if}
```

Update the footer to include resolve step buttons:

```svelte
{#snippet footer()}
	{#if step === 'preview'}
		<button class="btn btn-secondary" onclick={() => { step = 'upload'; rawRows = []; }}>Back</button>
		<div class="spacer"></div>
		<button class="btn btn-secondary" onclick={onClose}>Cancel</button>
		<button class="btn btn-primary" onclick={handlePreviewNext}>Next</button>
	{:else if step === 'resolve'}
		<button class="btn btn-secondary" onclick={() => { step = 'preview'; }}>Back</button>
		<div class="spacer"></div>
		<button class="btn btn-secondary" onclick={onClose}>Cancel</button>
		<button class="btn btn-primary" disabled={!allResolved || importing} onclick={handleImport}>
			{#if importing}<Spinner />{/if}
			{importing ? 'Importing...' : 'Import'}
		</button>
	{:else if step === 'results'}
		<button class="btn btn-primary" onclick={onClose}>Done</button>
	{:else}
		<button class="btn btn-secondary" onclick={onClose}>Cancel</button>
	{/if}
{/snippet}
```

- [ ] **Step 2: Add resolve step styles**

```css
.resolve-section {
	display: flex;
	flex-direction: column;
	gap: var(--spacing-md);
}

.resolve-section p {
	margin: 0;
	font-size: var(--font-size-sm);
	color: var(--color-text-secondary);
}

.resolve-list {
	display: flex;
	flex-direction: column;
	gap: var(--spacing-sm);
}

.resolve-row {
	display: flex;
	align-items: center;
	gap: var(--spacing-sm);
	padding: var(--spacing-sm);
	background: var(--color-surface-variant);
	border-radius: var(--radius-sm);
}

.resolve-info {
	display: flex;
	align-items: baseline;
	gap: var(--spacing-xs);
	min-width: 200px;
}

.resolve-name {
	font-weight: 600;
	font-size: var(--font-size-sm);
}

.resolve-arrow {
	color: var(--color-text-muted);
}
```

- [ ] **Step 3: Verify no type errors**

Run: `npx svelte-check --threshold error 2>&1 | tail -5`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add src/features/calendar/components/BulkStatusImportModal.svelte
git commit -m "feat: add resolve unmatched statuses step to BulkStatusImportModal"
```

---

### Task 6: Add Import Execution and Results Step

**Files:**
- Modify: `src/features/calendar/components/BulkStatusImportModal.svelte`

- [ ] **Step 1: Add the handleImport function**

Add after `handlePreviewNext`:

```typescript
async function handleImport() {
	if (!tableRef) return;
	const checkedRows = tableRef.getCheckedRows();
	if (checkedRows.length === 0) return;

	// Build status resolution map: lowercase csv name -> statusTypeId
	const statusResolutionMap = new Map<string, string>();
	// Add matched statuses
	for (const [lower, st] of statusTypeMap) {
		statusResolutionMap.set(lower, st.id);
	}
	// Add resolved unmatched statuses
	for (const mapping of unmatchedStatuses) {
		if (mapping.resolvedId && mapping.resolvedId !== '__skip__') {
			statusResolutionMap.set(mapping.csvName.toLowerCase(), mapping.resolvedId);
		}
	}

	// Build records
	const records: { personnelId: string; statusTypeId: string; startDate: string; endDate: string; note?: string | null }[] = [];
	const skippedStatuses = new Set(
		unmatchedStatuses.filter((m) => m.resolvedId === '__skip__').map((m) => m.csvName.toLowerCase())
	);

	for (const row of checkedRows) {
		const statusName = (row.statusType || '').trim().toLowerCase();
		if (skippedStatuses.has(statusName)) continue;

		const statusTypeId = statusResolutionMap.get(statusName);
		if (!statusTypeId) continue;

		// Resolve personnel
		const key = `${(row.lastName || '').trim().toLowerCase()}|${(row.firstName || '').trim().toLowerCase()}`;
		const matches = personnelMap.get(key) || [];
		let person: Personnel | undefined;
		if (matches.length === 1) {
			person = matches[0];
		} else if (matches.length > 1 && row.rank) {
			person = matches.find((p) => p.rank?.toLowerCase() === row.rank.trim().toLowerCase());
		}
		if (!person) continue;

		const startDate = parseDateString((row.startDate || '').trim());
		const endDate = parseDateString((row.endDate || '').trim());
		if (!startDate || !endDate) continue;

		const note = (row.note || '').trim() || null;
		records.push({ personnelId: person.id, statusTypeId, startDate, endDate, note });
	}

	if (records.length === 0) {
		importResult = { inserted: 0, errors: [{ row: 0, message: 'No valid records to import after filtering.' }] };
		step = 'results';
		return;
	}

	importing = true;
	try {
		// Batch in groups of 500
		let totalInserted = 0;
		const allErrors: { row: number; message: string }[] = [];

		for (let i = 0; i < records.length; i += 500) {
			const batch = records.slice(i, i + 500);
			const response = await fetch(`/org/${orgId}/api/availability/batch`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ records: batch })
			});

			if (response.ok) {
				const data = await response.json();
				totalInserted += data.inserted?.length || 0;
			} else {
				const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
				allErrors.push({ row: i + 1, message: errorData.error || `Batch failed (${response.status})` });
			}
		}

		importResult = { inserted: totalInserted, errors: allErrors };
		step = 'results';
		if (totalInserted > 0) {
			onImportComplete();
		}
	} catch (err) {
		importResult = { inserted: 0, errors: [{ row: 0, message: err instanceof Error ? err.message : 'Import failed' }] };
		step = 'results';
	} finally {
		importing = false;
	}
}
```

- [ ] **Step 2: Add the results step UI**

Add in the template after the resolve `{#if}` block:

```svelte
{#if step === 'results'}
	<div class="results-section">
		{#if importResult}
			{#if importResult.inserted > 0}
				<div class="results-success">
					<strong>{importResult.inserted}</strong> status {importResult.inserted === 1 ? 'entry' : 'entries'} imported successfully.
				</div>
			{/if}

			{#if importResult.errors.length > 0}
				<div class="results-errors">
					<h4>Errors</h4>
					{#each importResult.errors as error}
						<div class="results-error-row">
							{#if error.row > 0}<span class="text-muted">Row {error.row}:</span>{/if}
							<span>{error.message}</span>
						</div>
					{/each}
				</div>
			{/if}

			{#if importResult.inserted === 0 && importResult.errors.length === 0}
				<p class="text-muted">No records were imported.</p>
			{/if}
		{/if}
	</div>
{/if}
```

- [ ] **Step 3: Add results styles**

```css
.results-section {
	display: flex;
	flex-direction: column;
	gap: var(--spacing-md);
}

.results-success {
	padding: var(--spacing-md);
	background: color-mix(in srgb, var(--color-success) 15%, transparent);
	border-radius: var(--radius-sm);
	color: var(--color-success);
}

.results-errors {
	display: flex;
	flex-direction: column;
	gap: var(--spacing-xs);
}

.results-errors h4 {
	margin: 0;
	color: var(--color-error);
}

.results-error-row {
	display: flex;
	gap: var(--spacing-xs);
	font-size: var(--font-size-sm);
	padding: var(--spacing-xs) var(--spacing-sm);
	background: color-mix(in srgb, var(--color-error) 10%, transparent);
	border-radius: var(--radius-sm);
}
```

- [ ] **Step 4: Verify no type errors**

Run: `npx svelte-check --threshold error 2>&1 | tail -5`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add src/features/calendar/components/BulkStatusImportModal.svelte
git commit -m "feat: add import execution and results step to BulkStatusImportModal"
```

---

## Chunk 3: Wire Into Calendar Page

### Task 7: Integrate BulkStatusImportModal into the Calendar Page

**Files:**
- Modify: `src/routes/org/[orgId]/calendar/+page.svelte:57-68` (modal state variables)
- Modify: `src/routes/org/[orgId]/calendar/+page.svelte:389-396` (BulkStatusModal rendering)

- [ ] **Step 1: Add import modal state variable**

Near the existing `showBulkStatusModal` state variable (around line 57-68), add:

```typescript
let showBulkStatusImportModal = $state(false);
```

- [ ] **Step 2: Add import for the new component**

In the imports section at the top of the script, add:

```typescript
import BulkStatusImportModal from '$features/calendar/components/BulkStatusImportModal.svelte';
```

- [ ] **Step 3: Update BulkStatusModal to pass onImport**

Change the BulkStatusModal rendering (around line 389-396) from:

```svelte
{#if showBulkStatusModal}
	<BulkStatusModal
		personnelByGroup={personnelByGroup}
		statusTypes={statusTypesStore.list}
		onApply={handleBulkStatusApply}
		onClose={() => (showBulkStatusModal = false)}
	/>
{/if}
```

To:

```svelte
{#if showBulkStatusModal}
	<BulkStatusModal
		personnelByGroup={personnelByGroup}
		statusTypes={statusTypesStore.list}
		onApply={handleBulkStatusApply}
		onClose={() => (showBulkStatusModal = false)}
		onImport={() => {
			showBulkStatusModal = false;
			showBulkStatusImportModal = true;
		}}
	/>
{/if}
```

- [ ] **Step 4: Add the import modal rendering**

After the BulkStatusModal block, add:

The personnel list variable on this page is `calendarPersonnel`. Flatten it for the import modal:

```typescript
const allPersonnelFlat = $derived(personnelByGroup.flatMap((g) => g.members));
```

Add this derived near the other derived values, then use it in the modal:

```svelte
{#if showBulkStatusImportModal}
	<BulkStatusImportModal
		personnel={allPersonnelFlat}
		statusTypes={statusTypesStore.list}
		{orgId}
		onImportComplete={() => {
			invalidateAll();
		}}
		onClose={() => (showBulkStatusImportModal = false)}
	/>
{/if}
```

Ensure `invalidateAll` is imported at the top of the script:

```typescript
import { invalidateAll } from '$app/navigation';
```

Note: If `invalidateAll` is already imported (check the existing imports), don't add it again.

- [ ] **Step 6: Verify no type errors**

Run: `npx svelte-check --threshold error 2>&1 | tail -5`
Expected: No new errors

- [ ] **Step 7: Commit**

```bash
git add src/routes/org/[orgId]/calendar/+page.svelte
git commit -m "feat: wire BulkStatusImportModal into calendar page"
```

---

### Task 8: Manual Testing & Polish

- [ ] **Step 1: Create a test CSV file for manual testing**

Create a test file at `docs/plans/test-status-import.csv` (delete after testing):

```csv
Last Name,First Name,Start Date,End Date,Status,Note
Smith,John,2026-01-01,2026-01-05,Leave,Annual leave
Doe,Jane,2026-01-03,2026-01-03,TDY,Conference
Smith,John,2026-02-01,2026-02-03,Vacation,Family trip
```

- [ ] **Step 2: Run the dev server and test the full flow**

Run: `npm run dev`

Test checklist:
1. Open calendar page
2. Click "Bulk Status" button → BulkStatusModal opens
3. Click "Have a spreadsheet? Import from file" → BulkStatusModal closes, BulkStatusImportModal opens
4. Upload the test CSV → transitions to preview
5. Verify column auto-mapping works
6. Verify person-not-found shows as cell error
7. Click Next → if "Vacation" is unmatched, verify resolve step appears
8. Map "Vacation" to an existing status type → Continue enables
9. Click Import → verify results show success count
10. Verify new status entries appear on the calendar

- [ ] **Step 3: Test edge cases**

1. Upload file with no header row → verify mapping falls back to positional
2. Upload file with invalid dates → verify cell errors
3. Upload file with duplicate names (no rank column) → verify cell error message
4. Paste CSV text instead of file upload → verify same flow
5. Click Back buttons to verify navigation between steps
6. Import empty selection (uncheck all rows) → verify handled gracefully

- [ ] **Step 4: Run type check**

Run: `npx svelte-check --threshold error`
Expected: No new errors (pre-existing errors are fine)

- [ ] **Step 5: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 6: Final commit if any polish was needed**

```bash
git add -A
git commit -m "feat: polish bulk status import modal"
```

---

### Task 9: Update Changelog

**Files:**
- Modify: `src/lib/data/changelog.ts`

- [ ] **Step 1: Add changelog entry**

Add a new entry to the changelog array (keep ~5 entries, old ones can fall off):

```typescript
{
	date: '2026-03-13',
	title: 'Import Statuses from Spreadsheets',
	description: 'You can now import status data from CSV or Excel files directly into the calendar. Great for bringing over historic data from other tools. The importer will even help you match up status names if they don\'t exactly line up with your organization\'s status types.'
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/data/changelog.ts
git commit -m "feat: add changelog entry for bulk status import"
```
