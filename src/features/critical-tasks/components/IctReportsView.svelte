<script lang="ts">
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import * as ReportWorkspace from '$lib/components/ui/report-workspace';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import type { WorkspaceToolbarAction } from '$lib/components/ui/workspace-toolbar';
	import type { Group } from '$lib/stores/groups.svelte';
	import type { Personnel } from '$lib/types';
	import type { IctTask } from '$features/critical-tasks/criticalTasks.types';
	import type { IctReportDashboard } from '$features/critical-tasks/utils/ictReports';
	import IctAtRiskSoldiersTable from './IctAtRiskSoldiersTable.svelte';
	import IctExpirationCliffChart from './IctExpirationCliffChart.svelte';
	import IctReportKpiStrip from './IctReportKpiStrip.svelte';
	import IctReadinessDistributionHistogram from './IctReadinessDistributionHistogram.svelte';
	import IctReadinessMatrixTable from './IctReadinessMatrixTable.svelte';
	import IctReadinessTrendChart from './IctReadinessTrendChart.svelte';
	import IctTasksBelowThresholdTable from './IctTasksBelowThresholdTable.svelte';

	interface Props {
		orgId: string;
		personnel: Personnel[];
		groups: Group[];
		tasks: IctTask[];
		initialDashboard: IctReportDashboard;
		loading?: boolean;
	}

	let { orgId, personnel, groups, tasks, initialDashboard, loading = false }: Props = $props();

	let filterGroupId = $state('');
	let filterMosValues = $state<string[]>([]);
	let filterRole = $state('');
	let filterRank = $state('');
	let fetchedDashboard = $state<IctReportDashboard | null>(null);
	let dashboardLoading = $state(false);
	let dashboardError = $state<string | null>(null);
	const dashboard = $derived(fetchedDashboard ?? initialDashboard);

	const availableMos = $derived([...new Set(personnel.map((person) => person.mos).filter(Boolean))].sort());
	const availableMosOptions = $derived(availableMos.map((mos) => ({ value: mos, label: mos })));
	const availableRoles = $derived([...new Set(personnel.map((person) => person.clinicRole).filter(Boolean))].sort());
	const availableRanks = $derived([...new Set(personnel.map((person) => person.rank).filter(Boolean))].sort());
	const groupOptions = $derived([
		{ value: '', label: 'All Groups' },
		...groups.map((group) => ({ value: group.id, label: group.name }))
	]);
	const rankOptions = $derived([
		{ value: '', label: 'All Ranks' },
		...availableRanks.map((rank) => ({ value: rank, label: rank }))
	]);
	const roleOptions = $derived([
		{ value: '', label: 'All Duty Roles' },
		...availableRoles.map((role) => ({ value: role, label: role }))
	]);
	const hasActiveTasks = $derived(tasks.some((task) => !task.archivedAt));
	const hasActiveFilters = $derived(!!filterGroupId || filterMosValues.length > 0 || !!filterRole || !!filterRank);
	const reportQuery = $derived.by(() => {
		const params = new SvelteURLSearchParams();
		if (filterGroupId) params.set('groupId', filterGroupId);
		for (const mos of [...filterMosValues].sort()) {
			params.append('mos', mos);
		}
		if (filterRole) params.set('role', filterRole);
		if (filterRank) params.set('rank', filterRank);
		return params.toString();
	});
	const exportHref = $derived.by(() => {
		const query = reportQuery;
		return `/org/${orgId}/api/critical-tasks/reports/export${query ? `?${query}` : ''}`;
	});
	const summaryHref = $derived.by(() => {
		const query = reportQuery;
		return `/org/${orgId}/api/critical-tasks/reports/summary${query ? `?${query}` : ''}`;
	});
	const activeFilterCount = $derived(
		(filterGroupId ? 1 : 0) + filterMosValues.length + (filterRole ? 1 : 0) + (filterRank ? 1 : 0)
	);
	const toolbarActionItems = $derived.by<WorkspaceToolbarAction[]>(() => {
		const items: WorkspaceToolbarAction[] = [];

		if (hasActiveFilters) {
			items.push({
				id: 'clear-filters',
				label: 'Clear filters',
				onclick: clearFilters,
				disabled: loading,
				priority: 'normal',
				variant: 'secondary'
			});
		}

		items.push({
			id: 'export-csv',
			label: 'Export CSV',
			href: exportHref,
			icon: 'download',
			priority: 'critical',
			overflow: 'never',
			variant: 'primary'
		});

		return items;
	});

	function clearFilters() {
		filterGroupId = '';
		filterMosValues = [];
		filterRole = '';
		filterRank = '';
	}

	$effect(() => {
		const href = summaryHref;
		if (href === `/org/${orgId}/api/critical-tasks/reports/summary`) {
			fetchedDashboard = null;
			dashboardLoading = false;
			dashboardError = null;
			return;
		}

		const controller = new AbortController();
		dashboardLoading = true;
		dashboardError = null;

		void fetch(href, { signal: controller.signal })
			.then(async (response) => {
				if (!response.ok) {
					throw new Error('Failed to update critical task reports');
				}
				return (await response.json()) as IctReportDashboard;
			})
			.then((nextDashboard) => {
				if (!controller.signal.aborted) {
					fetchedDashboard = nextDashboard;
				}
			})
			.catch((error) => {
				if (!controller.signal.aborted) {
					dashboardError = error instanceof Error ? error.message : 'Failed to update critical task reports';
				}
			})
			.finally(() => {
				if (!controller.signal.aborted) {
					dashboardLoading = false;
				}
			});

		return () => {
			controller.abort();
		};
	});
