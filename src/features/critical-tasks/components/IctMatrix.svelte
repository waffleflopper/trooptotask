<script lang="ts">
	import type {
		CriticalTasksSettingsInput,
		IctStatus,
		IctTask,
		PersonnelIctCompletion
	} from '$features/critical-tasks/criticalTasks.types';
	import type { Group } from '$lib/stores/groups.svelte';
	import type { Personnel } from '$lib/types';
	import {
		buildCriticalTasksMatrix,
		type CriticalTasksMatrixCell
	} from '$features/critical-tasks/utils/criticalTasksMatrix';

	interface Props {
		personnel: Personnel[];
		tasks: IctTask[];
		completions: PersonnelIctCompletion[];
		groups?: Group[];
		settings?: CriticalTasksSettingsInput | null;
		selectedGroupId?: string;
		gapsOnly?: boolean;
		asOf?: string | Date;
		orgName?: string;
	}

	let {
		personnel,
		tasks,
		completions,
		groups = [],
		settings = null,
		selectedGroupId = '',
		gapsOnly = false,
		asOf,
		orgName = 'Unassigned'
	}: Props = $props();

	const matrix = $derived(
		buildCriticalTasksMatrix({
			personnel,
			tasks,
			completions,
			groups,
			settings,
			selectedGroupId,
			gapsOnly,
			asOf,
			orgName
		})
	);

	const statusSymbols: Record<IctStatus, string> = {
		current: '✓',
		'expiring-soon': '!',
		expired: '✗',
		'not-recorded': '—'
	};

	const statusLabels: Record<IctStatus, string> = {
		current: 'current',
		'expiring-soon': 'expiring soon',
		expired: 'expired',
		'not-recorded': 'not recorded'
	};

	const totalColumns = $derived(matrix.tasks.length + 1);

	function personName(person: Personnel): string {
		return `${person.lastName}, ${person.firstName}`;
	}

	function cellAriaLabel(person: Personnel, cell: CriticalTasksMatrixCell): string {
		if (!cell.applicable) {
			return `${person.lastName} ${cell.task.taskCode}: not applicable`;
		}

		return `${person.lastName} ${cell.task.taskCode}: ${statusLabels[cell.statusInfo.status]}. ${cell.detailLabel}`;
	}
</script>

