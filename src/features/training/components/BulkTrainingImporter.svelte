<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { TrainingType } from '$features/training/training.types';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as BulkImportWorkspace from '$lib/components/ui/bulk-import-workspace';
	import type { BulkImportRowStatus } from '$lib/components/ui/bulk-import-workspace';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import { useDataTableSelection, type ColumnDef } from '$lib/components/ui/data-table';
	import {
		TRAINING_COLUMNS,
		applyMapping,
		autoMapColumns,
		detectHeaderRow,
		getMissingRequired
	} from '$lib/utils/columnMapping';
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

	interface PreviewRow {
		id: string;
		sourceRowNumber: number;
		values: Record<string, string>;
		validation: RowValidation;
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
	let importFiles = $state<FileList | undefined>();
	let previewRows = $state<PreviewRow[]>([]);

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

	const previewColumns: ColumnDef<PreviewRow>[] = TRAINING_COLUMNS.map((column) => ({
		key: column.key,
		header: column.label,
		value: (row) => row.values[column.key] ?? '',
		sortable: false
	}));

	const selection = useDataTableSelection<PreviewRow>({
		rows: () => previewRows,
		rowKey: (row) => row.id,
		disabledRow: (row) => !row.validation.valid
	});

	const validationIssues = $derived.by(() => {
		const errorRows = previewRows.filter((row) => !row.validation.valid).length;
		const validRows = previewRows.filter((row) => row.validation.valid).length;
		const selectedRows = selection.selectedCount;
		return [
			...(validRows ? [{ label: 'valid rows', count: validRows, tone: 'neutral' as const }] : []),
			...(selectedRows ? [{ label: 'selected rows', count: selectedRows, tone: 'neutral' as const }] : []),
			...(errorRows ? [{ label: 'rows need review', count: errorRows, tone: 'error' as const }] : [])
		];
	});

	const submitDisabledReason = $derived(
		selection.selectedCount === 0 ? 'Select at least one valid row before importing.' : undefined
	);

	function validateRow(row: Record<string, string>): RowValidation {
		const cellErrors: Record<string, string> = {};
		const cellWarnings: Record<string, string> = {};

		const lastName = (row.lastName ?? '').trim();
		const firstName = (row.firstName ?? '').trim();
		const trainingTypeName = (row.trainingType ?? '').trim();
		const statusRaw = (row.status ?? '').trim();

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

		if (!statusRaw) {
			cellErrors.status = 'Date or status is required';
		}

		if (statusRaw && trainingType) {
			const parsed = parseTrainingStatus(statusRaw);

			if (parsed.type === 'skip') {
				cellErrors.status = 'Skipped (no/empty, row will not be imported)';
			} else if (parsed.type === 'invalid') {
				cellErrors.status = 'Invalid date or status. Use a date, "yes", "exempt", or "no" to skip';
			} else if (parsed.type === 'exempt') {
				if (!trainingType.canBeExempted) {
					cellErrors.status = 'This training type does not allow exemptions';
				}
			} else if (parsed.type === 'completed') {
				if (trainingType.expirationDateOnly) {
					cellErrors.status = `${trainingType.name} requires an expiration date, not yes/no`;
				} else if (trainingType.expirationMonths !== null) {
					cellErrors.status = `${trainingType.name} requires a completion date, not yes/no`;
				}
			}
		}

		const valid = Object.keys(cellErrors).length === 0;

		return { valid, cellErrors, cellWarnings };
	}

	function rebuildPreviewRows(nextRawRows: string[][]) {
		if (nextRawRows.length === 0) {
			previewRows = [];
			return;
		}

		const hasHeaders = detectHeaderRow(nextRawRows[0], TRAINING_COLUMNS);
		const mappings = autoMapColumns(nextRawRows[0], TRAINING_COLUMNS, hasHeaders);
		const missingRequired = getMissingRequired(mappings, TRAINING_COLUMNS);
		const dataRows = hasHeaders ? nextRawRows.slice(1) : nextRawRows;
		const sourceOffset = hasHeaders ? 2 : 1;

		if (missingRequired.length > 0) {
			importError = `Missing required columns: ${missingRequired.map((column) => column.label).join(', ')}`;
		}

		previewRows = dataRows.map((row, index) => {
			const values = applyMapping(row, mappings);
			return {
				id: `row-${index}`,
				sourceRowNumber: index + sourceOffset,
				values,
				validation: validateRow(values)
			};
		});

		selection.clear();
		selection.toggleAllPageRows(true);
	}

	async function handleFilesChange(files: FileList | undefined) {
		const file = files?.[0];
		if (!file) return;
		uploadedFileName = file.name;
		importText = '';
		importError = '';
		try {
			rawRows = await parseFile(file);
			rebuildPreviewRows(rawRows);
			importState = 'preview';
		} catch (err) {
			importError = `Failed to read file: ${err instanceof Error ? err.message : 'Unknown error'}`;
		}
	}

	async function handleTextParse() {
		if (!importText.trim()) return;
		importError = '';
		try {
			rawRows = await parseCSVText(importText);
			uploadedFileName = '';
			rebuildPreviewRows(rawRows);
			importState = 'preview';
		} catch (err) {
			importError = `Failed to parse text: ${err instanceof Error ? err.message : 'Unknown error'}`;
		}
	}

	function handleBack() {
		importState = 'input';
		rawRows = [];
		previewRows = [];
		importError = '';
	}

	function updatePreviewCell(row: PreviewRow, key: string, value: string) {
		row.values = { ...row.values, [key]: value };
		row.validation = validateRow(row.values);
		previewRows = [...previewRows];
		if (!row.validation.valid) {
			selection.toggleRow(row, previewRows.indexOf(row), false);
		}
	}

	function rowStatus(row: PreviewRow): BulkImportRowStatus {
		const errors = Object.values(row.validation.cellErrors);
		if (errors.length > 0) {
			return { tone: 'error', label: 'Review', description: errors[0] };
		}
		return { tone: 'valid', label: 'Ready', description: `Source row ${row.sourceRowNumber}` };
	}

	function disabledReason(row: PreviewRow): string | undefined {
		return Object.values(row.validation.cellErrors)[0];
	}

	async function handleImport() {
		if (isSubmitting) return;
		const checkedRows = selection.selectedRows.map((row) => row.values);
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

{#snippet previewCell(row: PreviewRow, column: ColumnDef<PreviewRow>)}
	<Input
		aria-label={`${column.header} for source row ${row.sourceRowNumber}`}
		value={row.values[column.key] ?? ''}
		oninput={(event) => updatePreviewCell(row, column.key, event.currentTarget.value)}
	/>
{/snippet}

<AppDialog.Root closeBlocked={isSubmitting} {onClose}>
	<AppDialog.Content size="wide" closeBlocked={isSubmitting}>
		<AppDialog.Header>
			<AppDialog.Title>Bulk Training Import</AppDialog.Title>
			<AppDialog.Description>
				Bring in completions or exemptions in bulk, then validate the rows before anything is saved.
			</AppDialog.Description>
		</AppDialog.Header>

		<AppDialog.Body>
			<BulkImportWorkspace.Root ariaLabel="Bulk training import workspace">
				{#if importState === 'input'}
					<BulkImportWorkspace.Header
						title="Import Records"
						description="Upload a spreadsheet or paste CSV rows. Nothing is saved until you review the preview."
						meta={[
							{ label: 'Training types', value: `${trainingTypes.length} training types` },
							...(uploadedFileName ? [{ label: 'File', value: uploadedFileName }] : [])
						]}
					/>

					<BulkImportWorkspace.InputPanel title="Available training types">
						<div class="flex flex-wrap gap-2">
							{#each trainingTypes as type (type.id)}
								<Badge style={`background-color: ${type.color}`}>
									{type.name}{type.expirationMonths === null ? ' *' : ''}
								</Badge>
							{/each}
						</div>
						<p class="text-sm text-muted-foreground">
							* = accepts "yes/no" instead of date. Use "exempt" to exempt a person.
						</p>
					</BulkImportWorkspace.InputPanel>

					<BulkImportWorkspace.InputPanel title="Upload file">
						<BulkImportWorkspace.FileInput
							bind:files={importFiles}
							label="Upload training file"
							description="Upload an Excel (.xlsx) or CSV file."
							onFilesChange={handleFilesChange}
						/>
					</BulkImportWorkspace.InputPanel>

					<BulkImportWorkspace.InputPanel title="Paste CSV text">
						<div class="flex justify-end">
							<Button variant="outline" size="sm" type="button" onclick={() => (importText = exampleCsv)}>
								Use Example
							</Button>
						</div>
						<BulkImportWorkspace.PasteInput
							bind:value={importText}
							label="CSV data"
							description="Columns: Last Name, First Name, Training Type, Date or Status, Notes."
							placeholder="Paste CSV data here..."
							rows={6}
						/>
					</BulkImportWorkspace.InputPanel>

					{#if importError}
						<BulkImportWorkspace.ValidationSummary
							title="Import input needs review"
							issues={[{ label: importError, tone: 'error' }]}
						/>
					{/if}
				{:else if importState === 'preview'}
					<BulkImportWorkspace.Header
						title="Preview"
						description="Correct row values inline, then import the checked rows."
						meta={[{ label: 'Rows', value: `${rawRows.length} rows loaded` }]}
					/>
					<BulkImportWorkspace.ValidationSummary
						title="Preview validation"
						description="Rows with errors are visible but cannot be selected until fixed."
						issues={validationIssues}
					/>
					<BulkImportWorkspace.PreviewTable
						rows={previewRows}
						columns={previewColumns}
						{selection}
						rowKey={(row) => row.id}
						disabledRow={(row) => !row.validation.valid}
						disabledReason={(row) => disabledReason(row)}
						rowStatus={(row) => rowStatus(row)}
						cell={previewCell}
						selectedCountLabel={(selected, total) => `${selected} of ${total} rows selected`}
					/>
					{#if importError}
						<BulkImportWorkspace.ValidationSummary
							title="Import preview needs review"
							issues={[{ label: importError, tone: 'error' }]}
						/>
					{/if}
				{:else if importState === 'importing'}
					<BulkImportWorkspace.ProgressState title="Importing records" description="Keep this dialog open." />
				{:else if importState === 'results' && results}
					<BulkImportWorkspace.ResultSummary
						status={results.errors > 0 ? 'partial' : 'success'}
						items={[
							{ label: 'Inserted', value: results.inserted },
							{ label: 'Updated', value: results.updated },
							{ label: 'Exempted', value: results.exempted },
							{ label: 'Errors', value: results.errors }
						]}
						description={results.errors > 0
							? 'Some records could not be imported. They may have been missing required data or referenced personnel outside your assigned group.'
							: undefined}
					/>
				{/if}
			</BulkImportWorkspace.Root>
		</AppDialog.Body>

		<AppDialog.Footer>
			{#if importState === 'input'}
				<Button variant="outline" type="button" onclick={onClose}>Cancel</Button>
				<Button type="button" onclick={handleTextParse} disabled={!importText.trim()}>Preview</Button>
			{:else if importState === 'preview'}
				<Button variant="outline" type="button" onclick={handleBack}>Back</Button>
				<Button
					type="button"
					onclick={handleImport}
					disabled={isSubmitting || !!submitDisabledReason}
					title={submitDisabledReason}
				>
					{#if isSubmitting}<Spinner />{/if}
					Import
				</Button>
			{:else if importState === 'importing'}
				<Button variant="outline" type="button" disabled>Back</Button>
				<Button type="button" disabled>
					<Spinner />
					Importing...
				</Button>
			{:else if importState === 'results'}
				<Button type="button" onclick={handleDone}>Done</Button>
			{/if}
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
