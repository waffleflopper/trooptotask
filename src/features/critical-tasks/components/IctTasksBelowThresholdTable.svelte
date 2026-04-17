<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import type { IctTaskBelowThresholdRow } from '$features/critical-tasks/utils/ictReports';

	interface Props {
		rows: IctTaskBelowThresholdRow[];
		thresholdPercent: number;
		loading?: boolean;
	}

	const VISIBLE_ROW_LIMIT = 10;
	type SortKey = 'task' | 'percent' | 'gap';
	type SortDirection = 'asc' | 'desc';

	let { rows, thresholdPercent, loading = false }: Props = $props();
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
		expanded ? `Show top ${VISIBLE_ROW_LIMIT} tasks below threshold` : `Show all ${rows.length} tasks below threshold`
	);

	function toggleExpanded() {
		expanded = !expanded;
	}

	function formatSoldierGap(count: number): string {
		return `${count} ${count === 1 ? 'Soldier' : 'Soldiers'}`;
	}

	function compareIdentity(left: IctTaskBelowThresholdRow, right: IctTaskBelowThresholdRow): number {
		return (
			left.taskCode.localeCompare(right.taskCode) ||
			left.taskName.localeCompare(right.taskName) ||
			left.taskId.localeCompare(right.taskId)
		);
	}

	function compareRows(
		left: IctTaskBelowThresholdRow,
		right: IctTaskBelowThresholdRow,
		key: SortKey,
		direction: SortDirection
	): number {
		if (key === 'task') {
			const identitySort = compareIdentity(left, right);
			return direction === 'asc' ? identitySort : -identitySort;
		}
		if (key === 'percent') {
			const percentSort = left.percentComplete - right.percentComplete;
			if (percentSort !== 0) return direction === 'asc' ? percentSort : -percentSort;
			return right.soldierGapCount - left.soldierGapCount || compareIdentity(left, right);
		}
		const gapSort = left.soldierGapCount - right.soldierGapCount;
		if (gapSort !== 0) return direction === 'asc' ? gapSort : -gapSort;
		return left.percentComplete - right.percentComplete || compareIdentity(left, right);
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
</script>

<section
	class="below-threshold-section"
	aria-labelledby="tasks-below-threshold-title"
	aria-busy={loading ? 'true' : 'false'}
>
	<div class="section-header">
		<div>
			<h2 id="tasks-below-threshold-title">Tasks Below Unit Threshold</h2>
			<p>Below {thresholdPercent}% unit completion</p>
		</div>
		{#if loading}
			<span class="section-status">Updating</span>
		{/if}
	</div>

	{#if rows.length === 0}
		<div class="empty-state">
			<EmptyState message={`No tasks are below ${thresholdPercent}% for the active filters.`} variant="simple" />
		</div>
	{:else}
		<div class="table-scroll">
			<table aria-label="Tasks below unit threshold">
				<thead>
					<tr>
						<th scope="col" aria-sort={ariaSortFor('task')}>
							<button
								class="sort-button"
								type="button"
								aria-label="Sort by Task ID + Name"
								onclick={() => sortBy('task', 'asc')}
							>
								Task ID + Name
							</button>
						</th>
						<th scope="col" class="numeric" aria-sort={ariaSortFor('percent')}>
							<button
								class="sort-button numeric"
								type="button"
								aria-label="Sort by % Complete"
								onclick={() => sortBy('percent', 'asc')}
							>
								% Complete
							</button>
						</th>
						<th scope="col" class="numeric" aria-sort={ariaSortFor('gap')}>
							<button
								class="sort-button numeric"
								type="button"
								aria-label="Sort by Soldier Gap"
								onclick={() => sortBy('gap', 'desc')}
							>
								Soldier Gap
							</button>
						</th>
					</tr>
				</thead>
				<tbody>
					{#each visibleRows as row (row.taskId)}
						<tr>
							<th scope="row" class="task-cell">
								<span class="task-code">{row.taskCode}</span>
								<span class="task-name">{row.taskName}</span>
							</th>
							<td class="numeric percent-cell">{row.percentComplete}%</td>
							<td class="numeric gap-cell">{formatSoldierGap(row.soldierGapCount)}</td>
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
	.below-threshold-section {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		width: 100%;
		border: 0.5px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
		padding: var(--sp-5) var(--sp-6) var(--sp-4);
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
	}

	table {
		width: 100%;
		border-collapse: collapse;
		min-width: 36rem;
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

	tbody tr:last-child th,
	tbody tr:last-child td {
		border-bottom: 0;
	}

	.task-cell {
		font-weight: var(--font-weight-normal);
	}

	.task-code,
	.numeric {
		font-family: var(--font-mono);
	}

	.task-code {
		display: block;
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-secondary);
	}

	.task-name {
		display: block;
		margin-top: var(--sp-1);
		font-family: var(--font-body);
		font-size: var(--text-base);
		color: var(--text-primary);
	}

	.numeric {
		width: 10rem;
		text-align: right;
		white-space: nowrap;
	}

	.percent-cell,
	.gap-cell {
		font-size: var(--text-sm);
		color: var(--text-primary);
	}

	.empty-state {
		border: 0;
	}

	.table-actions {
		display: flex;
		justify-content: flex-end;
	}

	@media (max-width: 640px) {
		.below-threshold-section {
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
