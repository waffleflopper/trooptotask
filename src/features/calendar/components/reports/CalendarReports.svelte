<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { StatusType } from '$lib/types';
	import StatusDaysSummary from './StatusDaysSummary.svelte';
	import AvailabilityForecast from './AvailabilityForecast.svelte';
	import PersonnelTempo from './PersonnelTempo.svelte';
	import AssignmentCoverage from './AssignmentCoverage.svelte';
	import GroupReadiness from './GroupReadiness.svelte';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';

	interface Props {
		orgId: string;
		orgUrlSegment?: string;
		personnel: Personnel[];
		statusTypes: StatusType[];
		groups: { id: string; name: string }[];
	}

	let { orgId, orgUrlSegment = orgId, personnel, statusTypes, groups }: Props = $props();

	type ReportType =
		| 'status-days'
		| 'availability-forecast'
		| 'personnel-tempo'
		| 'assignment-coverage'
		| 'group-readiness';
	let selectedReport = $state<ReportType>('status-days');

	const reportOptions: { value: ReportType; label: string }[] = [
		{ value: 'status-days', label: 'Status days by person' },
		{ value: 'availability-forecast', label: 'Availability by day' },
		{ value: 'personnel-tempo', label: 'Away days by person' },
		{ value: 'assignment-coverage', label: 'Assignment load by person' },
		{ value: 'group-readiness', label: 'Group availability by day' }
	];
	const relatedLinks = $derived([{ label: 'Calendar', href: `/org/${orgUrlSegment}/calendar` }]);
</script>

<div class="flex flex-col gap-4">
	<WorkspaceToolbar.Root ariaLabel="Calendar report controls">
		<WorkspaceToolbar.Group label="Calendar report type" activeCount={selectedReport !== 'status-days' ? 1 : 0}>
			<WorkspaceToolbar.Select
				ariaLabel="Report type"
				options={reportOptions}
				value={selectedReport}
				onValueChange={(value) => (selectedReport = value as ReportType)}
			/>
		</WorkspaceToolbar.Group>

		<WorkspaceToolbar.Group label="Related calendar pages" zone="actions">
			<WorkspaceToolbar.Nav ariaLabel="Related calendar pages" items={relatedLinks} />
		</WorkspaceToolbar.Group>
	</WorkspaceToolbar.Root>

	{#if selectedReport === 'status-days'}
		<StatusDaysSummary {orgId} {personnel} {statusTypes} {groups} />
	{:else if selectedReport === 'availability-forecast'}
		<AvailabilityForecast {orgId} {personnel} {statusTypes} {groups} />
	{:else if selectedReport === 'personnel-tempo'}
		<PersonnelTempo {orgId} {personnel} {statusTypes} {groups} />
	{:else if selectedReport === 'assignment-coverage'}
		<AssignmentCoverage {orgId} {personnel} {statusTypes} {groups} />
	{:else if selectedReport === 'group-readiness'}
		<GroupReadiness {orgId} {personnel} {statusTypes} {groups} />
	{/if}
</div>
