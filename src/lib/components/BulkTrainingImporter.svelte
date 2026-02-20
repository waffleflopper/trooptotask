<script lang="ts">
	import type { Personnel, TrainingType, PersonnelTraining } from '../types';
	import { formatDate } from '../utils/dates';
	import * as XLSX from 'xlsx';

	interface Props {
		personnel: Personnel[];
		trainingTypes: TrainingType[];
		onBulkAdd: (trainings: Omit<PersonnelTraining, 'id'>[]) => Promise<void>;
		onClose: () => void;
	}

	let { personnel, trainingTypes, onBulkAdd, onClose }: Props = $props();

	let fileInput: HTMLInputElement;
	let uploadedFileName = $state('');
	let importText = $state('');
	let importErrors = $state<string[]>([]);
	let parsedTrainings = $state<Omit<PersonnelTraining, 'id'>[]>([]);
	let isImporting = $state(false);

	const exampleFormat = `Smith, John, CPR/BLS, 2024-01-15
Johnson, Jane, ACLS, 2024-02-20
Williams, Robert, First Aid, 2024-03-10
Davis, Michael, Safety Brief, yes`;

	// Check if a value indicates "yes/completed"
	function isYesValue(value: string): boolean {
		const normalized = value.toLowerCase().trim();
		return ['yes', 'y', 'true', '1', 'complete', 'completed', 'done', 'x'].includes(normalized);
	}

	// Check if a value indicates "no/not completed"
	function isNoValue(value: string): boolean {
		const normalized = value.toLowerCase().trim();
		return ['no', 'n', 'false', '0', 'incomplete', 'pending', ''].includes(normalized);
	}

	function parseDate(dateStr: string): string | null {
		if (!dateStr) return null;

		// Try various date formats
		const str = String(dateStr).trim();

		// Already in YYYY-MM-DD format
		if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
			return str;
		}

		// MM/DD/YYYY format
		const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
		if (slashMatch) {
			const [, month, day, year] = slashMatch;
			return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
		}

		// Excel serial date number
		if (/^\d+$/.test(str)) {
			const serialDate = parseInt(str);
			// Excel dates start from 1900-01-01 (but with a bug where 1900 is treated as leap year)
			const excelEpoch = new Date(1899, 11, 30);
			const date = new Date(excelEpoch.getTime() + serialDate * 24 * 60 * 60 * 1000);
			return formatDate(date);
		}

		// Try parsing as Date
		const parsed = new Date(str);
		if (!isNaN(parsed.getTime())) {
			return formatDate(parsed);
		}

		return null;
	}

	function findPerson(lastName: string, firstName: string): Personnel | null {
		const lastLower = lastName.toLowerCase().trim();
		const firstLower = firstName.toLowerCase().trim();

		return personnel.find(p =>
			p.lastName.toLowerCase() === lastLower &&
			p.firstName.toLowerCase() === firstLower
		) ?? null;
	}

	function findTrainingType(name: string): TrainingType | null {
		const nameLower = name.toLowerCase().trim();
		return trainingTypes.find(t => t.name.toLowerCase() === nameLower) ?? null;
	}

	function calculateExpirationDate(completionDate: string, expirationMonths: number | null): string | null {
		if (expirationMonths === null) return null;
		const completion = new Date(completionDate);
		completion.setMonth(completion.getMonth() + expirationMonths);
		return formatDate(completion);
	}

	function parseImportData(rows: (string | number | undefined)[][]) {
		const parsed: Omit<PersonnelTraining, 'id'>[] = [];
		const errors: string[] = [];

		// Skip header row if it looks like a header
		let startRow = 0;
		if (rows.length > 0) {
			const firstCell = String(rows[0][0] || '').toLowerCase();
			if (firstCell.includes('last') || firstCell.includes('name') || firstCell === 'personnel') {
				startRow = 1;
			}
		}

		for (let i = startRow; i < rows.length; i++) {
			const row = rows[i];
			if (!row || row.length < 3 || !row[0]) continue;

			const lastName = String(row[0] || '').trim();
			const firstName = String(row[1] || '').trim();
			const trainingName = String(row[2] || '').trim();
			const completionDateRaw = row[3];
			const notes = String(row[4] || '').trim() || null;

			if (!lastName || !firstName) {
				errors.push(`Row ${i + 1}: Missing last name or first name`);
				continue;
			}

			if (!trainingName) {
				errors.push(`Row ${i + 1}: Missing training type`);
				continue;
			}

			const person = findPerson(lastName, firstName);
			if (!person) {
				errors.push(`Row ${i + 1}: Person not found - ${lastName}, ${firstName}`);
				continue;
			}

			const trainingType = findTrainingType(trainingName);
			if (!trainingType) {
				errors.push(`Row ${i + 1}: Training type not found - ${trainingName}`);
				continue;
			}

			const dateValue = String(completionDateRaw || '').trim();
			let completionDate: string | null = null;
			let expirationDate: string | null = null;

			// Check if this training type doesn't require a date (never expires)
			const isNonExpiringTraining = trainingType.expirationMonths === null;

			if (isNonExpiringTraining) {
				// For non-expiring trainings, accept yes/no values
				if (isYesValue(dateValue)) {
					// Use today's date as completion date
					completionDate = formatDate(new Date());
					expirationDate = null;
				} else if (isNoValue(dateValue)) {
					// Skip this row - training not completed
					continue;
				} else {
					// Try to parse as a date (user may still provide actual date)
					completionDate = parseDate(dateValue);
					if (!completionDate) {
						errors.push(`Row ${i + 1}: For "${trainingType.name}", use "yes" for completed or a date (got: ${dateValue})`);
						continue;
					}
					expirationDate = null;
				}
			} else {
				// Regular expiring training - requires a valid date
				completionDate = parseDate(dateValue);
				if (!completionDate) {
					errors.push(`Row ${i + 1}: Invalid date format - ${completionDateRaw}`);
					continue;
				}
				expirationDate = calculateExpirationDate(completionDate, trainingType.expirationMonths);
			}

			parsed.push({
				personnelId: person.id,
				trainingTypeId: trainingType.id,
				completionDate,
				expirationDate,
				notes,
				certificateUrl: null
			});
		}

		importErrors = errors;
		parsedTrainings = parsed;
	}

	function handleFileUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		uploadedFileName = file.name;
		const reader = new FileReader();

		reader.onload = (e) => {
			try {
				const data = e.target?.result;
				const workbook = XLSX.read(data, { type: 'array' });
				const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
				const rows = XLSX.utils.sheet_to_json<(string | number | undefined)[]>(firstSheet, { header: 1 });

				parseImportData(rows);
				importText = '';
			} catch (err) {
				importErrors = [`Failed to parse file: ${err instanceof Error ? err.message : 'Unknown error'}`];
				parsedTrainings = [];
			}
		};

		reader.readAsArrayBuffer(file);
	}

	function parseTextInput() {
		if (!importText.trim()) {
			parsedTrainings = [];
			importErrors = [];
			return;
		}

		const lines = importText.trim().split('\n');
		const rows = lines.map(line => line.split(',').map(cell => cell.trim()));
		parseImportData(rows);
	}

	function clearFileUpload() {
		uploadedFileName = '';
		parsedTrainings = [];
		importErrors = [];
		if (fileInput) fileInput.value = '';
	}

	async function handleImport() {
		if (parsedTrainings.length === 0) return;

		isImporting = true;
		try {
			await onBulkAdd(parsedTrainings);
			parsedTrainings = [];
			importErrors = [];
			importText = '';
			uploadedFileName = '';
		} finally {
			isImporting = false;
		}
	}

	function getPersonDisplay(personnelId: string): string {
		const person = personnel.find(p => p.id === personnelId);
		return person ? `${person.rank} ${person.lastName}, ${person.firstName}` : 'Unknown';
	}

	function getTrainingDisplay(trainingTypeId: string): string {
		const type = trainingTypes.find(t => t.id === trainingTypeId);
		return type?.name ?? 'Unknown';
	}

	$effect(() => {
		if (importText && !uploadedFileName) {
			parseTextInput();
		}
	});
