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
		<button class="btn btn-sm btn-ghost edit-btn" onclick={onEditClick} title="Manage views">
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
				<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
			</svg>
		</button>
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

	.edit-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
	}
</style>
