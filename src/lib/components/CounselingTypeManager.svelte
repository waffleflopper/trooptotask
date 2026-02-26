<script lang="ts">
	import type { CounselingType, CounselingRecurrence } from '$lib/types/leadersBook';
	import Badge from './ui/Badge.svelte';
	import EmptyState from './ui/EmptyState.svelte';
	import { COUNSELING_RECURRENCE_LABELS } from '$lib/types/leadersBook';

	interface Props {
		counselingTypes: CounselingType[];
		onAdd: (data: Omit<CounselingType, 'id'>) => void;
		onUpdate: (id: string, data: Partial<Omit<CounselingType, 'id'>>) => void;
		onRemove: (id: string) => void;
		onClose: () => void;
	}

	let { counselingTypes, onAdd, onUpdate, onRemove, onClose }: Props = $props();

	// New type form
	let newName = $state('');
	let newDescription = $state('');
	let newTemplateContent = $state('');
	let newRecurrence = $state<CounselingRecurrence>('none');
	let newColor = $state('#8b5cf6');
	let newIsFreeform = $state(false);

	// Edit form
	let editingId = $state<string | null>(null);
	let editName = $state('');
	let editDescription = $state('');
	let editTemplateContent = $state('');
	let editRecurrence = $state<CounselingRecurrence>('none');
	let editColor = $state('');
	let editIsFreeform = $state(false);

	function handleAdd() {
		if (newName.trim()) {
			onAdd({
				name: newName.trim(),
				description: newDescription.trim() || null,
				templateContent: newTemplateContent.trim() || null,
				recurrence: newRecurrence,
				color: newColor,
				isFreeform: newIsFreeform,
				sortOrder: counselingTypes.length
			});
			resetNewForm();
		}
	}

	function resetNewForm() {
		newName = '';
		newDescription = '';
		newTemplateContent = '';
		newRecurrence = 'none';
		newColor = '#8b5cf6';
		newIsFreeform = false;
	}

	function startEdit(type: CounselingType) {
		editingId = type.id;
		editName = type.name;
		editDescription = type.description ?? '';
		editTemplateContent = type.templateContent ?? '';
		editRecurrence = type.recurrence;
		editColor = type.color;
		editIsFreeform = type.isFreeform;
	}

	function saveEdit() {
		if (editingId && editName.trim()) {
			onUpdate(editingId, {
				name: editName.trim(),
				description: editDescription.trim() || null,
				templateContent: editTemplateContent.trim() || null,
				recurrence: editRecurrence,
				color: editColor,
				isFreeform: editIsFreeform
			});
		}
		cancelEdit();
	}

	function cancelEdit() {
		editingId = null;
	}

	function handleRemove(id: string, name: string) {
		if (
			confirm(
				`Are you sure you want to remove "${name}"? Existing counseling records will keep their data but lose the type reference.`
			)
		) {
			onRemove(id);
		}
	}

	function addDefaultTypes() {
		const defaults = [
			{ name: 'Initial Counseling', description: 'Initial counseling for new soldiers', recurrence: 'none' as CounselingRecurrence, color: '#3b82f6' },
			{ name: 'Monthly Counseling', description: 'Regular monthly performance counseling', recurrence: 'monthly' as CounselingRecurrence, color: '#22c55e' },
			{ name: 'Quarterly Counseling', description: 'Quarterly review and goal setting', recurrence: 'quarterly' as CounselingRecurrence, color: '#8b5cf6' },
			{ name: 'Event Counseling', description: 'Counseling for specific events or incidents', recurrence: 'none' as CounselingRecurrence, color: '#f59e0b' },
			{ name: 'Freeform', description: 'Custom counseling without template', recurrence: 'none' as CounselingRecurrence, color: '#6b7280', isFreeform: true }
		];

		defaults.forEach((d, i) => {
			onAdd({
				name: d.name,
				description: d.description,
				templateContent: null,
				recurrence: d.recurrence,
				color: d.color,
				isFreeform: d.isFreeform ?? false,
				sortOrder: counselingTypes.length + i
			});
		});
	}
</script>

<div
	class="modal-overlay"
	role="dialog"
	aria-modal="true"
	aria-labelledby="counseling-types-title"
	tabindex="-1"
	onkeydown={(e) => e.key === 'Escape' && onClose()}
