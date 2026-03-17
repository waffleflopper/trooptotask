# Bulk Import Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the rigid, all-or-nothing bulk import UX with forgiving column mapping, an editable preview table, batch API endpoints, and clear result summaries — for both Personnel and Training importers.

**Architecture:** Extract shared import logic (column mapping, CSV parsing, editable preview table) into a reusable `BulkImportTable.svelte` component. Add two new batch API endpoints (`/api/personnel/batch` and `/api/personnel-trainings/batch`) that accept arrays and do single bulk DB operations. Refactor both importer components to use the new shared component and batch endpoints.

**Tech Stack:** SvelteKit, Svelte 5 runes, TypeScript, Supabase (Postgres), XLSX library for file parsing.

**Design doc:** `docs/plans/2026-03-09-bulk-import-redesign-design.md`

---

## Task 1: Shared Column Mapping Utility

**Files:**

- Create: `src/lib/utils/columnMapping.ts`

**Step 1: Create the column mapping module**

This module handles auto-detection of column headers and mapping them to fields.

```typescript
// src/lib/utils/columnMapping.ts

export interface ColumnDef {
	key: string; // internal field name (e.g., 'lastName')
	label: string; // display label (e.g., 'Last Name')
	required: boolean;
	aliases: string[]; // recognized header variations (lowercase)
}

export interface ColumnMapping {
	columnIndex: number;
	fieldKey: string | null; // null = "Skip"
}

/**
 * Detect whether the first row is a header row.
 * Returns true if any cell in the first row matches a known alias.
 */
export function detectHeaderRow(firstRow: string[], columnDefs: ColumnDef[]): boolean {
	const allAliases = columnDefs.flatMap((d) => d.aliases);
	return firstRow.some((cell) => allAliases.includes(cell.trim().toLowerCase()));
}

/**
 * Auto-map columns by matching header text to column definition aliases.
 * Falls back to positional mapping if no headers detected.
 */
export function autoMapColumns(headers: string[], columnDefs: ColumnDef[], hasHeaders: boolean): ColumnMapping[] {
	if (!hasHeaders) {
		// Positional fallback: map columns 0..N to columnDefs in order
		return headers.map((_, i) => ({
			columnIndex: i,
			fieldKey: i < columnDefs.length ? columnDefs[i].key : null
		}));
	}

	const mappings: ColumnMapping[] = [];
	const usedKeys = new Set<string>();

	for (let i = 0; i < headers.length; i++) {
		const header = headers[i].trim().toLowerCase();
		const match = columnDefs.find((d) => !usedKeys.has(d.key) && d.aliases.includes(header));
		mappings.push({
			columnIndex: i,
			fieldKey: match?.key ?? null
		});
		if (match) usedKeys.add(match.key);
	}

	return mappings;
}

/**
 * Apply column mappings to a row of raw strings.
 * Returns an object keyed by fieldKey.
 */
export function applyMapping(row: string[], mappings: ColumnMapping[]): Record<string, string> {
	const result: Record<string, string> = {};
	for (const m of mappings) {
		if (m.fieldKey && m.columnIndex < row.length) {
			result[m.fieldKey] = row[m.columnIndex].trim();
		}
	}
	return result;
}

/**
 * Check that all required columns are mapped.
 */
export function getMissingRequired(mappings: ColumnMapping[], columnDefs: ColumnDef[]): ColumnDef[] {
	const mappedKeys = new Set(mappings.map((m) => m.fieldKey).filter(Boolean));
	return columnDefs.filter((d) => d.required && !mappedKeys.has(d.key));
}

// --- Column definitions for each importer ---

export const PERSONNEL_COLUMNS: ColumnDef[] = [
	{
		key: 'rank',
		label: 'Rank',
		required: true,
		aliases: ['rank', 'grade', 'pay grade', 'paygrade']
	},
	{
		key: 'lastName',
		label: 'Last Name',
		required: true,
		aliases: ['last name', 'lastname', 'last', 'surname', 'family name']
	},
	{
		key: 'firstName',
		label: 'First Name',
		required: true,
		aliases: ['first name', 'firstname', 'first', 'given name']
	},
	{
		key: 'mos',
		label: 'MOS',
		required: false,
		aliases: ['mos', 'military occupational specialty', 'job', 'afsc']
	},
	{
		key: 'clinicRole',
		label: 'Role',
		required: false,
		aliases: ['role', 'clinic role', 'duty position', 'position', 'billet']
	},
	{
		key: 'groupName',
		label: 'Group',
		required: false,
		aliases: ['group', 'unit', 'section', 'team', 'platoon', 'squad']
	}
];

export const TRAINING_COLUMNS: ColumnDef[] = [
	{
		key: 'lastName',
		label: 'Last Name',
		required: true,
		aliases: ['last name', 'lastname', 'last', 'surname', 'family name']
	},
	{
		key: 'firstName',
		label: 'First Name',
		required: true,
		aliases: ['first name', 'firstname', 'first', 'given name']
	},
	{
		key: 'trainingType',
		label: 'Training Type',
		required: true,
		aliases: ['training', 'training type', 'type', 'course', 'certification']
	},
	{
		key: 'status',
		label: 'Date / Status',
		required: true,
		aliases: ['date', 'completion date', 'completed', 'date completed', 'status']
	},
	{
		key: 'notes',
		label: 'Notes',
		required: false,
		aliases: ['notes', 'comments', 'remarks']
	}
];
```

**Step 2: Commit**

