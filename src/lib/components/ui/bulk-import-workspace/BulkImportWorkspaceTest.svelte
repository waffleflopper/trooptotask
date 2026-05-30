<script lang="ts">
	import * as BulkImportWorkspace from './index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DataTable from '$lib/components/ui/data-table/index.js';
	import type { BulkImportPreviewCellPresentation, BulkImportRowStatusDescriptionMode } from './types.js';

	type ImportRow = {
		id: string;
		row: number;
		name: string;
		status: 'valid' | 'warning' | 'error' | 'duplicate';
		disabled?: boolean;
	};

	const rows: ImportRow[] = [
		{ id: '1', row: 2, name: 'Avery Brooks', status: 'valid' },
		{ id: '2', row: 3, name: 'Maya Chen', status: 'error', disabled: true }
	];

	const columns = [
		{ key: 'row', header: 'Row', value: (row: ImportRow) => row.row },
		{ key: 'name', header: 'Name', value: (row: ImportRow) => row.name },
		{ key: 'status', header: 'Status', value: (row: ImportRow) => row.status }
	];

	let {
		statusDescriptionMode = 'inline',
		cellPresentation = 'default'
	}: {
		statusDescriptionMode?: BulkImportRowStatusDescriptionMode;
		cellPresentation?: BulkImportPreviewCellPresentation;
	} = $props();

	let source = $state<'upload' | 'paste' | 'manual'>('upload');
	let pasteValue = $state('');
	let files = $state<FileList>();
	const selection = DataTable.useDataTableSelection<ImportRow>({
		rows: () => rows,
		rowKey: (row) => row.id,
		disabledRow: (row) => row.disabled ?? false
	});
</script>

<BulkImportWorkspace.Root ariaLabel="Bulk import workspace">
	<BulkImportWorkspace.Header
		step="Step 1"
		title="Bulk record import"
		description="Choose a source, validate rows, then import checked records."
		meta={[{ label: 'Required', value: 'Name, status' }]}
	/>

	<BulkImportWorkspace.SourcePicker label="Choose import source">
		<BulkImportWorkspace.SourceOption
			label="Upload"
			description="Use a CSV or spreadsheet."
			selected={source === 'upload'}
			onSelect={() => (source = 'upload')}
		/>
		<BulkImportWorkspace.SourceOption
			label="Paste"
			description="Paste copied rows."
			selected={source === 'paste'}
			onSelect={() => (source = 'paste')}
		/>
		<BulkImportWorkspace.SourceOption
			label="Manual"
			description="Add one record."
			selected={source === 'manual'}
			onSelect={() => (source = 'manual')}
		/>
	</BulkImportWorkspace.SourcePicker>

	<BulkImportWorkspace.InputPanel title="Input rows" description="Shared input presentation owns labels and errors.">
		<BulkImportWorkspace.FileInput bind:files label="Upload import file" error="File is required" />
		<BulkImportWorkspace.PasteInput bind:value={pasteValue} label="Paste import rows" description="Use CSV format." />
	</BulkImportWorkspace.InputPanel>

	<BulkImportWorkspace.ValidationSummary
		title="Review row status"
		description="Fix errors before importing."
		issues={[
			{ label: 'valid', count: 1, tone: 'neutral' },
			{ label: 'errors', count: 1, tone: 'error' }
		]}
	/>

	<BulkImportWorkspace.PreviewTable
		{rows}
		{columns}
		{selection}
		rowKey={(row) => row.id}
		disabledRow={(row) => row.disabled ?? false}
		disabledReason={(row) => (row.disabled ? 'Resolve validation errors before selecting this row.' : undefined)}
		rowStatus={(row) =>
			row.status === 'valid'
				? { tone: 'valid', description: 'Ready to import.' }
				: { tone: 'error', label: 'Missing value', description: 'Value is required.' }}
		{statusDescriptionMode}
		{cellPresentation}
		selectedCountLabel={(selected, total) => `${selected} selectable rows chosen from ${total} preview rows`}
		ariaLabel="Bulk import preview"
	/>

	<BulkImportWorkspace.ProgressState title="Importing rows" description="Do not close this panel." value={50} />

	<BulkImportWorkspace.ResultSummary
		status="partial"
		description="Some rows need follow-up."
		items={[
			{ label: 'Created', value: 12, tone: 'success' },
			{ label: 'Failed', value: 2, tone: 'error' }
		]}
	/>

	<BulkImportWorkspace.FooterActions disabledReason="Select at least one valid row.">
		<Button disabled>Import checked rows</Button>
		<Button variant="outline">Back</Button>
	</BulkImportWorkspace.FooterActions>
</BulkImportWorkspace.Root>
