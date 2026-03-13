<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { StatusType } from '../../calendar.types';
	import StatusDaysSummary from './StatusDaysSummary.svelte';
	import AvailabilityForecast from './AvailabilityForecast.svelte';
	import PersonnelTempo from './PersonnelTempo.svelte';
	import AssignmentCoverage from './AssignmentCoverage.svelte';
	import GroupReadiness from './GroupReadiness.svelte';

	interface Props {
		orgId: string;
		personnel: Personnel[];
		statusTypes: StatusType[];
		groups: { id: string; name: string }[];
	}

	let { orgId, personnel, statusTypes, groups }: Props = $props();

	type ReportType = 'status-days' | 'availability-forecast' | 'personnel-tempo' | 'assignment-coverage' | 'group-readiness';
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
	<div class="report-selector">
		<label class="form-group">
			<span class="label">Report Type</span>
			<select class="select" bind:value={selectedReport}>
				{#each reportOptions as opt (opt.value)}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
		</label>
	</div>

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
		gap: var(--spacing-md);
	}

	.report-selector {
		max-width: 300px;
	}
</style>
