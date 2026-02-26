<script lang="ts">
	import type { Personnel, AvailabilityEntry } from '$lib/types';
	import { statusTypesStore } from '$lib/stores/statusTypes.svelte';
	import { availabilityStore } from '$lib/stores/availability.svelte';
	import { formatDate } from '$lib/utils/dates';
	import Modal from './Modal.svelte';
	import Badge from './ui/Badge.svelte';
	import Spinner from './ui/Spinner.svelte';

	interface Props {
		person: Personnel;
		existingEntry?: AvailabilityEntry;
		onClose: () => void;
	}

	let { person, existingEntry, onClose }: Props = $props();

	const isEditing = !!existingEntry;
	const todayStr = formatDate(new Date());

	let selectedStatusId = $state(existingEntry?.statusTypeId ?? statusTypesStore.list[0]?.id ?? '');
	let startDate = $state(existingEntry?.startDate ?? todayStr);
	let endDate = $state(existingEntry?.endDate ?? todayStr);
	let isSubmitting = $state(false);
	let isDeleting = $state(false);

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

	const selectedStatus = $derived(statusTypesStore.list.find((s) => s.id === selectedStatusId));

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
			onClose();
		} finally {
			isSubmitting = false;
		}
	}

	async function handleDelete() {
		if (!existingEntry || isDeleting) return;

		isDeleting = true;
		try {
			await availabilityStore.remove(existingEntry.id);
			onClose();
		} finally {
			isDeleting = false;
		}
	}
</script>

<Modal
	title={isEditing ? 'Edit Status' : 'Add Status'}
	{onClose}
	width="450px"
	titleId="status-modal-title"
>
	<div class="person-info">
		<span class="person-rank">{person.rank}</span>
		<span class="person-name">{person.lastName}, {person.firstName}</span>
	</div>

	<div class="form-group">
		<label class="label" for="statusType">Status Type</label>
		<select id="statusType" class="select" bind:value={selectedStatusId}>
			{#each statusTypesStore.list as status}
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
			<label class="label" for="startDate">Start Date</label>
			<input id="startDate" type="date" class="input" bind:value={startDate} />
		</div>
		<span class="date-arrow">→</span>
		<div class="form-group">
			<label class="label" for="endDate">End Date</label>
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
		<div class="date-error">{dateError}</div>
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

<style>
	.person-info {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-bg);
		border-radius: var(--radius-md);
		margin-bottom: var(--spacing-lg);
	}

	.person-rank {
		font-weight: 700;
		color: var(--color-primary);
	}

	.person-name {
		font-weight: 600;
	}

	.status-preview {
		margin-top: var(--spacing-sm);
	}

	.dates-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	.dates-row .form-group {
		flex: 1;
		margin-bottom: 0;
	}

	.date-arrow {
		color: var(--color-text-muted);
		font-size: var(--font-size-lg);
		padding-top: var(--spacing-lg);
	}

	.day-count {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: var(--spacing-xs) var(--spacing-sm);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		min-width: 50px;
		margin-top: var(--spacing-lg);
	}

	.day-count-number {
		font-size: var(--font-size-lg);
		font-weight: 700;
		color: var(--color-primary);
		line-height: 1;
	}

	.day-count-label {
		font-size: 10px;
		color: var(--color-text-muted);
		text-transform: uppercase;
	}

	.date-error {
		color: #dc2626;
		font-size: var(--font-size-sm);
		margin-top: var(--spacing-sm);
		padding: var(--spacing-xs) var(--spacing-sm);
		background: #fef2f2;
		border-radius: var(--radius-sm);
	}

	.footer-right {
		display: flex;
		gap: var(--spacing-sm);
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
