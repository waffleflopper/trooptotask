<script lang="ts">
	import * as BulkImportWorkspace from '$lib/components/ui/bulk-import-workspace';
	import { Button } from '$lib/components/ui/button';
	import { CalendarStatusBadge } from '$lib/components/ui/calendar-status-badge';
	import * as DataTable from '$lib/components/ui/data-table';
	import type { ColumnDef } from '$lib/components/ui/data-table';
	import type { BulkImportRowStatus } from '$lib/components/ui/bulk-import-workspace';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Textarea } from '$lib/components/ui/textarea';
	import { parseFile, parseCSVText } from '$lib/utils/csvParser';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { autoMapColumns, detectHeaderRow, STATUS_IMPORT_COLUMNS } from '$lib/utils/columnMapping';
	import {
		buildAvailabilityImportPlan,
		buildRosterNameIndex,
		planStatusResolution,
		validateAvailabilityImportRow,
		type AvailabilityImportIssueCode,
		type AvailabilityImportRowValidation,
		type StatusResolution
	} from '$features/calendar/utils/availabilityImport';
	import { availabilityStore } from '$features/calendar/stores/availability.svelte';
	import type { Personnel, StatusType } from '$lib/types';
	import { tick } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';

	interface Props {
		personnel: Personnel[];
		statusTypes: StatusType[];
		onComplete: () => void;
	}

	let { personnel, statusTypes, onComplete }: Props = $props();

	// State machine
	type Step = 'upload' | 'preview' | 'resolve' | 'results';
	let step = $state<Step>('upload');

	// Upload state
	let rawRows = $state<string[][]>([]);
	let pasteText = $state('');
	let parseError = $state('');

	// Resolve state
	type StatusMapping = { csvName: string; count: number; resolvedId: string | null };
	let unmatchedStatuses = $state<StatusMapping[]>([]);
	let savedCheckedRows = $state<{ rowNumber: number; values: Record<string, string> }[]>([]);

	// Import state
	let importing = $state(false);
	let importResult = $state<{ inserted: number; notInserted: number; skipped: number } | null>(null);
	let completionNotified = false;

	/**
	 * The Availability Status Import rules module is string-free; this map is the one
	 * place its issue codes become user-facing copy.
	 */
	const ISSUE_COPY: Record<AvailabilityImportIssueCode, string> = {
		'last-name-required': 'Last name is required',
		'first-name-required': 'First name is required',
		'person-not-found': 'Person not found',
		'ambiguous-name': 'Multiple people with this name — add Rank column to disambiguate',
		'ambiguous-name-and-rank': 'Multiple people match this name and rank',
		'rank-no-match': 'Rank does not match any person with this name',
		'rank-conflict': 'Rank does not match this person’s roster rank — the row will import against them',
		'start-date-required': 'Start date is required',
		'start-date-invalid': 'Invalid start date',
		'end-date-required': 'End date is required',
		'end-date-invalid': 'Invalid end date',
		'end-before-start': 'End date must be on or after start date',
		'status-required': 'Status is required'
	};

	type PreviewRow = {
		rowNumber: number;
		values: Record<string, string>;
		validation: AvailabilityImportRowValidation;
	};

	const previewRows = $derived.by<PreviewRow[]>(() => buildPreviewRows(rawRows));
	const previewColumns: ColumnDef<PreviewRow>[] = STATUS_IMPORT_COLUMNS.map((column) => ({
		key: column.key,
		header: column.label,
		value: (row) => row.values[column.key] ?? '',
		searchValue: (row) => row.values[column.key] ?? ''
	}));
	const validationSummary = $derived.by(() => {
		const invalidCount = previewRows.filter((row) => !row.validation.valid).length;
		const warningCount = previewRows.filter((row) =>
			row.validation.issues.some((issue) => issue.severity === 'warning')
		).length;
		return { invalidCount, warningCount };
	});
	const selection = DataTable.useDataTableSelection<PreviewRow>({
		rows: () => previewRows,
		rowKey: (row) => row.rowNumber,
		disabledRow: (row) => !row.validation.valid
	});

	const rosterNameIndex = $derived(buildRosterNameIndex(personnel));

	const allResolved = $derived(unmatchedStatuses.length === 0 || unmatchedStatuses.every((s) => s.resolvedId !== null));

	function notifyCompleteOnce() {
		if (completionNotified) return;
		completionNotified = true;
		onComplete();
	}

	function buildPreviewRows(raw: string[][]): PreviewRow[] {
		if (raw.length === 0) return [];

		const hasHeaders = detectHeaderRow(raw[0], STATUS_IMPORT_COLUMNS);
		const mappings = autoMapColumns(raw[0], STATUS_IMPORT_COLUMNS, hasHeaders).filter(
			(mapping): mapping is NonNullable<typeof mapping> => !!mapping
		);
		const dataRows = hasHeaders ? raw.slice(1) : raw;

		return dataRows.map((row, rowIndex) => {
			const values: Record<string, string> = {};
			for (const mapping of mappings) {
				if (mapping.fieldKey && mapping.columnIndex < row.length) {
					values[mapping.fieldKey] = (row[mapping.columnIndex] ?? '').trim();
				}
			}

			const validation = validateAvailabilityImportRow(values, rosterNameIndex);
			return {
				rowNumber: rowIndex + (hasHeaders ? 2 : 1),
				values,
				validation
			};
		});
	}

	function issueCopy(severity: 'error' | 'warning', row: PreviewRow): string {
		return row.validation.issues
			.filter((issue) => issue.severity === severity)
			.map((issue) => ISSUE_COPY[issue.code])
			.join('; ');
	}

	function rowStatus(row: PreviewRow): BulkImportRowStatus {
		if (!row.validation.valid) {
			return { tone: 'error', label: 'Error', description: issueCopy('error', row) };
		}
		if (row.validation.issues.some((issue) => issue.severity === 'warning')) {
			return { tone: 'warning', label: 'Review', description: issueCopy('warning', row) };
		}
		return { tone: 'valid', label: 'Ready' };
	}

	async function showPreview(rows: string[][]) {
		rawRows = rows;
		selection.clear();
		step = 'preview';
		await tick();
		selection.toggleAllPageRows(true);
	}

	function hasPreviewRows(rows: string[][]): boolean {
		return buildPreviewRows(rows).length > 0;
	}

	async function handleFileUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		parseError = '';
		try {
			const parsedRows = await parseFile(file);

			if (!hasPreviewRows(parsedRows)) {
				parseError = 'File appears to be empty or has no data rows.';
				rawRows = [];
				return;
			}
			await showPreview(parsedRows);
		} catch (err) {
			parseError = err instanceof Error ? err.message : 'Failed to parse file.';
		}
	}

	async function handlePaste() {
		if (!pasteText.trim()) return;
		parseError = '';
		try {
			const parsedRows = await parseCSVText(pasteText);

			if (!hasPreviewRows(parsedRows)) {
				parseError = 'No data rows found in pasted text.';
				rawRows = [];
				return;
			}
			await showPreview(parsedRows);
		} catch (err) {
			parseError = err instanceof Error ? err.message : 'Failed to parse text.';
		}
	}

	function handlePreviewNext() {
		if (importing) return;
		const checkedRows = selection.selectedRows.map((row) => ({ rowNumber: row.rowNumber, values: row.values }));
		if (checkedRows.length === 0) return;
		savedCheckedRows = checkedRows;

		unmatchedStatuses = planStatusResolution(
			checkedRows.map((row) => row.values),
			statusTypes
		).map((unresolved) => ({ ...unresolved, resolvedId: null }));

		// If no unmatched, go straight to import
		if (unmatchedStatuses.length === 0) {
			handleImport();
		} else {
			step = 'resolve';
		}
	}

	async function handleImport() {
		if (importing || savedCheckedRows.length === 0) return;

		const resolutions = new SvelteMap<string, StatusResolution>(
			unmatchedStatuses
				.filter((mapping) => mapping.resolvedId !== null)
				.map((mapping) => [
					mapping.csvName.toLowerCase(),
					mapping.resolvedId === '__skip__' ? 'skip' : (mapping.resolvedId as string)
				])
		);
		const plan = buildAvailabilityImportPlan(savedCheckedRows, { personnel, statusTypes, resolutions });

		if (plan.records.length === 0) {
			importResult = { inserted: 0, notInserted: 0, skipped: plan.skipped.length };
			step = 'results';
			return;
		}

		importing = true;
		try {
			const inserted = await availabilityStore.addBatch(plan.records);
			importResult = {
				inserted: inserted.length,
				notInserted: plan.records.length - inserted.length,
				skipped: plan.skipped.length
			};
			if (inserted.length > 0) {
				toastStore.success(`Imported ${inserted.length} status ${inserted.length === 1 ? 'entry' : 'entries'}`);
			} else {
				toastStore.error('No status entries were imported. Review the results and try again.');
			}
			step = 'results';
		} catch {
			importResult = { inserted: 0, notInserted: plan.records.length, skipped: plan.skipped.length };
			step = 'results';
			toastStore.error('No status entries were imported. Review the results and try again.');
		} finally {
			importing = false;
		}
	}
