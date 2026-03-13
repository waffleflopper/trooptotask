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
