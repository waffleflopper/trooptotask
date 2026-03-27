<script lang="ts">
	import BulkImportTable from '$lib/components/ui/BulkImportTable.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { parseFile, parseCSVText, parseDateString } from '$lib/utils/csvParser';
	import { STATUS_IMPORT_COLUMNS } from '$lib/utils/columnMapping';
	import type { RowValidation } from '$lib/components/ui/BulkImportTable.svelte';
	import type { Personnel, StatusType } from '$lib/types';

	interface Props {
		personnel: Personnel[];
		statusTypes: StatusType[];
		orgId: string;
		onImportComplete: () => void;
		onComplete: () => void;
	}

	let { personnel, statusTypes, orgId, onImportComplete, onComplete }: Props = $props();

	// State machine
	type Step = 'upload' | 'preview' | 'resolve' | 'results';
	let step = $state<Step>('upload');

	// Upload state
	let rawRows = $state<string[][]>([]);
	let pasteText = $state('');
	let parseError = $state('');

	// Preview state
	let tableRef: ReturnType<typeof BulkImportTable> | undefined = $state();

	// Resolve state
	type StatusMapping = { csvName: string; count: number; resolvedId: string | null };
	let unmatchedStatuses = $state<StatusMapping[]>([]);
	let savedCheckedRows = $state<Record<string, string>[]>([]);

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

	const allResolved = $derived(unmatchedStatuses.length === 0 || unmatchedStatuses.every((s) => s.resolvedId !== null));

	async function handleFileUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		parseError = '';
		try {
			rawRows = await parseFile(file);

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
					const rankMatches = matches.filter((p) => p.rank?.toLowerCase() === rank);
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
		savedCheckedRows = checkedRows;

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
				const originalName =
					checkedRows.find((r) => (r.statusType || '').trim().toLowerCase() === lower)?.statusType?.trim() || lower;
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
		const checkedRows = savedCheckedRows;
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
		const records: {
			personnelId: string;
			statusTypeId: string;
			startDate: string;
			endDate: string;
			note?: string | null;
		}[] = [];
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
			importResult = {
				inserted: 0,
				errors: [{ row: 0, message: err instanceof Error ? err.message : 'Import failed' }]
			};
			step = 'results';
		} finally {
			importing = false;
		}
	}
</script>

