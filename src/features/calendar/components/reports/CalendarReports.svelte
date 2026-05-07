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
		personnel: Personnel[];
		statusTypes: StatusType[];
		groups: { id: string; name: string }[];
	}

	let { orgId, personnel, statusTypes, groups }: Props = $props();

	type ReportType =
		| 'status-days'
		| 'availability-forecast'
		| 'personnel-tempo'
		| 'assignment-coverage'
		| 'group-readiness';
	let selectedReport = $state<ReportType>('status-days');

	const reportOptions: { value: ReportType; label: string }[] = [
		{ value: 'status-days', label: 'Status Days Summary' },
		{ value: 'availability-forecast', label: 'Availability Forecast' },
		{ value: 'personnel-tempo', label: 'Personnel Tempo (OPTEMPO)' },
		{ value: 'assignment-coverage', label: 'Assignment Coverage' },
		{ value: 'group-readiness', label: 'Group/Section Readiness' }
	];
	const relatedLinks = $derived([{ label: 'Calendar', href: `/org/${orgId}/calendar` }]);
</script>

<div class="reports-page">
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

<style>
	.reports-page {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}
</style>
