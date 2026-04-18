<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import type {
		IctReadinessMatrix,
		IctReadinessMatrixCell,
		IctReadinessMatrixRow
	} from '$features/critical-tasks/utils/ictReports';

	interface Props {
		matrix: IctReadinessMatrix;
		loading?: boolean;
	}

	const TITLE_ID = 'ict-readiness-matrix-title';
	const DESCRIPTION_ID = 'ict-readiness-matrix-description';
	const legendItems = [
		{ tier: 'danger', label: '<60%' },
		{ tier: 'warn', label: '60-69%' },
		{ tier: 'caution', label: '70-79%' },
		{ tier: 'okay', label: '80-89%' },
		{ tier: 'good', label: '90%+' },
		{ tier: 'not-applicable', label: 'Not applicable' }
	];

	let { matrix, loading = false }: Props = $props();

	function pluralizeSoldier(count: number): string {
		return count === 1 ? 'Soldier' : 'Soldiers';
	}

	function formatPercent(percent: number | null): string {
		return percent === null ? '-' : `${percent}%`;
	}

	function readinessLabel(
		mos: string,
		label: string,
		percent: number | null,
		readyCount: number,
		applicableCount: number
	): string {
		if (percent === null) {
			return `${mos} ${label} readiness: not applicable`;
		}

		return `${mos} ${label} readiness: ${percent}%, ${readyCount} of ${applicableCount} current`;
	}

	function cellLabel(mos: string, cell: IctReadinessMatrixCell): string {
		return readinessLabel(mos, cell.categoryLabel, cell.readinessPercent, cell.readyCount, cell.applicableCount);
	}

	function averageLabel(row: IctReadinessMatrixRow): string {
		return readinessLabel(
			row.mos,
			'average',
			row.averageReadinessPercent,
			row.averageReadyCount,
			row.averageApplicableCount
		);
	}
</script>

<section
	class="matrix-card"
	aria-labelledby={TITLE_ID}
	aria-describedby={DESCRIPTION_ID}
	aria-busy={loading ? 'true' : 'false'}
