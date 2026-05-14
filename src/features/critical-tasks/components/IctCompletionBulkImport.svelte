<script lang="ts">
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import * as BulkImportWorkspace from '$lib/components/ui/bulk-import-workspace';
	import { Button } from '$lib/components/ui/button';
	import * as DataTable from '$lib/components/ui/data-table';
	import type { ColumnDef } from '$lib/components/ui/data-table';
	import * as Tabs from '$lib/components/ui/tabs';
	import type { BulkImportRowStatus } from '$lib/components/ui/bulk-import-workspace';
	import { autoMapColumns, detectHeaderRow, type ColumnDef as ImportColumnDef } from '$lib/utils/columnMapping';
	import { parseFile } from '$lib/utils/csvParser';
	import { personnelIctCompletionsStore } from '$features/critical-tasks/stores/personnelIctCompletions.svelte';
	import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
	import type { Personnel } from '$lib/types';
	import {
		ICT_COMPLETION_IMPORT_COLUMNS,
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

	type PreviewRow = {
		rowNumber: number;
		values: Record<string, string>;
		validation: RowValidation;
	};

	type RowValidation = {
		valid: boolean;
		ambiguous: boolean;
		cellErrors: Record<string, string>;
	};

	let step = $state<Step>('input');
	let rawRows = $state<string[][]>([]);
	let uploadedFileName = $state('');
	let importError = $state('');
	let importResult = $state<{ created: number; updated: number; failed: number } | null>(null);
	let importFailures = $state<Array<{ rowNumber: number; personnelName: string; taskCode: string; message: string }>>(
		[]
	);
	let activeReviewGroup = $state<ReviewGroup>('ready');
	let reviewGroupInitialized = $state(false);
	let selectionInitialized = $state(false);

	const previewRows = $derived.by<PreviewRow[]>(() => buildPreviewRows(rawRows, ICT_COMPLETION_IMPORT_COLUMNS));
	const previewReview = $derived(
		reviewMappedIctCompletionImportRows(
			previewRows.map((row) => ({ rowNumber: row.rowNumber, values: row.values })),
			getReviewOptions()
		)
	);
	const validationSummary = $derived.by(() => {
		const invalidCount = previewRows.filter((row) => !row.validation.valid && !row.validation.ambiguous).length;
		const ambiguousCount = previewRows.filter((row) => row.validation.ambiguous).length;
		return { invalidCount, ambiguousCount };
	});
	const previewColumns: ColumnDef<PreviewRow>[] = ICT_COMPLETION_IMPORT_COLUMNS.map((column) => ({
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
		selection.clear();
		selectionInitialized = false;
	});

	$effect(() => {
		if (step !== 'preview' || selectionInitialized) return;
		selection.toggleAllPageRows(true);
		selectionInitialized = true;
	});

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

	function getReviewOptions() {
		return {
			personnel,
			tasks,
			existingCompletions: completions
		};
	}

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
		if (message.startsWith('Personnel record') || message.startsWith('Multiple personnel records')) return 'lastName';
		return 'taskCode';
	}

	function buildPreviewRows(raw: string[][], columnDefs: ImportColumnDef[]): PreviewRow[] {
		if (raw.length === 0) return [];
		const hasHeaders = detectHeaderRow(raw[0], columnDefs);
		const mappings = autoMapColumns(raw[0], columnDefs, hasHeaders).filter(
			(mapping): mapping is NonNullable<typeof mapping> => !!mapping
		);
		const dataRows = hasHeaders ? raw.slice(1) : raw;
		const rows: IctCompletionImportMappedRow[] = dataRows.map((row, rowIndex) => {
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

		const review = reviewMappedIctCompletionImportRows(rows, getReviewOptions());
		const invalidByRow = new Map(review.invalidRows.map((row) => [row.rowNumber, row]));
		const ambiguousByRow = new Map(review.ambiguousRows.map((row) => [row.rowNumber, row]));

		return rows.map((row) => {
			const problemRow = invalidByRow.get(row.rowNumber) ?? ambiguousByRow.get(row.rowNumber);
			if (!problemRow) {
				return {
					rowNumber: row.rowNumber,
					values: row.values,
					validation: { valid: true, ambiguous: false, cellErrors: {} }
				};
			}

			const cellErrors: Record<string, string> = {};
			for (const error of problemRow.errors) {
				cellErrors[mapErrorToField(error)] = error;
			}

			return {
				rowNumber: row.rowNumber,
				values: row.values,
				validation: {
					valid: false,
					ambiguous: ambiguousByRow.has(row.rowNumber),
					cellErrors
				}
			};
		});
	}

	function rowStatus(row: PreviewRow): BulkImportRowStatus {
		if (row.validation.ambiguous) {
			return { tone: 'warning', label: 'Ambiguous', description: Object.values(row.validation.cellErrors).join('; ') };
		}
		if (!row.validation.valid) {
			return { tone: 'error', label: 'Error', description: Object.values(row.validation.cellErrors).join('; ') };
		}
		return { tone: 'valid', label: 'Ready' };
	}

	async function handleFilesUpload(files: FileList | undefined) {
		const file = files?.[0];
		if (!file) return;

		importError = '';
		uploadedFileName = file.name;

		try {
			rawRows = await parseFile(file);
			activeReviewGroup = 'ready';
			reviewGroupInitialized = false;
			step = 'preview';
		} catch {
			rawRows = [];
			uploadedFileName = '';
			importError = 'Unable to parse that file. Upload a CSV or spreadsheet and try again.';
		}
	}

	function handleBack() {
		step = 'input';
		rawRows = [];
		uploadedFileName = '';
		importError = '';
		activeReviewGroup = 'ready';
		reviewGroupInitialized = false;
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

<AppDialog.Root open closeBlocked={step === 'importing'} onClose={handleClose}>
	<AppDialog.Content class="sm:max-w-5xl">
		<AppDialog.Header>
			<AppDialog.Title id="ict-completion-import-title">Import ICT Completions</AppDialog.Title>
		</AppDialog.Header>

		<AppDialog.Body>
			<BulkImportWorkspace.Root ariaLabel="ICT completion import workspace">
				{#if step === 'input'}
					<div class="flex flex-col gap-4 rounded-lg border bg-card p-5 text-card-foreground">
						<BulkImportWorkspace.Header
							step="Step 1"
							title="Upload Completion File"
							description="Upload a spreadsheet, review the rows in a table, then import only the checked items."
							meta={[
								{ label: 'Required', value: 'First Name, Last Name, Task Code, Completion Date' },
								{ label: 'Optional', value: 'Rank, Validation Method, Validator, Notes' }
							]}
						/>

						<BulkImportWorkspace.InputPanel title="Completion file" description="CSV and XLSX files are accepted.">
							<BulkImportWorkspace.FileInput onFilesChange={handleFilesUpload} />
						</BulkImportWorkspace.InputPanel>

						{#if importError}
							<BulkImportWorkspace.ValidationSummary
								issues={[{ label: 'errors', count: 1, tone: 'error' }]}
								description={importError}
								role="alert"
							/>
						{/if}
					</div>
				{:else if step === 'preview'}
					<div class="flex flex-col gap-4 rounded-lg border bg-card p-5 text-card-foreground">
						<BulkImportWorkspace.Header
							step="Step 2"
							title="Review Completion Import"
							description="Only checked rows without errors will import."
							meta={[
								{ label: 'File', value: uploadedFileName },
								{ label: 'Ready', value: `${previewReview.validRows.length} ready to import` },
								{ label: 'Ambiguous', value: `${previewReview.ambiguousRows.length} ambiguous` },
								{ label: 'Invalid', value: `${previewReview.invalidRows.length} invalid` }
							]}
						/>

						<Tabs.Root bind:value={activeReviewGroup}>
							<Tabs.List aria-label="Completion import row groups">
								<Tabs.Trigger value="ready">Ready ({previewReview.validRows.length})</Tabs.Trigger>
								<Tabs.Trigger value="ambiguous">Ambiguous ({previewReview.ambiguousRows.length})</Tabs.Trigger>
								<Tabs.Trigger value="invalid">Invalid ({previewReview.invalidRows.length})</Tabs.Trigger>
							</Tabs.List>

							<Tabs.Content value="ready">
								<section class="rounded-lg border bg-muted/30 p-4" aria-live="polite">
									<h3 class="text-sm font-semibold">Showing Ready rows</h3>
									{#if previewReview.validRows.length === 0}
										<p class="mt-2 text-sm text-muted-foreground">No ready rows to import yet.</p>
									{:else}
										<ul class="mt-3 grid gap-3">
											{#each previewReview.validRows as row (`ready-${row.rowNumber}`)}
												<li class="rounded-md border bg-card p-3 text-sm">
													<div class="flex flex-wrap items-center gap-2">
														<strong>Row {row.rowNumber}</strong>
														<span class="rounded-md border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
															{row.completionId ? 'Updates existing record' : 'Creates new record'}
														</span>
													</div>
													<p>{formatPersonName(row.personnel)}</p>
													<p>{formatTaskLabel(row.task.taskCode, row.task.title)}</p>
													<p>Completion date: {row.completion.completedAt}</p>
												</li>
											{/each}
										</ul>
									{/if}
								</section>
							</Tabs.Content>

							<Tabs.Content value="ambiguous">
								<section class="rounded-lg border bg-muted/30 p-4" aria-live="polite">
									<h3 class="text-sm font-semibold">Showing Ambiguous rows</h3>
									{#if previewReview.ambiguousRows.length === 0}
										<p class="mt-2 text-sm text-muted-foreground">No ambiguous rows need review.</p>
									{:else}
										<ul class="mt-3 grid gap-3">
											{#each previewReview.ambiguousRows as row (`ambiguous-${row.rowNumber}`)}
												<li class="rounded-md border bg-card p-3 text-sm">
													<div class="flex flex-wrap items-center gap-2">
														<strong>Row {row.rowNumber}</strong>
														<span>{formatImportedPersonName(row.values)}</span>
													</div>
													<p>{formatTaskLabel(row.values.taskCode ?? 'No task code')}</p>
													<ul class="mt-2 list-disc pl-5 text-destructive">
														{#each row.errors as error (`${row.rowNumber}-${error}`)}
															<li>{error}</li>
														{/each}
													</ul>
													{#if row.matches && row.matches.length > 0}
														<p class="mt-2 text-xs font-semibold text-muted-foreground">Possible matches</p>
														<ul class="list-disc pl-5">
															{#each row.matches as match (`${row.rowNumber}-${match.personnelId}`)}
																<li>{match.displayName}</li>
															{/each}
														</ul>
													{/if}
												</li>
											{/each}
										</ul>
									{/if}
								</section>
							</Tabs.Content>

							<Tabs.Content value="invalid">
								<section class="rounded-lg border bg-muted/30 p-4" aria-live="polite">
									<h3 class="text-sm font-semibold">Showing Invalid rows</h3>
									{#if previewReview.invalidRows.length === 0}
										<p class="mt-2 text-sm text-muted-foreground">No invalid rows remain.</p>
									{:else}
										<ul class="mt-3 grid gap-3">
											{#each previewReview.invalidRows as row (`invalid-${row.rowNumber}`)}
												<li class="rounded-md border bg-card p-3 text-sm">
													<div class="flex flex-wrap items-center gap-2">
														<strong>Row {row.rowNumber}</strong>
														<span>{formatImportedPersonName(row.values) || 'Missing personnel details'}</span>
													</div>
													<p>{formatTaskLabel(row.values.taskCode ?? 'No task code')}</p>
													<ul class="mt-2 list-disc pl-5 text-destructive">
														{#each row.errors as error (`${row.rowNumber}-${error}`)}
															<li>{error}</li>
														{/each}
													</ul>
												</li>
											{/each}
										</ul>
									{/if}
								</section>
							</Tabs.Content>
						</Tabs.Root>

						<BulkImportWorkspace.ValidationSummary
							issues={[
								{ label: 'ready', count: previewReview.validRows.length, tone: 'neutral' },
								{
									label: 'ambiguous rows',
									count: validationSummary.ambiguousCount,
									tone: validationSummary.ambiguousCount > 0 ? 'warning' : 'neutral'
								},
								{
									label: 'error rows',
									count: validationSummary.invalidCount,
									tone: validationSummary.invalidCount > 0 ? 'error' : 'neutral'
								}
							]}
							description={`${selection.selectedCount} rows selected for import.`}
						/>

						<BulkImportWorkspace.PreviewTable
							rows={previewRows}
							columns={previewColumns}
							ariaLabel="ICT completion import preview"
							{selection}
							rowKey={(row) => row.rowNumber}
							disabledRow={(row) => !row.validation.valid}
							{rowStatus}
							selectedCountLabel={(selected, total) => `${selected} of ${total} rows selected`}
						/>

						{#if importError}
							<BulkImportWorkspace.ValidationSummary
								issues={[{ label: 'errors', count: validationSummary.invalidCount + 1, tone: 'error' }]}
								description={importError}
								role="alert"
							/>
						{/if}
					</div>
				{:else if step === 'importing'}
					<BulkImportWorkspace.ProgressState
						title="Importing critical task completions..."
						description="Do not close this dialog."
					/>
				{:else if importResult}
					<div class="flex flex-col gap-4 rounded-lg border bg-card p-5 text-card-foreground">
						<BulkImportWorkspace.Header
							step="Complete"
							title="Import Finished"
							meta={[
								{ label: 'Created', value: `${importResult.created} created` },
								{ label: 'Updated', value: `${importResult.updated} updated` },
								{ label: 'Failed', value: `${importResult.failed} failed` }
							]}
						/>

						{#if importFailures.length > 0}
							<ul class="flex flex-col gap-2 pl-4">
								{#each importFailures as failure, index (`${failure.rowNumber}-${index}`)}
									<li class="flex flex-col gap-0.5">
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
			</BulkImportWorkspace.Root>
		</AppDialog.Body>

		<AppDialog.Footer>
			{#if step === 'input'}
				<Button variant="outline" size="sm" type="button" onclick={onCancel}>Cancel</Button>
			{:else if step === 'preview'}
				<Button variant="outline" size="sm" type="button" onclick={handleBack}>Back</Button>
				<Button variant="outline" size="sm" type="button" onclick={onCancel}>Cancel</Button>
				<Button size="sm" type="button" onclick={handleImport} disabled={selection.selectedCount === 0}>
					Import Checked Rows
				</Button>
			{:else if step === 'results'}
				<Button size="sm" type="button" onclick={onDone}>Done</Button>
			{/if}
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
