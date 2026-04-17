<script lang="ts">
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import type { Group } from '$lib/stores/groups.svelte';
	import type { Personnel } from '$lib/types';
	import type { IctTask } from '$features/critical-tasks/criticalTasks.types';
	import type { IctReportSummary } from '$features/critical-tasks/utils/ictReports';

	interface Props {
		orgId: string;
		personnel: Personnel[];
		groups: Group[];
		tasks: IctTask[];
		initialSummary: IctReportSummary;
	}

	let { orgId, personnel, groups, tasks, initialSummary }: Props = $props();

	let filterGroupId = $state('');
	let filterMos = $state('');
	let filterRole = $state('');
	let filterRank = $state('');
	let fetchedSummary = $state<IctReportSummary | null>(null);
	let summaryLoading = $state(false);
	let summaryError = $state<string | null>(null);
	const summary = $derived(fetchedSummary ?? initialSummary);

	const availableMos = $derived([...new Set(personnel.map((person) => person.mos).filter(Boolean))].sort());
	const availableRoles = $derived([...new Set(personnel.map((person) => person.clinicRole).filter(Boolean))].sort());
	const availableRanks = $derived([...new Set(personnel.map((person) => person.rank).filter(Boolean))].sort());
	const hasActiveFilters = $derived(!!filterGroupId || !!filterMos || !!filterRole || !!filterRank);
	const reportQuery = $derived.by(() => {
		const params = new SvelteURLSearchParams();
		if (filterGroupId) params.set('groupId', filterGroupId);
		if (filterMos) params.set('mos', filterMos);
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

	function monthLabel(month: string): string {
		return month;
	}

	function getReadinessColor(percent: number): string {
		if (percent >= 80) return 'var(--success)';
		if (percent >= 60) return 'var(--amber)';
		return 'var(--danger)';
	}

	function getSelectValue(event: Event): string {
		return (event.target as HTMLSelectElement).value;
	}

	function clearFilters() {
		filterGroupId = '';
		filterMos = '';
		filterRole = '';
		filterRank = '';
	}

	$effect(() => {
		const href = summaryHref;
		if (href === `/org/${orgId}/api/critical-tasks/reports/summary`) {
			fetchedSummary = null;
			summaryLoading = false;
			summaryError = null;
			return;
		}

		const controller = new AbortController();
		summaryLoading = true;
		summaryError = null;

		void fetch(href, { signal: controller.signal })
			.then(async (response) => {
				if (!response.ok) {
					throw new Error('Failed to update critical task reports');
				}
				return (await response.json()) as IctReportSummary;
			})
			.then((nextSummary) => {
				if (!controller.signal.aborted) {
					fetchedSummary = nextSummary;
				}
			})
			.catch((error) => {
				if (!controller.signal.aborted) {
					summaryError = error instanceof Error ? error.message : 'Failed to update critical task reports';
				}
			})
			.finally(() => {
				if (!controller.signal.aborted) {
					summaryLoading = false;
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

{#if tasks.length === 0}
	<EmptyState message="No critical tasks configured yet." />
{:else}
	<div class="reports-page-shell">
		<div class="report-filters">
			<div class="filter-row">
				<select
					class="input filter-select"
					value={filterGroupId}
					aria-label="Filter by group"
					onchange={(event) => (filterGroupId = getSelectValue(event))}
				>
					<option value="">All Groups</option>
					{#each groups as group (group.id)}
						<option value={group.id}>{group.name}</option>
					{/each}
				</select>

				<select
					class="input filter-select"
					value={filterRank}
					aria-label="Filter by rank"
					onchange={(event) => (filterRank = getSelectValue(event))}
				>
					<option value="">All Ranks</option>
					{#each availableRanks as rank (rank)}
						<option value={rank}>{rank}</option>
					{/each}
				</select>

				<select
					class="input filter-select"
					value={filterMos}
					aria-label="Filter by MOS"
					onchange={(event) => (filterMos = getSelectValue(event))}
				>
					<option value="">All MOS</option>
					{#each availableMos as mos (mos)}
						<option value={mos}>{mos}</option>
					{/each}
				</select>

				<select
					class="input filter-select"
					value={filterRole}
					aria-label="Filter by role"
					onchange={(event) => (filterRole = getSelectValue(event))}
				>
					<option value="">All Roles</option>
					{#each availableRoles as role (role)}
						<option value={role}>{role}</option>
					{/each}
				</select>

				{#if hasActiveFilters}
					<button class="btn btn-secondary btn-sm" type="button" onclick={clearFilters}>Clear filters</button>
				{/if}
			</div>
			{#if summaryError}
				<p class="report-error" role="status">{summaryError}</p>
			{/if}
		</div>

		<div class="dashboard-grid">
			<section class="report-card report-card-highlight">
				<p class="card-label">Overall Readiness</p>
				<p class="readiness-value" style={`color: ${getReadinessColor(summary.overallReadinessPercent)}`}>
					{summary.overallReadinessPercent}%
				</p>
			</section>

			<section class="report-card">
				<p class="card-label">Best Performing MOS</p>
				{#if summary.bestPerformingMos}
					<p class="mos-name">{summary.bestPerformingMos.mos}</p>
					<p class="metric-copy">{summary.bestPerformingMos.readinessPercent}% readiness</p>
				{:else}
					<p class="metric-copy">No applicable tasks</p>
				{/if}
			</section>

			<section class="report-card">
				<p class="card-label">Worst Performing MOS</p>
				{#if summary.worstPerformingMos}
					<p class="mos-name">{summary.worstPerformingMos.mos}</p>
					<p class="metric-copy">{summary.worstPerformingMos.readinessPercent}% readiness</p>
				{:else}
					<p class="metric-copy">No applicable tasks</p>
				{/if}
			</section>
		</div>

		<div class="reports-grid">
			<section class="report-panel">
				<div class="panel-header">
					<h2>Readiness by MOS</h2>
					{#if summaryLoading}
						<span class="panel-status">Updating...</span>
					{/if}
				</div>
				{#if summary.readinessByMos.length === 0}
					<p class="empty-copy">No applicable task data for the current filters.</p>
				{:else}
					<ul class="report-list">
						{#each summary.readinessByMos as row (row.mos)}
							<li class="report-list-item">
								<div>
									<p class="mos-name">{row.mos}</p>
									<p class="metric-copy">{row.readyCount} of {row.applicableCount} ready</p>
								</div>
								<div class="bar-row">
									<div class="bar-track">
										<div
											class="bar-fill"
											style={`width: ${row.readinessPercent}%; background-color: ${getReadinessColor(row.readinessPercent)}`}
										></div>
									</div>
									<span class="bar-value">{row.readinessPercent}%</span>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section class="report-panel">
				<div class="panel-header">
					<h2>Completion Trend</h2>
					{#if summaryLoading}
						<span class="panel-status">Updating...</span>
					{/if}
				</div>
				{#if summary.completionTrend.length === 0}
					<p class="empty-copy">No completion history for the current filters.</p>
				{:else}
					<ul class="trend-list">
						{#each summary.completionTrend as point (point.month)}
							<li class="trend-item">
								<span class="trend-month">{monthLabel(point.month)}</span>
								<span class="trend-count">{point.completions}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		</div>
	</div>
{/if}

<style>
	.reports-page-shell {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		padding: var(--sp-3);
	}

	.report-filters,
	.report-card,
	.report-panel {
		border: var(--border-thin);
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
		min-width: 9rem;
		max-width: 12rem;
	}

	.report-error {
		margin: var(--sp-2) 0 0;
		color: var(--danger);
	}

	.dashboard-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--sp-4);
	}

	.report-card,
	.report-panel {
		padding: var(--sp-4);
	}

	.report-card-highlight {
		background: color-mix(in srgb, var(--surface-panel) 88%, var(--surface-subtle) 12%);
	}

	.card-label {
		margin: 0 0 var(--sp-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.readiness-value,
	.mos-name,
	.bar-value,
	.trend-count {
		margin: 0;
		font-family: var(--font-display);
		font-weight: var(--font-weight-display);
		text-transform: uppercase;
	}

	.readiness-value {
		font-size: clamp(2.6rem, 2.2rem + 1vw, 3.2rem);
		line-height: 1;
	}

	.mos-name {
		font-size: var(--text-2xl);
		line-height: 1;
		color: var(--text-primary);
	}

	.metric-copy,
	.empty-copy,
	.trend-month {
		margin: var(--sp-1) 0 0;
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.reports-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--sp-4);
	}

	.panel-header {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--sp-3);
	}

	.panel-header h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: var(--font-weight-bold);
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.panel-status {
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.report-list,
	.trend-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.report-list-item,
	.trend-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		padding-top: var(--sp-3);
		border-top: var(--border-rule);
	}

	.report-list-item:first-child,
	.trend-item:first-child {
		padding-top: 0;
		border-top: 0;
	}

	.bar-row {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-width: 12rem;
	}

	.bar-track {
		flex: 1;
		height: 0.75rem;
		border-radius: var(--radius-pill);
		background: var(--surface-subtle);
		overflow: hidden;
	}

	.bar-fill {
		height: 100%;
		border-radius: inherit;
	}

	.bar-value,
	.trend-count {
		font-size: var(--text-lg);
		line-height: 1;
		color: var(--text-primary);
	}

	.trend-month {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
	}

	@media (max-width: 960px) {
		.dashboard-grid,
		.reports-grid {
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

		.bar-row,
		.report-list-item,
		.trend-item {
			align-items: start;
			flex-direction: column;
		}
	}
</style>
