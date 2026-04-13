<script lang="ts">
	import WidgetShell from './WidgetShell.svelte';
	import type { DashboardContext } from '../../contexts/DashboardContext.svelte';
	import type { WidgetInstanceConfig } from '../../dashboard.types';
	import { dashboardLayout } from '../../stores/dashboardLayout.svelte';
	import { SvelteMap } from 'svelte/reactivity';

	interface Props {
		ctx: DashboardContext;
		widgetId: string;
		config: WidgetInstanceConfig;
		configureMode?: boolean;
	}

	let { ctx, widgetId, config, configureMode = false }: Props = $props();

	let configOpen = $state(false);
	const display = $derived(config.display ?? 'both');
	const breakdown = $derived(config.breakdown ?? 'group');

	const stats = $derived(ctx.trainingStats);
	const issues = $derived(ctx.topTrainingIssues);
	const delinquencies = $derived(ctx.trainingGroupDelinquencies);
	const totalIssues = $derived(stats ? stats.expired + stats.warningOrange + stats.warningYellow : 0);
	const hasSignal = $derived(totalIssues > 0);

	// Bar chart: normalize against the worst group so bars are relative, not absolute
	// Bar chart: top 5 worst groups only, normalized so the worst group = full bar
	const topDelinquencies = $derived(delinquencies.slice(0, 5));
	const maxGroupCount = $derived(topDelinquencies.length > 0 ? Math.max(...topDelinquencies.map((g) => g.count)) : 1);

	// Group issues by person — show up to 5 unique people.
	// Comma-join their training names; pick the most severe label (expired > warning,
	// then within expired pick the one with the most days elapsed).
	const groupedIssues = $derived.by(() => {
		const byPerson = new SvelteMap<string, typeof issues>();
		for (const issue of issues) {
			const existing = byPerson.get(issue.personName) ?? [];
			existing.push(issue);
			byPerson.set(issue.personName, existing);
		}

		return [...byPerson.values()].slice(0, 5).map((personIssues) => {
			// Sort each person's issues: expired first, then by days elapsed desc
			const sorted = [...personIssues].sort((a, b) => {
				if (a.status === 'expired' && b.status !== 'expired') return -1;
				if (b.status === 'expired' && a.status !== 'expired') return 1;
				// Parse days from label e.g. "EXPIRED 245D AGO" or "Expiring in 12d"
				const daysA = parseInt(a.label?.match(/\d+/)?.[0] ?? '0');
				const daysB = parseInt(b.label?.match(/\d+/)?.[0] ?? '0');
				// For expired: more days ago = worse; for warning: fewer days = more urgent
				return a.status === 'expired' ? daysB - daysA : daysA - daysB;
			});

			return {
				personName: sorted[0].personName,
				typeNames: sorted.map((i) => i.typeName).join(', '),
				status: sorted[0].status,
				label: sorted[0].label || sorted[0].status,
				isExpired: sorted[0].status === 'expired'
			};
		});
	});
</script>

<WidgetShell
	label="Training Health"
	href="/org/{ctx.data.orgId}/training"
	signal={hasSignal}
	{configureMode}
	{configOpen}
	onConfigToggle={() => (configOpen = !configOpen)}