<div class="ict-matrix-shell">
	<div class="matrix-legend" aria-label="Critical Tasks status legend">
		<span class="legend-item" data-status="current"><span class="legend-mark">✓</span> Current</span>
		<span class="legend-item" data-status="expiring-soon"><span class="legend-mark">!</span> Expiring Soon</span>
		<span class="legend-item" data-status="expired"><span class="legend-mark">✗</span> Expired</span>
		<span class="legend-item" data-status="not-recorded"><span class="legend-mark">—</span> Not Recorded</span>
	</div>

	<div class="matrix-scroll">
		<table class="ict-matrix" aria-label="Critical Tasks readiness matrix">
			<thead>
				<tr>
					<th scope="col" class="person-header">Soldier</th>
					{#each matrix.tasks as task (task.id)}
						<th scope="col" class="task-header" aria-label="{task.taskCode} {task.title}">
							<span class="task-code">{task.taskCode}</span>
							<span class="task-title">{task.title}</span>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#if matrix.groups.length === 0}
					<tr>
						<td class="empty-row" colspan={totalColumns}>No personnel match the current Critical Tasks filters.</td>
					</tr>
				{:else}
					{#each matrix.groups as group (group.key)}
						<tr class="group-row">
							<th scope="rowgroup" colspan={totalColumns}>
								<span>{group.label}</span>
								<span class="group-count">{group.rows.length}</span>
							</th>
						</tr>
						{#each group.rows as row (row.person.id)}
							<tr>
								<th scope="row" class="person-cell">
									<span class="person-rank">{row.person.rank}</span>
									<span>{personName(row.person)}</span>
									<span class="person-mos">{row.person.mos || 'No MOS'}</span>
								</th>
								{#each row.cells as cell (cell.task.id)}
									{#if cell.applicable}
										<td class="status-cell" data-status={cell.statusInfo.status}>
											<button
												type="button"
												class="status-button"
												data-status={cell.statusInfo.status}
												aria-label={cellAriaLabel(row.person, cell)}
											>
												<span class="status-symbol">{statusSymbols[cell.statusInfo.status]}</span>
												<span class="status-text">{statusLabels[cell.statusInfo.status]}</span>
												<span class="cell-details" aria-hidden="true">
													{#if cell.completion}
														<span>Completed {cell.completion.completedAt}</span>
														{#if cell.statusInfo.expirationDate}
															<span>Expires {cell.statusInfo.expirationDate}</span>
														{/if}
														<span>{cell.completion.validatedBy ?? 'Validator not recorded'}</span>
													{:else}
														<span>No completion recorded</span>
													{/if}
												</span>
											</button>
										</td>
									{:else}
										<td class="status-cell not-applicable" aria-label={cellAriaLabel(row.person, cell)}></td>
									{/if}
								{/each}
							</tr>
						{/each}
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</div>

<style>
	.ict-matrix-shell {
		display: flex;
		flex-direction: column;
		min-height: 0;
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	.matrix-legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-3);
		padding: var(--sp-2) var(--sp-3);
		border-bottom: var(--border-thin);
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.legend-item {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
	}

	.legend-mark {
		display: inline-grid;
		width: 1.2rem;
		height: 1.2rem;
		place-items: center;
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		color: var(--text-primary);
	}

	.matrix-scroll {
		overflow: auto;
		min-height: 0;
	}

	.ict-matrix {
		width: 100%;
		min-width: max-content;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	.ict-matrix thead {
		position: sticky;
		top: 0;
		z-index: var(--z-sticky, 10);
		background: var(--surface-subtle);
	}

	.ict-matrix th,
	.ict-matrix td {
		border-bottom: var(--border-rule);
		text-align: left;
	}

	.person-header,
	.person-cell {
		position: sticky;
		left: 0;
		z-index: 5;
		width: 14rem;
		min-width: 14rem;
		max-width: 16rem;
		border-right: var(--border-thin);
		background: var(--surface-panel);
	}

	.person-header {
		z-index: calc(var(--z-sticky, 10) + 5);
		padding: var(--sp-2) var(--sp-3);
		background: var(--surface-subtle);
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.person-cell {
		padding: var(--sp-2) var(--sp-3);
		color: var(--text-primary);
		white-space: nowrap;
	}

	.person-rank {
		display: inline-block;
		min-width: 2.5rem;
		margin-right: var(--sp-2);
		color: var(--amber-dark);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.person-mos {
		display: block;
		margin-top: 2px;
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.06em;
	}

	.task-header {
		width: 5.5rem;
		min-width: 5.5rem;
		max-width: 5.5rem;
		height: 10rem;
		padding: var(--sp-2);
		vertical-align: bottom;
		border-left: var(--border-rule);
		color: var(--text-secondary);
	}

	.task-code,
	.task-title {
		display: block;
		writing-mode: vertical-rl;
		transform: rotate(180deg);
		white-space: nowrap;
	}

	.task-code {
		color: var(--text-primary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
	}

	.task-title {
		max-height: 7rem;
		margin-top: var(--sp-1);
		overflow: hidden;
		text-overflow: ellipsis;
		font-family: var(--font-display);
		font-size: var(--text-sm);
		line-height: 1;
		text-transform: uppercase;
	}

	.group-row th {
		position: sticky;
		left: 0;
		z-index: 4;
		padding: var(--sp-2) var(--sp-3);
		border-bottom: var(--border-thin);
		background: color-mix(in srgb, var(--surface-subtle) 74%, var(--surface-panel) 26%);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.group-count {
		margin-left: var(--sp-2);
		color: var(--text-tertiary);
	}

	.status-cell {
		width: 5.5rem;
		min-width: 5.5rem;
		height: 3rem;
		padding: 0;
		border-left: var(--border-rule);
		text-align: center;
		vertical-align: middle;
	}

	.status-button {
		position: relative;
		display: grid;
		width: 100%;
		height: 3rem;
		place-items: center;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--text-primary);
		cursor: default;
	}

	.status-button:focus-visible {
		outline: var(--focus-outline);
		outline-offset: -2px;
	}

	.status-symbol {
		font-family: var(--font-body);
		font-size: var(--text-lg);
		font-style: italic;
		font-weight: var(--font-weight-semibold);
		line-height: 1;
	}

	.status-text {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	.cell-details {
		position: absolute;
		left: 50%;
		bottom: calc(100% + 6px);
		z-index: 20;
		display: none;
		min-width: 12rem;
		max-width: 16rem;
		transform: translateX(-50%);
		padding: var(--sp-2);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
		box-shadow: var(--shadow-md);
		color: var(--text-primary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		line-height: 1.4;
		text-align: left;
	}

	.cell-details span {
		display: block;
	}

	.status-button:hover .cell-details,
	.status-button:focus-visible .cell-details {
		display: block;
	}

	.status-cell[data-status='current'] {
		background: color-mix(in srgb, #2f855a 16%, transparent);
	}

	.status-cell[data-status='expiring-soon'] {
		background: color-mix(in srgb, var(--amber) 22%, transparent);
	}

	.status-cell[data-status='expired'] {
		background: color-mix(in srgb, #c53030 16%, transparent);
	}

	.status-cell[data-status='not-recorded'] {
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
	}

	.not-applicable {
		background:
			repeating-linear-gradient(
				-45deg,
				color-mix(in srgb, var(--surface-subtle) 55%, transparent),
				color-mix(in srgb, var(--surface-subtle) 55%, transparent) 1px,
				transparent 1px,
				transparent 7px
			),
			var(--surface-panel);
	}

	.empty-row {
		padding: var(--sp-6);
		color: var(--text-secondary);
		text-align: center;
	}

	tr:hover .person-cell,
	tr:hover .status-cell {
		background-color: color-mix(in srgb, var(--surface-subtle) 58%, var(--surface-panel) 42%);
	}

	@media (max-width: 640px) {
		.person-header,
		.person-cell {
			width: 11rem;
			min-width: 11rem;
			max-width: 11rem;
		}

		.task-header,
		.status-cell {
			width: 4.75rem;
			min-width: 4.75rem;
			max-width: 4.75rem;
		}

		.task-header {
			height: 8rem;
		}
	}
</style>
