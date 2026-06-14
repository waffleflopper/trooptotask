<script lang="ts">
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { CalendarStatusBadge } from '$lib/components/ui/calendar-status-badge';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { availabilityStore } from '$features/calendar/stores/availability.svelte';
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import {
		DA6_AVAILABILITY_TREATMENT_OPTIONS,
		DA6_TREATMENT_NONE,
		formatDa6AvailabilityTreatment,
		toDa6AvailabilityTreatment,
		type Da6AvailabilityTreatmentOption
	} from '$features/calendar/utils/da6AvailabilityTreatment';
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
	let newStatusDa6Treatment = $state<Da6AvailabilityTreatmentOption>(DA6_TREATMENT_NONE);

	let editStatusOpen = $state(false);
	let editingStatus = $state<StatusType | null>(null);
	let editStatusName = $state('');
	let editStatusColor = $state('');
	let editStatusTextColor = $state('');
	let editStatusDa6Treatment = $state<Da6AvailabilityTreatmentOption>(DA6_TREATMENT_NONE);

	let confirmDeleteStatus = $state<StatusType | null>(null);
	const addStatusDirty = $derived(
		newStatusName.trim() !== '' ||
			newStatusColor !== '#4a4a47' ||
			newStatusTextColor !== '#f8f7f4' ||
			newStatusDa6Treatment !== DA6_TREATMENT_NONE
	);
	const editStatusDirty = $derived(
		Boolean(
			editingStatus &&
			(editStatusName !== editingStatus.name ||
				editStatusColor !== editingStatus.color ||
				editStatusTextColor !== editingStatus.textColor ||
				editStatusDa6Treatment !== (editingStatus.da6AvailabilityTreatment ?? DA6_TREATMENT_NONE))
		)
	);

	const statusTypesMissingDa6Treatment = $derived(
		statusTypesStore.items.filter((status) => !status.da6AvailabilityTreatment && !status.da6TreatmentReviewed)
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
		newStatusDa6Treatment = DA6_TREATMENT_NONE;
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
		editStatusDa6Treatment = s.da6AvailabilityTreatment ?? DA6_TREATMENT_NONE;
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
				textColor: newStatusTextColor,
				da6AvailabilityTreatment: toDa6AvailabilityTreatment(newStatusDa6Treatment),
				da6TreatmentReviewed: true
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
				textColor: editStatusTextColor,
				da6AvailabilityTreatment: toDa6AvailabilityTreatment(editStatusDa6Treatment),
				da6TreatmentReviewed: true
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

	async function markStatusDa6Reviewed(status: StatusType) {
		if (!canMutate) return;
		try {
			const saved = await statusTypesStore.update(status.id, {
				da6AvailabilityTreatment: null,
				da6TreatmentReviewed: true
			});
			if (!saved) showStatusMutationError('Failed to confirm DA6 treatment');
		} catch (error) {
			showStatusMutationError('Failed to confirm DA6 treatment', error);
		}
	}

	function handleNewDa6TreatmentChange(event: Event) {
		newStatusDa6Treatment = (event.currentTarget as HTMLSelectElement).value as Da6AvailabilityTreatmentOption;
	}

	function handleEditDa6TreatmentChange(event: Event) {
		editStatusDa6Treatment = (event.currentTarget as HTMLSelectElement).value as Da6AvailabilityTreatmentOption;
	}
</script>

{#if statusTypesMissingDa6Treatment.length > 0}
	<section
		class="mb-4 rounded-md border border-border bg-amber-50 p-4 dark:bg-amber-950/20"
		aria-label="DA6 treatment review"
	>
		<div class="mb-1 flex items-center gap-2">
			<Badge variant="outline" class="font-mono text-[10px]">DA6</Badge>
			<h4 class="text-sm font-semibold">Confirm statuses with no DA6 effect</h4>
		</div>
		<p class="mb-3 text-xs text-muted-foreground">
			These status types are excluded from DA Form 6 rosters unless you edit them and assign a duty roster treatment.
		</p>
		<div class="flex flex-wrap items-center gap-2">
			<span class="font-mono text-[10px] font-semibold text-muted-foreground">
				{statusTypesMissingDa6Treatment.length === 1
					? '1 needs review'
					: `${statusTypesMissingDa6Treatment.length} need review`}
			</span>
			{#each statusTypesMissingDa6Treatment as status (status.id)}
				<span
					class="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium"
				>
					{status.name}
					{#if canMutate}
						<button
							class="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-amber-700 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/30"
							type="button"
							aria-label={`Confirm ${status.name} has no DA6 effect`}
							onclick={() => markStatusDa6Reviewed(status)}
						>
							No effect
						</button>
					{/if}
				</span>
			{/each}
		</div>
	</section>
{/if}

<div class="space-y-1.5">
	{#each filteredStatuses as status (status.id)}
		<div
			class="flex items-center gap-4 rounded-md border border-transparent px-4 py-3 transition-colors hover:border-border hover:bg-muted/40"
		>
			<div class="flex flex-1 flex-col gap-0.5">
				<span class="text-sm font-medium">{status.name}</span>
				<span class="text-xs text-muted-foreground">
					{formatDa6AvailabilityTreatment(status.da6AvailabilityTreatment)}
				</span>
			</div>
			<CalendarStatusBadge statusType={status}>{status.name}</CalendarStatusBadge>
			{#if canMutate}
				<div class="flex gap-1">
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
			<div class="grid gap-2">
				<Label for="add-status-da6">Duty roster treatment</Label>
				<NativeSelect
					id="add-status-da6"
					value={newStatusDa6Treatment}
					onchange={handleNewDa6TreatmentChange}
					class="w-full min-w-0"
				>
					{#each DA6_AVAILABILITY_TREATMENT_OPTIONS as option (option.value)}
						<option value={option.value} disabled={option.disabled}>{option.label}</option>
					{/each}
				</NativeSelect>
				{#if newStatusDa6Treatment === 'authorized-absence'}
					<p class="text-xs leading-5 text-muted-foreground">DA6 rotation count pauses during absence.</p>
				{:else if newStatusDa6Treatment === 'other-duty'}
					<p class="text-xs leading-5 text-muted-foreground">DA6 rotation count continues while on duty.</p>
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
			<div class="grid gap-2">
				<Label for="edit-status-da6">Duty roster treatment</Label>
				<NativeSelect
					id="edit-status-da6"
					value={editStatusDa6Treatment}
					onchange={handleEditDa6TreatmentChange}
					class="w-full min-w-0"
				>
					{#each DA6_AVAILABILITY_TREATMENT_OPTIONS as option (option.value)}
						<option value={option.value} disabled={option.disabled}>{option.label}</option>
					{/each}
				</NativeSelect>
				{#if editStatusDa6Treatment === 'authorized-absence'}
					<p class="text-xs leading-5 text-muted-foreground">DA6 rotation count pauses during absence.</p>
				{:else if editStatusDa6Treatment === 'other-duty'}
					<p class="text-xs leading-5 text-muted-foreground">DA6 rotation count continues while on duty.</p>
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
