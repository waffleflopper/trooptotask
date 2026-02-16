<script lang="ts">
	import type { Group } from '../stores/groups.svelte';

	interface Props {
		groups: Group[];
		onAdd: (name: string) => void;
		onRemove: (id: string) => void;
		onRename: (id: string, newName: string) => void;
		onClose: () => void;
	}

	let { groups, onAdd, onRemove, onRename, onClose }: Props = $props();

	let newGroupName = $state('');
	let editingId = $state<string | null>(null);
	let editName = $state('');

	function handleAdd() {
		if (newGroupName.trim()) {
			onAdd(newGroupName.trim());
			newGroupName = '';
		}
	}

	function startEdit(group: Group) {
		editingId = group.id;
		editName = group.name;
	}

	function saveEdit() {
		if (editingId && editName.trim()) {
			onRename(editingId, editName.trim());
		}
		cancelEdit();
	}

	function cancelEdit() {
		editingId = null;
		editName = '';
	}

	function handleRemove(group: Group) {
		if (confirm(`Are you sure you want to remove "${group.name}"? Personnel in this group will become unassigned.`)) {
			onRemove(group.id);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleAdd();
		}
	}
</script>

<div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="groups-title" tabindex="-1" onkeydown={(e) => e.key === 'Escape' && onClose()}>
	<button class="modal-backdrop" onclick={onClose} tabindex="-1" aria-label="Close dialog"></button>
	<div class="modal" style="width: 400px;" role="document">
		<div class="modal-header">
			<h2 id="groups-title">Manage Groups</h2>
			<button class="btn btn-secondary btn-sm" onclick={onClose}>&times;</button>
		</div>

		<div class="modal-body">
			<div class="add-form">
				<input
					type="text"
					class="input"
					bind:value={newGroupName}
					placeholder="New group name"
					onkeydown={handleKeydown}
				/>
				<button class="btn btn-primary btn-sm" onclick={handleAdd} disabled={!newGroupName.trim()}>
					Add
				</button>
			</div>

			<div class="group-list">
				{#each groups as group (group.id)}
					<div class="group-item">
						{#if editingId === group.id}
							<input
								type="text"
								class="input"
								bind:value={editName}
								onkeydown={(e) => e.key === 'Enter' && saveEdit()}
							/>
							<div class="group-actions">
								<button class="btn btn-primary btn-sm" onclick={saveEdit}>Save</button>
								<button class="btn btn-secondary btn-sm" onclick={cancelEdit}>Cancel</button>
							</div>
						{:else}
							<span class="group-name">{group.name}</span>
							<div class="group-actions">
								<button class="btn btn-secondary btn-sm" onclick={() => startEdit(group)}>
									Edit
								</button>
								<button class="btn btn-danger btn-sm" onclick={() => handleRemove(group)}>
									&times;
								</button>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>

		<div class="modal-footer">
			<button class="btn btn-primary" onclick={onClose}>Done</button>
		</div>
	</div>
</div>

<style>
	.add-form {
		display: flex;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-md);
		padding-bottom: var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
	}

	.add-form .input {
		flex: 1;
	}

	.group-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
		max-height: 350px;
		overflow-y: auto;
	}

	.group-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm);
		background: var(--color-bg);
		border-radius: var(--radius-md);
	}

	.group-item .input {
		flex: 1;
	}

	.group-name {
		flex: 1;
		font-weight: 500;
	}

	.group-actions {
		display: flex;
		gap: var(--spacing-xs);
		flex-shrink: 0;
	}
</style>
