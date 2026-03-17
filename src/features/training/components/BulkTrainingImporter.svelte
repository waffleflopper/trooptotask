<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { TrainingType } from '$features/training/training.types';
	import Modal from '$lib/components/Modal.svelte';
	import BulkImportTable from '$lib/components/ui/BulkImportTable.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { TRAINING_COLUMNS } from '$lib/utils/columnMapping';
	import { parseCSVText, parseFile, parseTrainingStatus } from '$lib/utils/csvParser';

	interface ResolvedRecord {
		personnelId: string;
		trainingTypeId: string;
		completionDate: string | null;
		notes: string;
		status: 'completed' | 'exempt';
	}

	interface RowValidation {
		valid: boolean;
		cellErrors: Record<string, string>;
		cellWarnings: Record<string, string>;
	}

	interface Props {
		orgId: string;
		personnel: Personnel[];
		trainingTypes: TrainingType[];
		onImportComplete: () => void;
		onClose: () => void;
	}

	let { orgId, personnel, trainingTypes, onImportComplete, onClose }: Props = $props();

	type ImportState = 'input' | 'preview' | 'importing' | 'results';

	let importState = $state<ImportState>('input');
	let importText = $state('');
	let rawRows = $state<string[][]>([]);
	let uploadedFileName = $state('');
	let fileInputEl: HTMLInputElement | undefined = $state();
	let bulkTable: ReturnType<typeof BulkImportTable> | undefined = $state();

	interface ImportResults {
		inserted: number;
		updated: number;
		exempted: number;
		errors: number;
	}
	let results = $state<ImportResults | null>(null);
	let importError = $state('');
	let isSubmitting = $state(false);

	const exampleCsv = `Last Name,First Name,Training Type,Date / Status,Notes\nSmith,John,CPR/BLS,2024-01-15,\nJohnson,Jane,ACLS,2024-02-20,\nWilliams,Robert,First Aid,yes,Annual refresh\nDavis,Michael,Safety Brief,exempt,`;

	function validateRow(row: Record<string, string>): RowValidation {
		const cellErrors: Record<string, string> = {};
		const cellWarnings: Record<string, string> = {};

		const lastName = (row.lastName ?? '').trim();
		const firstName = (row.firstName ?? '').trim();
		const trainingTypeName = (row.trainingType ?? '').trim();
		const statusRaw = (row.status ?? '').trim();

		// Validate person
		if (!lastName) cellErrors.lastName = 'Last name is required';
		if (!firstName) cellErrors.firstName = 'First name is required';

		let person: Personnel | undefined;
		if (lastName && firstName) {
			const lastLower = lastName.toLowerCase();
			const firstLower = firstName.toLowerCase();
			person = personnel.find(
				(p) => p.lastName.toLowerCase() === lastLower && p.firstName.toLowerCase() === firstLower
			);
			if (!person) {
				cellErrors.lastName = `Person not found: "${lastName}, ${firstName}". Check spelling matches your personnel roster`;
			}
		}

		// Validate training type
		if (!trainingTypeName) {
			cellErrors.trainingType = 'Training type is required';
		}
		let trainingType: TrainingType | undefined;
		if (trainingTypeName) {
			const nameLower = trainingTypeName.toLowerCase();
			trainingType = trainingTypes.find((t) => t.name.toLowerCase() === nameLower);
			if (!trainingType) {
				cellErrors.trainingType = `Training type not found: "${trainingTypeName}". Available types: ${trainingTypes.map((t) => t.name).join(', ')}`;
			}
		}

		// Validate status / date
		if (!statusRaw) {
			cellErrors.status = 'Date or status is required';
		}

		let resolvedStatus: 'completed' | 'exempt' | null = null;
		let resolvedDate: string | null = null;

		if (statusRaw && trainingType) {
			const parsed = parseTrainingStatus(statusRaw);

			if (parsed.type === 'skip') {
				// skip rows are auto-unchecked; mark as invalid with a non-error indicator
				cellErrors.status = 'Skipped (no/empty — row will not be imported)';
			} else if (parsed.type === 'invalid') {
				cellErrors.status = `Invalid date or status. Use a date (YYYY-MM-DD or MM/DD/YYYY), "yes", "exempt", or "no" to skip`;
			} else if (parsed.type === 'exempt') {
				if (!trainingType.canBeExempted) {
					cellErrors.status = 'This training type does not allow exemptions';
				} else {
					resolvedStatus = 'exempt';
					resolvedDate = null;
				}
			} else if (parsed.type === 'completed') {
				// yes/true/done — completion flag without a specific date
				if (trainingType.expirationDateOnly) {
					cellErrors.status = `${trainingType.name} requires an expiration date, not yes/no`;
				} else if (trainingType.expirationMonths !== null) {
					cellErrors.status = `${trainingType.name} requires a completion date, not yes/no`;
				} else {
					resolvedStatus = 'completed';
					resolvedDate = parsed.date; // today
				}
			} else if (parsed.type === 'date') {
				resolvedStatus = 'completed';
				resolvedDate = parsed.date;
			}
		}

		const valid = Object.keys(cellErrors).length === 0;

		return { valid, cellErrors, cellWarnings };
	}

	async function handleFileUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		uploadedFileName = file.name;
		importText = '';
		importError = '';
		try {
			rawRows = await parseFile(file);
			importState = 'preview';
		} catch (err) {
			importError = `Failed to read file: ${err instanceof Error ? err.message : 'Unknown error'}`;
		}
	}

	function handleTextParse() {
		if (!importText.trim()) return;
		rawRows = parseCSVText(importText);
		uploadedFileName = '';
		importState = 'preview';
	}

	function handleBack() {
		importState = 'input';
		rawRows = [];
		importError = '';
	}

	async function handleImport() {
		if (isSubmitting || !bulkTable) return;
		const checkedRows = bulkTable.getCheckedRows();
		if (checkedRows.length === 0) return;

		const records = checkedRows
			.map((row): ResolvedRecord | null => {
				const person = personnel.find(
					(p) =>
						p.lastName.toLowerCase() === (row.lastName ?? '').toLowerCase() &&
						p.firstName.toLowerCase() === (row.firstName ?? '').toLowerCase()
				);
				const trainingType = trainingTypes.find((t) => t.name.toLowerCase() === (row.trainingType ?? '').toLowerCase());
				if (!person || !trainingType) return null;

				const statusResult = parseTrainingStatus(row.status ?? '');
				if (statusResult.type === 'exempt') {
					return {
						personnelId: person.id,
						trainingTypeId: trainingType.id,
						completionDate: null,
						notes: (row.notes ?? '').trim(),
						status: 'exempt'
					};
				}
				if (statusResult.type === 'completed' || statusResult.type === 'date') {
					return {
						personnelId: person.id,
						trainingTypeId: trainingType.id,
						completionDate: statusResult.date,
						notes: (row.notes ?? '').trim(),
						status: 'completed'
					};
				}
				return null;
			})
			.filter((r): r is ResolvedRecord => r !== null);

		if (records.length === 0) return;

		isSubmitting = true;
		importState = 'importing';
		importError = '';

		try {
			const res = await fetch(`/org/${orgId}/api/personnel-trainings/batch`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ records })
			});

			const data = await res.json().catch(() => ({}));

			if (!res.ok) {
				throw new Error(data.message ?? `HTTP ${res.status}`);
			}

			results = {
				inserted: data.inserted?.length ?? 0,
				updated: data.updated?.length ?? 0,
				exempted: data.exempted?.length ?? 0,
				errors: data.errors?.length ?? 0
			};
			importState = 'results';
		} catch (err) {
			importError = err instanceof Error ? err.message : 'Import failed';
			importState = 'preview';
		} finally {
			isSubmitting = false;
		}
	}

	function handleDone() {
		onImportComplete();
		onClose();
	}