</script>

<div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="bulk-training-title" tabindex="-1" onkeydown={(e) => e.key === 'Escape' && onClose()}>
	<button class="modal-backdrop" onclick={onClose} tabindex="-1" aria-label="Close dialog"></button>
	<div class="modal bulk-modal" role="document">
		<div class="modal-header">
			<h2 id="bulk-training-title">Bulk Training Import</h2>
			<button class="btn btn-secondary btn-sm close-btn" onclick={onClose} aria-label="Close">&times;</button>
		</div>

		<div class="modal-body">
			<div class="info-box">
				<h4>Available Training Types</h4>
				<div class="type-chips">
					{#each trainingTypes as type}
						<span class="type-chip" style="background-color: {type.color}" title={type.expirationMonths === null ? 'Accepts yes/no' : `Expires in ${type.expirationMonths} months`}>
							{type.name}{type.expirationMonths === null ? ' *' : ''}
						</span>
					{/each}
				</div>
				<p class="type-hint">* = accepts "yes/no" instead of date (never expires)</p>
				{#if trainingTypes.length === 0}
					<p class="warning">No training types defined. Please add training types first.</p>
				{/if}
			</div>

			<!-- File Upload -->
			<div class="upload-section">
				<h4>Upload File</h4>
				<p class="hint">Upload an Excel (.xlsx, .xls) or CSV file</p>
				<div class="upload-row">
					<input
						type="file"
						accept=".xlsx,.xls,.csv"
						onchange={handleFileUpload}
						bind:this={fileInput}
						class="file-input"
						id="trainingFileUpload"
					/>
					<label for="trainingFileUpload" class="btn btn-secondary upload-btn">
						<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
							<path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd" />
						</svg>
						Choose File
					</label>
					{#if uploadedFileName}
						<span class="file-name">{uploadedFileName}</span>
						<button class="btn btn-secondary btn-sm" onclick={clearFileUpload}>Clear</button>
					{/if}
				</div>
				<p class="format-hint">Columns: Last Name, First Name, Training Type, Completion Date or "yes" (for non-expiring trainings), Notes (optional)</p>
			</div>

			<div class="divider">
				<span>or paste text</span>
			</div>

			<div class="format-info">
				<h4>Paste Data</h4>
				<p>One training record per line, comma-separated:</p>
				<code>Last Name, First Name, Training Type, Date (YYYY-MM-DD or MM/DD/YYYY)</code>
				<p class="hint">For trainings that don't expire, use "yes" or "no" instead of a date</p>
			</div>

			<div class="example-box">
				<div class="example-header">
					<span>Example</span>
					<button class="btn btn-secondary btn-sm" onclick={() => { importText = exampleFormat; uploadedFileName = ''; }}>
						Use Example
					</button>
				</div>
				<pre>{exampleFormat}</pre>
			</div>

			<div class="form-group">
				<label class="label" for="trainingImportText">Training Data</label>
				<textarea
					id="trainingImportText"
					class="input import-textarea"
					bind:value={importText}
					placeholder="Paste training data here..."
					rows="5"
					disabled={!!uploadedFileName}
				></textarea>
			</div>

			{#if importErrors.length > 0}
				<div class="warnings-box">
					<div class="warnings-header">
						<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
							<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
						</svg>
						Warnings ({importErrors.length})
					</div>
					<ul>
						{#each importErrors.slice(0, 10) as error}
							<li>{error}</li>
						{/each}
						{#if importErrors.length > 10}
							<li>... and {importErrors.length - 10} more</li>
						{/if}
					</ul>
				</div>
			{/if}

			{#if parsedTrainings.length > 0}
				<div class="preview-box">
					<div class="preview-header">
						<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
							<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
						</svg>
						Ready to Import ({parsedTrainings.length})
					</div>
					<div class="preview-list">
						{#each parsedTrainings.slice(0, 20) as training}
							<div class="preview-item">
								<span class="preview-person">{getPersonDisplay(training.personnelId)}</span>
								<span class="preview-training">{getTrainingDisplay(training.trainingTypeId)}</span>
								<span class="preview-date">{training.completionDate}</span>
							</div>
						{/each}
						{#if parsedTrainings.length > 20}
							<div class="preview-more">... and {parsedTrainings.length - 20} more</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>

		<div class="modal-footer">
			<button class="btn btn-secondary" onclick={onClose}>Cancel</button>
			<button
				class="btn btn-primary"
				onclick={handleImport}
				disabled={parsedTrainings.length === 0 || isImporting}
			>
				{isImporting ? 'Importing...' : `Import ${parsedTrainings.length} Records`}
			</button>
		</div>
	</div>
</div>

<style>
	.bulk-modal {
		width: 650px;
		max-width: 95vw;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
	}

	.close-btn {
		font-size: 1.25rem;
		line-height: 1;
		padding: var(--spacing-xs) var(--spacing-sm);
	}

	.modal-body {
		flex: 1;
		overflow-y: auto;
		padding: var(--spacing-lg);
	}

	.info-box {
		margin-bottom: var(--spacing-md);
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

	.warning {
		color: #dc2626;
		font-size: var(--font-size-sm);
		margin: var(--spacing-sm) 0 0;
	}

	.type-hint {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		margin: var(--spacing-sm) 0 0;
		font-style: italic;
	}

	.upload-section {
		margin-bottom: var(--spacing-md);
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

	.file-name {
		font-size: var(--font-size-sm);
		color: var(--color-text);
		padding: var(--spacing-xs) var(--spacing-sm);
		background: var(--color-surface);
		border-radius: var(--radius-sm);
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.format-hint {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		margin: 0;
	}

	.hint {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin: 0 0 var(--spacing-sm);
	}

	.divider {
		display: flex;
		align-items: center;
		margin: var(--spacing-lg) 0;
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

	.format-info {
		margin-bottom: var(--spacing-md);
	}

	.format-info h4 {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: var(--spacing-xs);
	}

	.format-info p {
		margin: var(--spacing-xs) 0;
		color: var(--color-text);
	}

	.format-info code {
		display: inline-block;
		padding: var(--spacing-xs) var(--spacing-sm);
		background: var(--color-bg);
		border-radius: var(--radius-sm);
		font-family: monospace;
		font-size: var(--font-size-sm);
		color: var(--color-text);
	}

	.example-box {
		background: var(--color-bg);
		border-radius: var(--radius-md);
		padding: var(--spacing-sm) var(--spacing-md);
		margin-bottom: var(--spacing-md);
	}

	.example-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-xs);
	}

	.example-box pre {
		margin: 0;
		font-family: monospace;
		font-size: var(--font-size-sm);
		white-space: pre-wrap;
		color: var(--color-text);
	}

	.import-textarea {
		font-family: monospace;
		font-size: var(--font-size-sm);
		resize: vertical;
		color: var(--color-text);
	}

	.warnings-box {
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: var(--radius-md);
		padding: var(--spacing-sm) var(--spacing-md);
		margin-bottom: var(--spacing-md);
	}

	:global([data-theme='dark']) .warnings-box {
		background: #450a0a;
		border-color: #7f1d1d;
	}

	.warnings-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-weight: 600;
		color: #dc2626;
		margin-bottom: var(--spacing-xs);
	}

	:global([data-theme='dark']) .warnings-header {
		color: #fca5a5;
	}

	.warnings-box ul {
		margin: 0;
		padding-left: var(--spacing-lg);
		font-size: var(--font-size-sm);
		color: #b91c1c;
	}

	:global([data-theme='dark']) .warnings-box ul {
		color: #fca5a5;
	}

	.preview-box {
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		border-radius: var(--radius-md);
		padding: var(--spacing-sm) var(--spacing-md);
	}

	:global([data-theme='dark']) .preview-box {
		background: #052e16;
		border-color: #166534;
	}

	.preview-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-weight: 600;
		color: #22c55e;
		margin-bottom: var(--spacing-xs);
	}

	.preview-list {
		max-height: 200px;
		overflow-y: auto;
	}

	.preview-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-xs) 0;
		font-size: var(--font-size-sm);
		border-bottom: 1px solid rgba(0, 0, 0, 0.05);
		color: var(--color-text);
	}

	:global([data-theme='dark']) .preview-item {
		border-bottom-color: rgba(255, 255, 255, 0.1);
	}

	.preview-item:last-child {
		border-bottom: none;
	}

	.preview-person {
		flex: 1;
		font-weight: 500;
	}

	.preview-training {
		color: var(--color-primary);
		font-weight: 500;
	}

	.preview-date {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}

	.preview-more {
		padding: var(--spacing-xs) 0;
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		font-style: italic;
	}
</style>
