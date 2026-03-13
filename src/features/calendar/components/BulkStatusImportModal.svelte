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

	const allResolved = $derived(
		unmatchedStatuses.length === 0 ||
		unmatchedStatuses.every((s) => s.resolvedId !== null)
	);

	// Local date parser — parseDateString is not exported from csvParser
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
				const originalName = checkedRows.find(
					(r) => (r.statusType || '').trim().toLowerCase() === lower
				)?.statusType?.trim() || lower;
				unmatched.push({ csvName: originalName, count, resolvedId: null });
			}
		}

		unmatchedStatuses = unmatched;

		// If no unmatched, go straight to import
		if (unmatched.length === 0) {
			handleImport();
		} else {
			step = 'resolve';
		}
	}

	async function handleImport() {
		// TODO: implement in Task 6
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

	{#if step === 'preview'}
		<BulkImportTable
			bind:this={tableRef}
			{rawRows}
			columnDefs={STATUS_IMPORT_COLUMNS}
			{validateRow}
		/>
	{/if}

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
</style>
