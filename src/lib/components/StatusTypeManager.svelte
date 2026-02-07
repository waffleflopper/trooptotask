<script lang="ts">
	import type { StatusType } from '../types';

	interface Props {
		statusTypes: StatusType[];
		onAdd: (data: Omit<StatusType, 'id'>) => void;
		onUpdate: (id: string, data: Partial<Omit<StatusType, 'id'>>) => void;
		onRemove: (id: string) => void;
		onClose: () => void;
	}

	let { statusTypes, onAdd, onUpdate, onRemove, onClose }: Props = $props();

	let newName = $state('');
	let newColor = $state('#6b7280');
	let newTextColor = $state('#ffffff');
	let editingId = $state<string | null>(null);
	let editName = $state('');
	let editColor = $state('');
	let editTextColor = $state('');

	const canAdd = $derived(newName.trim() !== '');

	function handleAdd() {
		if (newName.trim()) {
			onAdd({
				name: newName.trim(),
				color: newColor,
				textColor: newTextColor
			});
			newName = '';
			newColor = '#6b7280';
			newTextColor = '#ffffff';
		}
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' && canAdd) {
			handleAdd();
		}
	}

	function startEdit(status: StatusType) {
		editingId = status.id;
		editName = status.name;
		editColor = status.color;
		editTextColor = status.textColor;
	}

	function saveEdit() {
		if (editingId && editName.trim()) {
			onUpdate(editingId, {
				name: editName.trim(),
				color: editColor,
				textColor: editTextColor
			});
		}
		cancelEdit();
	}

	function cancelEdit() {
		editingId = null;
		editName = '';
		editColor = '';
		editTextColor = '';
	}

	function handleRemove(id: string, name: string) {
		if (confirm(`Remove "${name}"?\n\nAll schedule entries using this status will also be removed. This cannot be undone.`)) {
			onRemove(id);
		}
	}
</script>

<div class="modal-overlay" role="dialog" aria-modal="true" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()}>
	<div class="modal status-manager-modal" onclick={(e) => e.stopPropagation()}>
		<div class="modal-header">
			<h2>Manage Status Types</h2>
			<button class="btn btn-secondary btn-sm close-btn" onclick={onClose} aria-label="Close">&times;</button>
		</div>

		<div class="modal-body">
			<!-- Add New Status -->
			<div class="add-section">
				<h4>Add New Status</h4>
				<div class="add-form">
					<input
						type="text"
						class="input"
						bind:value={newName}
						placeholder="Status name (e.g., Leave, TDY)"
						onkeydown={handleKeyDown}
					/>
					<div class="color-pickers">
						<label class="color-picker">
							<span>Background</span>
							<input type="color" bind:value={newColor} />
						</label>
						<label class="color-picker">
							<span>Text</span>
							<input type="color" bind:value={newTextColor} />
						</label>
					</div>
					{#if canAdd}
						<span
							class="preview-badge"
							style="background-color: {newColor}; color: {newTextColor}"
						>
							{newName}
						</span>
					{/if}
					<button class="btn btn-primary btn-sm" onclick={handleAdd} disabled={!canAdd}>
						Add
					</button>
				</div>
			</div>

			<!-- Existing Status Types -->
			<div class="status-list-section">
				<h4>Existing Status Types ({statusTypes.length})</h4>
				{#if statusTypes.length === 0}
					<div class="empty-state">
						No status types yet. Add one above to get started.
					</div>
				{:else}
					<div class="status-list">
						{#each statusTypes as status (status.id)}
							<div class="status-item" class:editing={editingId === status.id}>
								{#if editingId === status.id}
									<div class="edit-form">
										<input
											type="text"
											class="input"
											bind:value={editName}
											placeholder="Status name"
										/>
										<div class="color-pickers">
											<label class="color-picker">
												<span>BG</span>
												<input type="color" bind:value={editColor} />
											</label>
											<label class="color-picker">
												<span>Text</span>
												<input type="color" bind:value={editTextColor} />
											</label>
										</div>
										<span
											class="preview-badge"
											style="background-color: {editColor}; color: {editTextColor}"
										>
											{editName || 'Preview'}
										</span>
										<div class="edit-actions">
											<button class="btn btn-primary btn-sm" onclick={saveEdit}>Save</button>
											<button class="btn btn-secondary btn-sm" onclick={cancelEdit}>Cancel</button>
										</div>
									</div>
								{:else}
									<div class="status-display">
										<span
											class="status-badge"
											style="background-color: {status.color}; color: {status.textColor}"
										>
											{status.name}
										</span>
									</div>
									<div class="status-actions">
										<button
											class="btn btn-secondary btn-sm"
											onclick={() => startEdit(status)}
											title="Edit"
										>
											<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
												<path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
											</svg>
										</button>
										<button
											class="btn btn-danger btn-sm"
											onclick={() => handleRemove(status.id, status.name)}
											title="Remove"
										>
											<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
												<path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
											</svg>
										</button>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<div class="modal-footer">
			<button class="btn btn-primary" onclick={onClose}>Done</button>
		</div>
	</div>
</div>

<style>
	.status-manager-modal {
		width: 520px;
		max-width: 95vw;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
	}

	.close-btn {
		font-size: 1.25rem;
		line-height: 1;
		padding: var(--spacing-xs) var(--spacing-sm);
	}

	.modal-body {
		flex: 1;
		overflow-y: auto;
	}

	h4 {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: var(--spacing-sm);
	}

	/* Add Section */
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

	.add-form .input {
		flex: 1;
		min-width: 150px;
	}

	.color-pickers {
		display: flex;
		gap: var(--spacing-sm);
	}

	.color-picker {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		font-size: 10px;
		color: var(--color-text-muted);
		text-transform: uppercase;
	}

	.color-picker input[type='color'] {
		width: 32px;
		height: 32px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
		padding: 0;
	}

	.preview-badge,
	.status-badge {
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		font-size: var(--font-size-sm);
		font-weight: 500;
		white-space: nowrap;
	}

	/* Status List */
	.status-list-section {
		flex: 1;
	}

	.empty-state {
		text-align: center;
		color: var(--color-text-muted);
		padding: var(--spacing-xl);
		background: var(--color-bg);
		border-radius: var(--radius-md);
	}

	.status-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.status-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-bg);
		border-radius: var(--radius-md);
		transition: background-color 0.15s ease;
	}

	.status-item:hover {
		background: var(--color-surface);
		box-shadow: var(--shadow-sm);
	}

	.status-item.editing {
		background: var(--color-surface);
		box-shadow: var(--shadow-sm);
		border: 1px solid var(--color-primary);
	}

	.status-display {
		display: flex;
		align-items: center;
	}

	.status-actions {
		display: flex;
		gap: var(--spacing-xs);
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.status-item:hover .status-actions {
		opacity: 1;
	}

	.status-actions .btn {
		padding: var(--spacing-xs);
	}

	/* Edit Form */
	.edit-form {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		width: 100%;
		flex-wrap: wrap;
	}

	.edit-form .input {
		flex: 1;
		min-width: 120px;
	}

	.edit-actions {
		display: flex;
		gap: var(--spacing-xs);
	}
</style>
