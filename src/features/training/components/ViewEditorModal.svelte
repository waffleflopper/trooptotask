<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { trainingViewsStore } from '$features/training/stores/trainingViews.svelte';
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import type { TrainingView } from '$features/training/training.types';

	interface Props {
		onClose: () => void;
		readOnly: boolean;
	}

	let { onClose, readOnly }: Props = $props();

	let mode: 'list' | 'edit' = $state('list');
	let editingView: TrainingView | null = $state(null);
	let confirmDeleteView: TrainingView | null = $state(null);
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

	async function doDelete() {
		if (!confirmDeleteView) return;
		await trainingViewsStore.remove(confirmDeleteView.id);
		confirmDeleteView = null;
	}

	function getTypeName(typeId: string): string {
		return trainingTypesStore.getById(typeId)?.name ?? 'Unknown';
	}
</script>

<Modal
	title={mode === 'list' ? 'Manage Views' : editingView ? 'Edit View' : 'New View'}
	{onClose}
	width="560px"
	canClose={!saving}
>
	{#if mode === 'list'}
		<div class="view-list-state">
			<div class="list-summary">
				<div class="list-summary-copy">
					<p class="eyebrow">Saved Layouts</p>
					<p class="summary-text">
						Control which training columns show up in the matrix without rebuilding the view each time.
					</p>
				</div>
				<Badge label={`${trainingViewsStore.items.length} saved`} variant="outlined" />
			</div>

			<div class="view-list">
				{#each trainingViewsStore.items as view (view.id)}
					<div class="view-item">
						<div class="view-info">
							<span class="view-name">{view.name}</span>
							<div class="view-meta">
								<Badge label={`${view.columnIds.length} columns`} variant="outlined" />
								<span class="view-columns">{view.columnIds.map(getTypeName).join(' • ') || 'No columns selected'}</span>
							</div>
						</div>
						{#if !readOnly}
							<div class="view-actions">
								<button class="btn btn-sm" type="button" onclick={() => startEdit(view)}>Edit</button>
								<button class="btn btn-sm btn-danger" type="button" onclick={() => (confirmDeleteView = view)}>
									Delete
								</button>
							</div>
						{/if}
					</div>
				{:else}
					<EmptyState
						message="No saved views yet."
						actionLabel={readOnly ? undefined : 'New View'}
						onAction={readOnly ? undefined : startCreate}
					/>
				{/each}
			</div>
		</div>
	{:else}
		<div class="edit-form">
			<label class="form-field">
				<span class="form-label">View Name</span>
				<input class="input" type="text" bind:value={name} placeholder="e.g. Annual Trainings" />
			</label>

			{#if error}
				<p class="form-error">{error}</p>
			{/if}

			<div class="editor-section">
				<div class="section-header">
					<span class="form-label">Training Types</span>
					<Badge label={`${orderedIds.length} selected`} variant="outlined" />
				</div>
				<div class="type-checklist">
					{#each trainingTypesStore.items as type (type.id)}
						<label class="type-check">
							<input type="checkbox" checked={selectedIds.has(type.id)} onchange={() => toggleType(type.id)} />
							<span class="type-color" style="background: {type.color};"></span>
							<span class="type-check-name">{type.name}</span>
						</label>
					{/each}
				</div>
			</div>

			{#if orderedIds.length > 0}
				<div class="editor-section">
					<div class="section-header">
						<span class="form-label">Column Order</span>
						<Badge label={`${orderedIds.length} visible`} variant="outlined" />
					</div>
					<ol class="order-list">
						{#each orderedIds as typeId, i (typeId)}
							<li class="order-item">
								<span class="order-name">{getTypeName(typeId)}</span>
								<div class="order-buttons">
									<button class="btn-icon" type="button" onclick={() => moveUp(i)} disabled={i === 0}>&uarr;</button>
									<button
										class="btn-icon"
										type="button"
										onclick={() => moveDown(i)}
										disabled={i === orderedIds.length - 1}>&darr;</button
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
				<button class="btn btn-primary" type="button" onclick={startCreate}>New View</button>
			{/if}
			<span class="spacer"></span>
			<button class="btn" type="button" onclick={onClose}>Close</button>
		{:else}
			<button class="btn" type="button" onclick={() => (mode = 'list')} disabled={saving}>Back</button>
			<span class="spacer"></span>
			<button class="btn" type="button" onclick={() => (mode = 'list')} disabled={saving}>Cancel</button>
			<button class="btn btn-primary" type="button" onclick={handleSave} disabled={saving}>
				{saving ? 'Saving...' : 'Save'}
			</button>
		{/if}
	{/snippet}
</Modal>

{#if confirmDeleteView}
	<ConfirmDialog
		title="Delete Saved View"
		message={`Delete "${confirmDeleteView.name}"? This only removes the saved layout.`}
		confirmLabel="Delete"
		variant="danger"
		onConfirm={doDelete}
		onCancel={() => (confirmDeleteView = null)}
	/>
{/if}

<style>
	.view-list-state,
	.edit-form {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.list-summary {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: var(--sp-4);
		padding: var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		background: color-mix(in srgb, var(--surface-panel) 88%, var(--surface-subtle) 12%);
	}

	.list-summary-copy {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.eyebrow {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.summary-text {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.65;
		color: var(--text-secondary);
	}

	.view-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.view-item {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: var(--sp-4);
		padding: var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	.view-info {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: var(--sp-2);
		min-width: 0;
	}

	.view-name {
		font-size: var(--text-base);
		font-weight: var(--font-weight-semibold);
		color: var(--text-primary);
	}

	.view-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2);
	}

	.view-columns {
		font-size: var(--text-xs);
		color: var(--text-secondary);
		line-height: 1.5;
	}

	.view-actions {
		display: flex;
		gap: var(--sp-2);
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.form-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.form-error {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--danger);
	}

	.editor-section {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		padding: var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		background: color-mix(in srgb, var(--surface-subtle) 42%, var(--surface-panel) 58%);
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
	}

	.type-checklist {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		max-height: 220px;
		overflow-y: auto;
		padding: var(--sp-3);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
	}

	.type-check {
		display: grid;
		grid-template-columns: auto auto minmax(0, 1fr);
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-2) var(--sp-1);
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.type-check-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.type-color {
		display: inline-block;
		width: 0.75rem;
		height: 0.75rem;
		border-radius: 2px;
		flex-shrink: 0;
	}

	.order-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.order-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		padding: var(--sp-3) var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
		font-size: var(--text-sm);
	}

	.order-name {
		font-weight: var(--font-weight-semibold);
		color: var(--text-primary);
	}

	.order-buttons {
		display: flex;
		gap: 2px;
	}

	.btn-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		padding: 0;
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--surface-panel) 92%, var(--surface-subtle) 8%);
		color: var(--text-secondary);
		cursor: pointer;
	}

	.btn-icon:hover:not(:disabled) {
		background: color-mix(in srgb, var(--surface-subtle) 74%, var(--surface-panel) 26%);
		color: var(--text-primary);
	}

	.btn-icon:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	@media (max-width: 640px) {
		.list-summary,
		.view-item,
		.section-header {
			flex-direction: column;
			align-items: stretch;
		}

		.view-actions {
			justify-content: flex-end;
		}
	}
</style>
