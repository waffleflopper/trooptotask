<script lang="ts">
	import type { Group } from '$lib/stores/groups.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Alert from '$lib/components/ui/alert';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';

	interface Props {
		groups: Group[];
		onAdd: (name: string) => void | Promise<void>;
		onRemove: (id: string) => void | Promise<void>;
		onRename: (id: string, newName: string) => void | Promise<void>;
		onClose: () => void;
	}

	let { groups, onAdd, onRemove, onRename, onClose }: Props = $props();

	let newGroupName = $state('');
	let editingId = $state<string | null>(null);
	let editName = $state('');
	let pending = $state(false);
	let errorMessage = $state('');
	const groupDialogDirty = $derived(pending || newGroupName.trim() !== '' || Boolean(editingId && editName.trim()));

	async function runChange(change: () => void | Promise<void>): Promise<boolean> {
		if (pending) return false;
		pending = true;
		errorMessage = '';
		try {
			await change();
			return true;
		} catch (cause) {
			errorMessage = cause instanceof Error ? cause.message : 'Unable to save Group changes. Try again.';
			return false;
		} finally {
			pending = false;
		}
	}

	async function handleAdd() {
		const name = newGroupName.trim();
		if (name && (await runChange(() => onAdd(name)))) newGroupName = '';
	}

	function startEdit(group: Group) {
		errorMessage = '';
		editingId = group.id;
		editName = group.name;
	}

	async function saveEdit() {
		const id = editingId;
		const name = editName.trim();
		if (id && name && (await runChange(() => onRename(id, name)))) cancelEdit();
	}

	function cancelEdit() {
		editingId = null;
		editName = '';
	}

	let confirmRemove = $state<Group | null>(null);

	function handleRemove(group: Group) {
		errorMessage = '';
		confirmRemove = group;
	}

	async function doRemove() {
		const group = confirmRemove;
		if (group && (await runChange(() => onRemove(group.id)))) confirmRemove = null;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleAdd();
		}
	}
</script>

<AppDialog.Root open closeBlocked={groupDialogDirty} {onClose}>
	<AppDialog.Content closeBlocked={groupDialogDirty}>
		<AppDialog.Header>
			<AppDialog.Title>Manage Groups</AppDialog.Title>
		</AppDialog.Header>

		<AppDialog.Body class="grid gap-4">
			{#if errorMessage && !confirmRemove}
				<Alert.Root variant="destructive"><Alert.Description>{errorMessage}</Alert.Description></Alert.Root>
			{/if}
			<div class="grid gap-2">
				<Label for="new-group-name">Organization groups</Label>
				<div class="flex gap-2">
					<Input
						id="new-group-name"
						type="text"
						bind:value={newGroupName}
						readonly={pending}
						placeholder="New group name"
						onkeydown={handleKeydown}
					/>
					<Button type="button" size="sm" onclick={handleAdd} disabled={pending || !newGroupName.trim()}>Add</Button>
				</div>
			</div>

			<div class="grid max-h-80 gap-2 overflow-y-auto">
				{#each groups as group (group.id)}
					<div class="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
						{#if editingId === group.id}
							<Input
								type="text"
								aria-label="Group name"
								readonly={pending}
								bind:value={editName}
								onkeydown={(e) => e.key === 'Enter' && saveEdit()}
							/>
							<div class="flex gap-2 sm:justify-end">
								<Button type="button" size="sm" onclick={saveEdit} disabled={pending}>Save</Button>
								<Button type="button" variant="outline" size="sm" onclick={cancelEdit} disabled={pending}>Cancel</Button
								>
							</div>
						{:else}
							<span class="min-w-0 truncate">{group.name}</span>
							<div class="flex shrink-0 gap-1 sm:justify-end">
								<Button
									type="button"
									variant="outline"
									size="icon"
									title={`Edit ${group.name}`}
									aria-label={`Edit ${group.name}`}
									disabled={pending}
									onclick={() => startEdit(group)}
								>
									<PencilIcon aria-hidden="true" />
								</Button>
								<Button
									type="button"
									variant="destructive"
									size="icon"
									title={`Remove ${group.name}`}
									aria-label={`Remove ${group.name}`}
									disabled={pending}
									onclick={() => handleRemove(group)}
								>
									<Trash2Icon aria-hidden="true" />
								</Button>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</AppDialog.Body>

		<AppDialog.Footer>
			<Button type="button" onclick={onClose} disabled={pending}>Done</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

{#if confirmRemove}
	<ConfirmDialog
		title="Remove Group"
		message={`Remove "${confirmRemove.name}"? Personnel in this group will become unassigned.`}
		confirmLabel="Remove"
		variant="danger"
		onConfirm={doRemove}
		onCancel={() => {
			confirmRemove = null;
			errorMessage = '';
		}}
	>
		{#if errorMessage}
			<Alert.Root variant="destructive"><Alert.Description>{errorMessage}</Alert.Description></Alert.Root>
		{/if}
	</ConfirmDialog>
{/if}
