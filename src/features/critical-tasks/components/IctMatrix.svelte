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
		type CriticalTasksMatrixCell,
		type CriticalTasksMatrixRow
	} from '$features/critical-tasks/utils/criticalTasksMatrix';

	type IctMatrixViewMode = 'alphabetical' | 'by-group';

	interface Props {
		orgId?: string;
		personnel: Personnel[];
		tasks: IctTask[];
		completions: PersonnelIctCompletion[];
		groups?: Group[];
		settings?: CriticalTasksSettingsInput | null;
		selectedGroupId?: string;
		gapsOnly?: boolean;
		viewMode?: IctMatrixViewMode;
		asOf?: string | Date;
		orgName?: string;
		canEdit?: boolean;
		onSelectCell?: (selection: {
			person: Personnel;
			task: IctTask;
			completion: PersonnelIctCompletion | undefined;
		}) => void;
	}

	let {
		orgId = '',
		personnel,
		tasks,
		completions,
		groups = [],
		settings = null,
		selectedGroupId = '',
		gapsOnly = false,
		viewMode = 'by-group',
		asOf,
		orgName = 'Unassigned',
		canEdit = false,
		onSelectCell
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
	const visibleRows = $derived(viewMode === 'alphabetical' ? matrix.alphabeticalRows : matrix.rows);

	function personName(person: Personnel): string {
		return `${person.lastName}, ${person.firstName}`;
	}

	function readinessTone(percent: number, applicableCount: number): 'empty' | 'danger' | 'warn' | 'good' {
		if (applicableCount === 0) return 'empty';
		if (percent < 65) return 'danger';
		if (percent >= 80) return 'good';
		return 'warn';
	}

	function personDetailHref(person: Personnel): string {
		return `/org/${orgId}/critical-tasks/${person.id}`;
	}

	function cellAriaLabel(person: Personnel, cell: CriticalTasksMatrixCell): string {
		if (!cell.applicable) {
			return `${person.lastName} ${cell.task.taskCode}: not applicable`;
		}

		return `${person.lastName} ${cell.task.taskCode}: ${statusLabels[cell.statusInfo.status]}. ${cell.detailLabel}`;
	}

	function handleCellClick(person: Personnel, cell: CriticalTasksMatrixCell): void {
		if (!canEdit) return;
		onSelectCell?.({
			person,
			task: cell.task,
			completion: cell.completion
		});
	}
</script>

{#snippet matrixRow(row: CriticalTasksMatrixRow)}
	<tr>
		<th scope="row" class="person-cell">
			{#if orgId}
				<a href={personDetailHref(row.person)} class="person-link">
					<span class="person-primary">
						<span class="person-rank">{row.person.rank}</span>
						<span>
							<span class="person-name">{personName(row.person)}</span>
							<span class="person-mos">{row.person.mos || 'No MOS'}</span>
						</span>
					</span>
					<span
						class="person-readiness"
						aria-label={`${personName(row.person)} readiness ${row.readinessPercent}%`}
						data-readiness={readinessTone(row.readinessPercent, row.applicableCount)}
					>
						<span>RDY</span>
						<span class="person-readiness-bar" aria-hidden="true">
							<span class="person-readiness-fill" style={`width: ${row.readinessPercent}%`}></span>
						</span>
						<span class="person-readiness-percent">{row.readinessPercent}%</span>
					</span>
				</a>
			{:else}
				<div class="person-summary">
					<span class="person-primary">
						<span class="person-rank">{row.person.rank}</span>
						<span>
							<span class="person-name">{personName(row.person)}</span>
							<span class="person-mos">{row.person.mos || 'No MOS'}</span>
						</span>
					</span>
					<span
						class="person-readiness"
						aria-label={`${personName(row.person)} readiness ${row.readinessPercent}%`}
						data-readiness={readinessTone(row.readinessPercent, row.applicableCount)}
					>
						<span>RDY</span>
						<span class="person-readiness-bar" aria-hidden="true">
							<span class="person-readiness-fill" style={`width: ${row.readinessPercent}%`}></span>
						</span>
						<span class="person-readiness-percent">{row.readinessPercent}%</span>
					</span>
				</div>
			{/if}
		</th>
		{#each row.cells as cell (cell.task.id)}
			{#if cell.applicable}
				<td class="status-cell" data-status={cell.statusInfo.status}>
					<button
						type="button"
						class:editable={canEdit}
						class="status-button"
						data-status={cell.statusInfo.status}
						aria-label={cellAriaLabel(row.person, cell)}
						aria-haspopup={canEdit ? 'dialog' : undefined}
						onclick={() => handleCellClick(row.person, cell)}
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
{/snippet}

<div class="ict-matrix-shell">
	<div class="matrix-legend" aria-label="Critical Tasks status legend">
		<span class="legend-item" data-status="current"><span class="legend-mark">✓</span> Current</span>
		<span class="legend-item" data-status="expiring-soon"><span class="legend-mark">!</span> Expiring Soon</span>
		<span class="legend-item" data-status="expired"><span class="legend-mark">✗</span> Expired</span>
		<span class="legend-item" data-status="not-recorded"><span class="legend-mark">—</span> Not Recorded</span>
		<span class="legend-item legend-item--na"><span class="legend-mark"></span> Not Required for MOS</span>
	</div>

	<div class="matrix-scroll" data-testid="critical-tasks-matrix-scroll">
		<table class="ict-matrix" data-testid="critical-tasks-matrix-table" aria-label="Critical Tasks readiness matrix">
			<thead>
				<tr>
					<th scope="col" class="person-header">Soldier</th>
					{#each matrix.tasks as task (task.id)}
						<th scope="col" class="task-header" aria-label="{task.taskCode} {task.title}" title={task.title}>
							<span class="task-code">{task.taskCode}</span>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#if visibleRows.length === 0}
					<tr>
						<td class="empty-row" colspan={totalColumns}>No personnel match the current Critical Tasks filters.</td>
					</tr>
				{:else if viewMode === 'alphabetical'}
					{#each matrix.alphabeticalRows as row (row.person.id)}
						{@render matrixRow(row)}
					{/each}
				{:else}
					{#each matrix.groups as group (group.key)}
						<tr class="group-row">
							<th scope="rowgroup" colspan={totalColumns}>
								<span class="group-label">
									{group.label}
									<span class="group-meta">
										{group.rows.length} personnel ({group.readinessPercent}% Readiness)
									</span>
								</span>
							</th>
						</tr>
						{#each group.rows as row (row.person.id)}
							{@render matrixRow(row)}
						{/each}
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</div>

<style>
	.ict-matrix-shell {
		--matrix-rule: color-mix(in srgb, var(--text-primary) 12%, transparent);
		--matrix-rule-strong: color-mix(in srgb, var(--text-primary) 22%, transparent);
		--matrix-paper-2: color-mix(in srgb, var(--surface-subtle) 76%, var(--surface-panel) 24%);
		--matrix-paper-3: color-mix(in srgb, var(--border-default) 58%, var(--surface-panel) 42%);
		--cell-current-bg: color-mix(in srgb, var(--success-bg) 78%, var(--surface-panel) 22%);
		--cell-current-ink: var(--success);
		--cell-expiring-bg: color-mix(in srgb, var(--amber-light) 82%, var(--surface-panel) 18%);
		--cell-expiring-ink: var(--amber-dark);
		--cell-expired-bg: color-mix(in srgb, var(--danger-bg) 78%, var(--surface-panel) 22%);
		--cell-expired-ink: var(--danger);

		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		border: 1px solid var(--matrix-rule);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		overflow: hidden;
	}

	.matrix-legend {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-5);
		padding: 10px var(--sp-5);
		border-bottom: 1px solid var(--matrix-rule);
		background: var(--surface-panel);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.legend-item {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		white-space: nowrap;
	}

	.legend-item--na {
		margin-left: auto;
	}

	.legend-mark {
		display: inline-grid;
		width: 1.375rem;
		height: 1.375rem;
		place-items: center;
		border-radius: var(--radius-sm);
		border: 1px solid var(--matrix-rule);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-medium);
		line-height: 1;
	}

	.legend-item[data-status='current'] .legend-mark {
		border-color: transparent;
		background: var(--cell-current-bg);
		color: var(--cell-current-ink);
	}

	.legend-item[data-status='expiring-soon'] .legend-mark {
		border-color: transparent;
		background: var(--cell-expiring-bg);
		color: var(--cell-expiring-ink);
	}

	.legend-item[data-status='expired'] .legend-mark {
		border-color: transparent;
		background: var(--cell-expired-bg);
		color: var(--cell-expired-ink);
	}

	.legend-item[data-status='not-recorded'] .legend-mark {
		background: var(--surface-panel);
		color: var(--text-tertiary);
	}

	.legend-item--na .legend-mark {
		background:
			repeating-linear-gradient(
				45deg,
				transparent,
				transparent 3px,
				color-mix(in srgb, var(--text-primary) 7%, transparent) 3px,
				color-mix(in srgb, var(--text-primary) 7%, transparent) 4px
			),
			var(--surface-panel);
	}

	.matrix-scroll {
		flex: 1;
		overflow: auto;
		min-height: 0;
		background: var(--surface-panel);
	}

	.matrix-scroll::-webkit-scrollbar {
		width: 10px;
		height: 10px;
	}

	.matrix-scroll::-webkit-scrollbar-track {
		background: var(--matrix-paper-2);
	}

	.matrix-scroll::-webkit-scrollbar-thumb {
		border-radius: 0;
		background: var(--matrix-rule-strong);
	}

	.ict-matrix {
		width: max-content;
		min-width: max-content;
		border-collapse: separate;
		border-spacing: 0;
		font-size: var(--text-sm);
	}

	.ict-matrix thead {
		position: sticky;
		top: 0;
		z-index: var(--z-sticky, 10);
		background: var(--matrix-paper-2);
	}

	.ict-matrix th,
	.ict-matrix td {
		border-bottom: 1px solid var(--matrix-rule);
		text-align: left;
	}

	.person-header,
	.person-cell {
		position: sticky;
		left: 0;
		z-index: 5;
		width: 16.25rem;
		min-width: 16.25rem;
		max-width: 16.25rem;
		border-right: 1px solid var(--matrix-rule-strong);
		background: var(--surface-panel);
	}

	.person-header {
		z-index: calc(var(--z-sticky, 10) + 5);
		padding: var(--sp-3) var(--sp-4);
		background: var(--matrix-paper-2);
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		font-size: 0.625rem;
		font-weight: var(--font-weight-regular);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.person-cell {
		padding: 0;
		color: var(--text-primary);
		white-space: nowrap;
	}

	.person-link,
	.person-summary {
		display: grid;
		grid-template-columns: 1fr;
		gap: 6px;
		width: 100%;
		height: 100%;
		padding: 10px var(--sp-4);
		box-sizing: border-box;
	}

	.person-link {
		color: inherit;
		text-decoration: none;
	}

	.person-link:hover,
	.person-link:focus-visible {
		background: var(--matrix-paper-2);
		color: inherit;
	}

	.person-link:focus-visible {
		outline: 2px solid var(--amber-dark);
		outline-offset: -2px;
	}

	.person-primary {
		display: grid;
		grid-template-columns: 2.75rem minmax(0, 1fr);
		align-items: center;
		gap: 10px;
		min-width: 0;
	}

	.person-name {
		display: block;
		min-width: 0;
		color: var(--text-primary);
		font-family: var(--font-body);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		line-height: 1.2;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.person-rank {
		display: inline-block;
		min-width: 2.75rem;
		color: var(--amber-dark);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.person-mos {
		display: block;
		margin-top: 2px;
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.06em;
	}

	.person-readiness {
		display: grid;
		grid-template-columns: auto minmax(3.5rem, 1fr) 2rem;
		align-items: center;
		gap: 10px;
		padding-top: 6px;
		border-top: 1px dashed var(--matrix-rule);
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.person-readiness-bar {
		height: 3px;
		overflow: hidden;
		border-radius: 1px;
		background: var(--matrix-paper-3);
	}

	.person-readiness-fill {
		display: block;
		height: 100%;
		background: var(--amber);
	}

	.person-readiness[data-readiness='good'] .person-readiness-fill {
		background: var(--success);
	}

	.person-readiness[data-readiness='danger'] .person-readiness-fill {
		background: var(--danger);
	}

	.person-readiness-percent {
		color: var(--text-primary);
		font-weight: var(--font-weight-medium);
		text-align: right;
	}

	.task-header {
		position: sticky;
		top: 0;
		z-index: var(--z-sticky, 10);
		width: 2.5rem;
		min-width: 2.5rem;
		max-width: 2.5rem;
		height: 8.75rem;
		padding: 0;
		vertical-align: bottom;
		border-right: 1px solid var(--matrix-rule);
		color: var(--text-secondary);
		cursor: default;
		background: var(--matrix-paper-2);
	}

	.task-code {
		display: block;
		position: absolute;
		bottom: 10px;
		left: 50%;
		transform: translateX(-50%) rotate(-90deg);
		transform-origin: left bottom;
		white-space: nowrap;
		overflow: hidden;
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: 0.625rem;
		font-weight: var(--font-weight-regular);
		letter-spacing: 0.04em;
	}

	.group-row th {
		position: sticky;
		left: 0;
		z-index: 4;
		padding: 10px var(--sp-4);
		border-top: 1px solid var(--matrix-rule-strong);
		border-bottom: 1px solid var(--matrix-rule-strong);
		background: var(--matrix-paper-3);
		color: var(--text-primary);
		font-family: var(--font-display);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.group-label {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		white-space: nowrap;
	}

	.group-meta {
		flex: none;
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-regular);
		letter-spacing: 0.06em;
		text-transform: none;
	}

	.status-cell {
		width: 2.5rem;
		min-width: 2.5rem;
		height: 2.5rem;
		padding: 0;
		border-right: 1px solid var(--matrix-rule);
		text-align: center;
		vertical-align: middle;
		position: relative;
	}

	.status-cell:hover,
	.status-cell:focus-within {
		z-index: calc(var(--z-sticky, 10) + 30);
	}

	.status-button {
		position: relative;
		display: grid;
		width: 100%;
		height: 2.5rem;
		place-items: center;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		cursor: default;
	}

	.status-button.editable {
		cursor: pointer;
	}

	.status-button.editable:hover {
		z-index: calc(var(--z-sticky, 10) + 31);
		outline: 2px solid var(--amber);
		outline-offset: -2px;
		transform: scale(1.08);
	}

	.status-button:focus-visible {
		outline: var(--focus-outline);
		outline-offset: -2px;
	}

	.status-symbol {
		font-family: var(--font-mono);
		font-size: var(--text-lg);
		font-weight: var(--font-weight-medium);
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
		z-index: calc(var(--z-sticky, 10) + 40);
		display: none;
		min-width: 12rem;
		max-width: 16rem;
		transform: translateX(-50%);
		padding: var(--sp-2);
		border: 1px solid var(--matrix-rule-strong);
		border-radius: var(--radius-sm);
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
		background: var(--cell-current-bg);
		color: var(--cell-current-ink);
	}

	.status-cell[data-status='expiring-soon'] {
		background: var(--cell-expiring-bg);
		color: var(--cell-expiring-ink);
	}

	.status-cell[data-status='expired'] {
		background: var(--cell-expired-bg);
		color: var(--cell-expired-ink);
	}

	.status-cell[data-status='not-recorded'] {
		background: var(--surface-panel);
		color: var(--text-tertiary);
	}

	.not-applicable {
		background:
			repeating-linear-gradient(
				45deg,
				transparent,
				transparent 4px,
				color-mix(in srgb, var(--text-primary) 6%, transparent) 4px,
				color-mix(in srgb, var(--text-primary) 6%, transparent) 5px
			),
			var(--surface-panel);
	}

	.empty-row {
		padding: var(--sp-6);
		color: var(--text-secondary);
		text-align: center;
	}

	tr:hover .person-cell,
	tr:hover .status-cell[data-status='not-recorded'] {
		background-color: var(--matrix-paper-2);
	}

	@media (max-width: 640px) {
		.person-header,
		.person-cell {
			width: 13rem;
			min-width: 13rem;
			max-width: 13rem;
		}

		.task-header,
		.status-cell {
			width: 2.25rem;
			min-width: 2.25rem;
			max-width: 2.25rem;
		}

		.task-header {
			height: 7.5rem;
		}

		.legend-item--na {
			margin-left: 0;
		}
	}
</style>