```bash
git add src/lib/utils/columnMapping.ts
git commit -m "feat: add column mapping utility for bulk imports"
```

---

## Task 2: Shared CSV/Excel Parsing Utility

**Files:**

- Create: `src/lib/utils/csvParser.ts`

**Step 1: Create the CSV/Excel parser module**

Extract and improve the existing parsing logic from both importers into one shared module.

```typescript
// src/lib/utils/csvParser.ts
import * as XLSX from 'xlsx';

/**
 * Parse CSV text into a 2D array of strings.
 * Handles comma-separated values with basic trimming.
 */
export function parseCSVText(text: string): string[][] {
	return text
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line) => line.split(',').map((cell) => cell.trim()));
}

/**
 * Parse an uploaded file (Excel or CSV) into a 2D array of strings.
 * Returns a Promise because FileReader is async.
 */
export function parseFile(file: File): Promise<string[][]> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = (e) => {
			try {
				const data = new Uint8Array(e.target?.result as ArrayBuffer);
				const workbook = XLSX.read(data, { type: 'array' });
				const sheet = workbook.Sheets[workbook.SheetNames[0]];
				const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
				// Convert all cells to trimmed strings
				const rows = raw
					.map((row) => (row as unknown[]).map((cell) => String(cell ?? '').trim()))
					.filter((row) => row.some((cell) => cell.length > 0));
				resolve(rows);
			} catch (err) {
				reject(err);
			}
		};
		reader.onerror = () => reject(new Error('Failed to read file'));
		reader.readAsArrayBuffer(file);
	});
}

/**
 * Parse a training status/date value.
 * Returns { type, date } where type is 'date' | 'completed' | 'exempt' | 'skip' | 'invalid'.
 */
export function parseTrainingStatus(value: string): {
	type: 'date' | 'completed' | 'exempt' | 'skip' | 'invalid';
	date: string | null;
	raw: string;
} {
	const raw = value;
	const v = value.trim().toLowerCase();

	// Exempt values
	if (['exempt', 'exempted', 'e'].includes(v)) {
		return { type: 'exempt', date: null, raw };
	}

	// Yes/completed values → completed today
	if (['yes', 'y', 'true', '1', 'complete', 'completed', 'done', 'x'].includes(v)) {
		const today = new Date().toISOString().slice(0, 10);
		return { type: 'completed', date: today, raw };
	}

	// No/skip values
	if (['no', 'n', 'false', '0', 'incomplete', 'pending', ''].includes(v)) {
		return { type: 'skip', date: null, raw };
	}

	// Try date formats
	const date = parseDateString(value);
	if (date) {
		return { type: 'date', date, raw };
	}

	return { type: 'invalid', date: null, raw };
}

/**
 * Parse a date string in various formats to YYYY-MM-DD.
 */
function parseDateString(str: string): string | null {
	const trimmed = str.trim();

	// ISO: YYYY-MM-DD
	if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
		const d = new Date(trimmed + 'T00:00:00');
		return isNaN(d.getTime()) ? null : trimmed;
	}

	// US: MM/DD/YYYY
	const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
	if (usMatch) {
		const [, mm, dd, yyyy] = usMatch;
		const d = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T00:00:00`);
		return isNaN(d.getTime()) ? null : `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
	}

	// Excel serial number
	if (/^\d+$/.test(trimmed)) {
		const serial = parseInt(trimmed, 10);
		if (serial > 0 && serial < 200000) {
			// Excel epoch: Jan 1, 1900, with the leap year bug
			const excelEpoch = new Date(1900, 0, 1);
			const ms = excelEpoch.getTime() + (serial - 2) * 86400000;
			const d = new Date(ms);
			if (!isNaN(d.getTime())) {
				return d.toISOString().slice(0, 10);
			}
		}
	}

	// Fallback: JS Date.parse
	const d = new Date(trimmed);
	if (!isNaN(d.getTime())) {
		return d.toISOString().slice(0, 10);
	}

	return null;
}
```

**Step 2: Commit**

```bash
git add src/lib/utils/csvParser.ts
git commit -m "feat: add shared CSV/Excel parser and training status parser"
```

---

## Task 3: BulkImportTable Component

**Files:**

- Create: `src/lib/components/ui/BulkImportTable.svelte`

**Step 1: Create the editable preview table component**

This is the core shared UI component that handles: column mapping dropdowns, editable table with per-cell validation, row checkboxes, and summary bar.

