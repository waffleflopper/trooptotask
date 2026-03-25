<script lang="ts">
	import { trainingViewsStore } from '$features/training/stores/trainingViews.svelte';
	import type { TrainingView } from '$features/training/training.types';

	interface Props {
		selectedViewId: string | null;
		onSelect: (viewId: string | null) => void;
		canEdit: boolean;
		onEditClick: () => void;
	}

	let { selectedViewId, onSelect, canEdit, onEditClick }: Props = $props();

	function handleChange(e: Event) {
		const value = (e.target as HTMLSelectElement).value;
		onSelect(value || null);
	}
</script>

<div class="view-selector">
	<label class="filter-label">
		View:
		<select class="select" value={selectedViewId ?? ''} onchange={handleChange}>
			<option value="">All Trainings</option>
			{#each trainingViewsStore.items as view (view.id)}
				<option value={view.id}>{view.name}</option>
			{/each}
		</select>
	</label>
	{#if canEdit}
		<button class="btn btn-sm btn-ghost" onclick={onEditClick} title="Manage views"> &#9998; </button>
	{/if}
</div>

<style>
	.view-selector {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.filter-label {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: var(--font-size-sm);
	}

	.filter-label .select {
		width: 200px;
	}
</style>
