<script lang="ts">
	import * as ReportWorkspace from './index.js';
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
		<ReportWorkspace.Section title="Readiness trend">
			<div>Chart region</div>
		</ReportWorkspace.Section>
		<ReportWorkspace.Table title="Readiness rows" data={rows} {columns} ariaLabel="Readiness rows table">
			{#snippet summary()}
				<ReportWorkspace.SummaryStrip
					topRisk="Maya Chen · Action"
					population="2 personnel"
					parameters="Last 24 hours"
					findings={['1 person needs action.', '1 person is ready.']}
					riskTone="warning"
				/>
			{/snippet}
		</ReportWorkspace.Table>
	</ReportWorkspace.Content>

	<ReportWorkspace.State state="loading" title="Loading report rows" />
	<ReportWorkspace.State state="no-data" title="No report data" description="Adjust filters and try again." />
	<ReportWorkspace.State state="error" title="Report failed" description="Try again." onRetry={() => undefined} />
</ReportWorkspace.Root>
