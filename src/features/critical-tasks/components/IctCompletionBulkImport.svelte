<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import BulkImportTable, { type RowValidation } from '$lib/components/ui/BulkImportTable.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { parseFile } from '$lib/utils/csvParser';
	import { personnelIctCompletionsStore } from '$features/critical-tasks/stores/personnelIctCompletions.svelte';
	import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
	import type { Personnel } from '$lib/types';
	import {
		ICT_COMPLETION_IMPORT_COLUMNS,
		reviewIctCompletionImportRows,
		reviewMappedIctCompletionImportRows,
		type IctCompletionImportMappedRow
	} from '$features/critical-tasks/utils/ictCompletionImport';

	interface Props {
		personnel: Personnel[];
		tasks: IctTask[];
		completions: PersonnelIctCompletion[];
		onCancel: () => void;
		onDone: () => void;
	}

	let { personnel, tasks, completions, onCancel, onDone }: Props = $props();

	type Step = 'input' | 'preview' | 'importing' | 'results';
	type ReviewGroup = 'ready' | 'ambiguous' | 'invalid';

	let step = $state<Step>('input');
	let rawRows = $state<string[][]>([]);
	let previewRows = $state<IctCompletionImportMappedRow[]>([]);
	let uploadedFileName = $state('');
	let importError = $state('');
	let importResult = $state<{ created: number; updated: number; failed: number } | null>(null);
	let importFailures = $state<Array<{ rowNumber: number; personnelName: string; taskCode: string; message: string }>>(
		[]
	);
	let activeReviewGroup = $state<ReviewGroup>('ready');
	let reviewGroupInitialized = $state(false);
	let tableRef = $state<ReturnType<typeof BulkImportTable>>();

	function getReviewOptions() {
		return {
			personnel,
			tasks,
			existingCompletions: completions
		};
	}

	const previewReview = $derived.by(() =>
		previewRows.length > 0
			? reviewMappedIctCompletionImportRows(previewRows, getReviewOptions())
			: reviewIctCompletionImportRows(rawRows, getReviewOptions())
	);

	$effect(() => {
		if (step !== 'preview') return;

		if (!reviewGroupInitialized) {
			activeReviewGroup = getPreferredReviewGroup(previewReview);
			reviewGroupInitialized = true;
			return;
		}

		const activeGroupRowCount =
			activeReviewGroup === 'ready'
				? previewReview.validRows.length
				: activeReviewGroup === 'ambiguous'
					? previewReview.ambiguousRows.length
					: previewReview.invalidRows.length;

		if (activeGroupRowCount > 0) return;
		activeReviewGroup = getPreferredReviewGroup(previewReview);
	});

	function getPreferredReviewGroup(review = previewReview): ReviewGroup {
		if (review.ambiguousRows.length > 0) return 'ambiguous';
		if (review.invalidRows.length > 0) return 'invalid';
		return 'ready';
	}

	function formatPersonName(person: Personnel): string {
		return [person.rank.trim(), person.firstName.trim(), person.lastName.trim()].filter(Boolean).join(' ');
	}

	function formatImportedPersonName(values: Record<string, string>): string {
		return [values.rank?.trim(), values.firstName?.trim(), values.lastName?.trim()].filter(Boolean).join(' ');
	}

	function formatTaskLabel(taskCode: string, title?: string | null): string {
		const trimmedTitle = title?.trim() ?? '';
		return trimmedTitle ? `${taskCode} ${trimmedTitle}` : taskCode;
	}

	function handleClose() {
		if (step === 'results') {
			onDone();
			return;
		}

		onCancel();
	}

	function mapErrorToField(message: string): string {
		if (message.startsWith('First name')) return 'firstName';
		if (message.startsWith('Last name')) return 'lastName';
		if (message.startsWith('Completion date')) return 'completedAt';
		if (message.startsWith('Validation method')) return 'validationMethod';
		if (message.startsWith('Personnel record') || message.startsWith('Multiple personnel records')) {
			return 'lastName';
		}
		return 'taskCode';
	}

	function buildTableValidations(
		rows: Array<{ rowIndex: number; sourceRowNumber: number; values: Record<string, string> }>
	): RowValidation[] {
		const review = reviewMappedIctCompletionImportRows(
			rows.map((row) => ({
				rowNumber: row.sourceRowNumber,
				values: row.values
			})),
			getReviewOptions()
		);
		const invalidByRow = new Map([
			...review.invalidRows.map((row) => [row.rowNumber, row] as const),
			...review.ambiguousRows.map((row) => [row.rowNumber, row] as const)
		]);

		return rows.map((row) => {
			const problemRow = invalidByRow.get(row.sourceRowNumber);
			if (!problemRow) {
				return {
					valid: true,
					cellErrors: {},
					cellWarnings: {}
				};
			}

			const cellErrors: Record<string, string> = {};
			for (const error of problemRow.errors) {
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
			const parsedRows = await parseFile(file);
			rawRows = parsedRows;
			previewRows = [];
			activeReviewGroup = 'ready';
			reviewGroupInitialized = false;
			step = 'preview';
		} catch {
			rawRows = [];
			previewRows = [];
			uploadedFileName = '';
			importError = 'Unable to parse that file. Upload a CSV or spreadsheet and try again.';
		} finally {
			input.value = '';
		}
	}

	function handleBack() {
		step = 'input';
		rawRows = [];
		previewRows = [];
		uploadedFileName = '';
		importError = '';
		activeReviewGroup = 'ready';
		reviewGroupInitialized = false;
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
			const result = await personnelIctCompletionsStore.importBatch({
				records: checkedRows
			});
			importResult = {
				created: result.inserted.length,
				updated: result.updated.length,
				failed: result.errors.length
			};
			importFailures = result.errors;
			step = 'results';
		} catch (error) {
			importError = error instanceof Error ? error.message : 'Failed to import critical task completions';
			step = 'preview';
		}
	}
</script>

<Modal
	title="Import ICT Completions"
	onClose={handleClose}
	canClose={step !== 'importing'}
	width="1120px"
	titleId="ict-completion-import-title"
>
	{#if step === 'input'}
		<div class="import-workspace">
			<div class="import-summary">
				<div>
					<p class="summary-eyebrow">Step 1</p>
					<h2>Upload Completion File</h2>
					<p class="summary-copy">
						Upload a CSV or spreadsheet, review the rows in a table, then import only the checked items.
					</p>
				</div>
				<div class="summary-meta">
					<span>Required: First Name, Last Name, Task Code, Completion Date</span>
					<span>Optional: Rank, Validation Method, Validator, Notes</span>
				</div>
			</div>

			<div class="form-field">
				<label for="ict-completion-import-file">Upload file</label>
				<input
					id="ict-completion-import-file"
					type="file"
					class="input"
					accept=".csv,.xls,.xlsx"
					aria-label="Upload file"
					onchange={handleFileUpload}
				/>
				<p class="field-hint">CSV, XLS, and XLSX files are accepted.</p>
			</div>

			{#if importError}
				<p class="text-error" role="alert">{importError}</p>
			{/if}
		</div>
	{:else if step === 'preview'}
		<div class="import-workspace">
			<div class="import-summary">
				<div>
					<p class="summary-eyebrow">Step 2</p>
					<h2>Review Completion Import</h2>
					<p class="summary-copy">Double-click a cell to fix it. Only checked rows without errors will import.</p>
				</div>
				<div class="summary-meta">
					<span>{uploadedFileName}</span>
					<span>{previewReview.validRows.length} ready to import</span>
					<span>{previewReview.ambiguousRows.length} ambiguous</span>
					<span>{previewReview.invalidRows.length} invalid</span>
				</div>
			</div>

			<div class="review-groups" aria-label="Completion import review groups">
				<div class="review-tabs" role="group" aria-label="Completion import row groups">
					<button
						class="review-tab"
						type="button"
						aria-pressed={activeReviewGroup === 'ready'}
						class:active={activeReviewGroup === 'ready'}
						onclick={() => (activeReviewGroup = 'ready')}
					>
						Ready ({previewReview.validRows.length})
					</button>
					<button
						class="review-tab"
						type="button"
						aria-pressed={activeReviewGroup === 'ambiguous'}
						class:active={activeReviewGroup === 'ambiguous'}
						onclick={() => (activeReviewGroup = 'ambiguous')}
					>
						Ambiguous ({previewReview.ambiguousRows.length})
					</button>
					<button
						class="review-tab"
						type="button"
						aria-pressed={activeReviewGroup === 'invalid'}
						class:active={activeReviewGroup === 'invalid'}
						onclick={() => (activeReviewGroup = 'invalid')}
					>
						Invalid ({previewReview.invalidRows.length})
					</button>
				</div>

				<section class="review-panel" aria-live="polite">
					{#if activeReviewGroup === 'ready'}
						<h3>Showing Ready rows</h3>
						{#if previewReview.validRows.length === 0}
							<p class="review-empty">No ready rows to import yet.</p>
						{:else}
							<ul class="review-row-list">
								{#each previewReview.validRows as row (`ready-${row.rowNumber}`)}
									<li class="review-row">
										<div class="review-row-header">
											<strong>Row {row.rowNumber}</strong>
											<span class="review-chip"
												>{row.completionId ? 'Updates existing record' : 'Creates new record'}</span
											>
										</div>
										<p>{formatPersonName(row.personnel)}</p>
										<p>{formatTaskLabel(row.task.taskCode, row.task.title)}</p>
										<p>Completion date: {row.completion.completedAt}</p>
									</li>
								{/each}
							</ul>
						{/if}
					{:else if activeReviewGroup === 'ambiguous'}
						<h3>Showing Ambiguous rows</h3>
						{#if previewReview.ambiguousRows.length === 0}
							<p class="review-empty">No ambiguous rows need review.</p>
						{:else}
							<ul class="review-row-list">
								{#each previewReview.ambiguousRows as row (`ambiguous-${row.rowNumber}`)}
									<li class="review-row">
										<div class="review-row-header">
											<strong>Row {row.rowNumber}</strong>
											<span>{formatImportedPersonName(row.values)}</span>
										</div>
										<p>{formatTaskLabel(row.values.taskCode ?? 'No task code')}</p>
										<ul class="review-errors">
											{#each row.errors as error (`${row.rowNumber}-${error}`)}
												<li>{error}</li>
											{/each}
										</ul>
										{#if row.matches && row.matches.length > 0}
											<p class="review-subheading">Possible matches</p>
											<ul class="review-matches">
												{#each row.matches as match (`${row.rowNumber}-${match.personnelId}`)}
													<li>{match.displayName}</li>
												{/each}
											</ul>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
					{:else}
						<h3>Showing Invalid rows</h3>
						{#if previewReview.invalidRows.length === 0}
							<p class="review-empty">No invalid rows remain.</p>
						{:else}
							<ul class="review-row-list">
								{#each previewReview.invalidRows as row (`invalid-${row.rowNumber}`)}
									<li class="review-row">
										<div class="review-row-header">
											<strong>Row {row.rowNumber}</strong>
											<span>{formatImportedPersonName(row.values) || 'Missing personnel details'}</span>
										</div>
										<p>{formatTaskLabel(row.values.taskCode ?? 'No task code')}</p>
										<ul class="review-errors">
											{#each row.errors as error (`${row.rowNumber}-${error}`)}
												<li>{error}</li>
											{/each}
										</ul>
									</li>
								{/each}
							</ul>
						{/if}
					{/if}
				</section>
			</div>

			<BulkImportTable
				bind:this={tableRef}
				{rawRows}
				columnDefs={ICT_COMPLETION_IMPORT_COLUMNS}
				validateRow={() => ({ valid: true, cellErrors: {}, cellWarnings: {} })}
				validateRows={(rows) => buildTableValidations(rows)}
				onRowsChange={(rows) =>
					(previewRows = rows.map((row) => ({
						rowNumber: row.sourceRowNumber,
						values: row.values
					})))}
			/>

			{#if importError}
				<p class="text-error" role="alert">{importError}</p>
			{/if}
		</div>
	{:else if step === 'importing'}
		<div class="importing-state" aria-live="polite">
			<Spinner size={20} />
			<span>Importing critical task completions...</span>
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
					<span>{importResult.failed} failed</span>
				</div>
			</div>

			{#if importFailures.length > 0}
				<ul class="failure-list">
					{#each importFailures as failure, index (`${failure.rowNumber}-${index}`)}
						<li>
							<strong>Row {failure.rowNumber}</strong>
							<span>{failure.personnelName || 'Unknown person'}</span>
							<span>{failure.taskCode || 'No task code'}</span>
							<span>{failure.message}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

	{#snippet footer()}
		<div class="spacer"></div>
		{#if step === 'input'}
			<button class="btn btn-sm" type="button" onclick={onCancel}>Cancel</button>
		{:else if step === 'preview'}
			<button class="btn btn-sm" type="button" onclick={handleBack}>Back</button>
			<button class="btn btn-sm" type="button" onclick={onCancel}>Cancel</button>
			<button class="btn btn-primary btn-sm" type="button" onclick={handleImport}>Import Checked Rows</button>
		{:else if step === 'results'}
			<button class="btn btn-primary btn-sm" type="button" onclick={onDone}>Done</button>
		{/if}
	{/snippet}
</Modal>

<style>
	.import-workspace {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
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

	.summary-meta span {
		padding: var(--sp-2) var(--sp-3);
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		background: var(--surface-subtle);
		font-size: var(--text-xs);
		color: var(--text-secondary);
	}

	.review-groups {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.review-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.review-tab {
		padding: var(--sp-2) var(--sp-3);
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		background: var(--surface-subtle);
		color: var(--text-secondary);
		font: inherit;
		cursor: pointer;
	}

	.review-tab.active {
		background: var(--surface-panel);
		color: var(--text-primary);
		border-color: var(--border-strong);
	}

	.review-panel {
		padding: var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		background: var(--surface-subtle);
	}

	.review-panel h3,
	.review-row p,
	.review-errors,
	.review-matches,
	.review-empty,
	.review-subheading {
		margin: 0;
	}

	.review-row-list,
	.review-errors,
	.review-matches {
		padding-left: var(--sp-4);
	}

	.review-row-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.review-row {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.review-row-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2);
	}

	.review-chip {
		padding: 2px var(--sp-2);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		border: var(--border-thin);
		font-size: var(--text-xs);
		color: var(--text-secondary);
	}

	.review-subheading {
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		color: var(--text-secondary);
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.importing-state {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-3);
		padding: var(--sp-8);
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

	.spacer {
		flex: 1;
	}
</style>