>
	{#snippet config()}
		<div class="cfg-grid">
			<label class="cfg-row">
				<span>Display</span>
				<select
					class="cfg-select"
					value={display}
					onchange={(e) =>
						dashboardLayout.updateWidgetConfig(widgetId, {
							display: e.currentTarget.value as 'chart' | 'list' | 'both'
						})}
				>
					<option value="both">Chart + List</option>
					<option value="chart">Chart only</option>
					<option value="list">List only</option>
				</select>
			</label>
			<label class="cfg-row">
				<span>Breakdown</span>
				<select
					class="cfg-select"
					value={breakdown}
					onchange={(e) =>
						dashboardLayout.updateWidgetConfig(widgetId, {
							breakdown: e.currentTarget.value as 'group' | 'person'
						})}
				>
					<option value="group">By group</option>
					<option value="person">By person</option>
				</select>
			</label>
		</div>
	{/snippet}

	{#if !stats}
		<div class="widget-empty"><span>Training data loading...</span></div>
	{:else if totalIssues === 0}
		<div class="widget-empty"><span>All training current. No issues detected.</span></div>
	{:else}
		<div class="training-content" class:training-content--row={display === 'both'}>
			{#if display === 'chart' || display === 'both'}
				<div class="training-chart">
					<!-- Summary counts -->
					<div class="training-counts">
						{#if stats.expired > 0}
							<div class="training-count training-count--expired">
								<span class="tc-num">{stats.expired}</span>
								<span class="tc-label">Expired</span>
							</div>
						{/if}
						{#if stats.warningOrange > 0}
							<div class="training-count training-count--urgent">
								<span class="tc-num">{stats.warningOrange}</span>
								<span class="tc-label">Expiring soon</span>
							</div>
						{/if}
						{#if stats.warningYellow > 0}
							<div class="training-count training-count--warn">
								<span class="tc-num">{stats.warningYellow}</span>
								<span class="tc-label">Expiring</span>
							</div>
						{/if}
					</div>

					<!-- Group bar chart -->
					{#if breakdown === 'group' && topDelinquencies.length > 0}
						<div class="group-bars" role="list" aria-label="Training delinquencies by group">
							<div class="gbar-note">Estimated by group size</div>
							{#each topDelinquencies as g (g.groupName)}
								<div class="gbar-row" role="listitem">
									<span class="gbar-name">{g.groupName}</span>
									<div class="gbar-track">
										<div
											class="gbar-fill"
											class:gbar-fill--high={g.count >= maxGroupCount * 0.5}
											style="width: {Math.max((g.count / maxGroupCount) * 100, 4)}%"
										></div>
									</div>
									<span class="gbar-count">~{g.count}</span>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			{#if display === 'list' || display === 'both'}
				<div class="training-issues" class:training-issues--standalone={display === 'list'}>
					<div class="issues-header">Top issues</div>
					{#if groupedIssues.length === 0}
						<div class="widget-empty" style="padding: var(--sp-3)"><span>No issue data.</span></div>
					{:else}
						<div class="issues-list" role="list">
							{#each groupedIssues as issue (issue.personName)}
								<div class="issue-row" role="listitem">
									<span
										class="issue-dot"
										class:issue-dot--expired={issue.isExpired}
										class:issue-dot--warn={!issue.isExpired}
									></span>
									<span class="issue-name">{issue.personName}</span>
									<span class="issue-type">{issue.typeNames}</span>
									<span class="issue-label" class:issue-label--expired={issue.isExpired}>
										{issue.label}
									</span>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</WidgetShell>

<style>
	.widget-empty {
		flex: 1;
		display: flex;
		align-items: center;
		padding: var(--sp-4);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink-35);
	}

	.training-content {
		display: flex;
		flex-direction: column;
		flex: 1;
		overflow: hidden;
	}

	.training-content--row {
		flex-direction: row;
	}

	/* Left panel: chart + counts */
	.training-chart {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		padding: var(--sp-4);
		flex: 1;
		min-width: 0;
	}

	.training-counts {
		display: flex;
		gap: var(--sp-4);
		flex-wrap: wrap;
	}

	.training-count {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.tc-num {
		font-family: var(--font-display);
		font-size: var(--text-3xl);
		font-weight: var(--font-weight-display);
		line-height: 1;
		color: var(--ink-35);
		font-variant-numeric: tabular-nums;
	}

	.training-count--expired .tc-num {
		color: var(--danger);
	}

	.training-count--urgent .tc-num {
		color: var(--amber-dark);
	}

	:root[data-theme='dark'] .training-count--urgent .tc-num {
		color: var(--amber);
	}

	.training-count--warn .tc-num {
		color: var(--ink-35);
	}

	.tc-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ink-35);
	}

	/* Group bars */
	.group-bars {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.gbar-note {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink-35);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.gbar-row {
		display: grid;
		grid-template-columns: minmax(64px, 120px) 1fr 28px;
		align-items: center;
		gap: var(--sp-2);
	}

	.gbar-name {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink-60);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.gbar-track {
		height: 4px;
		background: var(--ink-06);
		border-radius: var(--radius-sm);
		overflow: hidden;
	}

	.gbar-fill {
		height: 100%;
		background: var(--amber);
		border-radius: var(--radius-sm);
		min-width: 4px;
	}

	.gbar-fill--high {
		background: var(--danger);
	}

	.gbar-count {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink-35);
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	/* Right panel: issues list */
	.training-issues {
		display: flex;
		flex-direction: column;
		min-width: 240px;
		border-top: var(--border-rule);
		flex: 1;
		overflow: hidden;
	}

	.training-content--row .training-issues {
		border-top: none;
		border-left: var(--border-rule);
	}

	.training-issues--standalone {
		flex: 1;
	}

	.issues-header {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ink-35);
		padding: var(--sp-2) var(--sp-3);
		border-bottom: var(--border-rule);
		flex-shrink: 0;
	}

	.issues-list {
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		flex: 1;
	}

	.issue-row {
		display: grid;
		grid-template-columns: 8px 1fr 1fr auto;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-3);
		border-bottom: var(--border-rule);
	}

	.issue-row:last-child {
		border-bottom: none;
	}

	.issue-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--ink-15);
		flex-shrink: 0;
	}

	.issue-dot--expired {
		background: var(--danger);
	}

	.issue-dot--warn {
		background: var(--amber);
	}

	.issue-name {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink);
		font-weight: var(--font-weight-medium);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.issue-type {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink-60);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.issue-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink-35);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		white-space: nowrap;
	}

	.issue-label--expired {
		color: var(--danger);
	}

	.cfg-grid {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.cfg-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--ink-60);
	}

	.cfg-select {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		background: var(--field-bg);
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		color: var(--ink);
		padding: 2px var(--sp-2);
		cursor: pointer;
	}
</style>
