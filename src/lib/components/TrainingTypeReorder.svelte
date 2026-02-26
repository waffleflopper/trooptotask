<script lang="ts">
	import type { TrainingType } from '../types';
	import Modal from './Modal.svelte';

	interface Props {
		trainingTypes: TrainingType[];
		onUpdate: (id: string, data: Partial<Omit<TrainingType, 'id'>>) => Promise<void>;
		onClose: () => void;
	}

	let { trainingTypes, onUpdate, onClose }: Props = $props();

	// Local copy for immediate visual feedback; synced from the (already-sorted) store list
	let orderedTypes = $state<TrainingType[]>([]);

	$effect(() => {
		orderedTypes = [...trainingTypes];
	});

	function moveUp(index: number) {
		if (index === 0) return;
		const newOrder = [...orderedTypes];
		const above = newOrder[index - 1];
		const current = newOrder[index];
		const swappedSort = above.sortOrder;
		newOrder[index - 1] = { ...current, sortOrder: swappedSort };
		newOrder[index] = { ...above, sortOrder: current.sortOrder };
		orderedTypes = newOrder;
		onUpdate(current.id, { sortOrder: swappedSort });
		onUpdate(above.id, { sortOrder: current.sortOrder });
	}

	function moveDown(index: number) {
		if (index === orderedTypes.length - 1) return;
		moveUp(index + 1);
	}
</script>

<Modal title="Reorder Training Types" {onClose} width="400px" titleId="reorder-title">
	<p class="hint">Use the arrows to set the column order in the training matrix.</p>

	<ul class="type-list">
		{#each orderedTypes as type, i (type.id)}
			<li class="type-item">
				<span class="type-color" style="background-color: {type.color}"></span>
				<span class="type-name">{type.name}</span>
				<div class="move-btns">
					<button
						class="btn-move"
						onclick={() => moveUp(i)}
						disabled={i === 0}
						aria-label="Move up"
					>▲</button>
					<button
						class="btn-move"
						onclick={() => moveDown(i)}
						disabled={i === orderedTypes.length - 1}
						aria-label="Move down"
					>▼</button>
				</div>
			</li>
		{/each}
	</ul>

	{#snippet footer()}
		<div class="spacer"></div>
		<button class="btn btn-primary" onclick={onClose}>Done</button>
	{/snippet}
</Modal>

<style>
	.hint {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-md);
	}

	.type-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.type-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.type-color {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.type-name {
		flex: 1;
		font-size: var(--font-size-sm);
		font-weight: 500;
	}

	.move-btns {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.btn-move {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 20px;
		font-size: 10px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
		color: var(--color-text-secondary);
		line-height: 1;
		transition: background var(--transition-fast);
	}

	.btn-move:hover:not(:disabled) {
		background: var(--color-primary);
		color: white;
		border-color: var(--color-primary);
	}

	.btn-move:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.spacer {
		flex: 1;
	}
</style>
