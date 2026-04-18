<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import type { IctAtRiskSoldierRow } from '$features/critical-tasks/utils/ictReports';

	interface Props {
		rows: IctAtRiskSoldierRow[];
		expiringSoonWindowDays: number;
		loading?: boolean;
	}

	const VISIBLE_ROW_LIMIT = 10;
	type ReadinessTone = 'red' | 'amber' | 'green';
	type SortKey = 'soldier' | 'mos' | 'readiness' | 'expiring' | 'lastUpdate';
	type SortDirection = 'asc' | 'desc';

	let { rows, expiringSoonWindowDays, loading = false }: Props = $props();
	let expanded = $state(false);
	let sortKey = $state<SortKey | null>(null);
	let sortDirection = $state<SortDirection>('asc');

	const expiringSoonColumnLabel = $derived(`Exp ≤${expiringSoonWindowDays}d`);
	const expiringSoonSortLabel = $derived(`Sort by Tasks Expiring ≤${expiringSoonWindowDays}d`);
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
	const sortSummary = $derived.by(() => {
		if (!sortKey) return 'Sorted worst first';
		return `Sorted by ${sortLabelFor(sortKey)} ${sortDirection.toUpperCase()}`;
	});

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
		if (key === 'mos') return compareText(left.mos, right.mos, direction) || compareIdentity(left, right);
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

	function sortLabelFor(key: SortKey): string {
		if (key === 'soldier') return 'Soldier';
		if (key === 'mos') return 'MOS';
		if (key === 'readiness') return '% Complete';
		if (key === 'expiring') return `Tasks Expiring ≤${expiringSoonWindowDays}d`;
		return 'Days Since Last ICT Update';
	}

	function ariaSortFor(key: SortKey): 'ascending' | 'descending' | undefined {
		if (sortKey !== key) return undefined;
		return sortDirection === 'asc' ? 'ascending' : 'descending';
	}

	function formatDaysSinceUpdate(days: number | null): string {
		if (days === null) return 'No update';
		return `${days}d`;
	}

	function readinessTone(percent: number): ReadinessTone {
		if (percent < 55) return 'red';
		if (percent < 70) return 'amber';
		return 'green';
	}
</script>

