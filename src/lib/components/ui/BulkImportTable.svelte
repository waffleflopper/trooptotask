<!--
	@deprecated Use ui/bulk-import-workspace PreviewTable, RowStatus, ValidationSummary,
	and ResultSummary for new or migrated import flows. This legacy helper stays
	until existing production consumers move to BulkImportWorkspace.
-->
<script lang="ts">
	import type { ColumnDef, ColumnMapping } from '$lib/utils/columnMapping';
	import { autoMapColumns, detectHeaderRow, getMissingRequired } from '$lib/utils/columnMapping';
	import { SvelteSet, SvelteMap } from 'svelte/reactivity';

	export interface RowValidation {
		valid: boolean;
		cellErrors: Record<string, string>;
		cellWarnings: Record<string, string>;
	}

	export interface CheckedRowEntry {
		rowIndex: number;
		sourceRowNumber: number;
		values: Record<string, string>;
	}

	interface Props {
		rawRows: string[][];
		columnDefs: ColumnDef[];
		validateRow: (row: Record<string, string>) => RowValidation;
		validateRows?: (
			rows: Array<{ rowIndex: number; sourceRowNumber: number; values: Record<string, string> }>
		) => RowValidation[];
		onMappingChange?: (mappings: ColumnMapping[]) => void;
		onRowsChange?: (rows: Array<{ rowIndex: number; sourceRowNumber: number; values: Record<string, string> }>) => void;
	}

	let { rawRows, columnDefs, validateRow, validateRows, onMappingChange, onRowsChange }: Props = $props();

	// Detect headers and auto-map columns as derived values
	const hasHeaders = $derived(rawRows.length > 0 ? detectHeaderRow(rawRows[0], columnDefs) : false);

	// Base mappings derived from raw data — user edits are overlaid via userMappings
	const autoMappings = $derived(rawRows.length > 0 ? autoMapColumns(rawRows[0], columnDefs, hasHeaders) : []);

	// User-overridden mappings: fieldKey per columnIndex
	let userOverrides = new SvelteMap<number, string | null>();

	// Reset overrides when rawRows change (new file loaded)
	$effect(() => {
		rawRows; // track dependency
		userOverrides.clear();
	});

	const mappings = $derived.by(() => {
		return autoMappings
			.filter((m): m is ColumnMapping => m != null && typeof m.columnIndex === 'number')
			.map((m) => {
				if (userOverrides.has(m.columnIndex)) {
					return { ...m, fieldKey: userOverrides.get(m.columnIndex) ?? null };
				}
				return m;
			});
	});

	// Notify parent when mappings change
	$effect(() => {
		onMappingChange?.(mappings);
	});

	const dataRows = $derived(hasHeaders ? rawRows.slice(1) : rawRows);
	const sourceRowNumbers = $derived(dataRows.map((_, index) => index + (hasHeaders ? 2 : 1)));
	const missingRequired = $derived(getMissingRequired(mappings, columnDefs));

	// editableRows starts as a copy of dataRows; user edits mutate it directly
	let editableRows = $state<string[][]>([]);

	// checkedRows auto-selects valid rows on initial load; user can toggle manually
	let checkedRows = new SvelteSet<number>();

	// Generation counter tracks when rawRows changes (new file loaded) vs cell edits.
	// This avoids fragile cross-effect state sharing via plain variables.
	let dataGeneration = 0;
	let lastCheckedGeneration = -1;

	// Reset editableRows and bump generation when dataRows changes
	$effect(() => {
		editableRows = dataRows.map((row) => [...row]);
		dataGeneration++;
	});

	const mappedRows = $derived.by(() => {
		return editableRows.map((row, rowIndex) => {
			const values: Record<string, string> = {};
			for (const m of mappings) {
				if (m.fieldKey && m.columnIndex < row.length) {
					values[m.fieldKey] = (row[m.columnIndex] ?? '').trim();
				}
			}

			return {
				rowIndex,
				sourceRowNumber: sourceRowNumbers[rowIndex] ?? rowIndex + 1,
				values
			};
		});
	});

	const rowValidations = $derived.by(() => {
		const baseValidations = mappedRows.map((row) => validateRow(row.values));
		const multiRowValidations = validateRows?.(mappedRows) ?? [];

		return baseValidations.map((baseValidation, index) => {
			const multiRowValidation = multiRowValidations[index];
			if (!multiRowValidation) return baseValidation;

			const cellErrors = {
				...baseValidation.cellErrors,
				...multiRowValidation.cellErrors
			};
			const cellWarnings = {
				...baseValidation.cellWarnings,
				...multiRowValidation.cellWarnings
			};

			return {
				valid: Object.keys(cellErrors).length === 0,
				cellErrors,
				cellWarnings
			};
		});
	});

	$effect(() => {
		onRowsChange?.(mappedRows);
	});

	// Track previous validations for incremental checkbox updates
	let prevValidations: RowValidation[] = [];

	// Single effect handles both initial population and incremental updates
	$effect(() => {
		const current = rowValidations;
		const isNewData = lastCheckedGeneration !== dataGeneration;

		if (isNewData) {
			// New file loaded — reset and auto-check all valid rows
			checkedRows.clear();
			current.forEach((v, i) => {
				if (v.valid) checkedRows.add(i);
			});
			lastCheckedGeneration = dataGeneration;
		} else {
			// Incremental update from cell edit or mapping change —
			// only touch rows whose validity changed
			current.forEach((v, i) => {
				const wasValid = prevValidations[i]?.valid ?? false;
				if (!wasValid && v.valid) {
					checkedRows.add(i);
				} else if (wasValid && !v.valid) {
					checkedRows.delete(i);
				}
			});
		}

		prevValidations = current;
	});

	function toggleRow(index: number) {
		if (checkedRows.has(index)) checkedRows.delete(index);
		else checkedRows.add(index);
	}

	function selectAll() {
		checkedRows.clear();
		rowValidations.forEach((v, i) => {
			if (v.valid) checkedRows.add(i);
		});
	}

	function selectNone() {
		checkedRows.clear();
	}

	let editingCell = $state<{ row: number; col: number } | null>(null);

	function commitEdit(row: number, col: number, value: string) {
		editableRows[row][col] = value;
		editableRows = [...editableRows];
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

	function setMapping(colIndex: number, fieldKey: string | null) {
		userOverrides.set(colIndex, fieldKey);
	}

	export function getCheckedRows(): Record<string, string>[] {
		return getCheckedRowEntries().map((entry) => entry.values);
	}

	export function getCheckedRowEntries(): CheckedRowEntry[] {
		const results: CheckedRowEntry[] = [];
		editableRows.forEach((row, i) => {
			if (!checkedRows.has(i)) return;
			if (!rowValidations[i]?.valid) return;
			const mapped = mappedRows[i]?.values ?? {};
			results.push({
				rowIndex: i,
				sourceRowNumber: sourceRowNumbers[i] ?? i + 1,
				values: mapped
			});
		});
		return results;
	}

	const readyCount = $derived(editableRows.filter((_, i) => checkedRows.has(i) && rowValidations[i]?.valid).length);
	const errorCount = $derived(rowValidations.filter((v) => !v.valid).length);
	const uncheckedCount = $derived(
		editableRows.filter((_, i) => !checkedRows.has(i) && rowValidations[i]?.valid).length
	);

	const sortedIndices = $derived.by(() => {
		const indices = editableRows.map((_, i) => i);
		indices.sort((a, b) => {
			const aValid = rowValidations[a]?.valid ?? false;
			const bValid = rowValidations[b]?.valid ?? false;
			if (aValid === bValid) return a - b;
			return aValid ? 1 : -1;
		});
		return indices;
	});

	function getAvailableFields(currentColIndex: number): (ColumnDef | null)[] {
		const usedKeys = new Set(
			mappings.filter((m) => m.fieldKey && m.columnIndex !== currentColIndex).map((m) => m.fieldKey)
		);
		return [null, ...columnDefs.filter((d) => !usedKeys.has(d.key))];
	}
</script>

{#if rawRows.length === 0}
	<!-- No data yet, render nothing -->
{:else}
	{#if missingRequired.length > 0}
		<div class="mapping-warning">
			Missing required columns: {missingRequired.map((d) => d.label).join(', ')}
		</div>
	{/if}

	<div class="mapping-row">
		{#each mappings as mapping, i (mapping.columnIndex)}
			<div class="mapping-col">
				<div class="mapping-header">{rawRows[0][mapping.columnIndex] ?? `Col ${i + 1}`}</div>
				<select
					class="select mapping-select"
					value={mapping.fieldKey ?? ''}
					onchange={(e) => setMapping(mapping.columnIndex, e.currentTarget.value || null)}
				>
					{#each getAvailableFields(mapping.columnIndex) as field (field?.key ?? '__skip__')}
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

	<div class="table-wrapper">
		<table class="import-table">
			<thead>
				<tr>
					<th class="col-check"></th>
					<th class="col-row">#</th>
					{#each mappings as mapping (mapping.columnIndex)}
						{#if mapping.fieldKey}
							{@const def = columnDefs.find((d) => d.key === mapping.fieldKey)}
							<th>{def?.label ?? mapping.fieldKey}</th>
						{/if}
					{/each}
					<th class="col-status"></th>
				</tr>
			</thead>
			<tbody>
				{#each sortedIndices as rowIdx (rowIdx)}
					{@const validation = rowValidations[rowIdx]}
					{@const checked = checkedRows.has(rowIdx)}
					{@const warningMessages = Object.values(validation?.cellWarnings ?? {})}
					<tr class:row-error={!validation?.valid} class:row-unchecked={!checked && validation?.valid}>
						<td class="col-check">
							<input type="checkbox" {checked} onchange={() => toggleRow(rowIdx)} />
						</td>
						<td class="col-row">{sourceRowNumbers[rowIdx] ?? rowIdx + 1}</td>
						{#each mappings as mapping (mapping.columnIndex)}
							{#if mapping.fieldKey}
								{@const cellError = validation?.cellErrors[mapping.fieldKey]}
								{@const cellWarning = validation?.cellWarnings[mapping.fieldKey]}
								<td
									class="cell"
									class:cell-error={!!cellError}
									class:cell-warning={!!cellWarning && !cellError}
									title={cellError ?? cellWarning ?? ''}
									ondblclick={() => (editingCell = { row: rowIdx, col: mapping.columnIndex })}
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
							{#if validation?.valid && warningMessages.length > 0}
								<span class="status-warning" title={warningMessages.join('; ')}>{warningMessages[0]}</span>
							{:else if validation?.valid}
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
		background: #fff3cd;
		color: #856404;
		padding: var(--sp-2) var(--sp-4);
		border-radius: var(--radius-sm);
		font-size: var(--text-ui-sm);
		margin-bottom: var(--sp-2);
	}

	.mapping-row {
		display: flex;
		gap: var(--sp-2);
		margin-bottom: var(--sp-4);
		overflow-x: auto;
		padding-bottom: var(--sp-1);
	}

	.mapping-col {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		min-width: 100px;
	}

	.mapping-header {
		font-size: var(--text-xs);
		color: var(--text-tertiary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 120px;
	}

	.mapping-select {
		font-size: var(--text-xs);
		padding: 2px 4px;
	}

	.summary-bar {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2) 0;
		font-size: var(--text-ui-sm);
		border-bottom: 1px solid var(--divider-color);
		margin-bottom: var(--sp-2);
	}

	.summary-ready {
		color: var(--success);
		font-weight: 600;
	}
	.summary-errors {
		color: var(--danger);
		font-weight: 600;
	}
	.summary-unchecked {
		color: var(--text-tertiary);
	}

	.table-wrapper {
		max-height: 400px;
		overflow: auto;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
	}

	.import-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-ui-sm);
	}

	.import-table th {
		position: sticky;
		top: 0;
		background: var(--surface-subtle);
		padding: var(--sp-1) var(--sp-2);
		text-align: left;
		font-weight: 600;
		border-bottom: 2px solid var(--border-default);
		white-space: nowrap;
	}

	.import-table td {
		padding: var(--sp-1) var(--sp-2);
		border-bottom: 1px solid var(--divider-color);
	}

	.col-check {
		width: 30px;
		text-align: center;
	}
	.col-row {
		width: 35px;
		color: var(--text-tertiary);
	}
	.col-status {
		min-width: 11rem;
		text-align: right;
	}

	.cell {
		cursor: text;
	}
	.cell-error {
		background: #fde8e8;
		border: 1px solid var(--danger);
	}
	.cell-warning {
		background: #fff3cd;
		border: 1px solid var(--color-warning, #f59e0b);
	}

	.cell-input {
		width: 100%;
		border: 2px solid var(--amber);
		border-radius: var(--radius-sm);
		padding: 1px 4px;
		font-size: var(--text-ui-sm);
		outline: none;
	}

	.row-error {
		opacity: 0.85;
	}
	.row-unchecked {
		opacity: 0.5;
	}

	.status-ok {
		color: var(--success);
		font-weight: bold;
	}
	.status-err {
		color: var(--danger);
		font-weight: bold;
	}
	.status-warning {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 2px 8px;
		border: 1px solid var(--color-warning, #f59e0b);
		border-radius: var(--radius-sm);
		background: #fff3cd;
		color: #8a5a00;
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		white-space: nowrap;
	}
</style>
