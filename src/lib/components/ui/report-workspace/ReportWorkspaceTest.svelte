<script lang="ts">
	import * as ReportWorkspace from './index.js';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar/index.js';
	import { Button } from '$lib/components/ui/button/index.js';

	const rows = [
		{ id: '1', name: 'Avery Brooks', status: 'Ready' },
		{ id: '2', name: 'Maya Chen', status: 'Action' }
	];

	const columns = [
		{ key: 'name', header: 'Name', value: (row: (typeof rows)[number]) => row.name },
		{ key: 'status', header: 'Status', value: (row: (typeof rows)[number]) => row.status }
	];
</script>

<ReportWorkspace.Root ariaLabel="Readiness report workspace">
	<ReportWorkspace.Header
		title="Readiness report"
		description="Current personnel readiness by group."
		meta={[
			{ label: 'Rows', value: 2 },
			{ label: 'Updated', value: 'Today' }
		]}
	/>

	<ReportWorkspace.Toolbar ariaLabel="Readiness report controls">
		<WorkspaceToolbar.Group label="Report filters" activeCount={1}>
			<Button variant="outline">Group: HQ</Button>
		</WorkspaceToolbar.Group>
		<WorkspaceToolbar.Group label="Report actions" zone="actions">
			<ReportWorkspace.ExportActions>
				<ReportWorkspace.ExportAction label="Export CSV" href="/export.csv" />
				<ReportWorkspace.ExportAction label="Export PDF" disabledReason="Select a date range first" />
				<ReportWorkspace.ExportAction label="Export XLSX" state="loading" loadingLabel="Preparing XLSX" />
				<ReportWorkspace.ExportAction label="Export packet" state="error" errorReason="Export service is unavailable" />
			</ReportWorkspace.ExportActions>
		</WorkspaceToolbar.Group>
	</ReportWorkspace.Toolbar>

	<ReportWorkspace.Filters title="Report configuration" description="Choose the scope and date range.">
		<Button variant="outline">Last 30 days</Button>
		{#snippet dateRange()}
			<div role="group" aria-label="Date range controls">
				<Button variant="outline">Start</Button>
				<Button variant="outline">End</Button>
			</div>
		{/snippet}
	</ReportWorkspace.Filters>

	<ReportWorkspace.Content layout="split">
		<ReportWorkspace.Chart title="Readiness trend" ariaLabel="Readiness trend chart">
			<div>Chart region</div>
		</ReportWorkspace.Chart>
		<ReportWorkspace.Table title="Readiness rows" data={rows} {columns} ariaLabel="Readiness rows table" />
	</ReportWorkspace.Content>

	<ReportWorkspace.State state="loading" title="Loading report rows" />
	<ReportWorkspace.State state="no-data" title="No report data" description="Adjust filters and try again." />
	<ReportWorkspace.State state="error" title="Report failed" description="Try again." />
</ReportWorkspace.Root>
