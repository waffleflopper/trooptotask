<script lang="ts">
	import type { Group, Personnel } from '$features/personnel/contracts';
	import type { StatusType } from '$features/calendar/contracts';
	import StatusDaysSummary from './StatusDaysSummary.svelte';
	import AvailabilityForecast from './AvailabilityForecast.svelte';
	import PersonnelTempo from './PersonnelTempo.svelte';
	import AssignmentCoverage from './AssignmentCoverage.svelte';
	import GroupReadiness from './GroupReadiness.svelte';
	import { WorkspaceToolbar, type ToolbarAction, type ToolbarItem } from '$lib/components/patterns/workspace-toolbar';

	interface Props {
		orgId: string;
		orgUrlSegment?: string;
		personnel: Personnel[];
		statusTypes: StatusType[];
		groups: Group[];
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

	let activeReport = $state<{ exportAction(): ToolbarAction | undefined } | null>(null);
	const exportAction = $derived(activeReport?.exportAction());

	const toolbarItems = $derived<ToolbarItem[]>([
		{
			kind: 'select',
			id: 'report-type',
			label: 'Report type',
			options: reportOptions,
			value: selectedReport,
			defaultValue: 'status-days',
			onValueChange: (value) => (selectedReport = value as ReportType)
		},
		...(exportAction ? [exportAction] : []),
		{ kind: 'action', id: 'calendar', label: 'Calendar', href: `/org/${orgUrlSegment}/calendar` }
	]);
</script>

<div class="flex flex-col gap-4">
	<WorkspaceToolbar ariaLabel="Calendar report controls" items={toolbarItems} />

	{#if selectedReport === 'status-days'}
		<StatusDaysSummary bind:this={activeReport} {orgId} {personnel} {statusTypes} {groups} />
	{:else if selectedReport === 'availability-forecast'}
		<AvailabilityForecast bind:this={activeReport} {orgId} {personnel} {statusTypes} {groups} />
	{:else if selectedReport === 'personnel-tempo'}
		<PersonnelTempo bind:this={activeReport} {orgId} {personnel} {statusTypes} {groups} />
	{:else if selectedReport === 'assignment-coverage'}
		<AssignmentCoverage bind:this={activeReport} {orgId} {personnel} {statusTypes} {groups} />
	{:else if selectedReport === 'group-readiness'}
		<GroupReadiness bind:this={activeReport} {orgId} {personnel} {statusTypes} {groups} />
	{/if}
</div>
