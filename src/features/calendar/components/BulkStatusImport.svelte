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
	import { parseFile, parseCSVText, parseDateString } from '$lib/utils/csvParser';
	import { autoMapColumns, detectHeaderRow, STATUS_IMPORT_COLUMNS } from '$lib/utils/columnMapping';
	import { validateDateRange, type AvailabilityRecord } from '$features/calendar/utils/availabilityMutation';
	import type { Personnel, StatusType } from '$lib/types';
	import { tick } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';

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

	// Resolve state
	type StatusMapping = { csvName: string; count: number; resolvedId: string | null };
	let unmatchedStatuses = $state<StatusMapping[]>([]);
	let savedCheckedRows = $state<Record<string, string>[]>([]);

	// Import state
	let importing = $state(false);
	let importResult = $state<{ inserted: number; errors: { row: number; message: string }[] } | null>(null);

	type RowValidation = {
		valid: boolean;
		cellErrors: Record<string, string>;
		cellWarnings: Record<string, string>;
	};

	type PreviewRow = {
		rowNumber: number;
		values: Record<string, string>;
		validation: RowValidation;
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
		const warningCount = previewRows.filter((row) => Object.keys(row.validation.cellWarnings).length > 0).length;
		return { invalidCount, warningCount };
	});
	const selection = DataTable.useDataTableSelection<PreviewRow>({
		rows: () => previewRows,
		rowKey: (row) => row.rowNumber,
		disabledRow: (row) => !row.validation.valid
	});

	// Personnel lookup map: "lastname|firstname" -> Personnel[]
	const personnelMap = $derived.by(() => {
		const map = new SvelteMap<string, Personnel[]>();
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
		const map = new SvelteMap<string, StatusType>();
		for (const st of statusTypes) {
			map.set(st.name.toLowerCase(), st);
		}
		return map;
	});

	const allResolved = $derived(unmatchedStatuses.length === 0 || unmatchedStatuses.every((s) => s.resolvedId !== null));

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

			const validation = validateRow(values);
			return {
				rowNumber: rowIndex + (hasHeaders ? 2 : 1),
				values,
				validation
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

	async function showPreview(rows: string[][]) {
		rawRows = rows;
		selection.clear();
		step = 'preview';
		await tick();
		selection.toggleAllPageRows(true);
	}

	async function handleFileUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		parseError = '';
		try {
			const parsedRows = await parseFile(file);

			if (parsedRows.length < 2) {
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

			if (parsedRows.length < 2) {
				parseError = 'No data rows found in pasted text.';
				rawRows = [];
				return;
			}
			await showPreview(parsedRows);
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
		if (startDate && endDate) {
			const rangeError = validateDateRange(startDate, endDate).error;
			if (rangeError) errors.endDate = rangeError;
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
		const checkedRows = selection.selectedRows.map((row) => row.values);
		if (checkedRows.length === 0) return;
		savedCheckedRows = checkedRows;

		// Collect unique status names and check matches
		const statusCounts = new SvelteMap<string, number>();
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
		const statusResolutionMap = new SvelteMap<string, string>();
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
		const records: AvailabilityRecord[] = [];
		const skippedStatuses = new SvelteSet(
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

					{#if importResult.errors.length > 0}
						<div class="flex flex-col gap-2">
							<h4 class="font-semibold text-destructive">Errors</h4>
							{#each importResult.errors as error, idx (idx)}
								<div class="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
									{#if error.row > 0}<span class="text-muted-foreground">Row {error.row}:</span>{/if}
									<span>{error.message}</span>
								</div>
							{/each}
						</div>
					{/if}

					{#if importResult.inserted === 0 && importResult.errors.length === 0}
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
				onclick={() => {
					step = 'upload';
					rawRows = [];
				}}>Back</Button
			>
			<Button onclick={handlePreviewNext} disabled={selection.selectedCount === 0}>Next</Button>
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
			<Button onclick={onComplete}>Done</Button>
		{/if}
	</div>
</BulkImportWorkspace.Root>
