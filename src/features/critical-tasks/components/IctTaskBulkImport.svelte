<script lang="ts">
	import * as BulkImportWorkspace from '$lib/components/patterns/bulk-import-workspace';
	import { Button } from '$lib/components/ui/button';
	import * as DataTable from '$lib/components/ui/data-table';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as NativeSelect from '$lib/components/ui/native-select';
	import type { ColumnDef } from '$lib/components/ui/data-table';
	import type { BulkImportRowStatus } from '$lib/components/patterns/bulk-import-workspace';
	import { autoMapColumns, detectHeaderRow, type ColumnDef as ImportColumnDef } from '$lib/utils/columnMapping';
	import { parseFile } from '$lib/utils/csvParser';
	import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';
	import { requestCriticalTasksWorkspaceRefresh } from '$features/critical-tasks/criticalTasksWorkspaceStatus.svelte';
	import type { IctTaskBatchImportError } from '$features/critical-tasks/contracts';
	import ImportRowIssues from './ImportRowIssues.svelte';
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
	let importResult = $state<{
		created: number;
		updated: number;
		restored: number;
		failed: number;
		unconfirmed: number;
		notAttempted: number;
	} | null>(null);
	let importFailures = $state<IctTaskBatchImportError[]>([]);
	let importUnconfirmed = $state<IctTaskBatchImportError[]>([]);
	let importNotAttempted = $state<IctTaskBatchImportError[]>([]);
	let selectionInitialized = $state(false);

	type PreviewRow = {
		rowNumber: number;
		values: Record<string, string>;
		validation: RowValidation;
	};

	type RowValidation = {
		valid: boolean;
		cellErrors: Record<string, string>;
		cellWarnings: Record<string, string>;
	};

	const previewRows = $derived.by<PreviewRow[]>(() => buildPreviewRows(rawRows, ICT_TASK_IMPORT_COLUMNS, importMode));
	const validationSummary = $derived.by(() => {
		const invalidCount = previewRows.filter((row) => !row.validation.valid).length;
		const warningCount = previewRows.filter((row) => Object.keys(row.validation.cellWarnings).length > 0).length;
		return { invalidCount, warningCount };
	});
	const previewColumns: ColumnDef<PreviewRow>[] = ICT_TASK_IMPORT_COLUMNS.map((column) => ({
		key: column.key,
		header: column.label,
		value: (row) => row.values[column.key] ?? '',
		searchValue: (row) => row.values[column.key] ?? ''
	}));
	const selection = DataTable.useDataTableSelection<PreviewRow>({
		rows: () => previewRows,
		rowKey: (row) => row.rowNumber,
		disabledRow: (row) => !row.validation.valid
	});

	$effect(() => {
		rawRows;
		importMode;
		selection.clear();
		selectionInitialized = false;
	});

	$effect(() => {
		if (step !== 'preview' || selectionInitialized) return;
		selection.toggleAllPageRows(true);
		selectionInitialized = true;
	});

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

	function buildPreviewRows(raw: string[][], columnDefs: ImportColumnDef[], mode: IctTaskImportMode): PreviewRow[] {
		if (raw.length === 0) return [];
		const hasHeaders = detectHeaderRow(raw[0], columnDefs);
		const mappings = autoMapColumns(raw[0], columnDefs, hasHeaders).filter(
			(mapping): mapping is NonNullable<typeof mapping> => !!mapping
		);
		const dataRows = hasHeaders ? raw.slice(1) : raw;
		const rows = dataRows.map((row, rowIndex) => {
			const values: Record<string, string> = {};
			for (const mapping of mappings) {
				if (mapping.fieldKey && mapping.columnIndex < row.length) {
					values[mapping.fieldKey] = (row[mapping.columnIndex] ?? '').trim();
				}
			}
			return {
				rowNumber: rowIndex + (hasHeaders ? 2 : 1),
				values
			};
		});
		const review = reviewMappedIctTaskImportRows(
			rows.map((row) => ({
				rowNumber: row.rowNumber,
				values: row.values
			})),
			{
				existingTasks: tasks,
				mode,
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
			const invalidRow = invalidByRow.get(row.rowNumber);
			if (!invalidRow) {
				const cellWarnings: Record<string, string> = restoreByRow.has(row.rowNumber)
					? { taskCode: restoreByRow.get(row.rowNumber) ?? '' }
					: {};

				return {
					rowNumber: row.rowNumber,
					values: row.values,
					validation: {
						valid: true,
						cellErrors: {},
						cellWarnings
					}
				};
			}

			const cellErrors: Record<string, string> = {};
			for (const error of invalidRow.errors) {
				cellErrors[mapErrorToField(error)] = error;
			}

			return {
				rowNumber: row.rowNumber,
				values: row.values,
				validation: { valid: false, cellErrors, cellWarnings: {} }
			};
		});
	}

	function rowStatus(row: PreviewRow): BulkImportRowStatus {
		if (!row.validation.valid) {
			return { tone: 'error', label: 'Error', description: Object.values(row.validation.cellErrors).join('; ') };
		}
		if (Object.keys(row.validation.cellWarnings).length > 0) {
			return { tone: 'warning', label: 'Review', description: Object.values(row.validation.cellWarnings).join('; ') };
		}
		return { tone: 'valid', label: 'Ready' };
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

	function issueRows(rows: IctTaskBatchImportError[]) {
		return rows.map((row) => ({
			rowNumber: row.rowNumber,
			details: [`${row.taskCode || 'No task code'}${row.title ? ` - ${row.title}` : ''}`],
			message: row.message
		}));
	}

	function handleBack() {
		step = 'input';
		rawRows = [];
		uploadedFileName = '';
		importError = '';
	}

	async function handleImport() {
		const checkedRows = selection.selectedRows.map((row) => ({
			rowNumber: row.rowNumber,
			values: row.values
		}));
		if (checkedRows.length === 0) return;

		step = 'importing';
		importError = '';

		try {
			if (importMode === 'upsert') requestCriticalTasksWorkspaceRefresh();
			const result = await ictTasksStore.importBatch({
				mode: importMode,
				records: checkedRows
			});
			importResult = {
				created: result.inserted.length,
				updated: result.updated.length,
				restored: result.restored.length,
				failed: result.errors.length,
				unconfirmed: result.unconfirmed.length,
				notAttempted: result.notAttempted.length
			};
			importFailures = result.errors;
			importUnconfirmed = result.unconfirmed;
			importNotAttempted = result.notAttempted;
			if (result.unconfirmed.length > 0) requestCriticalTasksWorkspaceRefresh();
			step = 'results';
		} catch (error) {
			importError = error instanceof Error ? error.message : 'Failed to import ICT tasks';
			step = 'preview';
		}
	}
</script>

<BulkImportWorkspace.Root ariaLabel="ICT task import workspace" {step}>
	{#if step === 'input'}
		<div class="flex flex-col gap-4 rounded-lg border bg-card p-5 text-card-foreground">
			<div class="flex flex-wrap justify-between gap-4 border-b pb-4">
				<div>
					<p class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Step 1</p>
					<h2 class="text-lg font-semibold">Import ICT Tasks</h2>
					<p class="text-sm text-muted-foreground">
						Upload a spreadsheet, review the rows in a table, then import only the checked items.
					</p>
				</div>
				<div class="flex flex-wrap items-start gap-2">
					<span class="rounded-md border bg-muted px-3 py-2 text-xs text-muted-foreground"
						>Required: Task Code, Title</span
					>
					<span class="rounded-md border bg-muted px-3 py-2 text-xs text-muted-foreground"
						>Optional: Description, Category, MOS, Expiration Months, Sort Order</span
					>
				</div>
			</div>

			<div class="grid gap-4 md:grid-cols-2">
				<Field.Root>
					<Field.Label for="ict-task-import-mode">Import behavior</Field.Label>
					<NativeSelect.Root id="ict-task-import-mode" value={importMode} onchange={handleImportModeChange}>
						<NativeSelect.Option value="create-only">Create new tasks only</NativeSelect.Option>
						<NativeSelect.Option value="upsert">Create, update, or restore by task code</NativeSelect.Option>
					</NativeSelect.Root>
				</Field.Root>

				<Field.Root>
					<Field.Label for="ict-task-import-file">Upload file</Field.Label>
					<Input
						id="ict-task-import-file"
						type="file"
						accept=".csv,.xlsx"
						aria-label="Upload file"
						onchange={handleFileUpload}
					/>
					<Field.Description>CSV and XLSX files are accepted.</Field.Description>
				</Field.Root>
			</div>

			{#if importError}
				<BulkImportWorkspace.ValidationSummary
					issues={[{ label: 'errors', count: 1, tone: 'error' }]}
					description={importError}
					role="alert"
				/>
			{/if}

			<div class="flex flex-wrap justify-end gap-2">
				<Button variant="outline" size="sm" type="button" onclick={onCancel}>Cancel</Button>
			</div>
		</div>
	{:else if step === 'preview'}
		<div class="flex flex-col gap-4 rounded-lg border bg-card p-5 text-card-foreground">
			<div class="flex flex-wrap justify-between gap-4 border-b pb-4">
				<div>
					<p class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Step 2</p>
					<h2 class="text-lg font-semibold">Review Import</h2>
					<p class="text-sm text-muted-foreground">Only checked rows without errors will import.</p>
				</div>
				<div class="flex flex-wrap items-start gap-2">
					<span class="rounded-md border bg-muted px-3 py-2 text-xs text-muted-foreground">{uploadedFileName}</span>
					<Field.Root class="min-w-56">
						<Field.Label for="ict-task-import-preview-mode">Import behavior</Field.Label>
						<NativeSelect.Root id="ict-task-import-preview-mode" value={importMode} onchange={handleImportModeChange}>
							<NativeSelect.Option value="create-only">Create new tasks only</NativeSelect.Option>
							<NativeSelect.Option value="upsert">Create, update, or restore by task code</NativeSelect.Option>
						</NativeSelect.Root>
					</Field.Root>
					{#if importMode === 'upsert'}
						<span class="rounded-md border bg-muted px-3 py-2 text-xs text-muted-foreground"
							>Rows tagged in amber will restore archived tasks.</span
						>
					{/if}
				</div>
			</div>

			<BulkImportWorkspace.ValidationSummary
				issues={[
					{ label: 'ready', count: previewRows.length - validationSummary.invalidCount, tone: 'neutral' },
					{
						label: 'errors',
						count: validationSummary.invalidCount,
						tone: validationSummary.invalidCount > 0 ? 'error' : 'neutral'
					},
					{
						label: 'warnings',
						count: validationSummary.warningCount,
						tone: validationSummary.warningCount > 0 ? 'warning' : 'neutral'
					}
				]}
				description={`${selection.selectedCount} rows selected for import.`}
			/>

			<BulkImportWorkspace.PreviewTable
				rows={previewRows}
				columns={previewColumns}
				ariaLabel="ICT task import preview"
				{selection}
				rowKey={(row) => row.rowNumber}
				disabledRow={(row) => !row.validation.valid}
				{rowStatus}
				selectedCountLabel={(selected, total) => `${selected} of ${total} rows selected`}
			/>

			{#if importError}
				<BulkImportWorkspace.ValidationSummary
					issues={[
						{ label: 'ready', count: previewRows.length - validationSummary.invalidCount, tone: 'neutral' },
						{ label: 'errors', count: validationSummary.invalidCount + 1, tone: 'error' },
						{
							label: 'warnings',
							count: validationSummary.warningCount,
							tone: validationSummary.warningCount > 0 ? 'warning' : 'neutral'
						}
					]}
					description={importError}
					role="alert"
				/>
			{/if}

			<div class="flex flex-wrap justify-end gap-2">
				<Button variant="outline" size="sm" type="button" onclick={handleBack}>Back</Button>
				<Button variant="outline" size="sm" type="button" onclick={onCancel}>Cancel</Button>
				<Button size="sm" type="button" onclick={handleImport} disabled={selection.selectedCount === 0}>
					Import Checked Rows
				</Button>
			</div>
		</div>
	{:else if step === 'importing'}
		<BulkImportWorkspace.ProgressState title="Importing ICT tasks..." description="Do not close this panel." />
	{:else if importResult}
		<div class="flex flex-col gap-4 rounded-lg border bg-card p-5 text-card-foreground">
			<div class="flex flex-wrap justify-between gap-4 border-b pb-4">
				<div>
					<p class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Complete</p>
					<h2 class="text-lg font-semibold">
						{importResult.unconfirmed + importResult.notAttempted > 0 ? 'Import Stopped' : 'Import Finished'}
					</h2>
				</div>
				<div class="flex flex-wrap items-start gap-2">
					<span class="rounded-md border bg-muted px-3 py-2 text-xs text-muted-foreground"
						>{importResult.created} created</span
					>
					<span class="rounded-md border bg-muted px-3 py-2 text-xs text-muted-foreground"
						>{importResult.updated} updated</span
					>
					<span class="rounded-md border bg-muted px-3 py-2 text-xs text-muted-foreground"
						>{importResult.restored} restored</span
					>
					<span class="rounded-md border bg-muted px-3 py-2 text-xs text-muted-foreground"
						>{importResult.failed} failed</span
					>
					{#if importResult.unconfirmed > 0}
						<span class="rounded-md border bg-muted px-3 py-2 text-xs text-muted-foreground"
							>{importResult.unconfirmed} not confirmed</span
						>
					{/if}
					{#if importResult.notAttempted > 0}
						<span class="rounded-md border bg-muted px-3 py-2 text-xs text-muted-foreground"
							>{importResult.notAttempted} not imported</span
						>
					{/if}
				</div>
			</div>

			<ImportRowIssues issues={issueRows(importFailures)} />
			<ImportRowIssues
				heading="Not confirmed"
				guidance="These rows may or may not have been saved. Reload to check them before importing them again."
				issues={issueRows(importUnconfirmed)}
			/>
			<ImportRowIssues
				heading="Not imported"
				guidance="These rows were not sent because the import stopped. Import them again when ready."
				issues={issueRows(importNotAttempted)}
			/>

			<div class="flex flex-wrap justify-end gap-2">
				<Button size="sm" type="button" onclick={onDone}>Done</Button>
			</div>
		</div>
	{/if}
</BulkImportWorkspace.Root>