<div class="bulk-import-panel">
	{#if step === 'upload'}
		<div class="import-workspace">
			<section class="import-summary-card">
				<div class="pane-heading">
					<span class="pane-eyebrow">Step 1</span>
					<h2 class="pane-title">Bring in status rows</h2>
					<p class="pane-copy">
						Upload a CSV or Excel file, or paste raw CSV text. You will review and validate the rows before anything
						imports.
					</p>
				</div>

				<div class="summary-list">
					<div class="summary-item">
						<span class="summary-label">Required fields</span>
						<span class="summary-value">Last name, first name, start date, end date, status</span>
					</div>
					<div class="summary-item">
						<span class="summary-label">Optional fields</span>
						<span class="summary-value">Rank for name conflicts, plus note if you want one carried in</span>
					</div>
					<div class="summary-item">
						<span class="summary-label">Supported files</span>
						<span class="summary-value">`.csv`, `.xlsx`, and `.xls`</span>
					</div>
				</div>
			</section>

			<section class="import-main-card">
				<div class="upload-grid">
					<div class="upload-option upload-card">
						<h4>Upload a file</h4>
						<p class="text-muted">Best when you already have a spreadsheet ready to go.</p>
						<input type="file" accept=".csv,.xlsx,.xls" onchange={handleFileUpload} />
					</div>

					<div class="divider-row">
						<div class="divider-line"></div>
						<span class="divider-text text-muted">or</span>
						<div class="divider-line"></div>
					</div>

					<div class="upload-option upload-card">
						<h4>Paste CSV data</h4>
						<p class="text-muted">Useful for a quick import from another system or email.</p>
						<textarea
							class="input"
							rows="8"
							placeholder="last name, first name, start date, end date, status&#10;Smith, John, 2026-01-01, 2026-01-05, Leave&#10;..."
							bind:value={pasteText}
						></textarea>
						<button class="btn btn-primary btn-sm" onclick={handlePaste} disabled={!pasteText.trim()}> Parse </button>
					</div>
				</div>

				{#if parseError}
					<p class="import-error" role="alert">{parseError}</p>
				{/if}
			</section>
		</div>
	{/if}

	{#if step === 'preview'}
		<section class="stage-card">
			<div class="pane-heading stage-heading">
				<span class="pane-eyebrow">Step 2</span>
				<h2 class="pane-title">Review parsed rows</h2>
				<p class="pane-copy">
					Check the rows that should be imported, then continue to status matching if anything needs resolution.
				</p>
			</div>
			<BulkImportTable bind:this={tableRef} {rawRows} columnDefs={STATUS_IMPORT_COLUMNS} {validateRow} />
		</section>
	{/if}

	{#if step === 'results'}
		<section class="stage-card">
			<div class="pane-heading stage-heading">
				<span class="pane-eyebrow">Results</span>
				<h2 class="pane-title">Import complete</h2>
				<p class="pane-copy">Review what was imported and any rows that still need attention.</p>
			</div>
			<div class="results-section">
				{#if importResult}
					{#if importResult.inserted > 0}
						<div class="results-success">
							<strong>{importResult.inserted}</strong> status {importResult.inserted === 1 ? 'entry' : 'entries'} imported
							successfully.
						</div>
					{/if}

					{#if importResult.errors.length > 0}
						<div class="results-errors">
							<h4>Errors</h4>
							{#each importResult.errors as error, idx (idx)}
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
		</section>
	{/if}

	{#if step === 'resolve'}
		<section class="stage-card">
			<div class="pane-heading stage-heading">
				<span class="pane-eyebrow">Step 3</span>
				<h2 class="pane-title">Resolve unmatched statuses</h2>
				<p class="pane-copy">
					The following status names do not match a status type in this organization. Map each one or choose skip to
					leave those rows out.
				</p>
			</div>
			<div class="resolve-section">
				<div class="resolve-list">
					{#each unmatchedStatuses as mapping, i (mapping.csvName)}
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
								{#each statusTypes as st (st.id)}
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
		</section>
	{/if}

	<div class="panel-footer">
		{#if step === 'preview'}
			<button
				class="btn btn-secondary"
				onclick={() => {
					step = 'upload';
					rawRows = [];
				}}>Back</button
			>
			<div class="spacer"></div>
			<button class="btn btn-primary" onclick={handlePreviewNext}>Next</button>
		{:else if step === 'resolve'}
			<button
				class="btn btn-secondary"
				onclick={() => {
					step = 'preview';
				}}>Back</button
			>
			<div class="spacer"></div>
			<button class="btn btn-primary" disabled={!allResolved || importing} onclick={handleImport}>
				{#if importing}<Spinner />{/if}
				{importing ? 'Importing...' : 'Import'}
			</button>
		{:else if step === 'results'}
			<button class="btn btn-primary" onclick={onComplete}>Done</button>
		{/if}
	</div>
</div>

<style>
	.bulk-import-panel {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.panel-footer {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--spacing-sm);
		padding: var(--spacing-md) var(--spacing-lg);
		border-top: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	.import-workspace {
		display: grid;
		grid-template-columns: minmax(300px, 360px) minmax(0, 1fr);
		gap: var(--spacing-lg);
		align-items: start;
	}

	.import-summary-card,
	.import-main-card,
	.stage-card {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
	}

	.import-summary-card,
	.import-main-card {
		padding: var(--spacing-lg);
	}

	.stage-heading {
		padding: var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface-variant);
	}

	.pane-heading {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.pane-eyebrow {
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-bold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-primary);
	}

	.pane-title {
		font-family: var(--font-display);
		font-size: var(--font-size-xl);
		font-weight: 400;
		line-height: 1.1;
	}

	.pane-copy {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
	}

	.summary-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		margin-top: var(--spacing-lg);
	}

	.summary-item {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2xs);
		padding: var(--spacing-sm) 0;
		border-top: 1px solid var(--color-border);
	}

	.summary-item:first-child {
		padding-top: 0;
		border-top: none;
	}

	.summary-label {
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
	}

	.summary-value {
		font-size: var(--font-size-sm);
		color: var(--color-text);
	}

	.upload-grid {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.spacer {
		flex: 1;
	}

	.upload-option {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.upload-card {
		padding: var(--spacing-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface-variant);
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

	.import-error {
		margin-top: var(--spacing-lg);
		padding: var(--spacing-sm) var(--spacing-md);
		color: var(--color-error);
		background: var(--color-error-tint);
		border-radius: var(--radius-md);
	}

	.resolve-section {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
		padding: var(--spacing-lg);
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

	.results-section {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
		padding: var(--spacing-lg);
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

	@media (max-width: 960px) {
		.import-workspace {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 640px) {
		.import-summary-card,
		.import-main-card,
		.stage-heading,
		.resolve-section,
		.results-section,
		.panel-footer {
			padding-left: var(--spacing-md);
			padding-right: var(--spacing-md);
		}

		.resolve-row {
			flex-direction: column;
			align-items: stretch;
		}

		.resolve-info {
			min-width: 0;
		}

		.resolve-arrow {
			display: none;
		}
	}
</style>
