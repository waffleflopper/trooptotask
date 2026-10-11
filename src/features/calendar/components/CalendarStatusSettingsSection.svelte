<script lang="ts">
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { CalendarStatusBadge } from './calendar-status-badge';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import { availabilityStore } from '$features/calendar/stores/availability.svelte';
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import type { StatusType } from '$features/calendar/contracts';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { PendingSave } from '$lib/utils/pendingSave.svelte';

	type Props = {
		canMutate: boolean;
		searchQuery: string;
	};

	let { canMutate, searchQuery }: Props = $props();

	// A color input only accepts #rrggbb, and the chosen values are saved as the status colors.
	const DEFAULT_STATUS_COLOR = '#4a4a47';
	const DEFAULT_STATUS_TEXT_COLOR = '#f8f7f4';

	let addStatusOpen = $state(false);
	let newStatusName = $state('');
	let newStatusColor = $state(DEFAULT_STATUS_COLOR);
	let newStatusTextColor = $state(DEFAULT_STATUS_TEXT_COLOR);

	let editStatusOpen = $state(false);
	let editingStatus = $state<StatusType | null>(null);
	let editStatusName = $state('');
	let editStatusColor = $state('');
	let editStatusTextColor = $state('');

	let confirmDeleteStatus = $state<StatusType | null>(null);
	const saving = new PendingSave();
	const addStatusDirty = $derived(
		newStatusName.trim() !== '' ||
			newStatusColor !== DEFAULT_STATUS_COLOR ||
			newStatusTextColor !== DEFAULT_STATUS_TEXT_COLOR
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
		newStatusColor = DEFAULT_STATUS_COLOR;
		newStatusTextColor = DEFAULT_STATUS_TEXT_COLOR;
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
						title="Edit {status.name}"
						aria-label="Edit {status.name}"
						onclick={() => openEditStatus(status)}
					>
						<Pencil />
					</Button>
					<Button
						variant="destructive"
						size="icon-sm"
						title="Delete {status.name}"
						aria-label="Delete {status.name}"
						onclick={() => (confirmDeleteStatus = status)}
					>
						<Trash2 />
					</Button>
				</div>
			{/if}
		</div>
	{:else}
		<div class="flex items-center justify-center py-12 text-sm text-muted-foreground">No status types found</div>
	{/each}
</div>

<AppDialog.Root
	bind:open={addStatusOpen}
	busy={saving.pending}
	closeBlocked={addStatusDirty}
	onClose={closeAddStatusDialog}
>
	<AppDialog.Content class="sm:max-w-md">
		<AppDialog.Header>
			<AppDialog.Title>Add Status Type</AppDialog.Title>
			<AppDialog.Description>Create a new personnel availability status for the calendar.</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Body class="grid gap-4">
			<fieldset class="contents" disabled={saving.pending}>
				<Field.Root>
					<Field.Label for="add-status-name">Status name</Field.Label>
					<Input id="add-status-name" type="text" placeholder="e.g., Leave, TDY, School" bind:value={newStatusName} />
				</Field.Root>
				<div class="flex flex-wrap items-end gap-4">
					<Field.Root class="w-auto">
						<Field.Label for="add-status-bg">Background</Field.Label>
						<Input id="add-status-bg" type="color" class="w-12 cursor-pointer p-1" bind:value={newStatusColor} />
					</Field.Root>
					<Field.Root class="w-auto">
						<Field.Label for="add-status-text">Text</Field.Label>
						<Input id="add-status-text" type="color" class="w-12 cursor-pointer p-1" bind:value={newStatusTextColor} />
					</Field.Root>
					{#if newStatusName.trim()}
						<Field.Root class="w-auto min-w-0 flex-1">
							<Field.Title>Preview</Field.Title>
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
						</Field.Root>
					{/if}
				</div>
			</fieldset>
		</AppDialog.Body>
		<AppDialog.Footer>
			<Button variant="outline" onclick={closeAddStatusDialog} disabled={saving.pending}>Cancel</Button>
			<Button onclick={() => saving.run(addStatus)} disabled={saving.pending || !newStatusName.trim()}>
				{#if saving.pending}<Spinner />{/if}
				Add Status Type
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

<AppDialog.Root
	bind:open={editStatusOpen}
	busy={saving.pending}
	closeBlocked={editStatusDirty}
	onClose={closeEditStatusDialog}
>
	<AppDialog.Content class="sm:max-w-md">
		<AppDialog.Header>
			<AppDialog.Title>Edit Status Type</AppDialog.Title>
			<AppDialog.Description>Update this personnel availability status.</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Body class="grid gap-4">
			<fieldset class="contents" disabled={saving.pending}>
				<Field.Root>
					<Field.Label for="edit-status-name">Status name</Field.Label>
					<Input id="edit-status-name" type="text" bind:value={editStatusName} />
				</Field.Root>
				<div class="flex flex-wrap items-end gap-4">
					<Field.Root class="w-auto">
						<Field.Label for="edit-status-bg">Background</Field.Label>
						<Input id="edit-status-bg" type="color" class="w-12 cursor-pointer p-1" bind:value={editStatusColor} />
					</Field.Root>
					<Field.Root class="w-auto">
						<Field.Label for="edit-status-text">Text</Field.Label>
						<Input
							id="edit-status-text"
							type="color"
							class="w-12 cursor-pointer p-1"
							bind:value={editStatusTextColor}
						/>
					</Field.Root>
					{#if editStatusName.trim()}
						<Field.Root class="w-auto min-w-0 flex-1">
							<Field.Title>Preview</Field.Title>
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
						</Field.Root>
					{/if}
				</div>
			</fieldset>
		</AppDialog.Body>
		<AppDialog.Footer>
			<Button variant="outline" onclick={closeEditStatusDialog} disabled={saving.pending}>Cancel</Button>
			<Button onclick={() => saving.run(saveEditStatus)} disabled={saving.pending || !editStatusName.trim()}>
				{#if saving.pending}<Spinner />{/if}
				Save Changes
			</Button>
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
			if (confirmDeleteStatus) return deleteStatus(confirmDeleteStatus);
		}}
		onCancel={() => (confirmDeleteStatus = null)}
	/>
{/if}
