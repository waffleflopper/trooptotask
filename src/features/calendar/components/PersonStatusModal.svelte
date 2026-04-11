<script lang="ts">
	import type { Personnel, AvailabilityEntry } from '$lib/types';
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
	import { availabilityStore } from '$features/calendar/stores/availability.svelte';
	import { formatDate } from '$lib/utils/dates';
	import { toastStore } from '$lib/stores/toast.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';

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
	<div class="person-info">
		<span class="person-rank">{person.rank}</span>
		<span class="person-name">{person.lastName}, {person.firstName}</span>
	</div>

	<div class="form-group">
		<label class="label" for="statusType">Status Type <span class="required">*</span></label>
		<select id="statusType" class="select" bind:value={selectedStatusId}>
			{#each statusTypesStore.items as status (status.id)}
				<option value={status.id}>{status.name}</option>
			{/each}
		</select>
		{#if selectedStatus}
			<div class="status-preview">
				<Badge label={selectedStatus.name} color={selectedStatus.color} textColor={selectedStatus.textColor} />
			</div>
		{/if}
	</div>

	<div class="dates-row">
		<div class="form-group">
			<label class="label" for="startDate">Start Date <span class="required">*</span></label>
			<input id="startDate" type="date" class="input" bind:value={startDate} />
		</div>
		<span class="date-arrow">→</span>
		<div class="form-group">
			<label class="label" for="endDate">End Date <span class="required">*</span></label>
			<input id="endDate" type="date" class="input" bind:value={endDate} />
		</div>
		{#if dayCount > 0}
			<div class="day-count">
				<span class="day-count-number">{dayCount}</span>
				<span class="day-count-label">{dayCount === 1 ? 'day' : 'days'}</span>
			</div>
		{/if}
	</div>

	{#if dateError}
		<div class="form-error">{dateError}</div>
	{/if}

	{#snippet footer()}
		{#if isEditing}
			<button class="btn btn-danger" onclick={handleDelete} disabled={isDeleting || isSubmitting}>
				{#if isDeleting}
					<Spinner />
					Deleting...
				{:else}
					Delete
				{/if}
			</button>
		{/if}
		<div class="footer-right">
			<button class="btn btn-secondary" onclick={onClose}>Cancel</button>
			<button class="btn btn-primary" disabled={!isValid || isSubmitting} onclick={handleSubmit}>
				{#if isSubmitting}
					<Spinner />
					{isEditing ? 'Saving...' : 'Adding...'}
				{:else}
					{isEditing ? 'Save Changes' : 'Add Status'}
				{/if}
			</button>
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

<style>
	.person-info {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-4);
		background: var(--surface-page);
		border-radius: var(--radius-md);
		margin-bottom: var(--sp-6);
	}

	.person-rank {
		font-weight: 700;
		color: var(--amber);
	}

	.person-name {
		font-weight: 600;
	}

	.status-preview {
		margin-top: var(--sp-2);
	}

	.dates-row {
		display: flex;
		align-items: center;
		gap: var(--sp-4);
	}

	.dates-row .form-group {
		flex: 1;
		margin-bottom: 0;
	}

	.date-arrow {
		color: var(--text-tertiary);
		font-size: var(--text-base);
		padding-top: var(--sp-6);
	}

	.day-count {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: var(--sp-1) var(--sp-2);
		background: var(--surface-panel);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		min-width: 50px;
		margin-top: var(--sp-6);
	}

	.day-count-number {
		font-size: var(--text-base);
		font-weight: 700;
		color: var(--amber);
		line-height: 1;
	}

	.day-count-label {
		font-size: 10px;
		color: var(--text-tertiary);
		text-transform: uppercase;
	}

	.footer-right {
		display: flex;
		gap: var(--sp-2);
		margin-left: auto;
	}

	.btn-danger {
		background: #dc2626;
		color: white;
	}

	.btn-danger:hover:not(:disabled) {
		background: #b91c1c;
	}
</style>
