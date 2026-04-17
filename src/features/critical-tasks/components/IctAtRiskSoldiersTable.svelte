<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import type { IctAtRiskSoldierRow } from '$features/critical-tasks/utils/ictReports';

	interface Props {
		rows: IctAtRiskSoldierRow[];
		loading?: boolean;
	}

	const VISIBLE_ROW_LIMIT = 10;
	type SortKey = 'soldier' | 'rank' | 'mos' | 'group' | 'readiness' | 'expiring' | 'lastUpdate';
	type SortDirection = 'asc' | 'desc';

	let { rows, loading = false }: Props = $props();
	let expanded = $state(false);
	let sortKey = $state<SortKey | null>(null);
	let sortDirection = $state<SortDirection>('asc');

	const hasOverflow = $derived(rows.length > VISIBLE_ROW_LIMIT);
	const sortedRows = $derived.by(() => {
		const activeSortKey = sortKey;
		if (!activeSortKey) return rows;
		return [...rows].sort((left, right) => compareRows(left, right, activeSortKey, sortDirection));
	});
	const visibleRows = $derived(expanded || !hasOverflow ? sortedRows : sortedRows.slice(0, VISIBLE_ROW_LIMIT));
	const toggleLabel = $derived(
		expanded ? `Show top ${VISIBLE_ROW_LIMIT} at-risk Soldiers` : `Show all ${rows.length} at-risk Soldiers`
	);

	function toggleExpanded() {
		expanded = !expanded;
	}

	function compareText(left: string, right: string, direction: SortDirection): number {
		const result = left.localeCompare(right);
		return direction === 'asc' ? result : -result;
	}

	function compareIdentity(left: IctAtRiskSoldierRow, right: IctAtRiskSoldierRow): number {
		return left.soldierName.localeCompare(right.soldierName) || left.personnelId.localeCompare(right.personnelId);
	}

	function compareNullableDays(left: number | null, right: number | null, direction: SortDirection): number {
		if (left === null && right === null) return 0;
		if (left === null) return 1;
		if (right === null) return -1;
		return direction === 'asc' ? left - right : right - left;
	}

	function compareRows(
		left: IctAtRiskSoldierRow,
		right: IctAtRiskSoldierRow,
		key: SortKey,
		direction: SortDirection
	): number {
		if (key === 'soldier') return compareText(left.soldierName, right.soldierName, direction);
		if (key === 'rank') return compareText(left.rank, right.rank, direction) || compareIdentity(left, right);
		if (key === 'mos') return compareText(left.mos, right.mos, direction) || compareIdentity(left, right);
		if (key === 'group') return compareText(left.groupName, right.groupName, direction) || compareIdentity(left, right);
		if (key === 'readiness') {
			const result = left.readinessPercent - right.readinessPercent;
			return (direction === 'asc' ? result : -result) || compareIdentity(left, right);
		}
		if (key === 'expiring') {
			const result = left.tasksExpiringSoonCount - right.tasksExpiringSoonCount;
			return (direction === 'asc' ? result : -result) || compareIdentity(left, right);
		}
		return (
			compareNullableDays(left.daysSinceLastIctUpdate, right.daysSinceLastIctUpdate, direction) ||
			compareIdentity(left, right)
		);
	}

	function sortBy(nextKey: SortKey, initialDirection: SortDirection) {
		if (sortKey === nextKey) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
			return;
		}
		sortKey = nextKey;
		sortDirection = initialDirection;
	}

	function ariaSortFor(key: SortKey): 'ascending' | 'descending' | undefined {
		if (sortKey !== key) return undefined;
		return sortDirection === 'asc' ? 'ascending' : 'descending';
	}

	function formatDaysSinceUpdate(days: number | null): string {
		if (days === null) return 'No ICT update';
		if (days === 1) return '1 day';
		return `${days} days`;
	}
</script>

