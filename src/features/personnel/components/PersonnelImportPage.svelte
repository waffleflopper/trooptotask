<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { Group } from '$lib/stores/groups.svelte';
	import { ALL_RANKS } from '$lib/types';
	import type { Personnel } from '$lib/types';
	import * as BulkImportWorkspace from '$lib/components/ui/bulk-import-workspace';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as NativeSelect from '$lib/components/ui/native-select';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import {
		PERSONNEL_COLUMNS,
		autoMapColumns,
		detectHeaderRow,
		getMissingRequired,
		type ColumnDef as ImportColumnDef,
		type ColumnMapping
	} from '$lib/utils/columnMapping';
	import { parseFile } from '$lib/utils/csvParser';
	import { useDataTableSelection, type ColumnDef as DataTableColumnDef } from '$lib/components/ui/data-table';
	import { tick } from 'svelte';
	import AlertCircleIcon from '@lucide/svelte/icons/alert-circle';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

	interface Props {
		orgId: string;
		orgUrlSegment?: string;
		groups: Group[];
		personnel?: Personnel[];
		readOnly?: boolean;
	}

	let { orgId, orgUrlSegment = orgId, groups, personnel = [], readOnly = false }: Props = $props();

	type ImportState = 'input' | 'preview' | 'importing' | 'results';

	interface RowValidation {
		valid: boolean;
		cellErrors: Record<string, string>;
		cellWarnings: Record<string, string>;
	}

	interface PreviewRow {
		id: string;
		rowIndex: number;
		sourceRowNumber: number;
		values: Record<string, string>;
		validation: RowValidation;
	}

	interface CheckedRowEntry {
		rowIndex: number;
		sourceRowNumber: number;
		values: Record<string, string>;
	}

	interface ImportResult {
		insertedCount: number;
		errors: Array<{ index: number; message: string }>;
		capError?: string;
	}

	const TEMPLATE_HEADERS = 'Rank, Last Name, First Name, MOS, Duty Role, Group, ETS, PCS / DEROS';
	const SAMPLE_ROW = 'SGT, Smith, John, 68W, Medic, Alpha Team, 2027-05-01, 2026-11-30';

	let importStep = $state<ImportState>('input');
	let fileRows = $state<string[][]>([]);
	let uploadedFiles = $state<FileList>();
	let uploadedFileName = $state('');
	let importError = $state('');
	let importResult = $state<ImportResult | null>(null);
	let runningImport = $state(false);
	let editableRows = $state<string[][]>([]);
	let userOverrides = $state<Record<number, string | null>>({});
	let lastSubmittedEntries = $state<CheckedRowEntry[]>([]);

	const rawRows = $derived(fileRows);
	const rosterPath = $derived(resolve(`/org/${orgUrlSegment}/personnel`));
	const hasHeaders = $derived(rawRows.length > 0 ? detectHeaderRow(rawRows[0], PERSONNEL_COLUMNS) : false);
	const dataRows = $derived(hasHeaders ? rawRows.slice(1) : rawRows);
	const dataRowCount = $derived(dataRows.length);
	const sourceRowNumbers = $derived(dataRows.map((_, index) => index + (hasHeaders ? 2 : 1)));
	const activePersonnelCount = $derived(personnel.filter((person) => !person.archivedAt).length);
	const autoMappings = $derived(rawRows.length > 0 ? autoMapColumns(rawRows[0], PERSONNEL_COLUMNS, hasHeaders) : []);
	const mappings = $derived(
		autoMappings
			.filter((mapping): mapping is ColumnMapping => mapping != null && typeof mapping.columnIndex === 'number')
			.map((mapping) =>
				Object.hasOwn(userOverrides, mapping.columnIndex)
					? { ...mapping, fieldKey: userOverrides[mapping.columnIndex] ?? null }
					: mapping
			)
	);
	const missingRequired = $derived(getMissingRequired(mappings, PERSONNEL_COLUMNS));

	function validateRow(row: Record<string, string>): RowValidation {
		const cellErrors: Record<string, string> = {};
		const cellWarnings: Record<string, string> = {};

		const rank = (row.rank ?? '').trim();
		if (!rank) {
			cellErrors.rank = 'Rank is required';
		} else if (!ALL_RANKS.some((value) => value.toLowerCase() === rank.toLowerCase())) {
			cellErrors.rank = `"${rank}" is not a valid rank. Valid ranks: ${ALL_RANKS.join(', ')}`;
		}

		if (!(row.lastName ?? '').trim()) cellErrors.lastName = 'Last name is required';
		if (!(row.firstName ?? '').trim()) cellErrors.firstName = 'First name is required';

		const groupName = (row.groupName ?? '').trim();
		if (groupName && !groups.some((group) => group.name.toLowerCase() === groupName.toLowerCase())) {
			cellWarnings.groupName = `"${groupName}" does not match a known group and will import as unassigned.`;
		}

		return {
			valid: Object.keys(cellErrors).length === 0,
			cellErrors,
			cellWarnings
		};
	}

	function mapRow(row: string[]): Record<string, string> {
		const values: Record<string, string> = {};
		for (const mapping of mappings) {
			if (mapping.fieldKey && mapping.columnIndex < row.length) {
				values[mapping.fieldKey] = (row[mapping.columnIndex] ?? '').trim();
			}
		}
		return values;
	}

	const previewRows = $derived(
		editableRows.map((row, rowIndex) => {
			const values = mapRow(row);
			return {
				id: `row-${sourceRowNumbers[rowIndex] ?? rowIndex + 1}`,
				rowIndex,
				sourceRowNumber: sourceRowNumbers[rowIndex] ?? rowIndex + 1,
				values,
				validation: validateRow(values)
			};
		})
	);

	const readyCount = $derived(previewRows.filter((row) => row.validation.valid).length);
	const errorCount = $derived(previewRows.filter((row) => !row.validation.valid).length);
	const warningCount = $derived(
		previewRows.filter((row) => row.validation.valid && Object.keys(row.validation.cellWarnings).length > 0).length
	);
	const previewColumns = $derived<DataTableColumnDef<PreviewRow>[]>([
		{ key: 'sourceRowNumber', header: 'Row', value: (row) => row.sourceRowNumber, width: '4rem' },
		...mappings
			.filter((mapping) => mapping.fieldKey)
			.map((mapping) => {
				const field = PERSONNEL_COLUMNS.find((column) => column.key === mapping.fieldKey);
				return {
					key: `field:${mapping.fieldKey}`,
					header: field?.label ?? mapping.fieldKey ?? 'Column',
					value: (row: PreviewRow) => row.values[mapping.fieldKey ?? ''] ?? ''
				};
			})
	]);
	const validationIssues = $derived([
		{ label: 'ready', count: readyCount, tone: 'neutral' as const },
		...(errorCount > 0 ? [{ label: 'errors', count: errorCount, tone: 'error' as const }] : []),
		...(warningCount > 0 ? [{ label: 'warnings', count: warningCount, tone: 'warning' as const }] : []),
		...(missingRequired.length > 0
			? [{ label: 'missing required mappings', count: missingRequired.length, tone: 'error' as const }]
			: [])
	]);

	const selection = useDataTableSelection<PreviewRow>({
		rows: () => previewRows,
		rowKey: (row) => row.id,
		disabledRow: (row) => !row.validation.valid
	});

	function resetSelectionToValidRows() {
		selection.clear();
		previewRows.forEach((row, index) => {
			if (row.validation.valid) selection.toggleRow(row, index, true);
		});
	}

	const submitDisabledReason = $derived(
		selection.selectedCount === 0 ? 'Select at least one valid row to import.' : undefined
	);
	const resultStatus = $derived(
		importResult
			? importResult.insertedCount > 0 && importResult.errors.length > 0
				? 'partial'
				: importResult.insertedCount > 0
					? 'success'
					: 'failed'
			: 'failed'
	);

	function firstError(row: PreviewRow): string | undefined {
		return Object.values(row.validation.cellErrors)[0];
	}

	function firstWarning(row: PreviewRow): string | undefined {
		return Object.values(row.validation.cellWarnings)[0];
	}

	function disabledReason(row: PreviewRow): string | undefined {
		const error = firstError(row);
		return error ? `Resolve row errors: ${error}` : undefined;
	}

	function rowStatus(row: PreviewRow) {
		const error = firstError(row);
		if (error) return { tone: 'error' as const, label: 'Blocked', description: error };

		const warning = firstWarning(row);
		if (warning) return { tone: 'warning' as const, label: 'Warning', description: warning };

		return { tone: 'valid' as const, label: 'Ready', description: 'Ready to import.' };
	}

	function setMapping(colIndex: number, fieldKey: string | null) {
		userOverrides = { ...userOverrides, [colIndex]: fieldKey };
		void tick().then(resetSelectionToValidRows);
	}

	function getAvailableFields(currentColIndex: number): (ImportColumnDef | null)[] {
		const usedKeys = new Set(
			mappings.filter((mapping) => mapping.fieldKey && mapping.columnIndex !== currentColIndex).map((m) => m.fieldKey)
		);
		return [null, ...PERSONNEL_COLUMNS.filter((column) => !usedKeys.has(column.key))];
	}

	function updateCell(row: PreviewRow, fieldKey: string, value: string) {
		const mapping = mappings.find((entry) => entry.fieldKey === fieldKey);
		if (!mapping) return;
		editableRows[row.rowIndex][mapping.columnIndex] = value;
		editableRows = [...editableRows];
		void tick().then(resetSelectionToValidRows);
	}

	async function handleFilesUpload(files: FileList | undefined) {
		const file = files?.[0];
		if (!file) return;

		uploadedFileName = file.name;
		importError = '';
		importResult = null;
		try {
			const parsedRows = await parseFile(file);
			fileRows = parsedRows;
			editableRows = (detectHeaderRow(parsedRows[0] ?? [], PERSONNEL_COLUMNS) ? parsedRows.slice(1) : parsedRows).map(
				(row) => [...row]
			);
			userOverrides = {};
			await tick();
			resetSelectionToValidRows();
		} catch (err) {
			fileRows = [];
			editableRows = [];
			uploadedFileName = '';
			importError = err instanceof Error ? err.message : 'Failed to parse uploaded file';
		}
	}

	function clearFile() {
		uploadedFileName = '';
		uploadedFiles = undefined;
		fileRows = [];
		importError = '';
		importResult = null;
		lastSubmittedEntries = [];
		importStep = 'input';
	}

	function useTemplateHeaders() {
		void navigator.clipboard?.writeText(`${TEMPLATE_HEADERS}\n${SAMPLE_ROW}`);
	}

	function goToPreview() {
		resetSelectionToValidRows();
		importStep = 'preview';
	}

	function backToInput() {
		importStep = 'input';
	}

	function checkedEntries(): CheckedRowEntry[] {
		return selection.selectedRows
			.filter((row) => row.validation.valid)
			.map((row) => ({
				rowIndex: row.rowIndex,
				sourceRowNumber: row.sourceRowNumber,
				values: row.values
			}));
	}

	async function runImport() {
		if (runningImport || selection.selectedCount === 0) return;
		const checkedRows = checkedEntries();
		if (checkedRows.length === 0) return;

		lastSubmittedEntries = checkedRows;
		runningImport = true;
		importStep = 'importing';

		try {
			const response = await fetch(`/org/${orgId}/api/personnel/batch`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ records: checkedRows.map((row) => row.values) })
			});

			const data = await response.json();
			if (response.status === 403 && data.error) {
				importResult = { insertedCount: 0, errors: data.errors ?? [], capError: data.error };
			} else {
				importResult = {
					insertedCount: (data.inserted ?? []).length,
					errors: data.errors ?? []
				};
			}
			importStep = 'results';
		} catch (err) {
			importResult = {
				insertedCount: 0,
				errors: [{ index: -1, message: err instanceof Error ? err.message : 'Network error' }]
			};
			importStep = 'results';
		} finally {
			runningImport = false;
		}
	}

	function sourceRowForError(errorIndex: number): number | undefined {
		if (errorIndex < 0) return undefined;
		return lastSubmittedEntries[errorIndex]?.sourceRowNumber ?? errorIndex + 1;
	}

	function reviewFailedRows() {
		importStep = 'preview';
		const failedKeys = new Set(
			importResult?.errors
				.map((error) => (error.index >= 0 ? lastSubmittedEntries[error.index]?.sourceRowNumber : undefined))
				.filter((rowNumber): rowNumber is number => rowNumber !== undefined)
				.map((rowNumber) => `row-${rowNumber}`)
		);
		selection.clear();
		previewRows.forEach((row, index) => {
			if (failedKeys.has(row.id) && row.validation.valid) selection.toggleRow(row, index, true);
		});
	}

	async function finishImport() {
		await invalidateAll();
		await goto(resolve(`/org/${orgUrlSegment}/personnel`));
	}