```svelte
<!-- src/lib/components/ui/BulkImportTable.svelte -->
<script lang="ts">
	import type { ColumnDef, ColumnMapping } from '$lib/utils/columnMapping';
	import { autoMapColumns, detectHeaderRow, getMissingRequired } from '$lib/utils/columnMapping';

	interface RowValidation {
		valid: boolean;
		cellErrors: Record<string, string>; // fieldKey → error message
		cellWarnings: Record<string, string>; // fieldKey → warning message
	}

	interface Props {
		rawRows: string[][];
		columnDefs: ColumnDef[];
		validateRow: (row: Record<string, string>) => RowValidation;
		onMappingChange?: (mappings: ColumnMapping[]) => void;
	}

	let { rawRows, columnDefs, validateRow, onMappingChange }: Props = $props();

	// --- Column mapping state ---
	let hasHeaders = $state(false);
	let mappings = $state<ColumnMapping[]>([]);

	// Detect headers and auto-map when rawRows change
	$effect(() => {
		if (rawRows.length === 0) {
			mappings = [];
			return;
		}
		hasHeaders = detectHeaderRow(rawRows[0], columnDefs);
		mappings = autoMapColumns(rawRows[0], columnDefs, hasHeaders);
		onMappingChange?.(mappings);
	});

	// Data rows (skip header row if detected)
	const dataRows = $derived(hasHeaders ? rawRows.slice(1) : rawRows);

	// Missing required columns
	const missingRequired = $derived(getMissingRequired(mappings, columnDefs));

	// --- Editable cell data ---
	// Clone dataRows into editable state
	let editableRows = $state<string[][]>([]);
	$effect(() => {
		editableRows = dataRows.map((row) => [...row]);
	});

	// --- Row validation ---
	const rowValidations = $derived.by(() => {
		return editableRows.map((row) => {
			const mapped: Record<string, string> = {};
			for (const m of mappings) {
				if (m.fieldKey && m.columnIndex < row.length) {
					mapped[m.fieldKey] = row[m.columnIndex].trim();
				}
			}
			return validateRow(mapped);
		});
	});

	// --- Checkboxes ---
	let checkedRows = $state<Set<number>>(new Set());

	// Auto-check valid rows, uncheck invalid
	$effect(() => {
		const newChecked = new Set<number>();
		rowValidations.forEach((v, i) => {
			if (v.valid) newChecked.add(i);
		});
		checkedRows = newChecked;
	});

	function toggleRow(index: number) {
		const next = new Set(checkedRows);
		if (next.has(index)) next.delete(index);
		else next.add(index);
		checkedRows = next;
	}

	function selectAll() {
		checkedRows = new Set(rowValidations.map((_, i) => i));
	}

	function selectNone() {
		checkedRows = new Set();
	}

	// --- Inline editing ---
	let editingCell = $state<{ row: number; col: number } | null>(null);

	function startEdit(row: number, col: number) {
		editingCell = { row, col };
	}

	function commitEdit(row: number, col: number, value: string) {
		editableRows[row][col] = value;
		editableRows = [...editableRows]; // trigger reactivity
		editingCell = null;
	}

	function handleKeydown(e: KeyboardEvent, row: number, col: number) {
		if (e.key === 'Enter' || e.key === 'Tab') {
			e.preventDefault();
			commitEdit(row, col, (e.target as HTMLInputElement).value);
		} else if (e.key === 'Escape') {
			editingCell = null;
		}
	}

	// --- Column mapping change handler ---
	function setMapping(colIndex: number, fieldKey: string | null) {
		mappings = mappings.map((m) => (m.columnIndex === colIndex ? { ...m, fieldKey } : m));
		onMappingChange?.(mappings);
	}

	// --- Public API ---
	// Expose the checked+valid rows as mapped objects
	export function getCheckedRows(): Record<string, string>[] {
		const results: Record<string, string>[] = [];
		editableRows.forEach((row, i) => {
			if (!checkedRows.has(i)) return;
			if (!rowValidations[i]?.valid) return;
			const mapped: Record<string, string> = {};
			for (const m of mappings) {
				if (m.fieldKey && m.columnIndex < row.length) {
					mapped[m.fieldKey] = row[m.columnIndex].trim();
				}
			}
			results.push(mapped);
		});
		return results;
	}

	// Summary counts
	const readyCount = $derived(editableRows.filter((_, i) => checkedRows.has(i) && rowValidations[i]?.valid).length);
	const errorCount = $derived(rowValidations.filter((v) => !v.valid).length);
	const uncheckedCount = $derived(
		editableRows.filter((_, i) => !checkedRows.has(i) && rowValidations[i]?.valid).length
	);

	// Sorted indices: errors first, then valid
	const sortedIndices = $derived.by(() => {
		const indices = editableRows.map((_, i) => i);
		indices.sort((a, b) => {
			const aValid = rowValidations[a]?.valid ?? false;
			const bValid = rowValidations[b]?.valid ?? false;
			if (aValid === bValid) return a - b;
			return aValid ? 1 : -1; // errors first
		});
		return indices;
	});

	// Available (unmapped) fields for each dropdown
	function getAvailableFields(currentColIndex: number): (ColumnDef | null)[] {
		const usedKeys = new Set(
			mappings.filter((m) => m.fieldKey && m.columnIndex !== currentColIndex).map((m) => m.fieldKey)
		);
		return [
			null, // "Skip" option
			...columnDefs.filter((d) => !usedKeys.has(d.key))
		];
	}
</script>

{#if rawRows.length === 0}
	<!-- No data yet -->
{:else}
	<!-- Column Mapping -->
	{#if missingRequired.length > 0}
		<div class="mapping-warning">
			Missing required columns: {missingRequired.map((d) => d.label).join(', ')}
		</div>
	{/if}

	<div class="mapping-row">
		{#each mappings as mapping, i}
			<div class="mapping-col">
				<div class="mapping-header">{rawRows[0][mapping.columnIndex] ?? `Col ${i + 1}`}</div>
				<select
					class="select mapping-select"
					value={mapping.fieldKey ?? ''}
					onchange={(e) => setMapping(mapping.columnIndex, e.currentTarget.value || null)}
				>
					{#each getAvailableFields(mapping.columnIndex) as field}
						{#if field === null}
							<option value="">Skip</option>
						{:else}
							<option value={field.key}>{field.label}{field.required ? ' *' : ''}</option>
						{/if}
					{/each}
				</select>
			</div>
		{/each}
	</div>

	<!-- Summary Bar -->
	<div class="summary-bar">
		<span class="summary-ready">{readyCount} ready</span>
		{#if errorCount > 0}
			<span class="summary-errors">{errorCount} errors</span>
		{/if}
		{#if uncheckedCount > 0}
			<span class="summary-unchecked">{uncheckedCount} unchecked</span>
		{/if}
		<div class="spacer"></div>
		<button class="btn btn-sm btn-secondary" onclick={selectAll}>Select All</button>
		<button class="btn btn-sm btn-secondary" onclick={selectNone}>Select None</button>
	</div>

	<!-- Editable Table -->
	<div class="table-wrapper">
		<table class="import-table">
			<thead>
				<tr>
					<th class="col-check"></th>
					<th class="col-row">#</th>
					{#each mappings as mapping}
						{#if mapping.fieldKey}
							{@const def = columnDefs.find((d) => d.key === mapping.fieldKey)}
							<th>{def?.label ?? mapping.fieldKey}</th>
						{/if}
					{/each}
					<th class="col-status"></th>
				</tr>
			</thead>
			<tbody>
				{#each sortedIndices as rowIdx}
					{@const validation = rowValidations[rowIdx]}
					{@const checked = checkedRows.has(rowIdx)}
					<tr class:row-error={!validation?.valid} class:row-unchecked={!checked && validation?.valid}>
						<td class="col-check">
							<input type="checkbox" {checked} onchange={() => toggleRow(rowIdx)} />
						</td>
						<td class="col-row">{rowIdx + 1}</td>
						{#each mappings as mapping}
							{#if mapping.fieldKey}
								{@const cellError = validation?.cellErrors[mapping.fieldKey]}
								{@const cellWarning = validation?.cellWarnings[mapping.fieldKey]}
								<td
									class="cell"
									class:cell-error={!!cellError}
									class:cell-warning={!!cellWarning && !cellError}
									title={cellError ?? cellWarning ?? ''}
									ondblclick={() => startEdit(rowIdx, mapping.columnIndex)}
								>
									{#if editingCell?.row === rowIdx && editingCell?.col === mapping.columnIndex}
										<input
											class="cell-input"
											type="text"
											value={editableRows[rowIdx][mapping.columnIndex] ?? ''}
											onblur={(e) => commitEdit(rowIdx, mapping.columnIndex, e.currentTarget.value)}
											onkeydown={(e) => handleKeydown(e, rowIdx, mapping.columnIndex)}
										/>
									{:else}
										{editableRows[rowIdx]?.[mapping.columnIndex] ?? ''}
									{/if}
								</td>
							{/if}
						{/each}
						<td class="col-status">
							{#if validation?.valid}
								<span class="status-ok" title="Valid">&#10003;</span>
							{:else}
								<span class="status-err" title={Object.values(validation?.cellErrors ?? {}).join('; ')}>&#10007;</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	.mapping-warning {
		background: var(--color-warning-bg, #fff3cd);
		color: var(--color-warning-text, #856404);
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-sm);
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-sm);
	}

	.mapping-row {
		display: flex;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-md);
		overflow-x: auto;
		padding-bottom: var(--spacing-xs);
	}

	.mapping-col {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
		min-width: 100px;
	}

	.mapping-header {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 120px;
	}

	.mapping-select {
		font-size: var(--font-size-xs);
		padding: 2px 4px;
	}

	.summary-bar {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) 0;
		font-size: var(--font-size-sm);
		border-bottom: 1px solid var(--color-divider);
		margin-bottom: var(--spacing-sm);
	}

	.summary-ready {
		color: var(--color-success);
		font-weight: 600;
	}
	.summary-errors {
		color: var(--color-error);
		font-weight: 600;
	}
	.summary-unchecked {
		color: var(--color-text-muted);
	}

	.table-wrapper {
		max-height: 400px;
		overflow: auto;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}

	.import-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--font-size-sm);
	}

	.import-table th {
		position: sticky;
		top: 0;
		background: var(--color-surface-variant);
		padding: var(--spacing-xs) var(--spacing-sm);
		text-align: left;
		font-weight: 600;
		border-bottom: 2px solid var(--color-border);
		white-space: nowrap;
	}

	.import-table td {
		padding: var(--spacing-xs) var(--spacing-sm);
		border-bottom: 1px solid var(--color-divider);
	}

	.col-check {
		width: 30px;
		text-align: center;
	}
	.col-row {
		width: 35px;
		color: var(--color-text-muted);
	}
	.col-status {
		width: 30px;
		text-align: center;
	}

	.cell {
		cursor: text;
	}
	.cell-error {
		background: var(--color-error-bg, #fde8e8);
		border: 1px solid var(--color-error);
	}
	.cell-warning {
		background: var(--color-warning-bg, #fff3cd);
		border: 1px solid var(--color-warning);
	}

	.cell-input {
		width: 100%;
		border: 2px solid var(--color-primary);
		border-radius: var(--radius-sm);
		padding: 1px 4px;
		font-size: var(--font-size-sm);
		outline: none;
	}

	.row-error {
		opacity: 0.85;
	}
	.row-unchecked {
		opacity: 0.5;
	}

	.status-ok {
		color: var(--color-success);
		font-weight: bold;
	}
	.status-err {
		color: var(--color-error);
		font-weight: bold;
	}
</style>
```

