<script lang="ts">
	import type { AssignmentType } from '../stores/dailyAssignments.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';

	interface Props {
		assignmentTypes: AssignmentType[];
		onAdd: (data: Omit<AssignmentType, 'id'>) => void;
		onUpdate: (id: string, data: Partial<Omit<AssignmentType, 'id'>>) => void;
		onRemove: (id: string) => void;
		onClose: () => void;
	}

	let { assignmentTypes, onAdd, onUpdate, onRemove, onClose }: Props = $props();

	let newName = $state('');
	let newShortName = $state('');
	let newAssignTo = $state<'personnel' | 'group'>('personnel');
	let newColor = $state('#3b82f6');

	let editingId = $state<string | null>(null);
	let editName = $state('');
	let editShortName = $state('');
	let editAssignTo = $state<'personnel' | 'group'>('personnel');
	let editColor = $state('');

	const canAdd = $derived(newName.trim() !== '' && newShortName.trim() !== '');

	function handleAdd() {
		if (newName.trim() && newShortName.trim()) {
			onAdd({
				name: newName.trim(),
				shortName: newShortName.trim().toUpperCase(),
				assignTo: newAssignTo,
				color: newColor,
				exemptPersonnelIds: []
			});
			newName = '';
			newShortName = '';
			newAssignTo = 'personnel';
			newColor = '#3b82f6';
		}
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' && canAdd) {
			handleAdd();
		}
	}

	function startEdit(type: AssignmentType) {
		editingId = type.id;
		editName = type.name;
		editShortName = type.shortName;
		editAssignTo = type.assignTo;
		editColor = type.color;
	}

	function saveEdit() {
		if (editingId && editName.trim() && editShortName.trim()) {
			onUpdate(editingId, {
				name: editName.trim(),
				shortName: editShortName.trim().toUpperCase(),
				assignTo: editAssignTo,
				color: editColor
			});
		}
		cancelEdit();
	}

	function cancelEdit() {
		editingId = null;
		editName = '';
		editShortName = '';
		editAssignTo = 'personnel';
		editColor = '';
	}

	let confirmRemove = $state<{ id: string; name: string } | null>(null);

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

<div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="assign-types-title" tabindex="-1" onkeydown={(e) => e.key === 'Escape' && onClose()}>
	<button class="modal-backdrop" onclick={onClose} tabindex="-1" aria-label="Close dialog"></button>
	<div class="modal assignment-manager-modal" role="document">
		<div class="modal-header">
			<h2 id="assign-types-title">Manage Assignment Types</h2>
			<button class="btn btn-secondary btn-sm close-btn" onclick={onClose} aria-label="Close">&times;</button>
		</div>

		<div class="modal-body">
			<!-- Add New Assignment Type -->
			<div class="add-section">
				<h4>Add New Assignment Type</h4>
				<div class="add-form">
					<div class="form-row">
						<input
							type="text"
							class="input"
							bind:value={newName}
							placeholder="Full name (e.g., Staff Duty)"
							aria-label="Full name"
							onkeydown={handleKeyDown}
						/>
						<input
							type="text"
							class="input short-input"
							bind:value={newShortName}
							placeholder="Short (e.g., SD)"
							aria-label="Short name"
							maxlength="5"
							onkeydown={handleKeyDown}
						/>
					</div>
					<div class="form-row">
						<select class="select" aria-label="Assign to" bind:value={newAssignTo}>
							<option value="personnel">Assign to Person</option>
							<option value="group">Assign to Group</option>
						</select>
						<label class="color-picker">
							<span>Color</span>
							<input type="color" bind:value={newColor} />
						</label>
						{#if canAdd}
							<Badge label={newShortName.toUpperCase() || '?'} color={newColor} bold={true} />
						{/if}
						<button class="btn btn-primary btn-sm" onclick={handleAdd} disabled={!canAdd}>
							Add
						</button>
					</div>
				</div>
				<p class="hint">
					<strong>Assign to Person:</strong> Shows on individual's calendar row (e.g., MOD, CQ)<br/>
					<strong>Assign to Group:</strong> Shows in date header column (e.g., Front Desk duty group)
				</p>
			</div>

			<!-- Existing Assignment Types -->
			<div class="type-list-section">
				<h4>Existing Assignment Types ({assignmentTypes.length})</h4>
				{#if assignmentTypes.length === 0}
					<EmptyState message="No assignment types yet. Add one above to get started." />
				{:else}
					<div class="type-list">
						{#each assignmentTypes as type (type.id)}
							<div class="type-item" class:editing={editingId === type.id}>
								{#if editingId === type.id}
									<div class="edit-form">
										<div class="form-row">
											<input
												type="text"
												class="input"
												bind:value={editName}
												placeholder="Full name"
												aria-label="Full name"
											/>
											<input
												type="text"
												class="input short-input"
												bind:value={editShortName}
												placeholder="Short"
												aria-label="Short name"
												maxlength="5"
											/>
										</div>
										<div class="form-row">
											<select class="select" aria-label="Assign to" bind:value={editAssignTo}>
												<option value="personnel">Person</option>
												<option value="group">Group</option>
											</select>
											<label class="color-picker">
												<span>Color</span>
												<input type="color" bind:value={editColor} />
											</label>
											<Badge label={editShortName.toUpperCase() || '?'} color={editColor} bold={true} />
											<div class="edit-actions">
												<button class="btn btn-primary btn-sm" onclick={saveEdit}>Save</button>
												<button class="btn btn-secondary btn-sm" onclick={cancelEdit}>Cancel</button>
											</div>
										</div>
									</div>
								{:else}
									<div class="type-display">
										<Badge label={type.shortName} color={type.color} bold={true} />
										<div class="type-info">
											<span class="type-name">{type.name}</span>
											<span class="type-assign-to">
												{type.assignTo === 'personnel' ? 'Assigned to person' : 'Assigned to group'}
											</span>
										</div>
									</div>
									<div class="type-actions">
										<button
											class="btn btn-secondary btn-sm"
											onclick={() => startEdit(type)}
											title="Edit"
										>
											<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
												<path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
											</svg>
										</button>
										<button
											class="btn btn-danger btn-sm"
											onclick={() => handleRemove(type.id, type.name)}
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

{#if confirmRemove}
	<ConfirmDialog
		title="Remove Assignment Type"
		message='Remove "{confirmRemove.name}"? All assignments using this type will also be removed. This cannot be undone.'
		confirmLabel="Remove"
		variant="danger"
		onConfirm={doRemove}
		onCancel={() => (confirmRemove = null)}
	/>
{/if}

<style>
	.assignment-manager-modal {
		width: 560px;
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
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.form-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
	}

	.form-row .input {
		flex: 1;
		min-width: 150px;
	}

	.short-input {
		flex: 0 0 80px !important;
		min-width: 80px !important;
		text-transform: uppercase;
	}

	.form-row .select {
		flex: 0 0 140px;
	}

	.hint {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		margin-top: var(--spacing-sm);
		line-height: 1.5;
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

	/* Type List */
	.type-list-section {
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
		flex-direction: column;
		align-items: stretch;
	}

	.type-display {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	.type-info {
		display: flex;
		flex-direction: column;
	}

	.type-name {
		font-weight: 500;
		color: var(--color-text);
	}

	.type-assign-to {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
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

	/* Edit Form */
	.edit-form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		width: 100%;
	}

	.edit-actions {
		display: flex;
		gap: var(--spacing-xs);
		margin-left: auto;
	}
</style>