<section class="at-risk-section" aria-labelledby="at-risk-soldiers-title" aria-busy={loading ? 'true' : 'false'}>
	<div class="section-header">
		<div>
			<h2 id="at-risk-soldiers-title">At-Risk Soldiers — Call List</h2>
		</div>
		<span class="section-meta">{sortSummary}</span>
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
								<span>Soldier</span>
								{#if sortKey === 'soldier'}
									<span class="sort-indicator" aria-hidden="true">{sortDirection === 'asc' ? 'ASC' : 'DESC'}</span>
								{/if}
							</button>
						</th>
						<th scope="col" aria-sort={ariaSortFor('mos')}>
							<button class="sort-button" type="button" aria-label="Sort by MOS" onclick={() => sortBy('mos', 'asc')}>
								<span>MOS</span>
								{#if sortKey === 'mos'}
									<span class="sort-indicator" aria-hidden="true">{sortDirection === 'asc' ? 'ASC' : 'DESC'}</span>
								{/if}
							</button>
						</th>
						<th scope="col" class="numeric" aria-sort={ariaSortFor('readiness')}>
							<button
								class="sort-button numeric"
								type="button"
								aria-label="Sort by % Complete"
								onclick={() => sortBy('readiness', 'asc')}
							>
								<span>%</span>
								{#if sortKey === 'readiness'}
									<span class="sort-indicator" aria-hidden="true">{sortDirection === 'asc' ? 'ASC' : 'DESC'}</span>
								{/if}
							</button>
						</th>
						<th scope="col" class="numeric" aria-sort={ariaSortFor('expiring')}>
							<button
								class="sort-button numeric"
								type="button"
								aria-label={expiringSoonSortLabel}
								onclick={() => sortBy('expiring', 'desc')}
							>
								<span>{expiringSoonColumnLabel}</span>
								{#if sortKey === 'expiring'}
									<span class="sort-indicator" aria-hidden="true">{sortDirection === 'asc' ? 'ASC' : 'DESC'}</span>
								{/if}
							</button>
						</th>
						<th scope="col" class="numeric" aria-sort={ariaSortFor('lastUpdate')}>
							<button
								class="sort-button numeric"
								type="button"
								aria-label="Sort by Days Since Last ICT Update"
								onclick={() => sortBy('lastUpdate', 'desc')}
							>
								<span>Last Update</span>
								{#if sortKey === 'lastUpdate'}
									<span class="sort-indicator" aria-hidden="true">{sortDirection === 'asc' ? 'ASC' : 'DESC'}</span>
								{/if}
							</button>
						</th>
					</tr>
				</thead>
				<tbody>
					{#each visibleRows as row (row.personnelId)}
						{@const tone = readinessTone(row.readinessPercent)}
						<tr>
							<th scope="row" class="soldier-cell">
								<span class="soldier-name">{row.soldierName}</span>
								<span class="soldier-context">
									<span>{row.rank}</span>
									<span aria-hidden="true">/</span>
									<span>{row.groupName}</span>
								</span>
							</th>
							<td><span class="mos-tag">{row.mos}</span></td>
							<td class={`numeric readiness-val ${tone}`}>{row.readinessPercent}%</td>
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
		gap: var(--sp-5);
		width: 100%;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		padding: var(--sp-5) var(--sp-6);
	}

	.section-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--sp-3);
		border-bottom: 1px solid color-mix(in srgb, var(--border-default) 72%, transparent);
		padding-bottom: 14px;
	}

	.section-header h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: var(--font-weight-semibold);
		line-height: 1;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-primary);
	}

	.section-meta,
	.section-status {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.section-status {
		margin: 0;
		color: var(--amber-dark);
	}

	.table-scroll {
		overflow-x: auto;
	}

	table {
		width: 100%;
		min-width: 35rem;
		border-collapse: collapse;
	}

	th,
	td {
		padding: 7px var(--sp-2) 7px 0;
		border-bottom: 1px solid color-mix(in srgb, var(--border-default) 72%, transparent);
		text-align: left;
		vertical-align: top;
	}

	thead th {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		font-weight: var(--font-weight-regular);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-secondary);
		border-bottom-color: color-mix(in srgb, var(--border-default) 92%, var(--text-primary) 8%);
		background: transparent;
	}

	tbody th,
	tbody td {
		font-family: var(--font-body);
		font-size: var(--text-sm);
		color: var(--text-primary);
	}

	tbody tr:last-child th,
	tbody tr:last-child td {
		border-bottom: 0;
	}

	tbody tr:hover th,
	tbody tr:hover td {
		background: var(--surface-subtle);
	}

	.soldier-cell {
		font-family: var(--font-body);
		font-weight: var(--font-weight-normal);
	}

	.soldier-name,
	.soldier-context {
		display: block;
	}

	.soldier-name {
		font-size: 0.8125rem;
		line-height: 1.22;
		color: var(--text-primary);
	}

	.soldier-context {
		margin-top: 1px;
		font-family: var(--font-mono);
		font-size: 0.625rem;
		line-height: 1.2;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.soldier-context span + span {
		margin-left: var(--sp-1);
	}

	.mos-tag,
	.numeric {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.04em;
	}

	.numeric {
		text-align: right;
		white-space: nowrap;
	}

	.readiness-val.red {
		color: var(--danger);
		font-weight: var(--font-weight-medium);
	}

	.readiness-val.amber {
		color: var(--amber-dark);
		font-weight: var(--font-weight-medium);
	}

	.readiness-val.green {
		color: var(--success);
		font-weight: var(--font-weight-medium);
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

	.sort-indicator {
		border: 1px solid color-mix(in srgb, var(--border-default) 82%, var(--text-primary) 18%);
		border-radius: var(--radius-xs);
		padding: 1px 4px;
		font-size: 0.5625rem;
		line-height: 1.1;
		color: var(--text-primary);
		letter-spacing: 0.08em;
	}

	.sort-button:focus-visible {
		outline: var(--focus-outline);
		outline-offset: 2px;
	}

	.empty-state {
		border: 0;
	}

	.table-actions {
		display: flex;
		justify-content: flex-end;
	}

	@media (max-width: 640px) {
		.at-risk-section {
			padding: var(--sp-4);
		}

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
