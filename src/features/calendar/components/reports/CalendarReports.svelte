<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { StatusType } from '../../calendar.types';
	import StatusDaysSummary from './StatusDaysSummary.svelte';

	interface Props {
		orgId: string;
		personnel: Personnel[];
		statusTypes: StatusType[];
		groups: { id: string; name: string }[];
	}

	let { orgId, personnel, statusTypes, groups }: Props = $props();

	type ReportType = 'status-days';
	let selectedReport = $state<ReportType>('status-days');

	const reportOptions: { value: ReportType; label: string }[] = [
		{ value: 'status-days', label: 'Status Days Summary' }
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
