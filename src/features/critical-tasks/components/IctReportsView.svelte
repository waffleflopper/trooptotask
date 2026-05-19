<script lang="ts">
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Progress from '$lib/components/ui/progress';
	import * as ReportWorkspace from '$lib/components/ui/report-workspace';
	import * as Separator from '$lib/components/ui/separator';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import type { WorkspaceToolbarAction } from '$lib/components/ui/workspace-toolbar';
	import { downloadBlob, filenameFromContentDisposition } from '$lib/export/workbook';
	import type { IctReportDashboard, IctReportScope } from '$features/critical-tasks/utils/ictReports';
	import IctAtRiskSoldiersTable from './IctAtRiskSoldiersTable.svelte';
	import IctExpirationCliffChart from './IctExpirationCliffChart.svelte';
	import IctReadinessDistributionHistogram from './IctReadinessDistributionHistogram.svelte';
	import IctReadinessMatrixTable from './IctReadinessMatrixTable.svelte';
	import IctReadinessTrendChart from './IctReadinessTrendChart.svelte';
	import IctTasksBelowThresholdTable from './IctTasksBelowThresholdTable.svelte';

	interface Props {
		orgId: string;
		reportScope: IctReportScope;
		initialDashboard: IctReportDashboard;
		loading?: boolean;
	}

	let { orgId, reportScope, initialDashboard, loading = false }: Props = $props();

	let filterGroupId = $state('');
	let filterMosValues = $state<string[]>([]);
	let filterRole = $state('');
	let filterRank = $state('');
	let fetchedDashboard = $state<IctReportDashboard | null>(null);
	let dashboardLoading = $state(false);
	let dashboardError = $state<string | null>(null);
	let exportLoading = $state(false);
	const dashboard = $derived(fetchedDashboard ?? initialDashboard);

	const availableMosOptions = $derived(reportScope.filterOptions.mos.map((mos) => ({ value: mos, label: mos })));
	const groupOptions = $derived([
		{ value: '', label: 'All Groups' },
		...reportScope.groups.map((group) => ({ value: group.id, label: group.name }))
	]);
	const rankOptions = $derived([
		{ value: '', label: 'All Ranks' },
		...reportScope.filterOptions.ranks.map((rank) => ({ value: rank, label: rank }))
	]);
	const roleOptions = $derived([
		{ value: '', label: 'All Duty Roles' },
		...reportScope.filterOptions.roles.map((role) => ({ value: role, label: role }))
	]);
	const hasActiveTasks = $derived(reportScope.hasActiveTasks);
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
	const filteredPersonnelCount = $derived(
		reportScope.personnel.filter((person) => {
			if (filterGroupId && person.groupId !== filterGroupId) return false;
			if (filterMosValues.length > 0 && !filterMosValues.includes(person.mos)) return false;
			if (filterRole && person.dutyRole !== filterRole) return false;
			if (filterRank && person.rank !== filterRank) return false;
			return true;
		}).length
	);
	const reportMeta = $derived([
		{ label: 'Filters', value: activeFilterCount },
		{ label: 'Population', value: filteredPersonnelCount }
	]);
	const readinessVariant = $derived.by(() => {
		const percent = dashboard.kpis.overallReadiness.percent;
		if (percent >= 80) return 'success';
		if (percent >= 70) return 'warning';
		return 'destructive';
	});
	const readinessDeltaLabel = $derived(formatDelta(dashboard.kpis.overallReadiness.deltaPercent));
	const readinessProgress = $derived(Math.max(0, Math.min(100, dashboard.kpis.overallReadiness.percent)));
	const topTasksBelowThreshold = $derived(dashboard.tasksBelowThreshold.rows.slice(0, 4));
	const topAtRiskSoldiers = $derived(dashboard.atRiskSoldiers.rows.slice(0, 5));
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
			id: 'export-excel',
			label: exportLoading ? 'Exporting...' : 'Export Excel',
			onclick: exportExcel,
			icon: 'download',
			priority: 'critical',
			overflow: 'never',
			variant: 'primary',
			disabled: exportLoading
		});

		return items;
	});

	function clearFilters() {
		filterGroupId = '';
		filterMosValues = [];
		filterRole = '';
		filterRank = '';
	}

	function formatDelta(delta: number): string {
		if (delta > 0) return `+${delta}% over 30 days`;
		if (delta < 0) return `${delta}% over 30 days`;
		return 'Flat over 30 days';
	}

	async function exportExcel(): Promise<void> {
		if (exportLoading) return;
		exportLoading = true;
		dashboardError = null;
		try {
			const response = await fetch(exportHref);
			if (!response.ok) {
				throw new Error('Failed to export critical task report');
			}
			const blob = await response.blob();
			downloadBlob(
				blob,
				filenameFromContentDisposition(response.headers.get('Content-Disposition'), 'critical-task-report.xlsx')
			);
		} catch (error) {
			dashboardError = error instanceof Error ? error.message : 'Failed to export critical task report';
		} finally {
			exportLoading = false;
		}
	}

	function readinessBadgeVariant(percent: number | null): 'success' | 'warning' | 'destructive' | 'secondary' {
		if (percent === null) return 'secondary';
		if (percent >= 80) return 'success';
		if (percent >= 70) return 'warning';
		return 'destructive';
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
		<ReportWorkspace.Root ariaLabel="Critical task analysis console">
			<div class="border-b border-border pb-4">
				<dl class="flex flex-wrap gap-x-4 gap-y-1" aria-label="Critical task report scope">
					{#each reportMeta as item (`${item.label}-${item.value}`)}
						<div class="flex items-center gap-1.5 text-xs">
							<dt class="font-mono font-semibold uppercase tracking-[0.08em] text-muted-foreground">{item.label}</dt>
							<dd class="text-foreground">{item.value}</dd>
						</div>
					{/each}
				</dl>
			</div>

			<div class="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
				<aside class="space-y-4">
					<Card.Root>
						<Card.Header>
							<Card.Title>Readiness summary</Card.Title>
							<Card.Description>{dashboardLoading ? 'Updating' : 'Current filtered population'}</Card.Description>
						</Card.Header>
						<Card.Content class="space-y-4">
							<div>
								<div class="flex items-center justify-between gap-3">
									<span class="text-sm text-muted-foreground">Overall</span>
									<Badge variant={readinessVariant}>{dashboard.kpis.overallReadiness.percent}%</Badge>
								</div>
								<Progress.Progress class="mt-2" value={readinessProgress} aria-label="Overall readiness" />
							</div>
							<Separator.Separator />
							<div class="grid gap-3 text-sm">
								<div class="flex items-center justify-between gap-3">
									<span class="text-muted-foreground">Ready</span>
									<span class="font-medium">{dashboard.kpis.overallReadiness.readyCount}</span>
								</div>
								<div class="flex items-center justify-between gap-3">
									<span class="text-muted-foreground">Applicable</span>
									<span class="font-medium">{dashboard.kpis.overallReadiness.applicableCount}</span>
								</div>
								<div class="flex items-center justify-between gap-3">
									<span class="text-muted-foreground">30-day delta</span>
									<span class="font-medium">{readinessDeltaLabel}</span>
								</div>
							</div>
						</Card.Content>
					</Card.Root>

					<Card.Root>
						<Card.Header>
							<Card.Title>Immediate risk</Card.Title>
							<Card.Description>Top rows from the active filter set.</Card.Description>
						</Card.Header>
						<Card.Content class="space-y-4">
							<div class="space-y-2">
								<p class="text-sm font-medium">Tasks</p>
								{#each topTasksBelowThreshold as task (task.taskId)}
									<div class="rounded-lg border bg-background p-3">
										<div class="flex items-start justify-between gap-3">
											<p class="text-sm font-medium">{task.taskCode}</p>
											<Badge variant={readinessBadgeVariant(task.percentComplete)}>{task.percentComplete}%</Badge>
										</div>
										<p class="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.taskName}</p>
									</div>
								{:else}
									<p class="text-sm text-muted-foreground">No tasks below threshold.</p>
								{/each}
							</div>

							<Separator.Separator />

							<div class="space-y-2">
								<p class="text-sm font-medium">Soldiers</p>
								{#each topAtRiskSoldiers as soldier (soldier.personnelId)}
									<div class="flex items-center justify-between gap-3 rounded-lg border bg-background p-3">
										<div class="min-w-0">
											<p class="truncate text-sm font-medium">{soldier.soldierName}</p>
											<p class="text-xs text-muted-foreground">{soldier.rank} / {soldier.mos}</p>
										</div>
										<Badge variant={readinessBadgeVariant(soldier.readinessPercent)}>{soldier.readinessPercent}%</Badge>
									</div>
								{:else}
									<p class="text-sm text-muted-foreground">No at-risk Soldiers.</p>
								{/each}
							</div>
						</Card.Content>
					</Card.Root>
				</aside>

				<div class="min-w-0 space-y-4">
					<IctReadinessMatrixTable matrix={dashboard.readinessMatrix} loading={dashboardLoading} compact />
					<ReportWorkspace.Content layout="split">
						<IctReadinessTrendChart
							trend={dashboard.readinessTrend}
							loading={dashboardLoading}
							heightClass="h-[190px]"
						/>
						<IctExpirationCliffChart
							cliff={dashboard.expirationCliff}
							currentReadinessPercent={dashboard.kpis.overallReadiness.percent}
							loading={dashboardLoading}
							heightClass="h-[190px]"
						/>
					</ReportWorkspace.Content>
					<ReportWorkspace.Content layout="split">
						<IctTasksBelowThresholdTable
							rows={dashboard.tasksBelowThreshold.rows}
							thresholdPercent={dashboard.tasksBelowThreshold.thresholdPercent}
							loading={dashboardLoading}
						/>
						<IctAtRiskSoldiersTable
							rows={dashboard.atRiskSoldiers.rows}
							expiringSoonWindowDays={dashboard.kpis.tasksExpiringSoon.windowDays}
							loading={dashboardLoading}
						/>
					</ReportWorkspace.Content>
					<div class="grid gap-4 xl:grid-cols-[minmax(0,0.72fr)_minmax(18rem,0.28fr)]">
						<IctReadinessDistributionHistogram
							distribution={dashboard.readinessDistribution}
							selectedPageMos={filterMosValues}
							loading={dashboardLoading}
							heightClass="h-[190px]"
						/>
						<Card.Root>
							<Card.Header>
								<Card.Title>Distribution readout</Card.Title>
								<Card.Description
									>Use this with the selected MOS filter before choosing drill-down targets.</Card.Description
								>
							</Card.Header>
							<Card.Content class="space-y-3 text-sm">
								<div class="flex items-center justify-between gap-3">
									<span class="text-muted-foreground">Default MOS</span>
									<span class="font-medium">{dashboard.readinessDistribution.defaultMos ?? 'None'}</span>
								</div>
								<div class="flex items-center justify-between gap-3">
									<span class="text-muted-foreground">Series</span>
									<span class="font-medium">{dashboard.readinessDistribution.series.length}</span>
								</div>
								<div class="flex items-center justify-between gap-3">
									<span class="text-muted-foreground">Bands</span>
									<span class="font-medium">{dashboard.readinessDistribution.bins.length}</span>
								</div>
							</Card.Content>
						</Card.Root>
					</div>
				</div>
			</div>
		</ReportWorkspace.Root>
	{/if}
</div>
