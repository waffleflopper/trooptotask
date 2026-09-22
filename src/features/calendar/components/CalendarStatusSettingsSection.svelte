<script lang="ts">
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { CalendarStatusBadge } from '$lib/components/ui/calendar-status-badge';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { availabilityStore } from '$features/calendar/stores/availability.svelte';
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import type { StatusType } from '$lib/types';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	type Props = {
		canMutate: boolean;
		searchQuery: string;
	};

	let { canMutate, searchQuery }: Props = $props();

	let addStatusOpen = $state(false);
	let newStatusName = $state('');
	let newStatusColor = $state('#4a4a47');
	let newStatusTextColor = $state('#f8f7f4');

	let editStatusOpen = $state(false);
	let editingStatus = $state<StatusType | null>(null);
	let editStatusName = $state('');
	let editStatusColor = $state('');
	let editStatusTextColor = $state('');

	let confirmDeleteStatus = $state<StatusType | null>(null);
	const addStatusDirty = $derived(
		newStatusName.trim() !== '' || newStatusColor !== '#4a4a47' || newStatusTextColor !== '#f8f7f4'
	);
	const editStatusDirty = $derived(
		Boolean(
			editingStatus &&
			(editStatusName !== editingStatus.name ||
				editStatusColor !== editingStatus.color ||
				editStatusTextColor !== editingStatus.textColor)
		)
	);

	const filteredStatuses = $derived(
		statusTypesStore.items.filter((s) => !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase()))
	);

	export function openAddDialog() {
		addStatusOpen = true;
	}

	function resetAddStatusForm() {
		newStatusName = '';
		newStatusColor = '#4a4a47';
		newStatusTextColor = '#f8f7f4';
	}

	function closeAddStatusDialog() {
		resetAddStatusForm();
		addStatusOpen = false;
	}

	function closeEditStatusDialog() {
		editStatusOpen = false;
		editingStatus = null;
	}

	function openEditStatus(s: StatusType) {
		editingStatus = s;
		editStatusName = s.name;
		editStatusColor = s.color;
		editStatusTextColor = s.textColor;
		editStatusOpen = true;
	}

	function showStatusMutationError(message: string, error?: unknown) {
		toastStore.error(error instanceof Error ? error.message : message);
	}

	async function addStatus() {
		if (!canMutate || !newStatusName.trim()) return;
		try {
			const created = await statusTypesStore.add({
				name: newStatusName.trim(),
				color: newStatusColor,
				textColor: newStatusTextColor
			});
			if (!created) {
				showStatusMutationError('Failed to add status type');
				return;
			}
		} catch (error) {
			showStatusMutationError('Failed to add status type', error);
			return;
		}
		resetAddStatusForm();
		addStatusOpen = false;
	}

	async function saveEditStatus() {
		if (!canMutate || !editingStatus || !editStatusName.trim()) return;
		try {
			const saved = await statusTypesStore.update(editingStatus.id, {
				name: editStatusName.trim(),
				color: editStatusColor,
				textColor: editStatusTextColor
			});
			if (!saved) {
				showStatusMutationError('Failed to save status type');
				return;
			}
		} catch (error) {
			showStatusMutationError('Failed to save status type', error);
			return;
		}
		editStatusOpen = false;
		editingStatus = null;
	}

	async function deleteStatus(s: StatusType) {
		if (!canMutate) return;
		try {
			const deleted = await statusTypesStore.remove(s.id);
			if (!deleted) {
				showStatusMutationError('Failed to delete status type');
				return;
			}
		} catch (error) {
			showStatusMutationError('Failed to delete status type', error);
			return;
		}
		try {
			availabilityStore.removeByStatusTypeLocal(s.id);
		} catch (error) {
			showStatusMutationError('Status type deleted, but local calendar cleanup failed', error);
		}
		confirmDeleteStatus = null;
	}
</script>