</script>

<BulkImportWorkspace.Root ariaLabel="Calendar status import workspace">
	{#if step === 'upload'}
		<div class="grid gap-5 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
			<section class="rounded-lg border bg-card p-5 text-card-foreground">
				<div class="flex flex-col gap-2">
					<p class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Step 1</p>
					<h2 class="text-lg font-semibold">Bring in status rows</h2>
					<p class="text-sm text-muted-foreground">
						Upload a CSV or Excel file, or paste raw CSV text. You will review and validate the rows before anything
						imports.
					</p>
				</div>

				<div class="mt-5 flex flex-col gap-3">
					<div class="border-t pt-3 first:border-t-0 first:pt-0">
						<span class="block font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
							>Required fields</span
						>
						<span class="text-sm">Last name, first name, start date, end date, status</span>
					</div>
					<div class="border-t pt-3 first:border-t-0 first:pt-0">
						<span class="block font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
							>Optional fields</span
						>
						<span class="text-sm">Rank for name conflicts, plus note if you want one carried in</span>
					</div>
					<div class="border-t pt-3 first:border-t-0 first:pt-0">
						<span class="block font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
							>Supported files</span
						>
						<span class="text-sm">.csv and .xlsx</span>
					</div>
				</div>
			</section>

			<section class="rounded-lg border bg-card p-5 text-card-foreground">
				<div class="flex flex-col gap-4">
					<div class="flex flex-col gap-2 rounded-md border bg-muted/40 p-4">
						<Field.Root>
							<Field.Label for="calendar-status-import-file">Upload a file</Field.Label>
							<Field.Description>Best when you already have a spreadsheet ready to go.</Field.Description>
							<Input id="calendar-status-import-file" type="file" accept=".csv,.xlsx" onchange={handleFileUpload} />
						</Field.Root>
					</div>

					<div class="flex items-center gap-3">
						<div class="h-px flex-1 bg-border"></div>
						<span class="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">or</span>
						<div class="h-px flex-1 bg-border"></div>
					</div>

					<div class="flex flex-col gap-3 rounded-md border bg-muted/40 p-4">
						<Field.Root>
							<Field.Label for="calendar-status-import-paste">Paste CSV data</Field.Label>
							<Field.Description>Useful for a quick import from another system or email.</Field.Description>
							<Textarea
								id="calendar-status-import-paste"
								rows={8}
								class="font-mono text-sm"
								placeholder="last name, first name, start date, end date, status&#10;Smith, John, 2026-01-01, 2026-01-05, Leave&#10;..."
								bind:value={pasteText}
							/>
						</Field.Root>
						<div class="flex justify-end">
							<Button size="sm" onclick={handlePaste} disabled={!pasteText.trim()}>Parse</Button>
						</div>
					</div>
				</div>

				{#if parseError}
					<BulkImportWorkspace.ValidationSummary
						issues={[{ label: 'errors', count: 1, tone: 'error' }]}
						description={parseError}
						role="alert"
					/>
				{/if}
			</section>
		</div>
	{/if}

	{#if step === 'preview'}
		<section class="flex flex-col gap-4 rounded-lg border bg-card p-5 text-card-foreground">
			<div class="flex flex-wrap justify-between gap-4 border-b pb-4">
				<div>
					<p class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Step 2</p>
					<h2 class="text-lg font-semibold">Review parsed rows</h2>
					<p class="text-sm text-muted-foreground">
						Check the rows that should be imported, then continue to status matching if anything needs resolution.
					</p>
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
				ariaLabel="Calendar status import preview"
				{selection}
				rowKey={(row) => row.rowNumber}
				disabledRow={(row) => !row.validation.valid}
				{rowStatus}
				selectedCountLabel={(selected, total) => `${selected} of ${total} rows selected`}
			/>
		</section>
	{/if}

	{#if step === 'results'}
		<section class="flex flex-col gap-4 rounded-lg border bg-card p-5 text-card-foreground">
			<div class="border-b pb-4">
				<p class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Results</p>
				<h2 class="text-lg font-semibold">Import complete</h2>
				<p class="text-sm text-muted-foreground">Review what was imported and any rows that still need attention.</p>
			</div>
			<div class="flex flex-col gap-4">
				{#if importResult}
					{#if importResult.inserted > 0}
						<div
							class="rounded-md border border-green-600/30 bg-green-600/10 p-4 text-sm text-green-700 dark:text-green-300"
						>
							<strong>{importResult.inserted}</strong> status {importResult.inserted === 1 ? 'entry' : 'entries'} imported
							successfully.
						</div>
					{/if}

					{#if importResult.notInserted > 0}
						<div class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
							<strong>{importResult.notInserted}</strong>
							{importResult.notInserted === 1 ? 'entry' : 'entries'} failed to import. Re-run the import for the missing rows
							or try again later.
						</div>
					{/if}

					{#if importResult.skipped > 0}
						<p class="text-sm text-muted-foreground">
							{importResult.skipped}
							{importResult.skipped === 1 ? 'row was' : 'rows were'} skipped by your status selections.
						</p>
					{/if}

					{#if importResult.inserted === 0 && importResult.notInserted === 0 && importResult.skipped === 0}
						<p class="text-sm text-muted-foreground">No records were imported.</p>
					{/if}
				{/if}
			</div>
		</section>
	{/if}

	{#if step === 'resolve'}
		<section class="flex flex-col gap-4 rounded-lg border bg-card p-5 text-card-foreground">
			<div class="border-b pb-4">
				<p class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Step 3</p>
				<h2 class="text-lg font-semibold">Resolve unmatched statuses</h2>
				<p class="text-sm text-muted-foreground">
					The following status names do not match a status type in this organization. Map each one or choose skip to
					leave those rows out.
				</p>
			</div>
			<div class="flex flex-col gap-3">
				{#each unmatchedStatuses as mapping, i (mapping.csvName)}
					<div class="flex flex-col gap-3 rounded-md border bg-muted/40 p-3 sm:flex-row sm:items-center">
						<div class="min-w-48">
							<span class="font-mono text-xs font-semibold uppercase tracking-[0.08em]">"{mapping.csvName}"</span>
							<span class="ml-2 text-sm text-muted-foreground"
								>({mapping.count} {mapping.count === 1 ? 'row' : 'rows'})</span
							>
						</div>
						<span class="hidden text-muted-foreground sm:inline">-&gt;</span>
						<NativeSelect
							value={mapping.resolvedId ?? ''}
							onchange={(e) => {
								const val = (e.target as HTMLSelectElement).value;
								unmatchedStatuses[i].resolvedId = val || null;
							}}
						>
							<option value="">Select</option>
							<option value="__skip__">Skip, do not import</option>
							{#each statusTypes as st (st.id)}
								<option value={st.id}>{st.name}</option>
							{/each}
						</NativeSelect>
						{#if mapping.resolvedId && mapping.resolvedId !== '__skip__'}
							{@const resolved = statusTypes.find((s) => s.id === mapping.resolvedId)}
							{#if resolved}
								<CalendarStatusBadge statusType={resolved}>{resolved.name}</CalendarStatusBadge>
							{/if}
						{/if}
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<div class="flex flex-wrap justify-end gap-2 border-t bg-card p-4">
		{#if step === 'preview'}
			<Button
				variant="outline"
				disabled={importing}
				onclick={() => {
					step = 'upload';
					rawRows = [];
				}}>Back</Button
			>
			<Button onclick={handlePreviewNext} disabled={selection.selectedCount === 0 || importing}>
				{#if importing}<Spinner />{/if}
				{importing ? 'Importing...' : 'Next'}
			</Button>
		{:else if step === 'resolve'}
			<Button
				variant="outline"
				onclick={() => {
					step = 'preview';
				}}>Back</Button
			>
			<Button disabled={!allResolved || importing} onclick={handleImport}>
				{#if importing}<Spinner />{/if}
				{importing ? 'Importing...' : 'Import'}
			</Button>
		{:else if step === 'results'}
			<Button onclick={notifyCompleteOnce}>Done</Button>
		{/if}
	</div>
</BulkImportWorkspace.Root>
