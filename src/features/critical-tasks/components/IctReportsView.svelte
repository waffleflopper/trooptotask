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
			<div class="filter-select">
				<SearchSelect
					options={groupOptions}
					value={filterGroupId}
					placeholder="All Groups"
					ariaLabel="Filter by group"
					disabled={loading}
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
	{:else if tasks.length === 0}
		<EmptyState message="No critical tasks configured yet." />
	{:else}
		<IctReportKpiStrip {dashboard} loading={dashboardLoading} />
		<div class="report-visual-grid">
			<IctReadinessTrendChart trend={dashboard.readinessTrend} loading={dashboardLoading} />
			<IctTasksBelowThresholdTable
				rows={dashboard.tasksBelowThreshold.rows}
				thresholdPercent={dashboard.tasksBelowThreshold.thresholdPercent}
				loading={dashboardLoading}
			/>
		</div>
		<div class="report-followup-grid">
			<IctExpirationCliffChart cliff={dashboard.expirationCliff} loading={dashboardLoading} />
			<IctAtRiskSoldiersTable rows={dashboard.atRiskSoldiers.rows} loading={dashboardLoading} />
		</div>
	{/if}
</div>

<style>
	.reports-page-shell {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		padding: var(--sp-3);
	}

	.report-visual-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--sp-4);
		align-items: start;
	}

	.report-followup-grid {
		display: grid;
		grid-template-columns: minmax(20rem, 0.85fr) minmax(0, 1.15fr);
		gap: var(--sp-4);
		align-items: start;
	}

	.report-filters,
	.report-state {
		border: 0.5px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	.report-filters {
		padding: var(--sp-4);
	}

	.filter-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		align-items: end;
	}

	.filter-select {
		flex: 0 1 12rem;
		width: 12rem;
		min-width: 9rem;
		max-width: 12rem;
	}

	.filter-multi {
		flex: 0 1 12rem;
		width: 12rem;
		min-width: 9rem;
		max-width: 12rem;
	}

	.report-error {
		margin: var(--sp-2) 0 0;
		color: var(--danger);
	}

	.report-state {
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

		.filter-select {
			width: 100%;
			max-width: none;
		}

		.filter-multi {
			width: 100%;
			max-width: none;
		}
	}
</style>