</script>

<svelte:head>
	<title>Import Personnel - Troop to Task</title>
</svelte:head>

<main class="flex h-full min-h-0 flex-col overflow-auto bg-background">
	<div class="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-6 py-5 max-sm:px-3">
		<header class="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
			<div class="grid gap-2">
				<Button variant="ghost" size="sm" href={rosterPath} class="w-fit">
					<ArrowLeftIcon aria-hidden="true" />
					Personnel
				</Button>
				<div class="grid gap-1">
					<p class="text-xs font-medium tracking-widest text-muted-foreground uppercase">Personnel import</p>
					<h1 class="text-2xl font-semibold tracking-tight text-foreground">Build the roster from one file</h1>
					<p class="max-w-3xl text-sm leading-relaxed text-muted-foreground">
						Import rank, name, MOS, duty role, group, ETS, and PCS / DEROS together. Review the mapped rows before
						anything is added to the active roster.
					</p>
				</div>
			</div>

			<div class="grid min-w-[220px] grid-cols-2 gap-2 text-sm">
				<div class="rounded-lg border bg-card p-3">
					<div class="text-xs text-muted-foreground">Active roster</div>
					<div class="mt-1 text-lg font-semibold">{activePersonnelCount}</div>
				</div>
				<div class="rounded-lg border bg-card p-3">
					<div class="text-xs text-muted-foreground">Known groups</div>
					<div class="mt-1 text-lg font-semibold">{groups.length}</div>
				</div>
			</div>
		</header>

		{#if readOnly}
			<BulkImportWorkspace.ValidationSummary
				title="Import disabled"
				description="Import is disabled while this organization is read-only."
				issues={[{ label: 'read-only', tone: 'error' }]}
			/>
		{:else if importStep === 'input'}
			<BulkImportWorkspace.Root ariaLabel="Personnel import workspace">
				<BulkImportWorkspace.Header
					step="Step 1"
					title="Upload roster file"
					description="Use an Excel (.xlsx) or CSV file with one row per person."
					meta={[
						{ label: 'Active roster', value: `${activePersonnelCount} active` },
						{ label: 'Known groups', value: `${groups.length} groups` }
					]}
				/>
				<BulkImportWorkspace.InputPanel title="File source" description="CSV and XLSX files are accepted.">
					<BulkImportWorkspace.FileInput
						id="fileUpload"
						bind:files={uploadedFiles}
						label="Upload personnel file"
						accept=".xlsx,.csv"
						error={importError}
						onFilesChange={handleFilesUpload}
					/>
					{#if uploadedFileName}
						<div class="flex items-center justify-between gap-2">
							<span class="truncate font-mono text-xs">{uploadedFileName}</span>
							<Button variant="outline" size="sm" type="button" onclick={clearFile}>Clear</Button>
						</div>
					{/if}

					{#snippet examples()}
						<div class="grid gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
							<h3 class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
								Accepted headers
							</h3>
							<p class="font-mono text-xs text-foreground">{TEMPLATE_HEADERS}</p>
							<p class="text-xs text-muted-foreground">Sample row: {SAMPLE_ROW}</p>
							<p class="border-t border-border pt-2 text-xs text-muted-foreground">
								Unknown groups import as unassigned. Match group names exactly when assignment matters.
							</p>
						</div>
					{/snippet}

					{#snippet actions()}
						<Button variant="outline" size="sm" type="button" onclick={useTemplateHeaders}>Use these headers</Button>
					{/snippet}
				</BulkImportWorkspace.InputPanel>

				<BulkImportWorkspace.FooterActions>
					<Button type="button" onclick={goToPreview} disabled={rawRows.length === 0}>
						Preview {dataRowCount > 0 ? dataRowCount : ''} Rows
					</Button>
				</BulkImportWorkspace.FooterActions>
			</BulkImportWorkspace.Root>
		{:else if importStep === 'preview'}
			{#snippet previewCell(row: PreviewRow, column: DataTableColumnDef<PreviewRow>)}
				{#if column.key === 'sourceRowNumber'}
					<span class="font-mono text-xs text-muted-foreground">{row.sourceRowNumber}</span>
				{:else if column.key.startsWith('field:')}
					{@const fieldKey = column.key.slice('field:'.length)}
					{@const fieldError = row.validation.cellErrors[fieldKey]}
					{@const fieldWarning = row.validation.cellWarnings[fieldKey]}
					{@const fieldIssue = fieldError ?? fieldWarning}
					{@const fieldState = fieldError ? 'error' : fieldWarning ? 'warning' : undefined}
					{#if fieldIssue}
						<span class="relative block min-w-0">
							<Tooltip.Root>
								<Tooltip.Trigger>
									{#snippet child({ props })}
										<Input
											{...props}
											aria-label={`Row ${row.sourceRowNumber} ${column.header}`}
											autocomplete="off"
											spellcheck="false"
											value={row.values[fieldKey] ?? ''}
											aria-invalid={!!fieldError}
											data-cell-state={fieldState}
											title={fieldIssue}
											class={[
												'pr-7',
												fieldState === 'error' &&
													'border-danger/80! bg-danger-muted/70! text-danger-foreground ring-1 ring-danger/45!',
												fieldState === 'warning' &&
													'border-warning/80! bg-warning-muted/80! text-warning-foreground ring-1 ring-warning/45!'
											]}
											onchange={(event) => updateCell(row, fieldKey, event.currentTarget.value)}
										/>
									{/snippet}
								</Tooltip.Trigger>
								<Tooltip.Content side="top" sideOffset={6}>{fieldIssue}</Tooltip.Content>
							</Tooltip.Root>
							<span
								class={[
									'pointer-events-none absolute top-1/2 right-1.5 inline-flex -translate-y-1/2 items-center',
									fieldState === 'error' ? 'text-danger-foreground' : 'text-warning-foreground'
								]}
								aria-hidden="true"
							>
								{#if fieldState === 'error'}
									<AlertCircleIcon class="size-3.5" />
								{:else}
									<TriangleAlertIcon class="size-3.5" />
								{/if}
							</span>
						</span>
					{:else}
						<Input
							aria-label={`Row ${row.sourceRowNumber} ${column.header}`}
							autocomplete="off"
							spellcheck="false"
							value={row.values[fieldKey] ?? ''}
							onchange={(event) => updateCell(row, fieldKey, event.currentTarget.value)}
						/>
					{/if}
				{:else}
					{String(column.value(row) ?? '')}
				{/if}
			{/snippet}

			<Tooltip.Provider>
				<BulkImportWorkspace.Root ariaLabel="Personnel import workspace">
					<BulkImportWorkspace.Header
						step="Step 2"
						title="Review mapped rows"
						description="Only checked rows without errors will be imported."
					/>

					<BulkImportWorkspace.InputPanel title="Column mapping" description="Confirm each file column before import.">
						<div class="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
							{#each mappings as mapping, i (mapping.columnIndex)}
								<label class="grid gap-1">
									<span class="truncate font-mono text-xs text-muted-foreground">
										{rawRows[0]?.[mapping.columnIndex] ?? `Column ${i + 1}`}
									</span>
									<NativeSelect.Root
										class="w-full"
										size="sm"
										value={mapping.fieldKey ?? ''}
										onchange={(event) => setMapping(mapping.columnIndex, event.currentTarget.value || null)}
									>
										{#each getAvailableFields(mapping.columnIndex) as field (field?.key ?? '__skip__')}
											{#if field === null}
												<NativeSelect.Option value="">Skip</NativeSelect.Option>
											{:else}
												<NativeSelect.Option value={field.key}
													>{field.label}{field.required ? ' *' : ''}</NativeSelect.Option
												>
											{/if}
										{/each}
									</NativeSelect.Root>
								</label>
							{/each}
						</div>
					</BulkImportWorkspace.InputPanel>

					<BulkImportWorkspace.ValidationSummary
						title="Review row status"
						description="Warnings can import, errors are blocked until fixed."
						issues={validationIssues}
					/>

					<BulkImportWorkspace.PreviewTable
						rows={previewRows}
						columns={previewColumns}
						{selection}
						rowKey={(row) => row.id}
						disabledRow={(row) => !row.validation.valid}
						{disabledReason}
						{rowStatus}
						statusDescriptionMode="sr-only"
						cellPresentation="editable-grid"
						selectedCountLabel={(selected, total) => `${selected} of ${total} selected`}
						ariaLabel="Personnel import preview"
						cell={previewCell}
					/>

					<BulkImportWorkspace.FooterActions disabledReason={submitDisabledReason}>
						<Button variant="outline" type="button" onclick={backToInput}>Back</Button>
						<Button type="button" onclick={runImport} disabled={runningImport || !!submitDisabledReason}>
							Import checked rows
						</Button>
					</BulkImportWorkspace.FooterActions>
				</BulkImportWorkspace.Root>
			</Tooltip.Provider>
		{:else if importStep === 'importing'}
			<BulkImportWorkspace.ProgressState
				title="Importing personnel records"
				description="Keep this page open while the roster is updated."
			/>
		{:else if importStep === 'results' && importResult}
			{#snippet resultActions()}
				{#if importResult && importResult.errors.length > 0}
					<Button variant="outline" type="button" onclick={reviewFailedRows}>Review failed rows</Button>
					<Button variant="outline" type="button" onclick={clearFile}>Upload another file</Button>
				{/if}
				<Button type="button" onclick={finishImport}>Return to Personnel</Button>
			{/snippet}

			<BulkImportWorkspace.ResultSummary
				status={resultStatus}
				description={importResult.capError ?? 'Review the summary before returning to the roster.'}
				items={[
					{ label: 'Saved', value: importResult.insertedCount, tone: 'success' },
					{
						label: 'Failed',
						value: importResult.errors.length,
						tone: importResult.errors.length > 0 ? 'error' : 'neutral'
					}
				]}
				actions={resultActions}
			>
				{#if importResult.errors.length > 0}
					<ul class="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
						{#each importResult.errors as err (`${err.index}-${err.message}`)}
							<li>
								{#if sourceRowForError(err.index)}Row {sourceRowForError(err.index)}:
								{/if}{err.message}
							</li>
						{/each}
					</ul>
				{/if}
			</BulkImportWorkspace.ResultSummary>
		{/if}
	</div>
</main>
