<script lang="ts">
	import type { Personnel, AvailabilityEntry } from '$lib/types';
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
	import { availabilityStore } from '$features/calendar/stores/availability.svelte';
	import { formatDate } from '$lib/utils/dates';
	import { toastStore } from '$lib/stores/toast.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { Spinner } from '$lib/components/ui/spinner';

	interface Props {
		person: Personnel;
		existingEntry?: AvailabilityEntry;
		onClose: () => void;
	}

	let { person, existingEntry, onClose }: Props = $props();

	const isEditing = $derived(!!existingEntry);
	const todayStr = formatDate(new Date());

	let selectedStatusId = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let isSubmitting = $state(false);
	let isDeleting = $state(false);

	// Reset form state when existingEntry changes (e.g. modal reopened with different data)
	$effect(() => {
		selectedStatusId = existingEntry?.statusTypeId ?? statusTypesStore.items[0]?.id ?? '';
		startDate = existingEntry?.startDate ?? todayStr;
		endDate = existingEntry?.endDate ?? todayStr;
	});

	const dateError = $derived.by(() => {
		if (startDate && endDate && startDate > endDate) {
			return 'End date must be on or after start date';
		}
		return null;
	});

	const dayCount = $derived.by(() => {
		if (!startDate || !endDate || startDate > endDate) return 0;
		const start = new Date(startDate);
		const end = new Date(endDate);
		return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
	});

	const isValid = $derived(selectedStatusId && startDate && endDate && startDate <= endDate);

	const selectedStatus = $derived(statusTypesStore.items.find((s) => s.id === selectedStatusId));

	async function handleSubmit() {
		if (!isValid || isSubmitting) return;

		isSubmitting = true;
		try {
			if (isEditing && existingEntry) {
				// For editing, we need to delete and re-add since there's no update method
				await availabilityStore.remove(existingEntry.id);
			}

			await availabilityStore.add({
				personnelId: person.id,
				statusTypeId: selectedStatusId,
				startDate,
				endDate
			});
			toastStore.success(isEditing ? 'Status updated' : 'Status added');
			onClose();
		} catch {
			toastStore.error('Failed to save status');
		} finally {
			isSubmitting = false;
		}
	}

	let showDeleteConfirm = $state(false);

	function handleDelete() {
		showDeleteConfirm = true;
	}

	async function doDelete() {
		if (!existingEntry || isDeleting) return;
		showDeleteConfirm = false;

		isDeleting = true;
		try {
			await availabilityStore.remove(existingEntry.id);
			toastStore.success('Status deleted');
			onClose();
		} catch {
			toastStore.error('Failed to delete status');
		} finally {
			isDeleting = false;
		}
	}
</script>

<Modal title={isEditing ? 'Edit Status' : 'Add Status'} {onClose} width="450px" titleId="status-modal-title">
	<div class="bg-muted/40 mb-5 flex items-center gap-2 rounded-lg border px-3 py-2">
		<span class="text-primary text-sm font-bold">{person.rank}</span>
		<span class="text-sm font-semibold">{person.lastName}, {person.firstName}</span>
	</div>

	<div class="mb-4 grid gap-2">
		<label class="text-sm font-medium" for="statusType">Status Type <span class="text-destructive">*</span></label>
		<NativeSelect id="statusType" bind:value={selectedStatusId} class="w-full">
			{#each statusTypesStore.items as status (status.id)}
				<option value={status.id}>{status.name}</option>
			{/each}
		</NativeSelect>
		{#if selectedStatus}
			<div>
				<Badge label={selectedStatus.name} color={selectedStatus.color} textColor={selectedStatus.textColor} />
			</div>
		{/if}
	</div>

	<div class="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-start">
		<div class="grid gap-2">
			<label class="text-sm font-medium" for="startDate">Start Date <span class="text-destructive">*</span></label>
			<Input id="startDate" type="date" bind:value={startDate} />
		</div>
		<span class="text-muted-foreground hidden pt-7 sm:block">→</span>
		<div class="grid gap-2">
			<label class="text-sm font-medium" for="endDate">End Date <span class="text-destructive">*</span></label>
			<Input id="endDate" type="date" bind:value={endDate} />
		</div>
		{#if dayCount > 0}
			<div
				class="bg-card mt-0 flex min-w-12 flex-row items-center justify-center gap-1 rounded-lg border px-2 py-1 sm:mt-6 sm:flex-col sm:gap-0"
			>
				<span class="text-primary text-base leading-none font-bold">{dayCount}</span>
				<span class="text-muted-foreground text-[10px] uppercase">{dayCount === 1 ? 'day' : 'days'}</span>
			</div>
		{/if}
	</div>

	{#if dateError}
		<div class="form-error">{dateError}</div>
	{/if}

	{#snippet footer()}
		{#if isEditing}
			<Button variant="destructive" onclick={handleDelete} disabled={isDeleting || isSubmitting}>
				{#if isDeleting}
					<Spinner />
					Deleting...
				{:else}
					Delete
				{/if}
			</Button>
		{/if}
		<div class="ml-auto flex gap-2">
			<Button variant="outline" onclick={onClose}>Cancel</Button>
			<Button disabled={!isValid || isSubmitting} onclick={handleSubmit}>
				{#if isSubmitting}
					<Spinner />
					{isEditing ? 'Saving...' : 'Adding...'}
				{:else}
					{isEditing ? 'Save Changes' : 'Add Status'}
				{/if}
			</Button>
		</div>
	{/snippet}
</Modal>

{#if showDeleteConfirm}
	<ConfirmDialog
		title="Delete Status"
		message="Are you sure you want to delete this status entry?"
		confirmLabel="Delete"
		variant="danger"
		onConfirm={doDelete}
		onCancel={() => (showDeleteConfirm = false)}
	/>
{/if}
