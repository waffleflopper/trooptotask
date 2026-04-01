<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { StatusType } from '$lib/types';
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
	<section class="report-selector-shell">
		<div class="report-selector-copy">
			<p class="report-eyebrow">Calendar reports</p>
			<h2>Pick the view that answers the question in front of you.</h2>
			<p>Switch between readiness, tempo, and coverage summaries without bouncing through separate routes.</p>
		</div>
		<label class="report-selector-field form-group">
			<span class="label">Report Type</span>
			<select class="select" bind:value={selectedReport}>
				{#each reportOptions as opt (opt.value)}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
		</label>
	</section>

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
		gap: var(--sp-5);
	}

	.report-selector-shell {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: var(--sp-5);
		padding: var(--sp-5);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		background: color-mix(in srgb, var(--surface-panel) 90%, var(--surface-subtle) 10%);
		box-shadow: var(--shadow-sm);
	}

	.report-selector-copy {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		max-width: 58ch;
	}

	.report-eyebrow {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--amber-dark);
	}

	.report-selector-copy h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.2rem, 2vw, 1.65rem);
		line-height: 1.1;
		color: var(--text-primary);
	}

	.report-selector-copy p {
		margin: 0;
		font-size: var(--text-sm);
		line-height: var(--line-height-copy);
		color: var(--text-secondary);
	}

	.report-selector-field {
		width: min(100%, 320px);
		flex-shrink: 0;
	}

	@media (max-width: 720px) {
		.report-selector-shell {
			flex-direction: column;
			align-items: stretch;
			padding: var(--sp-4);
		}

		.report-selector-field {
			width: 100%;
		}
	}
</style>
