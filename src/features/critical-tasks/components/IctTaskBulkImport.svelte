<script lang="ts">
	import BulkImportTable, { type RowValidation } from '$lib/components/ui/BulkImportTable.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { parseFile } from '$lib/utils/csvParser';
	import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';
	import type { IctTask } from '$features/critical-tasks/criticalTasks.types';
	import {
		ICT_TASK_IMPORT_COLUMNS,
		reviewMappedIctTaskImportRows,
		type IctTaskImportMode
	} from '$features/critical-tasks/utils/ictTaskImport';

	interface Props {
		tasks: IctTask[];
		onCancel: () => void;
		onDone: () => void;
	}

	let { tasks, onCancel, onDone }: Props = $props();

	type Step = 'input' | 'preview' | 'importing' | 'results';

	let step = $state<Step>('input');
	let importMode = $state<IctTaskImportMode>('create-only');
	let rawRows = $state<string[][]>([]);
	let uploadedFileName = $state('');
	let importError = $state('');
	let importResult = $state<{ created: number; updated: number; restored: number; failed: number } | null>(null);
	let importFailures = $state<Array<{ rowNumber: number; taskCode: string; title: string; message: string }>>([]);
	let tableRef = $state<ReturnType<typeof BulkImportTable>>();

	function handleImportModeChange(event: Event) {
		importMode = (event.currentTarget as HTMLSelectElement).value as IctTaskImportMode;
	}

	function nextSortOrder(): number {
		if (tasks.length === 0) return 0;
		return Math.max(...tasks.map((task) => task.sortOrder)) + 1;
	}

	function mapErrorToField(message: string): string {
		if (message.startsWith('Title')) return 'title';
		if (message.startsWith('MOS')) return 'mos';
		if (message.startsWith('Expiration months')) return 'expirationMonths';
		return 'taskCode';
	}

	function buildTableValidations(
		rows: Array<{ rowIndex: number; sourceRowNumber: number; values: Record<string, string> }>
	): RowValidation[] {
		const review = reviewMappedIctTaskImportRows(
			rows.map((row) => ({
				rowNumber: row.sourceRowNumber,
				values: row.values
			})),
			{
				existingTasks: tasks,
				mode: importMode,
				nextSortOrder: nextSortOrder()
			}
		);
		const invalidByRow = new Map(review.invalidRows.map((row) => [row.rowNumber, row]));
		const restoreByRow = new Map(
			review.validRows
				.filter((row) => row.restoresArchivedTask)
				.map((row) => [row.rowNumber, 'Will restore archived task'] as const)
		);

		return rows.map((row) => {
			const invalidRow = invalidByRow.get(row.sourceRowNumber);
			if (!invalidRow) {
				const cellWarnings: Record<string, string> = restoreByRow.has(row.sourceRowNumber)
					? { taskCode: restoreByRow.get(row.sourceRowNumber) ?? '' }
					: {};

				return {
					valid: true,
					cellErrors: {},
					cellWarnings
				};
			}

			const cellErrors: Record<string, string> = {};
			for (const error of invalidRow.errors) {
				cellErrors[mapErrorToField(error)] = error;
			}

			return {
				valid: false,
				cellErrors,
				cellWarnings: {}
			};
		});
	}

	async function handleFileUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		importError = '';
		uploadedFileName = file.name;

		try {
			rawRows = await parseFile(file);
			step = 'preview';
		} catch {
			rawRows = [];
			uploadedFileName = '';
			importError = 'Unable to parse that file. Upload a CSV or spreadsheet and try again.';
		} finally {
			input.value = '';
		}
	}

	function handleBack() {
		step = 'input';
		rawRows = [];
		uploadedFileName = '';
		importError = '';
	}

	async function handleImport() {
		if (!tableRef) return;
		const checkedRows = tableRef.getCheckedRowEntries().map((row) => ({
			rowNumber: row.sourceRowNumber,
			values: row.values
		}));
		if (checkedRows.length === 0) return;

		step = 'importing';
		importError = '';

		try {
			const result = await ictTasksStore.importBatch({
				mode: importMode,
				records: checkedRows
			});
			importResult = {
				created: result.inserted.length,
				updated: result.updated.length,
				restored: result.restored.length,
				failed: result.errors.length
			};
			importFailures = result.errors;
			step = 'results';
		} catch (error) {
			importError = error instanceof Error ? error.message : 'Failed to import ICT tasks';
			step = 'preview';
		}
	}
</script>

