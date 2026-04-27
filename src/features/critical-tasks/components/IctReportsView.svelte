<script lang="ts">
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import {
		Toolbar,
		ToolbarActions,
		ToolbarFilterSelect,
		ToolbarGroup,
		ToolbarMultiSelectFilter,
		type ToolbarActionConfig
	} from '$lib/components/ui/toolbar';
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
	const toolbarActionItems = $derived.by<ToolbarActionConfig[]>(() => {
		const items: ToolbarActionConfig[] = [];

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

<div class="reports-page-shell">
	<Toolbar ariaLabel="Critical task report controls" collapse="wide" leadingMin="52rem">
		{#snippet leading()}
			<ToolbarGroup label="Critical task report filters" activeCount={activeFilterCount} testId="ict-report-filters">
				{#snippet full()}
					<ToolbarFilterSelect
						options={groupOptions}
						value={filterGroupId}
						ariaLabel="Filter by group"
						defaultValue=""
						width="wide"
						mode="full"
						disabled={loading}
						onValueChange={(value) => (filterGroupId = value)}
					/>

					<ToolbarFilterSelect
						options={rankOptions}
						value={filterRank}
						ariaLabel="Filter by rank"
						defaultValue=""
						width="wide"
						mode="full"
						disabled={loading}
						onValueChange={(value) => (filterRank = value)}
					/>

					<ToolbarMultiSelectFilter
						options={availableMosOptions}
						value={filterMosValues}
						label="MOS"
						placeholder="All MOS"
						ariaLabel="Filter by MOS"
						disabled={loading}
						mode="full"
						onChange={(values) => (filterMosValues = values)}
					/>

					<ToolbarFilterSelect
						options={roleOptions}
						value={filterRole}
						ariaLabel="Filter by duty role"
						defaultValue=""
						width="wide"
						mode="full"
						disabled={loading}
						onValueChange={(value) => (filterRole = value)}
					/>
				{/snippet}
			</ToolbarGroup>
		{/snippet}

		<ToolbarActions
			actions={toolbarActionItems}
			ariaLabel="Critical task report actions"
			overflowAriaLabel="More critical task report actions"
		/>
	</Toolbar>

	{#if dashboardError}
		<p class="report-error" role="alert">{dashboardError}</p>
	{/if}

	{#if loading}
		<section class="report-state" aria-busy="true" aria-live="polite" role="status">
			Loading critical task reports...
		</section>
	{:else if !hasActiveTasks}
		<EmptyState message="No active critical tasks configured." />
	{:else}
		<IctReportKpiStrip {dashboard} loading={dashboardLoading} />
		<IctReadinessMatrixTable matrix={dashboard.readinessMatrix} loading={dashboardLoading} />
		<div class="report-visual-grid">
			<IctReadinessTrendChart trend={dashboard.readinessTrend} loading={dashboardLoading} />
			<IctTasksBelowThresholdTable
				rows={dashboard.tasksBelowThreshold.rows}
				thresholdPercent={dashboard.tasksBelowThreshold.thresholdPercent}
				loading={dashboardLoading}
			/>
		</div>
		<div class="report-followup-grid">
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

<style>
	.reports-page-shell {
		display: flex;
		flex-direction: column;
		gap: var(--sp-5);
		padding: var(--sp-4);
	}

	.report-visual-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--sp-4);
		align-items: start;
	}

	.report-followup-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--sp-4);
		align-items: start;
	}

	.report-state {
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
	}

	.report-error {
		margin: 0;
		color: var(--danger);
	}

	.report-state {
		background: var(--surface-panel);
		min-height: 8.5rem;
		display: grid;
		place-items: center;
		padding: var(--sp-4);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	@media (max-width: 1024px) {
		.report-visual-grid,
		.report-followup-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 640px) {
		.reports-page-shell {
			padding: var(--sp-2);
		}
	}
</style>
