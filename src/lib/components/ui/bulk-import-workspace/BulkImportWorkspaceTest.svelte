<script lang="ts">
	import * as BulkImportWorkspace from './index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DataTable from '$lib/components/ui/data-table/index.js';

	type ImportRow = {
		id: string;
		row: number;
		name: string;
		status: string;
		disabled?: boolean;
	};

	const rows: ImportRow[] = [
		{ id: '1', row: 2, name: 'Avery Brooks', status: 'Valid' },
		{ id: '2', row: 3, name: 'Maya Chen', status: 'Missing group', disabled: true }
	];

	const columns = [
		{ key: 'row', header: 'Row', value: (row: ImportRow) => row.row },
		{ key: 'name', header: 'Name', value: (row: ImportRow) => row.name },
		{ key: 'status', header: 'Status', value: (row: ImportRow) => row.status }
	];

	let source = $state<'upload' | 'paste' | 'manual'>('upload');
	let pasteValue = $state('');
	let files = $state<FileList>();
	const selection = DataTable.useDataTableSelection<ImportRow>({
		rows: () => rows,
		rowKey: (row) => row.id,
		disabledRow: (row) => row.disabled ?? false
	});
</script>

<BulkImportWorkspace.Root ariaLabel="Personnel import workspace">
	<BulkImportWorkspace.Header
		step="Step 1"
		title="Bulk personnel import"
		description="Choose a source, validate rows, then import checked records."
		meta={[{ label: 'Required', value: 'Rank, name' }]}
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
		<BulkImportWorkspace.FileInput bind:files label="Upload roster" error="File is required" />
		<BulkImportWorkspace.PasteInput bind:value={pasteValue} label="Paste roster rows" description="Use CSV format." />
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
		ariaLabel="Personnel import preview"
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