<div class="space-y-1.5">
	{#each filteredStatuses as status (status.id)}
		<div
			class="flex flex-wrap items-center gap-4 rounded-md border border-transparent px-4 py-3 transition-colors hover:border-border hover:bg-muted/40"
		>
			<div class="flex min-w-0 basis-full flex-col gap-0.5 break-words sm:flex-1 sm:basis-auto">
				<span class="text-sm font-medium">{status.name}</span>
			</div>
			<CalendarStatusBadge statusType={status} class="max-w-full whitespace-normal break-words"
				>{status.name}</CalendarStatusBadge
			>
			{#if canMutate}
				<div class="flex shrink-0 gap-1">
					<Button
						variant="ghost"
						size="icon-sm"
						class="size-7"
						title="Edit status type"
						aria-label="Edit status type"
						onclick={() => openEditStatus(status)}
					>
						<Pencil class="size-3.5" />
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						class="size-7 text-destructive hover:text-destructive"
						title="Delete status type"
						aria-label="Delete status type"
						onclick={() => (confirmDeleteStatus = status)}
					>
						<Trash2 class="size-3.5" />
					</Button>
				</div>
			{/if}
		</div>
	{:else}
		<div class="flex items-center justify-center py-12 text-sm text-muted-foreground">No status types found</div>
	{/each}
</div>

<AppDialog.Root bind:open={addStatusOpen} closeBlocked={addStatusDirty} onClose={closeAddStatusDialog}>
	<AppDialog.Content class="sm:max-w-md" closeBlocked={addStatusDirty}>
		<AppDialog.Header>
			<AppDialog.Title>Add Status Type</AppDialog.Title>
			<AppDialog.Description>Create a new personnel availability status for the calendar.</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Body class="grid gap-4">
			<div class="grid gap-2">
				<Label for="add-status-name">Status name</Label>
				<Input id="add-status-name" type="text" placeholder="e.g., Leave, TDY, School" bind:value={newStatusName} />
			</div>
			<div class="flex flex-wrap items-end gap-4">
				<div class="grid gap-2">
					<Label for="add-status-bg">Background</Label>
					<input
						id="add-status-bg"
						type="color"
						bind:value={newStatusColor}
						class="size-9 cursor-pointer rounded-md border border-border p-0.5"
					/>
				</div>
				<div class="grid gap-2">
					<Label for="add-status-text">Text</Label>
					<input
						id="add-status-text"
						type="color"
						bind:value={newStatusTextColor}
						class="size-9 cursor-pointer rounded-md border border-border p-0.5"
					/>
				</div>
				{#if newStatusName.trim()}
					<div class="min-w-0 flex-1">
						<Label>Preview</Label>
						<div class="mt-2">
							<CalendarStatusBadge
								statusType={{
									id: 'preview',
									name: newStatusName,
									color: newStatusColor,
									textColor: newStatusTextColor
								}}
							>
								{newStatusName}
							</CalendarStatusBadge>
						</div>
					</div>
				{/if}
			</div>
		</AppDialog.Body>
		<AppDialog.Footer>
			<Button variant="outline" onclick={closeAddStatusDialog}>Cancel</Button>
			<Button onclick={addStatus} disabled={!newStatusName.trim()}>Add Status Type</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

<AppDialog.Root bind:open={editStatusOpen} closeBlocked={editStatusDirty} onClose={closeEditStatusDialog}>
	<AppDialog.Content class="sm:max-w-md" closeBlocked={editStatusDirty}>
		<AppDialog.Header>
			<AppDialog.Title>Edit Status Type</AppDialog.Title>
			<AppDialog.Description>Update this personnel availability status.</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Body class="grid gap-4">
			<div class="grid gap-2">
				<Label for="edit-status-name">Status name</Label>
				<Input id="edit-status-name" type="text" bind:value={editStatusName} />
			</div>
			<div class="flex flex-wrap items-end gap-4">
				<div class="grid gap-2">
					<Label for="edit-status-bg">Background</Label>
					<input
						id="edit-status-bg"
						type="color"
						bind:value={editStatusColor}
						class="size-9 cursor-pointer rounded-md border border-border p-0.5"
					/>
				</div>
				<div class="grid gap-2">
					<Label for="edit-status-text">Text</Label>
					<input
						id="edit-status-text"
						type="color"
						bind:value={editStatusTextColor}
						class="size-9 cursor-pointer rounded-md border border-border p-0.5"
					/>
				</div>
				{#if editStatusName.trim()}
					<div class="min-w-0 flex-1">
						<Label>Preview</Label>
						<div class="mt-2">
							<CalendarStatusBadge
								statusType={{
									id: 'edit-preview',
									name: editStatusName,
									color: editStatusColor,
									textColor: editStatusTextColor
								}}
							>
								{editStatusName}
							</CalendarStatusBadge>
						</div>
					</div>
				{/if}
			</div>
		</AppDialog.Body>
		<AppDialog.Footer>
			<Button variant="outline" onclick={closeEditStatusDialog}>Cancel</Button>
			<Button onclick={saveEditStatus} disabled={!editStatusName.trim()}>Save Changes</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

{#if confirmDeleteStatus}
	<ConfirmDialog
		title="Delete Status Type"
		message={`Remove "${confirmDeleteStatus.name}"? All schedule entries using this status will also be removed. This cannot be undone.`}
		confirmLabel="Delete"
		variant="danger"
		onConfirm={() => {
			if (confirmDeleteStatus) deleteStatus(confirmDeleteStatus);
		}}
		onCancel={() => (confirmDeleteStatus = null)}
	/>
{/if}