</script>

<Modal title="Bulk Training Import" {onClose} width="800px" titleId="bulk-training-title" canClose={!isSubmitting}>
	{#if importState === 'input'}
		<div class="input-section">
			<!-- Available training types -->
			<div class="info-box">
				<h4>Available Training Types</h4>
				<div class="type-chips">
					{#each trainingTypes as type (type.id)}
						<span
							class="type-chip"
							style="background-color: {type.color}"
							title={type.expirationMonths === null ? 'Accepts yes/no' : `Expires in ${type.expirationMonths} months`}
						>
							{type.name}{type.expirationMonths === null ? ' *' : ''}
						</span>
					{/each}
				</div>
				<p class="type-hint">* = accepts "yes/no" instead of date (never expires). Use "exempt" to exempt a person.</p>
				{#if trainingTypes.length === 0}
					<p class="text-error" style="margin: var(--spacing-sm) 0 0; font-size: var(--font-size-sm);">
						No training types defined. Please add training types first.
					</p>
				{/if}
			</div>

			<!-- File upload -->
			<div class="upload-section">
				<h4>Upload File</h4>
				<p class="hint">Upload an Excel (.xlsx, .xls) or CSV file</p>
				<div class="upload-row">
					<input
						type="file"
						accept=".xlsx,.xls,.csv"
						onchange={handleFileUpload}
						bind:this={fileInputEl}
						class="file-input"
						id="trainingFileUpload"
					/>
					<label for="trainingFileUpload" class="btn btn-secondary upload-btn">
						<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
							<path
								fill-rule="evenodd"
								d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z"
								clip-rule="evenodd"
							/>
						</svg>
						Choose File
					</label>
				</div>
				<p class="format-hint">
					Columns: Last Name, First Name, Training Type, Date or Status (yes/exempt/YYYY-MM-DD), Notes (optional)
				</p>
			</div>

			<div class="divider"><span>or paste CSV text</span></div>

			<!-- Text paste -->
			<div class="paste-section">
				<div class="example-header">
					<h4>Paste Data</h4>
					<button
						class="btn btn-secondary btn-sm"
						onclick={() => {
							importText = exampleCsv;
						}}
					>
						Use Example
					</button>
				</div>
				<textarea class="input import-textarea" bind:value={importText} placeholder="Paste CSV data here..." rows="6"
				></textarea>
			</div>

			{#if importError}
				<p class="text-error" style="margin-top: var(--spacing-sm); font-size: var(--font-size-sm);">
					{importError}
				</p>
			{/if}
		</div>
	{:else if importState === 'preview'}
		<div class="preview-section">
			<p class="hint">
				Review the data below. Double-click any cell to edit. Rows with errors are shown with red highlighting and will
				not be imported unless fixed.
			</p>
			<BulkImportTable bind:this={bulkTable} {rawRows} columnDefs={TRAINING_COLUMNS} {validateRow} />
			{#if importError}
				<p class="text-error" style="margin-top: var(--spacing-sm); font-size: var(--font-size-sm);">
					{importError}
				</p>
			{/if}
		</div>
	{:else if importState === 'importing'}
		<div class="importing-state">
			<Spinner size={20} color="var(--color-primary)" />
			<span>Importing records...</span>
		</div>
	{:else if importState === 'results' && results}
		<div class="results-section">
			<div class="result-grid">
				<div class="result-card inserted">
					<span class="result-value">{results.inserted}</span>
					<span class="result-label">Inserted</span>
				</div>
				<div class="result-card updated">
					<span class="result-value">{results.updated}</span>
					<span class="result-label">Updated</span>
				</div>
				<div class="result-card exempted">
					<span class="result-value">{results.exempted}</span>
					<span class="result-label">Exempted</span>
				</div>
				{#if results.errors > 0}
					<div class="result-card errored">
						<span class="result-value">{results.errors}</span>
						<span class="result-label">Errors</span>
					</div>
				{/if}
			</div>
			{#if results.errors > 0}
				<p class="hint" style="margin-top: var(--spacing-md);">
					Some records could not be imported. They may have been missing required data or referenced personnel outside
					your assigned group.
				</p>
			{/if}
		</div>
	{/if}

	{#snippet footer()}
		{#if importState === 'input'}
			<button class="btn btn-secondary" onclick={onClose}>Cancel</button>
			<button class="btn btn-primary" onclick={handleTextParse} disabled={!importText.trim()}> Preview </button>
		{:else if importState === 'preview'}
			<button class="btn btn-secondary" onclick={handleBack}>Back</button>
			<button class="btn btn-primary" onclick={handleImport} disabled={isSubmitting}>
				{#if isSubmitting}<Spinner />{/if}
				Import
			</button>
		{:else if importState === 'importing'}
			<button class="btn btn-secondary" disabled>Back</button>
			<button class="btn btn-primary" disabled>
				<Spinner />
				Importing...
			</button>
		{:else if importState === 'results'}
			<button class="btn btn-primary" onclick={handleDone}>Done</button>
		{/if}
	{/snippet}
</Modal>

<style>
	.input-section,
	.preview-section,
	.results-section {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.importing-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-md);
		padding: var(--spacing-xl) 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.info-box {
		padding: var(--spacing-md);
		background: var(--color-bg);
		border-radius: var(--radius-md);
	}

	.info-box h4 {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: var(--spacing-sm);
	}

	.type-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-xs);
	}

	.type-chip {
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-size: var(--font-size-xs);
		font-weight: 500;
		color: white;
	}

	.type-hint {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		margin: var(--spacing-sm) 0 0;
		font-style: italic;
	}

	.upload-section {
		padding: var(--spacing-md);
		background: var(--color-bg);
		border-radius: var(--radius-md);
		border: 2px dashed var(--color-border);
	}

	.upload-section h4 {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: var(--spacing-xs);
	}

	.upload-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin: var(--spacing-sm) 0;
	}

	.file-input {
		display: none;
	}

	.upload-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		cursor: pointer;
	}

	.format-hint {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		margin: 0;
	}

	.hint {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin: 0;
	}

	.divider {
		display: flex;
		align-items: center;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.divider::before,
	.divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--color-border);
	}

	.divider span {
		padding: 0 var(--spacing-md);
	}

	.paste-section {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.example-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.example-header h4 {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.import-textarea {
		font-family: monospace;
		font-size: var(--font-size-sm);
		resize: vertical;
	}

	/* Results */
	.result-grid {
		display: flex;
		gap: var(--spacing-md);
		flex-wrap: wrap;
	}

	.result-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: var(--spacing-md) var(--spacing-lg);
		border-radius: var(--radius-md);
		min-width: 100px;
	}

	.result-card.inserted {
		background: rgba(34, 197, 94, 0.1);
		border: 1px solid #22c55e;
	}

	.result-card.updated {
		background: rgba(59, 130, 246, 0.1);
		border: 1px solid #3b82f6;
	}

	.result-card.exempted {
		background: rgba(168, 85, 247, 0.1);
		border: 1px solid #a855f7;
	}

	.result-card.errored {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid #ef4444;
	}

	.result-value {
		font-size: var(--font-size-lg);
		font-weight: 700;
		color: var(--color-text);
	}

	.result-label {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
</style>