**Step 2: Commit**

```bash
git add src/lib/components/ui/BulkImportTable.svelte
git commit -m "feat: add BulkImportTable shared component with column mapping and inline editing"
```

---

## Task 4: Personnel Batch API Endpoint

**Files:**

- Create: `src/routes/org/[orgId]/api/personnel/batch/+server.ts`

**Context:** The existing single-record POST is at `src/routes/org/[orgId]/api/personnel/+server.ts`. The batch endpoint follows the same permission/validation pattern but accepts an array and does a single bulk insert.

**Key references:**

- `src/lib/server/permissions.ts` — `requireEditPermission`, `getScopedGroupId`
- `src/lib/server/subscription.ts` — `canAddPersonnel` (checks personnel cap)
- `src/lib/server/read-only-guard.ts` — `checkReadOnly`
- `src/lib/server/auditLog.ts` — `auditLog`
- `src/lib/server/supabase.ts` — `getApiContext`
- `src/lib/server/validation.ts` — `sanitizeString`
- `src/lib/utils/ranks.ts` — `ALL_RANKS`

**Step 1: Create the batch endpoint**

```typescript
// src/routes/org/[orgId]/api/personnel/batch/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditPermission, getScopedGroupId } from '$lib/server/permissions';
import { getApiContext } from '$lib/server/supabase';
import { canAddPersonnel } from '$lib/server/subscription';
import { checkReadOnly } from '$lib/server/read-only-guard';
import { auditLog } from '$lib/server/auditLog';
import { sanitizeString } from '$lib/server/validation';
import { ALL_RANKS } from '$lib/utils/ranks';

interface BatchRecord {
	rank: string;
	lastName: string;
	firstName: string;
	mos?: string;
	clinicRole?: string;
	groupName?: string;
}

export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'personnel');
	}

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const body = await request.json();
	const records: BatchRecord[] = body.records;

	if (!Array.isArray(records) || records.length === 0) {
		throw error(400, 'records array is required');
	}

	if (records.length > 500) {
		throw error(400, 'Maximum 500 records per batch');
	}

	// Check personnel cap for total count
	const capCheck = await canAddPersonnel(supabase, orgId);
	if (!capCheck.allowed) {
		return json({ error: capCheck.message, inserted: [], errors: [] }, { status: 403 });
	}

	// Get current count and cap to check total
	// (canAddPersonnel only checks if at least 1 can be added, we need room for all)
	const { count } = await supabase
		.from('personnel')
		.select('*', { count: 'exact', head: true })
		.eq('organization_id', orgId)
		.is('archived_at', null);

	// Fetch groups for name matching
	const { data: groups } = await supabase.from('groups').select('id, name').eq('organization_id', orgId);
	const groupMap = new Map((groups ?? []).map((g) => [g.name.toLowerCase(), g.id]));

	// Get scoped group for non-privileged users
	let scopedGroupId: string | null = null;
	if (!isSandbox && userId) {
		scopedGroupId = await getScopedGroupId(supabase, orgId, userId);
	}

	// Validate all records
	const validRows: Array<{ index: number; row: Record<string, unknown> }> = [];
	const errors: Array<{ index: number; message: string }> = [];
	const allRanksLower = ALL_RANKS.map((r) => r.toLowerCase());

	for (let i = 0; i < records.length; i++) {
		const rec = records[i];
		const rank = sanitizeString(rec.rank);
		const lastName = sanitizeString(rec.lastName);
		const firstName = sanitizeString(rec.firstName);

		if (!rank || !lastName || !firstName) {
			errors.push({ index: i, message: 'Rank, Last Name, and First Name are required' });
			continue;
		}

		// Case-insensitive rank match — find the canonical rank
		const rankIdx = allRanksLower.indexOf(rank.toLowerCase());
		if (rankIdx === -1) {
			errors.push({ index: i, message: `Invalid rank "${rank}"` });
			continue;
		}

		const groupName = sanitizeString(rec.groupName);
		let groupId: string | null = null;
		if (groupName) {
			groupId = groupMap.get(groupName.toLowerCase()) ?? null;
			// Not an error if group not found — import as unassigned
		}

		if (scopedGroupId && groupId !== scopedGroupId) {
			errors.push({ index: i, message: 'You can only add personnel to your assigned group' });
			continue;
		}

		validRows.push({
			index: i,
			row: {
				organization_id: orgId,
				rank: ALL_RANKS[rankIdx],
				last_name: lastName,
				first_name: firstName,
				mos: sanitizeString(rec.mos) || '',
				clinic_role: sanitizeString(rec.clinicRole) || '',
				group_id: groupId
			}
		});
	}

	if (validRows.length === 0) {
		return json({ inserted: [], errors });
	}

	// Bulk insert
	const { data: inserted, error: dbError } = await supabase
		.from('personnel')
		.insert(validRows.map((v) => v.row))
		.select('*, groups(name)');

	if (dbError) throw error(500, dbError.message);

	auditLog(
		{
			action: 'personnel.bulk_created',
			resourceType: 'personnel',
			orgId,
			details: {
				actor: locals.user?.email ?? userId,
				count: inserted.length
			}
		},
		{ userId }
	);

	const result = (inserted ?? []).map((d) => ({
		id: d.id,
		rank: d.rank,
		lastName: d.last_name,
		firstName: d.first_name,
		mos: d.mos,
		clinicRole: d.clinic_role,
		groupId: d.group_id,
		groupName: d.groups?.name ?? ''
	}));

	return json({ inserted: result, errors });
};
```

