<script lang="ts">
	import type { Group } from '$lib/stores/groups.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

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

<Dialog.Root open onOpenChange={(open) => !open && onClose()}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Manage Groups</Dialog.Title>
		</Dialog.Header>

		<div class="grid gap-4">
			<div class="grid gap-2">
				<Label for="new-group-name">Organization groups</Label>
				<div class="flex gap-2">
					<Input
						id="new-group-name"
						type="text"
						bind:value={newGroupName}
						placeholder="New group name"
						onkeydown={handleKeydown}
					/>
					<Button type="button" size="sm" onclick={handleAdd} disabled={!newGroupName.trim()}>Add</Button>
				</div>
			</div>

			<div class="grid max-h-80 gap-2 overflow-y-auto">
				{#each groups as group (group.id)}
					<div class="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
						{#if editingId === group.id}
							<Input type="text" bind:value={editName} onkeydown={(e) => e.key === 'Enter' && saveEdit()} />
							<div class="flex gap-2 sm:justify-end">
								<Button type="button" size="sm" onclick={saveEdit}>Save</Button>
								<Button type="button" variant="outline" size="sm" onclick={cancelEdit}>Cancel</Button>
							</div>
						{:else}
							<span>{group.name}</span>
							<div class="flex gap-2 sm:justify-end">
								<Button type="button" variant="outline" size="sm" onclick={() => startEdit(group)}>Edit</Button>
								<Button type="button" variant="destructive" size="sm" onclick={() => handleRemove(group)}>
									Remove
								</Button>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>

		<Dialog.Footer>
			<Button type="button" onclick={onClose}>Done</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

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