>
	<button class="modal-backdrop" onclick={onClose} tabindex="-1" aria-label="Close dialog"></button>
	<div class="modal" style="width: 650px; max-height: 90vh;" role="document">
		<div class="modal-header">
			<h2 id="counseling-types-title">Manage Counseling Types</h2>
			<button class="btn btn-secondary btn-sm" onclick={onClose}>&times;</button>
		</div>

		<div class="modal-body">
			<div class="add-section">
				<h3>Add Counseling Type</h3>
				<div class="add-form">
					<div class="form-row">
						<div class="form-group flex-1">
							<label class="label">Name</label>
							<input
								type="text"
								class="input"
								bind:value={newName}
								placeholder="e.g., Monthly Counseling"
							/>
						</div>
						<div class="form-group">
							<label class="label">Color</label>
							<input type="color" class="color-input" bind:value={newColor} />
						</div>
					</div>

					<div class="form-group">
						<label class="label">Description (optional)</label>
						<input
							type="text"
							class="input"
							bind:value={newDescription}
							placeholder="Brief description..."
						/>
					</div>

					<div class="form-row">
						<div class="form-group flex-1">
							<label class="label">Recurrence</label>
							<select class="select" bind:value={newRecurrence}>
								{#each Object.entries(COUNSELING_RECURRENCE_LABELS) as [value, label]}
									<option {value}>{label}</option>
								{/each}
							</select>
						</div>
						<div class="form-group">
							<label class="label">&nbsp;</label>
							<label class="checkbox-label">
								<input type="checkbox" bind:checked={newIsFreeform} />
								Freeform (no template)
							</label>
						</div>
					</div>

					{#if !newIsFreeform}
						<div class="form-group">
							<label class="label">Template Content (Markdown)</label>
							<textarea
								class="input textarea"
								bind:value={newTemplateContent}
								placeholder="## Purpose of Counseling&#10;&#10;## Key Points&#10;&#10;## Plan of Action"
								rows="4"
							></textarea>
						</div>
					{/if}

					<button class="btn btn-primary" onclick={handleAdd} disabled={!newName.trim()}>
						Add Counseling Type
					</button>
				</div>
			</div>

			<div class="list-section">
				<div class="list-header">
					<h3>Existing Types</h3>
					{#if counselingTypes.length === 0}
						<button class="btn btn-secondary btn-sm" onclick={addDefaultTypes}>
							Add Default Types
						</button>
					{/if}
				</div>
				<div class="type-list">
					{#each counselingTypes as type (type.id)}
						<div class="type-item">
							{#if editingId === type.id}
								<div class="edit-form">
									<div class="form-row">
										<div class="form-group flex-1">
											<label class="label">Name</label>
											<input type="text" class="input" bind:value={editName} />
										</div>
										<div class="form-group">
											<label class="label">Color</label>
											<input type="color" class="color-input" bind:value={editColor} />
										</div>
									</div>

									<div class="form-group">
										<label class="label">Description</label>
										<input type="text" class="input" bind:value={editDescription} />
									</div>

									<div class="form-row">
										<div class="form-group flex-1">
											<label class="label">Recurrence</label>
											<select class="select" bind:value={editRecurrence}>
												{#each Object.entries(COUNSELING_RECURRENCE_LABELS) as [value, label]}
													<option {value}>{label}</option>
												{/each}
											</select>
										</div>
										<div class="form-group">
											<label class="label">&nbsp;</label>
											<label class="checkbox-label">
												<input type="checkbox" bind:checked={editIsFreeform} />
												Freeform
											</label>
										</div>
									</div>

									{#if !editIsFreeform}
										<div class="form-group">
											<label class="label">Template Content</label>
											<textarea
												class="input textarea"
												bind:value={editTemplateContent}
												rows="3"
											></textarea>
										</div>
									{/if}

									<div class="edit-actions">
										<button class="btn btn-primary btn-sm" onclick={saveEdit}>Save</button>
										<button class="btn btn-secondary btn-sm" onclick={cancelEdit}>Cancel</button>
									</div>
								</div>
							{:else}
								<div class="type-info">
									<Badge label={type.name} color={type.color} />
									{#if type.recurrence !== 'none'}
										<span class="type-meta">{COUNSELING_RECURRENCE_LABELS[type.recurrence]}</span>
									{/if}
									{#if type.isFreeform}
										<Badge label="Freeform" variant="outlined" />
									{/if}
								</div>
								<div class="type-actions">
									<button class="btn btn-secondary btn-sm" onclick={() => startEdit(type)}>
										Edit
									</button>
									<button
										class="btn btn-danger btn-sm"
										onclick={() => handleRemove(type.id, type.name)}
									>
										&times;
									</button>
								</div>
							{/if}
						</div>
					{/each}

					{#if counselingTypes.length === 0}
						<EmptyState message="No counseling types defined yet." variant="simple" />
					{/if}
				</div>
			</div>
		</div>

		<div class="modal-footer">
			<button class="btn btn-primary" onclick={onClose}>Done</button>
		</div>
	</div>
</div>

<style>
	.add-section,
	.list-section {
		margin-bottom: var(--spacing-lg);
	}

	.add-section h3,
	.list-section h3 {
		font-size: var(--font-size-base);
		font-weight: 600;
		margin-bottom: var(--spacing-sm);
		color: var(--color-text-muted);
	}

	.list-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--spacing-sm);
	}

	.add-form,
	.edit-form {
		padding: var(--spacing-md);
		background: var(--color-bg);
		border-radius: var(--radius-md);
	}

	.form-row {
		display: flex;
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-sm);
	}

	.form-group {
		margin-bottom: var(--spacing-sm);
	}

	.form-group.flex-1 {
		flex: 1;
	}

	.color-input {
		width: 40px;
		height: 40px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
		padding: 0;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		font-size: var(--font-size-sm);
		cursor: pointer;
		padding: var(--spacing-xs) 0;
	}

	.textarea {
		resize: vertical;
		min-height: 60px;
		font-family: monospace;
	}

	.type-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		max-height: 300px;
		overflow-y: auto;
	}

	.type-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm);
		background: var(--color-bg);
		border-radius: var(--radius-md);
	}

	.type-info {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		flex-wrap: wrap;
	}

	.type-meta {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.type-actions {
		display: flex;
		gap: var(--spacing-xs);
	}

	.edit-form {
		width: 100%;
	}

	.edit-actions {
		display: flex;
		gap: var(--spacing-xs);
		margin-top: var(--spacing-sm);
	}

	.modal-body {
		max-height: 70vh;
		overflow-y: auto;
	}
</style>