**Step 2: Commit**

```bash
git add src/routes/org/[orgId]/api/personnel/batch/+server.ts
git commit -m "feat: add batch API endpoint for personnel import"
```

---

## Task 5: Training Batch API Endpoint

**Files:**

- Create: `src/routes/org/[orgId]/api/personnel-trainings/batch/+server.ts`

**Context:** The existing single-record POST is at `src/routes/org/[orgId]/api/personnel-trainings/+server.ts`. The batch endpoint handles both completed records (upsert) and exemptions (update training type's `exempt_personnel_ids` array).

**Key references:**

- Existing POST handler at `src/routes/org/[orgId]/api/personnel-trainings/+server.ts` — upsert logic, expiration calculation
- `src/lib/utils/dates.ts` — `formatDate`

**Step 1: Create the batch endpoint**

```typescript
// src/routes/org/[orgId]/api/personnel-trainings/batch/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditPermission, getScopedGroupId, requireGroupAccess } from '$lib/server/permissions';
import { getApiContext } from '$lib/server/supabase';
import { checkReadOnly } from '$lib/server/read-only-guard';
import { auditLog } from '$lib/server/auditLog';
import { formatDate } from '$lib/utils/dates';

function calculateExpirationDate(completionDate: string | null, expirationMonths: number | null): string | null {
	if (expirationMonths === null || !completionDate) return null;
	const date = new Date(completionDate);
	date.setMonth(date.getMonth() + expirationMonths);
	return formatDate(date);
}

interface BatchTrainingRecord {
	personnelId: string;
	trainingTypeId: string;
	completionDate: string | null;
	notes?: string;
	status: 'completed' | 'exempt';
}

export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'training');
	}

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const body = await request.json();
	const records: BatchTrainingRecord[] = body.records;

	if (!Array.isArray(records) || records.length === 0) {
		throw error(400, 'records array is required');
	}

	if (records.length > 500) {
		throw error(400, 'Maximum 500 records per batch');
	}

	// Get scoped group for validation
	let scopedGroupId: string | null = null;
	if (!isSandbox && userId) {
		scopedGroupId = await getScopedGroupId(supabase, orgId, userId);
	}

	// Fetch all referenced training types in one query
	const trainingTypeIds = [...new Set(records.map((r) => r.trainingTypeId))];
	const { data: trainingTypes } = await supabase
		.from('training_types')
		.select('id, expiration_months, expiration_date_only, can_be_exempted, exempt_personnel_ids')
		.eq('organization_id', orgId)
		.in('id', trainingTypeIds);
	const typeMap = new Map((trainingTypes ?? []).map((t) => [t.id, t]));

	// If scoped, fetch personnel group_ids for access check
	let personnelGroupMap = new Map<string, string | null>();
	if (scopedGroupId) {
		const personnelIds = [...new Set(records.map((r) => r.personnelId))];
		const { data: personnelData } = await supabase
			.from('personnel')
			.select('id, group_id')
			.eq('organization_id', orgId)
			.in('id', personnelIds);
		personnelGroupMap = new Map((personnelData ?? []).map((p) => [p.id, p.group_id]));
	}

	// Split and validate
	const completedRecords: Array<{ index: number; row: Record<string, unknown>; isUpdate: boolean }> = [];
	const exemptionUpdates: Map<string, Set<string>> = new Map(); // trainingTypeId → Set<personnelId>
	const errors: Array<{ index: number; message: string }> = [];

	// Fetch existing training records for upsert detection
	const { data: existingRecords } = await supabase
		.from('personnel_trainings')
		.select('id, personnel_id, training_type_id')
		.eq('organization_id', orgId);
	const existingMap = new Map((existingRecords ?? []).map((e) => [`${e.personnel_id}:${e.training_type_id}`, e.id]));

	for (let i = 0; i < records.length; i++) {
		const rec = records[i];
		const type = typeMap.get(rec.trainingTypeId);

		if (!type) {
			errors.push({ index: i, message: 'Training type not found' });
			continue;
		}

		// Group scope check
		if (scopedGroupId) {
			const groupId = personnelGroupMap.get(rec.personnelId);
			if (groupId !== scopedGroupId) {
				errors.push({ index: i, message: 'Personnel not in your assigned group' });
				continue;
			}
		}

		if (rec.status === 'exempt') {
			if (!type.can_be_exempted) {
				errors.push({ index: i, message: 'This training type does not allow exemptions' });
				continue;
			}
			if (!exemptionUpdates.has(rec.trainingTypeId)) {
				exemptionUpdates.set(rec.trainingTypeId, new Set(type.exempt_personnel_ids ?? []));
			}
			exemptionUpdates.get(rec.trainingTypeId)!.add(rec.personnelId);
			continue;
		}

		// completed status
		const completionDate = rec.completionDate;
		const isExpirationDateOnly = type.expiration_date_only ?? false;

		if (isExpirationDateOnly && !completionDate) {
			errors.push({ index: i, message: 'Expiration date required for this training type' });
			continue;
		}

		if (type.expiration_months !== null && !completionDate) {
			errors.push({ index: i, message: 'Completion date is required for training that expires' });
			continue;
		}

		const expirationDate = isExpirationDateOnly
			? completionDate // for date-only types, completion date IS the expiration date
			: calculateExpirationDate(completionDate, type.expiration_months);

		const existingId = existingMap.get(`${rec.personnelId}:${rec.trainingTypeId}`);

		if (existingId) {
			completedRecords.push({
				index: i,
				isUpdate: true,
				row: {
					id: existingId,
					completion_date: completionDate,
					expiration_date: expirationDate,
					notes: rec.notes ?? null,
					updated_at: new Date().toISOString()
				}
			});
		} else {
			completedRecords.push({
				index: i,
				isUpdate: false,
				row: {
					organization_id: orgId,
					personnel_id: rec.personnelId,
					training_type_id: rec.trainingTypeId,
					completion_date: completionDate,
					expiration_date: expirationDate,
					notes: rec.notes ?? null
				}
			});
		}
	}

	// Execute bulk operations
	const insertRows = completedRecords.filter((r) => !r.isUpdate);
	const updateRows = completedRecords.filter((r) => r.isUpdate);

	let insertedData: any[] = [];
	let updatedData: any[] = [];
	const exemptedResults: Array<{ index: number; personnelId: string; trainingTypeId: string }> = [];

	// Bulk insert new records
	if (insertRows.length > 0) {
		const { data, error: insertError } = await supabase
			.from('personnel_trainings')
			.insert(insertRows.map((r) => r.row))
			.select();

		if (insertError) throw error(500, insertError.message);
		insertedData = data ?? [];
	}

	// Update existing records one by one (Supabase doesn't support bulk update by different IDs)
	for (const rec of updateRows) {
		const { id, ...updates } = rec.row as { id: string; [key: string]: unknown };
		const { data, error: updateError } = await supabase
			.from('personnel_trainings')
			.update(updates)
			.eq('id', id)
			.eq('organization_id', orgId)
			.select()
			.single();

		if (updateError) {
			errors.push({ index: rec.index, message: updateError.message });
		} else if (data) {
			updatedData.push(data);
		}
	}

	// Update exemption arrays on training types
	for (const [typeId, personnelIds] of exemptionUpdates) {
		const { error: exemptError } = await supabase
			.from('training_types')
			.update({ exempt_personnel_ids: [...personnelIds] })
			.eq('id', typeId)
			.eq('organization_id', orgId);

		if (exemptError) {
			errors.push({ index: -1, message: `Failed to update exemptions: ${exemptError.message}` });
		}
	}

	// Build exempted results from the original records
	for (let i = 0; i < records.length; i++) {
		if (records[i].status === 'exempt' && !errors.some((e) => e.index === i)) {
			exemptedResults.push({
				index: i,
				personnelId: records[i].personnelId,
				trainingTypeId: records[i].trainingTypeId
			});
		}
	}

	const transformRecord = (d: any) => ({
		id: d.id,
		personnelId: d.personnel_id,
		trainingTypeId: d.training_type_id,
		completionDate: d.completion_date,
		expirationDate: d.expiration_date,
		notes: d.notes,
		certificateUrl: d.certificate_url
	});

	auditLog(
		{
			action: 'training.bulk_imported',
			resourceType: 'training_record',
			orgId,
			details: {
				actor: locals.user?.email ?? userId,
				inserted: insertedData.length,
				updated: updatedData.length,
				exempted: exemptedResults.length
			}
		},
		{ userId }
	);

	return json({
		inserted: insertedData.map(transformRecord),
		updated: updatedData.map(transformRecord),
		exempted: exemptedResults,
		errors
	});
};
```

**Step 2: Commit**

```bash
git add src/routes/org/[orgId]/api/personnel-trainings/batch/+server.ts
git commit -m "feat: add batch API endpoint for training import with exemption support"
```

---

## Task 6: Refactor BulkPersonnelManager to Use New Components

**Files:**

- Modify: `src/lib/components/BulkPersonnelManager.svelte`
- Modify: `src/routes/org/[orgId]/personnel/+page.svelte` (lines 173-178: `handleBulkAdd`)

**Step 1: Refactor BulkPersonnelManager**

Replace the existing import tab contents with the new flow: input → BulkImportTable → import → results. Keep the Archive tab unchanged.

Key changes:

- Replace `parseImportText()` with `parseCSVText()` from `csvParser.ts`
- Replace the hardcoded preview list with `<BulkImportTable>` component
- Add a `validateRow()` function that checks rank, required fields, group matching
- Add result summary step after import
- Call the batch endpoint directly instead of going through `onBulkAdd`
- Add a progress bar during the batch API call

The component should have these states: `'input' | 'preview' | 'importing' | 'results'`

**Input state:** textarea + file upload (keep existing UI)
**Preview state:** BulkImportTable with mapping + editing
**Importing state:** progress bar
**Results state:** summary with inserted/errors/skipped counts

Replace `onBulkAdd` prop with `orgId` prop (to call batch API directly). Keep `onBulkDelete` and `onClose` as-is.

**Step 2: Update personnel page**

Replace `handleBulkAdd` with a simpler handler that refreshes data after import:

```typescript
async function handleBulkImportComplete() {
	await invalidateAll();
	showBulkManager = false;
}
```

Update the `<BulkPersonnelManager>` usage to pass `orgId` and `onImportComplete` instead of `onBulkAdd`.

**Step 3: Commit**

```bash
git add src/lib/components/BulkPersonnelManager.svelte src/routes/org/[orgId]/personnel/+page.svelte
git commit -m "feat: refactor BulkPersonnelManager to use column mapping, editable preview, and batch API"
```

---

## Task 7: Refactor BulkTrainingImporter to Use New Components

**Files:**

- Modify: `src/lib/components/BulkTrainingImporter.svelte`
- Modify: `src/routes/org/[orgId]/training/+page.svelte` (lines 169-174: `handleBulkAddTrainings`)

**Step 1: Refactor BulkTrainingImporter**

Same pattern as Task 6. Key differences:

- `validateRow()` must match person by last+first name (case-insensitive) and resolve `personnelId`
- `validateRow()` must match training type by name (case-insensitive) and resolve `trainingTypeId`
- `validateRow()` must handle the date/status column: date, yes/completed, exempt, skip, invalid — using `parseTrainingStatus()` from `csvParser.ts`
- Cross-validate: "yes" + expiring type = error, "exempt" + non-exemptable type = error
- Use `TRAINING_COLUMNS` from `columnMapping.ts`
- Call batch endpoint at `/api/personnel-trainings/batch`
- Results summary includes inserted, updated, exempted counts

Replace `onBulkAdd` prop with `orgId` prop. Add `onImportComplete` callback.

**Step 2: Update training page**

Replace `handleBulkAddTrainings` with:

```typescript
async function handleBulkImportComplete() {
	await invalidateAll();
	showBulkImporter = false;
}
```

Update `<BulkTrainingImporter>` usage to pass `orgId` and `onImportComplete`.

**Step 3: Commit**

```bash
git add src/lib/components/BulkTrainingImporter.svelte src/routes/org/[orgId]/training/+page.svelte
git commit -m "feat: refactor BulkTrainingImporter to use column mapping, editable preview, and batch API"
```

---

## Task 8: Add Personnel Store Batch Method

**Files:**

- Modify: `src/lib/stores/personnel.svelte.ts`

**Step 1: Add `addBatch` method to PersonnelStore**

The BulkPersonnelManager calls the batch API directly, but the store still needs to know about the new records so the UI updates without a full page reload. Add a method that merges server-returned records into the store:

```typescript
addBatchResults(inserted: Personnel[]) {
  this.#personnel = [...this.#personnel, ...inserted];
}
```

This is called by BulkPersonnelManager after the batch API returns, so the personnel list updates immediately without `invalidateAll()`.

**Step 2: Add same to PersonnelTrainingsStore**

```typescript
addBatchResults(inserted: PersonnelTraining[], updated: PersonnelTraining[]) {
  // Remove any existing records that were updated
  const updatedIds = new Set(updated.map(u => u.id));
  this.#trainings = this.#trainings.filter(t => !updatedIds.has(t.id));
  this.#trainings = [...this.#trainings, ...inserted, ...updated];
}
```

**Step 3: Commit**

```bash
git add src/lib/stores/personnel.svelte.ts src/lib/stores/personnelTrainings.svelte.ts
git commit -m "feat: add batch result methods to personnel and training stores"
```

---

## Task 9: Manual Testing & Polish

**Step 1: Test personnel import**

1. Open Personnel page → Overflow menu → Bulk Import
2. Paste CSV with headers in wrong order — verify column mapping auto-detects and lets you reassign
3. Paste CSV without headers — verify positional fallback works
4. Include rows with invalid ranks — verify red highlighting and error tooltip
5. Include rows with missing names — verify error
6. Include rows with unknown group names — verify warning (yellow) but still importable
7. Double-click a cell to edit it inline — verify validation updates
8. Uncheck some valid rows — verify they're excluded from count
9. Click Import — verify progress, then results summary
10. Verify imported personnel appear in the list

**Step 2: Test training import**

1. Open Training page → Overflow menu → Bulk Import
2. Paste CSV with: date values, "yes" values, "exempt" values, invalid names
3. Verify "yes" on expiring type shows error
4. Verify "exempt" on non-exemptable type shows error
5. Verify column mapping works with varied header names
6. Import and verify results summary shows inserted/updated/exempted counts
7. Verify exempted personnel appear as exempt in training matrix

**Step 3: Test edge cases**

1. Empty paste → no table shown
2. Single row with errors → table shown with 0 ready
3. Paste 200+ rows → verify performance is acceptable
4. File upload (.xlsx) → verify same flow works
5. Permission: member without edit permission → verify batch endpoint returns 403
6. Read-only mode → verify batch endpoint returns blocked response
7. Personnel cap: try importing more than cap allows → verify error

**Step 4: Commit any polish fixes**

```bash
git add -A
git commit -m "fix: polish bulk import UX after manual testing"
```

---

## Summary

| Task | What                          | New Files                                                         | Modified Files                                          |
| ---- | ----------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------- |
| 1    | Column mapping utility        | `src/lib/utils/columnMapping.ts`                                  | —                                                       |
| 2    | CSV/Excel parser utility      | `src/lib/utils/csvParser.ts`                                      | —                                                       |
| 3    | BulkImportTable component     | `src/lib/components/ui/BulkImportTable.svelte`                    | —                                                       |
| 4    | Personnel batch API           | `src/routes/org/[orgId]/api/personnel/batch/+server.ts`           | —                                                       |
| 5    | Training batch API            | `src/routes/org/[orgId]/api/personnel-trainings/batch/+server.ts` | —                                                       |
| 6    | Refactor BulkPersonnelManager | —                                                                 | `BulkPersonnelManager.svelte`, `personnel/+page.svelte` |
| 7    | Refactor BulkTrainingImporter | —                                                                 | `BulkTrainingImporter.svelte`, `training/+page.svelte`  |
| 8    | Store batch methods           | —                                                                 | `personnel.svelte.ts`, `personnelTrainings.svelte.ts`   |
| 9    | Manual testing & polish       | —                                                                 | Various                                                 |

**Execution order:** Tasks 1-2 have no dependencies. Task 3 depends on 1. Tasks 4-5 are independent. Tasks 6-7 depend on 1-5. Task 8 depends on 6-7. Task 9 is last.

**Parallelizable:** Tasks 1+2 can run in parallel. Tasks 4+5 can run in parallel. Tasks 6+7 can run in parallel after 1-5 are done.
