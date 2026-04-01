<script lang="ts">
	import type { Group } from '$lib/stores/groups.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import Modal from '$lib/components/Modal.svelte';

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

	async function handleAdd() {
		if (newGroupName.trim()) {
			await onAdd(newGroupName.trim());
			newGroupName = '';
		}
	}

	function startEdit(group: Group) {
		editingId = group.id;
		editName = group.name;
	}

	async function saveEdit() {
		if (editingId && editName.trim()) {
			await onRename(editingId, editName.trim());
		}
		cancelEdit();
	}

	function cancelEdit() {
		editingId = null;
		editName = '';
	}

	let confirmRemove = $state<Group | null>(null);

	function handleRemove(group: Group) {
		confirmRemove = group;
	}

	async function doRemove() {
		if (confirmRemove) {
			await onRemove(confirmRemove.id);
			confirmRemove = null;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleAdd();
		}
	}
</script>

<Modal title="Manage Groups" {onClose} width="440px" titleId="groups-title">
	<div class="group-manager">
		<div class="add-form">
			<div class="add-copy">
				<span class="add-kicker">Organization groups</span>
			</div>
			<div class="add-controls">
				<input
					type="text"
					class="input"
					bind:value={newGroupName}
					placeholder="New group name"
					onkeydown={handleKeydown}
				/>
				<button class="btn btn-primary btn-sm" type="button" onclick={handleAdd} disabled={!newGroupName.trim()}>
					Add
				</button>
			</div>
		</div>

		<div class="group-list">
			{#each groups as group (group.id)}
				<div class="group-item">
					{#if editingId === group.id}
						<input type="text" class="input" bind:value={editName} onkeydown={(e) => e.key === 'Enter' && saveEdit()} />
						<div class="group-actions">
							<button class="btn btn-primary btn-sm" type="button" onclick={saveEdit}>Save</button>
							<button class="btn btn-secondary btn-sm" type="button" onclick={cancelEdit}>Cancel</button>
						</div>
					{:else}
						<div class="group-meta">
							<span class="group-name">{group.name}</span>
						</div>
						<div class="group-actions">
							<button class="btn btn-secondary btn-sm" type="button" onclick={() => startEdit(group)}>Edit</button>
							<button class="btn btn-danger btn-sm" type="button" onclick={() => handleRemove(group)}>Remove</button>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>

	{#snippet footer()}
		<div class="spacer"></div>
		<button class="btn btn-primary" type="button" onclick={onClose}>Done</button>
	{/snippet}
</Modal>

{#if confirmRemove}
	<ConfirmDialog
		title="Remove Group"
		message={`Remove "${confirmRemove.name}"? Personnel in this group will become unassigned.`}
		confirmLabel="Remove"
		variant="danger"
		onConfirm={doRemove}
		onCancel={() => (confirmRemove = null)}
	/>
{/if}

<style>
	.group-manager {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.add-form {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		padding: var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-subtle) 68%, var(--surface-panel) 32%);
	}

	.add-copy {
		display: flex;
		flex-direction: column;
	}

	.add-kicker {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--amber-dark);
	}

	.add-controls {
		display: flex;
		gap: var(--sp-2);
	}

	.add-controls .input {
		flex: 1;
	}

	.group-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		max-height: 350px;
		overflow-y: auto;
	}

	.group-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		padding: var(--sp-3) var(--sp-4);
		background: var(--surface-panel);
		border: var(--border-thin);
		border-radius: var(--radius-md);
	}

	.group-item .input {
		flex: 1;
	}

	.group-meta {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		min-width: 0;
		flex: 1;
	}

	.group-name {
		flex: 1;
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--text-primary);
	}

	.group-actions {
		display: flex;
		gap: var(--sp-2);
		flex-shrink: 0;
	}

	@media (max-width: 640px) {
		.add-controls,
		.group-item {
			flex-direction: column;
			align-items: stretch;
		}

		.group-actions {
			justify-content: flex-end;
		}
	}
</style>