>
	<div class="matrix-card-header">
		<div>
			<h2 id={TITLE_ID}>Readiness Matrix — MOS × Task Category</h2>
			<p id={DESCRIPTION_ID} class="screen-reader-text">
				MOS rows and task category columns, with each cell showing the percent trained and current.
			</p>
		</div>
		<div class="matrix-card-meta">
			<span class="matrix-kicker">Cell = % trained & current</span>
			{#if loading}
				<span class="matrix-status">Updating</span>
			{/if}
		</div>
	</div>

	{#if matrix.rows.length === 0}
		<div class="empty-state">
			<EmptyState message="No readiness matrix data is available for the active filters." variant="simple" />
		</div>
	{:else if !matrix.hasCategorizedTasks}
		<div class="empty-state">
			<EmptyState
				message="Task categories are not set yet. Add categories to build the MOS by category matrix."
				variant="simple"
			/>
		</div>
	{:else}
		<div class="matrix-wrap">
			<table class="matrix-table" aria-label="MOS by task category readiness matrix">
				<thead>
					<tr>
						<th scope="col" class="mos-header">MOS</th>
						{#each matrix.categories as category (category.key)}
							<th scope="col">{category.label}</th>
						{/each}
						<th scope="col" class="average-header">Avg</th>
					</tr>
				</thead>
				<tbody>
					{#each matrix.rows as row (row.mos)}
						<tr>
							<th scope="row" class="mos-cell">
								<span class="mos-code">{row.mos}</span>
								<span class="mos-meta">{row.personnelCount} {pluralizeSoldier(row.personnelCount)}</span>
							</th>
							{#each row.cells as cell (cell.categoryKey)}
								<td class="heat-cell-wrap">
									<span class="heat-cell" data-tier={cell.tier} aria-label={cellLabel(row.mos, cell)}>
										{formatPercent(cell.readinessPercent)}
									</span>
								</td>
							{/each}
							<td class="heat-cell-wrap average-cell">
								<span class="heat-cell" data-tier={row.averageTier} aria-label={averageLabel(row)}>
									{formatPercent(row.averageReadinessPercent)}
								</span>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<ul class="matrix-legend" aria-label="Readiness matrix tiers">
			{#each legendItems as item (item.tier)}
				<li>
					<span class="legend-swatch" data-tier={item.tier} aria-hidden="true"></span>
					<span>{item.label}</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.matrix-card {
		--matrix-danger: #e8b9a8;
		--matrix-warn: #eca382;
		--matrix-caution: #f2c878;
		--matrix-okay: #c5d89b;
		--matrix-good: #9bc361;
		--matrix-na-a: color-mix(in srgb, var(--surface-subtle) 86%, var(--surface-panel) 14%);
		--matrix-na-b: color-mix(in srgb, var(--border-default) 62%, var(--surface-panel) 38%);

		width: 100%;
		display: flex;
		flex-direction: column;
		gap: var(--sp-5);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		padding: var(--sp-5) var(--sp-6);
	}

	.matrix-card-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--sp-3);
		border-bottom: 1px solid color-mix(in srgb, var(--border-default) 72%, transparent);
		padding-bottom: 14px;
	}

	.matrix-card h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: var(--font-weight-semibold);
		line-height: 1;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-primary);
	}

	.matrix-card-meta {
		display: inline-flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--sp-2);
		min-width: 0;
	}

	.matrix-kicker,
	.matrix-status {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.matrix-status {
		color: var(--amber-dark);
	}

	.matrix-wrap {
		overflow-x: auto;
	}

	.matrix-table {
		width: 100%;
		min-width: 50rem;
		border-collapse: collapse;
	}

	th,
	td {
		padding: 10px var(--sp-2);
		border-bottom: 1px solid color-mix(in srgb, var(--border-default) 72%, transparent);
		text-align: center;
		vertical-align: middle;
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

	tbody tr:hover {
		background: color-mix(in srgb, var(--surface-subtle) 74%, transparent);
	}

	tbody tr:last-child th,
	tbody tr:last-child td {
		border-bottom: 0;
	}

	.mos-header,
	.mos-cell {
		position: sticky;
		left: 0;
		z-index: 1;
		text-align: left;
		background: var(--surface-panel);
	}

	tbody tr:hover .mos-cell {
		background: color-mix(in srgb, var(--surface-subtle) 74%, var(--surface-panel) 26%);
	}

	.mos-cell {
		min-width: 9rem;
	}

	.mos-code {
		display: block;
		font-family: var(--font-display);
		font-size: 1.125rem;
		font-weight: var(--font-weight-semibold);
		line-height: 1.05;
		letter-spacing: 0.02em;
		color: var(--text-primary);
	}

	.mos-meta {
		display: block;
		margin-top: 3px;
		font-family: var(--font-mono);
		font-size: 0.625rem;
		font-weight: var(--font-weight-regular);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.heat-cell-wrap {
		min-width: 4.5rem;
	}

	.average-cell {
		border-left: 1px solid color-mix(in srgb, var(--border-default) 82%, transparent);
	}

	.heat-cell {
		display: inline-grid;
		width: 3.625rem;
		height: 1.75rem;
		place-items: center;
		border: 1px solid color-mix(in srgb, var(--text-primary) 16%, transparent);
		border-radius: 2px;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		font-weight: var(--font-weight-semibold);
		font-variant-numeric: tabular-nums;
		color: #24211d;
	}

	.heat-cell[data-tier='danger'],
	.legend-swatch[data-tier='danger'] {
		background: var(--matrix-danger);
	}

	.heat-cell[data-tier='warn'],
	.legend-swatch[data-tier='warn'] {
		background: var(--matrix-warn);
	}

	.heat-cell[data-tier='caution'],
	.legend-swatch[data-tier='caution'] {
		background: var(--matrix-caution);
	}

	.heat-cell[data-tier='okay'],
	.legend-swatch[data-tier='okay'] {
		background: var(--matrix-okay);
	}

	.heat-cell[data-tier='good'],
	.legend-swatch[data-tier='good'] {
		background: var(--matrix-good);
	}

	.heat-cell[data-tier='not-applicable'],
	.legend-swatch[data-tier='not-applicable'] {
		background: repeating-linear-gradient(
			45deg,
			var(--matrix-na-a),
			var(--matrix-na-a) 3px,
			var(--matrix-na-b) 3px,
			var(--matrix-na-b) 6px
		);
		color: var(--text-secondary);
	}

	.matrix-legend {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2) var(--sp-4);
		margin: -2px 0 0;
		padding: var(--sp-3) 0 0;
		border-top: 1px solid color-mix(in srgb, var(--border-default) 72%, transparent);
		list-style: none;
	}

	.matrix-legend li {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.legend-swatch {
		display: block;
		width: 0.625rem;
		height: 0.625rem;
		border: 0.5px solid color-mix(in srgb, var(--text-primary) 36%, transparent);
		border-radius: 1px;
	}

	.empty-state {
		min-height: 8rem;
		display: grid;
		place-items: center;
	}

	.screen-reader-text {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	@media (max-width: 640px) {
		.matrix-card {
			padding: var(--sp-4);
		}

		.matrix-card-header {
			align-items: start;
			flex-direction: column;
		}

		.matrix-card h2 {
			font-size: 1.125rem;
		}

		.matrix-legend li {
			font-size: 0.5625rem;
		}
	}
</style>
