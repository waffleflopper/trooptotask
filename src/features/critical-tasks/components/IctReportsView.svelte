<script lang="ts">
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import MultiTagSelect from '$lib/components/ui/MultiTagSelect.svelte';
	import SearchSelect from '$lib/components/ui/SearchSelect.svelte';
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
	const groupOptions = $derived(groups.map((group) => ({ value: group.id, label: group.name })));
	const rankOptions = $derived(availableRanks.map((rank) => ({ value: rank, label: rank })));
	const roleOptions = $derived(availableRoles.map((role) => ({ value: role, label: role })));
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

<PageToolbar
	title="Critical Task Reports"
	titleBadge="Beta"
	breadcrumbs={[{ label: 'Critical Tasks', href: `/org/${orgId}/critical-tasks` }, { label: 'Reports' }]}
>
	<a class="btn btn-sm" href={exportHref}>Export CSV</a>
	<a class="btn btn-secondary btn-sm" href={`/org/${orgId}/critical-tasks`}>Back</a>
</PageToolbar>

<div class="reports-page-shell">
	<div class="report-filters">
		<div class="filter-row">
			<span class="filter-label">Filter</span>
			<div class="filter-select">
				<SearchSelect
					options={groupOptions}
					value={filterGroupId}
					placeholder="All Groups"
					ariaLabel="Filter by group"
					disabled={loading}
					compact
					onchange={(value) => (filterGroupId = value)}
				/>
			</div>

			<div class="filter-select">
				<SearchSelect
					options={rankOptions}
					value={filterRank}
					placeholder="All Ranks"
					ariaLabel="Filter by rank"
					disabled={loading}
					compact
					onchange={(value) => (filterRank = value)}
				/>
			</div>

			<div class="filter-multi">
				<MultiTagSelect
					options={availableMosOptions}
					value={filterMosValues}
					placeholder="All MOS"
					ariaLabel="Filter by MOS"
					disabled={loading}
					onChange={(values) => (filterMosValues = values)}
				/>
			</div>

			<div class="filter-select">
				<SearchSelect
					options={roleOptions}
					value={filterRole}
					placeholder="All Roles"
					ariaLabel="Filter by role"
					disabled={loading}
					compact
					onchange={(value) => (filterRole = value)}
				/>
			</div>

			{#if hasActiveFilters}
				<button class="btn btn-secondary btn-sm" type="button" disabled={loading} onclick={clearFilters}
					>Clear filters</button
				>
			{/if}
		</div>
		{#if dashboardError}
			<p class="report-error" role="alert">{dashboardError}</p>
		{/if}
	</div>

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

	.report-filters,
	.report-state {
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
	}

	.report-filters {
		background: var(--surface-subtle);
		padding: 14px 18px;
	}

	.filter-row {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: center;
	}

	.filter-label {
		margin-right: var(--sp-1);
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.filter-select {
		flex: 0 1 8.75rem;
		width: 8.75rem;
		min-width: 8.75rem;
		max-width: 10.5rem;
	}

	.filter-multi {
		flex: 0 1 17.5rem;
		width: 17.5rem;
		min-width: 17.5rem;
		max-width: 20rem;
	}

	.report-filters :global(.input-wrapper),
	.report-filters :global(.mts-control) {
		min-height: 34px;
		border-color: color-mix(in srgb, var(--border-default) 82%, var(--text-primary) 18%);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		box-shadow: none;
	}

	.report-filters :global(.display-btn),
	.report-filters :global(.search-input),
	.report-filters :global(.mts-input) {
		font-family: var(--font-body);
		font-size: var(--text-sm);
		color: var(--text-primary);
	}

	.report-filters :global(.display-btn) {
		min-height: 32px;
		padding: 7px 28px 7px 12px;
	}

	.report-filters :global(.display-icon) {
		width: 12px;
		height: 12px;
	}

	.report-filters :global(.mts-control) {
		padding: 5px 8px;
	}

	.filter-multi :global(.mts-control) {
		height: 34px;
		flex-wrap: nowrap;
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: thin;
	}

	.filter-multi :global(.mts-control::-webkit-scrollbar) {
		height: 4px;
	}

	.filter-multi :global(.mts-control::-webkit-scrollbar-thumb) {
		background: color-mix(in srgb, var(--text-tertiary) 42%, transparent);
		border-radius: var(--radius-sm);
	}

	.report-filters :global(.mts-tag) {
		flex: 0 0 auto;
		max-width: 5.5rem;
		padding: 2px 4px 2px 6px;
		font-size: 0.625rem;
	}

	.filter-multi :global(.mts-input) {
		flex: 0 0 4rem;
		min-width: 4rem;
	}

	.filter-multi :global(.mts-input:placeholder-shown) {
		flex-basis: 100%;
	}

	.report-filters :global(.btn) {
		min-height: 34px;
		border-radius: var(--radius-sm);
		padding: 7px 12px;
		font-size: var(--text-sm);
	}

	.report-error {
		margin: var(--sp-2) 0 0;
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

		.filter-label {
			flex: 1 0 100%;
		}

		.filter-select {
			width: 100%;
			min-width: 0;
			max-width: none;
		}

		.filter-multi {
			width: 100%;
			min-width: 0;
			max-width: none;
		}
	}
</style>
