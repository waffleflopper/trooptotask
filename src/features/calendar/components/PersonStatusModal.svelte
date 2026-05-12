<script lang="ts">
	import type { Personnel, AvailabilityEntry } from '$lib/types';
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
	import { availabilityStore } from '$features/calendar/stores/availability.svelte';
	import { formatDate } from '$lib/utils/dates';
	import { toastStore } from '$lib/stores/toast.svelte';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { CalendarStatusBadge } from '$lib/components/ui/calendar-status-badge';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import * as Select from '$lib/components/ui/select';
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

<AppDialog.Root open {onClose} closeBlocked={isSubmitting || isDeleting}>
	<AppDialog.Content>
		<AppDialog.Header>
			<AppDialog.Title id="status-modal-title">{isEditing ? 'Edit Status' : 'Add Status'}</AppDialog.Title>
			<AppDialog.Description>
				{person.rank}
				{person.lastName}, {person.firstName}
			</AppDialog.Description>
		</AppDialog.Header>

		<AppDialog.Body class="space-y-4">
			<Field.Root>
				<Field.Label id="statusType-label">Status Type <span class="text-destructive">*</span></Field.Label>
				<div class="flex flex-wrap items-center gap-2">
					<Select.Root type="single" bind:value={selectedStatusId}>
						<Select.Trigger id="statusType" aria-labelledby="statusType-label" class="min-w-48 flex-1">
							{selectedStatus?.name ?? 'Select status'}
						</Select.Trigger>
						<Select.Content>
							{#each statusTypesStore.items as status (status.id)}
								<Select.Item value={status.id} label={status.name} />
							{/each}
						</Select.Content>
					</Select.Root>
					{#if selectedStatus}
						<CalendarStatusBadge statusType={selectedStatus}>{selectedStatus.name}</CalendarStatusBadge>
					{/if}
				</div>
			</Field.Root>

			<div class="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-start">
				<Field.Root>
					<Field.Label for="startDate">Start Date <span class="text-destructive">*</span></Field.Label>
					<DatePicker id="startDate" bind:value={startDate} placeholder="Select start date" />
				</Field.Root>
				<span class="text-muted-foreground hidden pt-7 sm:block">→</span>
				<Field.Root>
					<Field.Label for="endDate">End Date <span class="text-destructive">*</span></Field.Label>
					<DatePicker id="endDate" bind:value={endDate} placeholder="Select end date" />
				</Field.Root>
				{#if dayCount > 0}
					<div
						class="bg-muted/30 mt-0 flex min-w-14 flex-row items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5 sm:mt-6 sm:flex-col sm:gap-0"
					>
						<span class="text-foreground text-base leading-none font-semibold">{dayCount}</span>
						<span class="text-muted-foreground text-xs">{dayCount === 1 ? 'day' : 'days'}</span>
					</div>
				{/if}
			</div>

			{#if dateError}
				<Field.Error>{dateError}</Field.Error>
			{/if}
		</AppDialog.Body>

		<AppDialog.Footer>
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
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

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