<section class="at-risk-section" aria-labelledby="at-risk-soldiers-title" aria-busy={loading ? 'true' : 'false'}>
	<div class="section-header">
		<div>
			<h2 id="at-risk-soldiers-title">At-Risk Soldiers</h2>
			<p>Worst-first call list for follow-up</p>
		</div>
		{#if loading}
			<span class="section-status">Updating</span>
		{/if}
	</div>

	{#if rows.length === 0}
		<div class="empty-state">
			<EmptyState message="No Soldiers match the active filters." variant="simple" />
		</div>
	{:else}
		<div class="table-scroll">
			<table aria-label="At-risk Soldiers call list">
				<thead>
					<tr>
						<th scope="col" aria-sort={ariaSortFor('soldier')}>
							<button
								class="sort-button"
								type="button"
								aria-label="Sort by Soldier"
								onclick={() => sortBy('soldier', 'asc')}
							>
								Soldier
							</button>
						</th>
						<th scope="col" aria-sort={ariaSortFor('mos')}>
							<button class="sort-button" type="button" aria-label="Sort by MOS" onclick={() => sortBy('mos', 'asc')}
								>MOS</button
							>
						</th>
						<th scope="col" aria-sort={ariaSortFor('rank')}>
							<button class="sort-button" type="button" aria-label="Sort by Rank" onclick={() => sortBy('rank', 'asc')}
								>Rank</button
							>
						</th>
						<th scope="col" aria-sort={ariaSortFor('group')}>
							<button
								class="sort-button"
								type="button"
								aria-label="Sort by Group"
								onclick={() => sortBy('group', 'asc')}
							>
								Group
							</button>
						</th>
						<th scope="col" class="numeric" aria-sort={ariaSortFor('readiness')}>
							<button
								class="sort-button numeric"
								type="button"
								aria-label="Sort by % Complete"
								onclick={() => sortBy('readiness', 'asc')}
							>
								% Complete
							</button>
						</th>
						<th scope="col" class="numeric" aria-sort={ariaSortFor('expiring')}>
							<button
								class="sort-button numeric"
								type="button"
								aria-label="Sort by Tasks Expiring ≤30d"
								onclick={() => sortBy('expiring', 'desc')}
							>
								Tasks Expiring ≤30d
							</button>
						</th>
						<th scope="col" class="numeric" aria-sort={ariaSortFor('lastUpdate')}>
							<button
								class="sort-button numeric"
								type="button"
								aria-label="Sort by Days Since Last ICT Update"
								onclick={() => sortBy('lastUpdate', 'desc')}
							>
								Days Since Last ICT Update
							</button>
						</th>
					</tr>
				</thead>
				<tbody>
					{#each visibleRows as row (row.personnelId)}
						<tr>
							<th scope="row" class="soldier-cell">{row.soldierName}</th>
							<td>{row.mos}</td>
							<td>{row.rank}</td>
							<td>{row.groupName}</td>
							<td class="numeric">{row.readinessPercent}%</td>
							<td class="numeric">{row.tasksExpiringSoonCount}</td>
							<td class="numeric">{formatDaysSinceUpdate(row.daysSinceLastIctUpdate)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if hasOverflow}
			<div class="table-actions">
				<button
					class="btn btn-secondary btn-sm"
					type="button"
					aria-expanded={expanded ? 'true' : 'false'}
					onclick={toggleExpanded}
				>
					{toggleLabel}
				</button>
			</div>
		{/if}
	{/if}
</section>

<style>
	.at-risk-section {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.section-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--sp-3);
		border-bottom: 0.5px solid var(--border-default);
		padding-bottom: var(--sp-2);
	}

	.section-header h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		font-weight: var(--font-weight-display);
		line-height: 0.95;
		text-transform: uppercase;
		color: var(--text-primary);
	}

	.section-header p,
	.section-status {
		margin: var(--sp-1) 0 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.section-status {
		margin: 0;
		color: var(--amber-dark);
	}

	.table-scroll {
		overflow-x: auto;
		border: 0.5px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	table {
		width: 100%;
		min-width: 54rem;
		border-collapse: collapse;
	}

	th,
	td {
		padding: var(--sp-3) var(--sp-4);
		border-bottom: 0.5px solid var(--border-default);
		text-align: left;
		vertical-align: top;
	}

	thead th {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-secondary);
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
	}

	tbody th,
	tbody td {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--text-primary);
	}

	tbody tr:last-child th,
	tbody tr:last-child td {
		border-bottom: 0;
	}

	.soldier-cell {
		font-family: var(--font-body);
		font-weight: var(--font-weight-normal);
	}

	.numeric {
		text-align: right;
		white-space: nowrap;
	}

	.sort-button {
		display: inline-flex;
		width: 100%;
		align-items: center;
		justify-content: flex-start;
		gap: var(--sp-1);
		border: 0;
		padding: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		letter-spacing: inherit;
		text-align: inherit;
		text-transform: inherit;
		cursor: pointer;
	}

	.sort-button.numeric {
		justify-content: flex-end;
	}

	.sort-button:focus-visible {
		outline: var(--focus-outline);
		outline-offset: 2px;
	}

	.empty-state {
		border: 0.5px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	.table-actions {
		display: flex;
		justify-content: flex-end;
	}

	@media (max-width: 640px) {
		.section-header {
			align-items: flex-start;
			flex-direction: column;
		}

		.table-actions {
			justify-content: stretch;
		}

		.table-actions :global(.btn) {
			width: 100%;
			justify-content: center;
		}
	}
</style>
