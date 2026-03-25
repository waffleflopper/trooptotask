<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import { trainingViewsStore } from '$features/training/stores/trainingViews.svelte';
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import type { TrainingView } from '$features/training/training.types';

	interface Props {
		onClose: () => void;
		orgId: string;
		readOnly: boolean;
	}

	let { onClose, orgId, readOnly }: Props = $props();

	let mode: 'list' | 'edit' = $state('list');
	let editingView: TrainingView | null = $state(null);
	let name = $state('');
	let selectedIds = new SvelteSet<string>();
	let orderedIds: string[] = $state([]);
	let saving = $state(false);
	let error = $state('');

	function startCreate() {
		editingView = null;
		name = '';
		selectedIds.clear();
		orderedIds = [];
		error = '';
		mode = 'edit';
	}

	function startEdit(view: TrainingView) {
		editingView = view;
		name = view.name;
		selectedIds.clear();
		for (const id of view.columnIds) selectedIds.add(id);
		orderedIds = [...view.columnIds];
		error = '';
		mode = 'edit';
	}

	function toggleType(typeId: string) {
		if (selectedIds.has(typeId)) {
			selectedIds.delete(typeId);
			orderedIds = orderedIds.filter((id) => id !== typeId);
		} else {
			selectedIds.add(typeId);
			orderedIds = [...orderedIds, typeId];
		}
	}

	function moveUp(index: number) {
		if (index <= 0) return;
		const newOrder = [...orderedIds];
		[newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
		orderedIds = newOrder;
	}

	function moveDown(index: number) {
		if (index >= orderedIds.length - 1) return;
		const newOrder = [...orderedIds];
		[newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
		orderedIds = newOrder;
	}

	async function handleSave() {
		if (!name.trim()) {
			error = 'Name is required.';
			return;
		}
		saving = true;
		error = '';

		try {
			if (editingView) {
				await trainingViewsStore.update(editingView.id, {
					name: name.trim(),
					columnIds: orderedIds
				});
			} else {
				await trainingViewsStore.add({
					name: name.trim(),
					columnIds: orderedIds,
					createdBy: '',
					createdAt: '',
					updatedAt: ''
				});
			}
			mode = 'list';
		} catch {
			error = 'Failed to save view.';
		} finally {
			saving = false;
		}
	}

	async function handleDelete(view: TrainingView) {
		if (!confirm(`Delete view "${view.name}"?`)) return;
		await trainingViewsStore.remove(view.id);
	}

	function getTypeName(typeId: string): string {
		return trainingTypesStore.getById(typeId)?.name ?? 'Unknown';
	}
</script>

<Modal
	title={mode === 'list' ? 'Manage Views' : editingView ? 'Edit View' : 'New View'}
	{onClose}
	width="520px"
	canClose={!saving}
>
	{#if mode === 'list'}
		<div class="view-list">
			{#each trainingViewsStore.items as view (view.id)}
				<div class="view-item">
					<div class="view-info">
						<span class="view-name">{view.name}</span>
						<span class="view-count">{view.columnIds.length} columns</span>
					</div>
					{#if !readOnly}
						<div class="view-actions">
							<button class="btn btn-sm" onclick={() => startEdit(view)}>Edit</button>
							<button class="btn btn-sm btn-danger" onclick={() => handleDelete(view)}>Delete</button>
						</div>
					{/if}
				</div>
			{:else}
				<p class="text-muted">No saved views yet.</p>
			{/each}
		</div>
	{:else}
		<div class="edit-form">
			<label class="form-field">
				<span class="form-label">View Name</span>
				<input class="input" type="text" bind:value={name} placeholder="e.g., Annual Trainings" />
			</label>

			{#if error}
				<p class="form-error">{error}</p>
			{/if}

			<div class="type-selection">
				<span class="form-label">Training Types</span>
				<div class="type-checklist">
					{#each trainingTypesStore.items as type (type.id)}
						<label class="type-check">
							<input type="checkbox" checked={selectedIds.has(type.id)} onchange={() => toggleType(type.id)} />
							<span class="type-color" style="background: {type.color};"></span>
							{type.name}
						</label>
					{/each}
				</div>
			</div>

			{#if orderedIds.length > 0}
				<div class="column-order">
					<span class="form-label">Column Order</span>
					<ol class="order-list">
						{#each orderedIds as typeId, i (typeId)}
							<li class="order-item">
								<span>{getTypeName(typeId)}</span>
								<div class="order-buttons">
									<button class="btn-icon" onclick={() => moveUp(i)} disabled={i === 0}>&uarr;</button>
									<button class="btn-icon" onclick={() => moveDown(i)} disabled={i === orderedIds.length - 1}
										>&darr;</button
									>
								</div>
							</li>
						{/each}
					</ol>
				</div>
			{/if}
		</div>
	{/if}

	{#snippet footer()}
		{#if mode === 'list'}
			{#if !readOnly}
				<button class="btn btn-primary" onclick={startCreate}>New View</button>
			{/if}
			<span class="spacer"></span>
			<button class="btn" onclick={onClose}>Close</button>
		{:else}
			<button class="btn" onclick={() => (mode = 'list')} disabled={saving}>Back</button>
			<span class="spacer"></span>
			<button class="btn" onclick={() => (mode = 'list')} disabled={saving}>Cancel</button>
			<button class="btn btn-primary" onclick={handleSave} disabled={saving}>
				{saving ? 'Saving...' : 'Save'}
			</button>
		{/if}
	{/snippet}
</Modal>

<style>
	.view-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.view-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-bg);
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
	}

	.view-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.view-name {
		font-weight: 500;
	}

	.view-count {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.view-actions {
		display: flex;
		gap: var(--spacing-xs);
	}

	.edit-form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.form-label {
		font-size: var(--font-size-sm);
		font-weight: 500;
	}

	.form-error {
		color: var(--color-error);
		font-size: var(--font-size-sm);
	}

	.type-selection {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.type-checklist {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
		max-height: 200px;
		overflow-y: auto;
		padding: var(--spacing-sm);
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.type-check {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: var(--font-size-sm);
		cursor: pointer;
	}

	.type-color {
		display: inline-block;
		width: 12px;
		height: 12px;
		border-radius: 2px;
		flex-shrink: 0;
	}

	.column-order {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.order-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.order-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-xs) var(--spacing-sm);
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--font-size-sm);
	}

	.order-buttons {
		display: flex;
		gap: 2px;
	}

	.btn-icon {
		padding: 2px 6px;
		font-size: var(--font-size-sm);
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		color: var(--color-text);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}

	.btn-icon:hover:not(:disabled) {
		background: var(--color-bg);
	}

	.btn-icon:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}
</style>