{#if step === 'input'}
	<div class="import-workspace">
		<div class="import-summary">
			<div>
				<p class="summary-eyebrow">Step 1</p>
				<h2>Import ICT Tasks</h2>
				<p class="summary-copy">
					Upload a spreadsheet, review the rows in a table, then import only the checked items.
				</p>
			</div>
			<div class="summary-meta">
				<span>Required: Task Code, Title</span>
				<span>Optional: Description, MOS, Expiration Months, Sort Order</span>
			</div>
		</div>

		<div class="form-grid">
			<div class="form-field">
				<label for="ict-task-import-mode">Import behavior</label>
				<select id="ict-task-import-mode" class="input" value={importMode} onchange={handleImportModeChange}>
					<option value="create-only">Create new tasks only</option>
					<option value="upsert">Create, update, or restore by task code</option>
				</select>
			</div>

			<div class="form-field">
				<label for="ict-task-import-file">Upload file</label>
				<input
					id="ict-task-import-file"
					type="file"
					class="input"
					accept=".csv,.xls,.xlsx"
					aria-label="Upload file"
					onchange={handleFileUpload}
				/>
				<p class="field-hint">CSV, XLS, and XLSX files are accepted.</p>
			</div>
		</div>

		{#if importError}
			<p class="text-error" role="alert">{importError}</p>
		{/if}

		<div class="actions">
			<button class="btn btn-sm" type="button" onclick={onCancel}>Cancel</button>
		</div>
	</div>
{:else if step === 'preview'}
	<div class="import-workspace">
		<div class="import-summary">
			<div>
				<p class="summary-eyebrow">Step 2</p>
				<h2>Review Import</h2>
				<p class="summary-copy">Double-click a cell to fix it. Only checked rows without errors will import.</p>
			</div>
			<div class="summary-meta">
				<span>{uploadedFileName}</span>
				<div class="summary-control">
					<label for="ict-task-import-preview-mode">Import behavior</label>
					<select id="ict-task-import-preview-mode" class="input" value={importMode} onchange={handleImportModeChange}>
						<option value="create-only">Create new tasks only</option>
						<option value="upsert">Create, update, or restore by task code</option>
					</select>
				</div>
				{#if importMode === 'upsert'}
					<span>Rows tagged in amber will restore archived tasks.</span>
				{/if}
			</div>
		</div>

		<BulkImportTable
			bind:this={tableRef}
			{rawRows}
			columnDefs={ICT_TASK_IMPORT_COLUMNS}
			validateRow={() => ({ valid: true, cellErrors: {}, cellWarnings: {} })}
			validateRows={(rows) => buildTableValidations(rows)}
		/>

		{#if importError}
			<p class="text-error" role="alert">{importError}</p>
		{/if}

		<div class="actions">
			<button class="btn btn-sm" type="button" onclick={handleBack}>Back</button>
			<button class="btn btn-sm" type="button" onclick={onCancel}>Cancel</button>
			<button class="btn btn-primary btn-sm" type="button" onclick={handleImport}>Import Checked Rows</button>
		</div>
	</div>
{:else if step === 'importing'}
	<div class="importing-state" aria-live="polite">
		<Spinner size={20} />
		<span>Importing ICT tasks...</span>
	</div>
{:else if importResult}
	<div class="import-workspace">
		<div class="import-summary">
			<div>
				<p class="summary-eyebrow">Complete</p>
				<h2>Import Finished</h2>
			</div>
			<div class="summary-meta">
				<span>{importResult.created} created</span>
				<span>{importResult.updated} updated</span>
				<span>{importResult.restored} restored</span>
				<span>{importResult.failed} failed</span>
			</div>
		</div>

		{#if importFailures.length > 0}
			<ul class="failure-list">
				{#each importFailures as failure, index (`${failure.rowNumber}-${index}`)}
					<li>
						<strong>Row {failure.rowNumber}</strong>
						<span>{failure.taskCode || 'No task code'} {failure.title ? `- ${failure.title}` : ''}</span>
						<span>{failure.message}</span>
					</li>
				{/each}
			</ul>
		{/if}

		<div class="actions">
			<button class="btn btn-primary btn-sm" type="button" onclick={onDone}>Done</button>
		</div>
	</div>
{/if}

<style>
	.import-workspace {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		padding: var(--sp-5);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	.import-summary {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: var(--sp-4);
		padding-bottom: var(--sp-4);
		border-bottom: var(--border-thin);
	}

	.import-summary h2,
	.summary-copy,
	.field-hint,
	.failure-list {
		margin: 0;
	}

	.summary-eyebrow {
		margin: 0 0 var(--sp-1);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.summary-meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		align-items: flex-start;
	}

	.summary-control {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.summary-control label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.summary-control select {
		min-width: 14rem;
	}

	.summary-meta span {
		padding: var(--sp-2) var(--sp-3);
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		background: var(--surface-subtle);
		font-size: var(--text-xs);
		color: var(--text-secondary);
	}

	.form-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--sp-4);
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		justify-content: flex-end;
	}

	.importing-state {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-3);
		padding: var(--sp-8);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	.failure-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		padding-left: var(--sp-4);
	}

	.failure-list li {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	@media (max-width: 720px) {
		.form-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
