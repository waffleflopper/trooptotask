<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { StatusType } from '$lib/types';
	import StatusDaysSummary from './StatusDaysSummary.svelte';
	import AvailabilityForecast from './AvailabilityForecast.svelte';
	import PersonnelTempo from './PersonnelTempo.svelte';
	import AssignmentCoverage from './AssignmentCoverage.svelte';
	import GroupReadiness from './GroupReadiness.svelte';
	import FloatingPageToolbar from '$lib/components/FloatingPageToolbar.svelte';
	import ToolbarSelect from '$lib/components/ui/ToolbarSelect.svelte';

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
</script>

<div class="reports-page">
	<FloatingPageToolbar ariaLabel="Calendar report controls" collapse="narrow" leadingMin="20rem">
		{#snippet leading()}
			<ToolbarSelect ariaLabel="Report type" options={reportOptions} bind:value={selectedReport} width="wide" />
		{/snippet}

		<a href="/org/{orgId}/calendar" class="btn btn-sm">Calendar</a>
	</FloatingPageToolbar>

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