</script>

<div class="flex flex-col gap-5 p-4 sm:p-2 md:p-4">
	<WorkspaceToolbar.Root ariaLabel="Critical task report controls">
		<WorkspaceToolbar.Group
			label="Critical task report filters"
			activeCount={activeFilterCount}
			data-testid="ict-report-filters"
		>
			<WorkspaceToolbar.Select
				options={groupOptions}
				value={filterGroupId}
				ariaLabel="Filter by group"
				disabled={loading}
				onValueChange={(value) => (filterGroupId = value)}
			/>

			<WorkspaceToolbar.Select
				options={rankOptions}
				value={filterRank}
				ariaLabel="Filter by rank"
				disabled={loading}
				onValueChange={(value) => (filterRank = value)}
			/>

			<WorkspaceToolbar.MultiSelect
				options={availableMosOptions}
				value={filterMosValues}
				label="MOS"
				ariaLabel="Filter by MOS"
				disabled={loading}
				onChange={(values) => (filterMosValues = values)}
			/>

			<WorkspaceToolbar.Select
				options={roleOptions}
				value={filterRole}
				ariaLabel="Filter by duty role"
				disabled={loading}
				onValueChange={(value) => (filterRole = value)}
			/>
		</WorkspaceToolbar.Group>

		<WorkspaceToolbar.Group label="Critical task report actions" zone="actions">
			<WorkspaceToolbar.Actions
				actions={toolbarActionItems}
				ariaLabel="Critical task report actions"
				overflowAriaLabel="More critical task report actions"
			/>
		</WorkspaceToolbar.Group>
	</WorkspaceToolbar.Root>

	{#if dashboardError}
		<ReportWorkspace.State
			state="error"
			title="Unable to update critical task reports"
			description={dashboardError}
			role="alert"
		/>
	{/if}

	{#if loading}
		<ReportWorkspace.State state="loading" title="Loading critical task reports..." />
	{:else if !hasActiveTasks}
		<ReportWorkspace.State
			state="no-data"
			title="No active critical tasks configured."
			description="Add active critical tasks before running readiness reports."
		/>
	{:else}
		<IctReportKpiStrip {dashboard} loading={dashboardLoading} />
		<IctReadinessMatrixTable matrix={dashboard.readinessMatrix} loading={dashboardLoading} />
		<div class="grid items-start gap-4 xl:grid-cols-2">
			<IctReadinessTrendChart trend={dashboard.readinessTrend} loading={dashboardLoading} />
			<IctTasksBelowThresholdTable
				rows={dashboard.tasksBelowThreshold.rows}
				thresholdPercent={dashboard.tasksBelowThreshold.thresholdPercent}
				loading={dashboardLoading}
			/>
		</div>
		<div class="grid items-start gap-4 xl:grid-cols-2">
			<IctExpirationCliffChart
				cliff={dashboard.expirationCliff}
				currentReadinessPercent={dashboard.kpis.overallReadiness.percent}
				loading={dashboardLoading}
			/>
			<IctAtRiskSoldiersTable
				rows={dashboard.atRiskSoldiers.rows}
				expiringSoonWindowDays={dashboard.kpis.tasksExpiringSoon.windowDays}
				loading={dashboardLoading}
			/>
		</div>
		<IctReadinessDistributionHistogram
			distribution={dashboard.readinessDistribution}
			selectedPageMos={filterMosValues}
			loading={dashboardLoading}
		/>
	{/if}
</div>
