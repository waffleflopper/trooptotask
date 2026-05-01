<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import type { AdvancedDutyDa6Matrix } from '../duty-roster.types';
	import {
		formatAdvancedDutyDa6CellLabel,
		formatAdvancedDutyDa6CoverageLabel,
		formatAdvancedDutyDa6DisplayDate
	} from './advancedDutyDa6Format';

	interface Props {
		title: string;
		matrices: AdvancedDutyDa6Matrix[];
		onClose: () => void;
		onPrint: () => void;
	}

	let { title, matrices, onClose, onPrint }: Props = $props();
</script>

<Modal {title} {onClose} width="1200px" titleId="advanced-da6-modal-title">
	<section class="da6-modal" aria-label="Advanced duty DA6 matrices">
		<div class="da6-toolbar">
			<div>
				<p class="eyebrow">Duty roster audit</p>
				<p class="meta">{matrices.length} matrix{matrices.length === 1 ? '' : 'es'} ready for review and print.</p>
			</div>
			<button class="btn btn-secondary btn-sm" type="button" onclick={onPrint}>Print DA6</button>
		</div>
		<p class="legend">
			Legend: <strong>X</strong> assigned, <strong>A</strong> authorized absence, <strong>D#</strong> other duty or
			blocked, <strong>U#</strong> misconduct unavailable.
		</p>

		<div class="matrix-list">
			{#each matrices as matrix (`${matrix.templateSlotId}-${matrix.sequenceKey}`)}
				<article class="matrix-card">
					<header class="matrix-header">
						<div>
							<h4>{matrix.roleLabel}</h4>
							<p class="meta">
								{matrix.sequenceLabel} · {matrix.columns.length} duty date{matrix.columns.length === 1 ? '' : 's'} · {matrix
									.rows.length} Soldiers
							</p>
						</div>
						<p class="pool-label">Pool {matrix.rotationPoolKey}</p>
					</header>
					<div class="matrix-scroll">
						<table class="roster-table da6-table" aria-label={`DA6 matrix ${matrix.roleLabel} ${matrix.sequenceLabel}`}>
							<thead>
								<tr>
									<th class="sticky-col">Name</th>
									{#each matrix.columns as column (column.eventDate)}
										<th>
											<div>{formatAdvancedDutyDa6DisplayDate(column.eventDate)}</div>
											<div class="column-meta">{formatAdvancedDutyDa6CoverageLabel(column)}</div>
										</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each matrix.rows as row (row.personnelId)}
									<tr>
										<td class="sticky-col name-cell"
											>{row.display.rank} {row.display.lastName}, {row.display.firstName}</td
										>
										{#each row.cells as cell (`${row.personnelId}-${cell.eventDate}`)}
											<td
												class:assigned={cell.assigned}
												class:blocked={cell.da6Code === 'D'}
												class:unavailable={cell.da6Code === 'A' || cell.da6Code === 'U'}
												title={cell.reason ?? undefined}
											>
												{formatAdvancedDutyDa6CellLabel(cell)}
											</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</article>
			{/each}
		</div>
	</section>
</Modal>

<style>
	.da6-modal {
		display: grid;
		gap: var(--sp-4);
	}

	.da6-toolbar {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--sp-4);
	}

	.eyebrow,
	.pool-label {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.meta,
	.legend {
		margin: var(--sp-1) 0 0;
		color: var(--text-secondary);
	}

	.matrix-list {
		display: grid;
		gap: var(--sp-4);
	}

	.matrix-card {
		display: grid;
		gap: var(--sp-3);
		padding: var(--sp-4);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
	}

	.matrix-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--sp-3);
	}

	h4 {
		margin: 0;
	}

	.matrix-scroll {
		overflow-x: auto;
	}

	.da6-table {
		min-width: max-content;
	}

	.sticky-col {
		position: sticky;
		left: 0;
		background: var(--surface-panel);
		z-index: 1;
	}

	.name-cell {
		min-width: 220px;
	}

	.column-meta {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		color: var(--text-tertiary);
	}

	td {
		min-width: 88px;
		text-align: center;
		font-family: var(--font-mono);
	}

	td.assigned {
		background: color-mix(in srgb, var(--success-bg) 55%, var(--surface-panel) 45%);
		font-weight: var(--font-weight-semibold);
	}

	td.blocked {
		background: color-mix(in srgb, var(--warning-bg) 60%, var(--surface-panel) 40%);
	}

	td.unavailable {
		background: color-mix(in srgb, var(--surface-subtle) 80%, var(--surface-panel) 20%);
	}
</style>
