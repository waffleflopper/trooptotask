<script lang="ts" generics="T extends { id: string; name: string }">
	import type { Snippet } from 'svelte';
	import Modal from '$lib/components/Modal.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';

	interface Props {
		items: T[];
		onAdd: (data: Omit<T, 'id'>) => void;
		onUpdate: (id: string, data: Partial<Omit<T, 'id'>>) => void;
		onRemove: (id: string) => void;
		onClose: () => void;
		title: string;
		noun?: string;
		titleId?: string;
		width?: string;
		removeConfirmMessage?: (item: T) => string;
		getAddData: () => Omit<T, 'id'> | null;
		resetAddForm: () => void;
		onEditStart: (item: T) => void;
		getEditData: () => Partial<Omit<T, 'id'>> | null;
		addForm: Snippet;
		editForm: Snippet;
		itemDisplay: Snippet<[T]>;
	}

	let {
		items,
		onAdd,
		onUpdate,
		onRemove,
		onClose,
		title,
		noun = 'Item',
		titleId,
		width = '560px',
		removeConfirmMessage,
		getAddData,
		resetAddForm,
		onEditStart,
		getEditData,
		addForm,
		editForm,
		itemDisplay
	}: Props = $props();

	let editingId = $state<string | null>(null);
	let confirmRemove = $state<{ id: string; name: string } | null>(null);

	const canAdd = $derived(getAddData() !== null);

	function handleAdd() {
		const data = getAddData();
		if (!data) return;
		onAdd(data);
		resetAddForm();
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' && canAdd) {
			handleAdd();
		}
	}

	function startEdit(item: T) {
		editingId = item.id;
		onEditStart(item);
	}

	function saveEdit() {
		if (!editingId) return;
		const data = getEditData();
		if (!data) return;
		onUpdate(editingId, data);
		cancelEdit();
	}

	function cancelEdit() {
		editingId = null;
	}

	function handleRemove(id: string, name: string) {
		confirmRemove = { id, name };
	}

	function doRemove() {
		if (confirmRemove) {
			onRemove(confirmRemove.id);
			confirmRemove = null;
		}
	}
</script>

<Modal {title} {onClose} {width} {titleId}>
	<div class="add-section">
		<h4>Add New {noun}</h4>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="add-form" onkeydown={handleKeyDown}>
			{@render addForm()}
			<button class="btn btn-primary btn-sm" onclick={handleAdd} disabled={!canAdd}>Add</button>
		</div>
	</div>

	<div class="list-section">
		<h4>Existing {noun}s ({items.length})</h4>
		{#if items.length === 0}
			<EmptyState message="No {noun.toLowerCase()}s yet. Add one above to get started." />
		{:else}
			<div class="type-list">
				{#each items as item (item.id)}
					<div class="type-item" class:editing={editingId === item.id}>
						{#if editingId === item.id}
							<div class="edit-form">
								{@render editForm()}
								<div class="edit-actions">
									<button class="btn btn-primary btn-sm" onclick={saveEdit}>Save</button>
									<button class="btn btn-secondary btn-sm" onclick={cancelEdit}>Cancel</button>
								</div>
							</div>
						{:else}
							<div class="type-display">
								{@render itemDisplay(item)}
							</div>
							<div class="type-actions">
								<button class="btn btn-secondary btn-sm" onclick={() => startEdit(item)} title="Edit">
									<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
										<path
											d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"
										/>
									</svg>
								</button>
								<button class="btn btn-danger btn-sm" onclick={() => handleRemove(item.id, item.name)} title="Remove">
									<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
										<path
											fill-rule="evenodd"
											d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
											clip-rule="evenodd"
										/>
									</svg>
								</button>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<button class="btn btn-primary" onclick={onClose}>Done</button>
	{/snippet}
</Modal>

{#if confirmRemove}
	{@const removing = confirmRemove}
	<ConfirmDialog
		title="Remove {noun}"
		message={removeConfirmMessage
			? removeConfirmMessage(items.find((i) => i.id === removing.id) as T)
			: `Remove "${removing.name}"? This cannot be undone.`}
		confirmLabel="Remove"
		variant="danger"
		onConfirm={doRemove}
		onCancel={() => (confirmRemove = null)}
	/>
{/if}

<style>
	h4 {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: var(--spacing-sm);
	}

	.add-section {
		padding-bottom: var(--spacing-md);
		margin-bottom: var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
	}

	.add-form {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
	}

	.add-form :global(.input) {
		flex: 1;
		min-width: 150px;
	}

	.list-section {
		flex: 1;
	}

	.type-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.type-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-bg);
		border-radius: var(--radius-md);
		transition: background-color 0.15s ease;
	}

	.type-item:hover {
		background: var(--color-surface);
		box-shadow: var(--shadow-sm);
	}

	.type-item.editing {
		background: var(--color-surface);
		box-shadow: var(--shadow-sm);
		border: 1px solid var(--color-primary);
	}

	.type-display {
		display: flex;
		align-items: center;
	}

	.type-actions {
		display: flex;
		gap: var(--spacing-xs);
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.type-item:hover .type-actions {
		opacity: 1;
	}

	.type-actions .btn {
		padding: var(--spacing-xs);
	}

	.edit-form {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		width: 100%;
		flex-wrap: wrap;
	}

	.edit-form :global(.input) {
		flex: 1;
		min-width: 120px;
	}

	.edit-actions {
		display: flex;
		gap: var(--spacing-xs);
	}
</style>
