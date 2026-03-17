<script lang="ts">
	import type { SpecialDay } from '$features/calendar/calendar.types';
	import { formatDate } from '$lib/utils/dates';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import Modal from '$lib/components/Modal.svelte';

	interface Props {
		specialDays: SpecialDay[];
		onAdd: (data: Omit<SpecialDay, 'id'>) => void;
		onRemove: (id: string) => void;
		onResetHolidays: () => void;
		onClose: () => void;
	}

	let { specialDays, onAdd, onRemove, onResetHolidays, onClose }: Props = $props();

	let newDate = $state(formatDate(new Date()));
	let newName = $state('');
	let newType = $state<'federal-holiday' | 'org-closure'>('org-closure');
	let filterYear = $state(new Date().getFullYear());

	const filteredDays = $derived(
		specialDays.filter((d) => d.date.startsWith(`${filterYear}-`)).sort((a, b) => a.date.localeCompare(b.date))
	);

	const yearOptions = $derived.by(() => {
		const currentYear = new Date().getFullYear();
		return [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];
	});

	function handleAdd() {
		if (newDate && newName.trim()) {
			onAdd({
				date: newDate,
				name: newName.trim(),
				type: newType
			});
			newName = '';
		}
	}

	let confirmRemove = $state<SpecialDay | null>(null);
	let showResetConfirm = $state(false);

	function handleRemove(day: SpecialDay) {
		confirmRemove = day;
	}

	function doRemove() {
		if (confirmRemove) {
			onRemove(confirmRemove.id);
			confirmRemove = null;
		}
	}

	function handleResetHolidays() {
		showResetConfirm = true;
	}

	function doReset() {
		onResetHolidays();
		showResetConfirm = false;
	}

	function formatDisplayDate(dateStr: string): string {
		const date = new Date(dateStr + 'T00:00:00');
		return date.toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<Modal title="Manage Holidays & Closures" {onClose} width="550px" titleId="special-day-title">
	<div class="add-form">
		<input type="date" class="input" bind:value={newDate} style="width: 150px;" />
		<input type="text" class="input" bind:value={newName} placeholder="Name (e.g., Training Day)" style="flex: 1;" />
		<select class="select" bind:value={newType} style="width: 140px;">
			<option value="org-closure">Closure</option>
			<option value="federal-holiday">Federal Holiday</option>
		</select>
		<button class="btn btn-primary btn-sm" onclick={handleAdd} disabled={!newName.trim()}> Add </button>
	</div>

	<div class="filter-bar">
		<label class="label">Year:</label>
		<select class="select" bind:value={filterYear} style="width: 100px;">
			{#each yearOptions as year}
				<option value={year}>{year}</option>
			{/each}
		</select>
		<span class="count">{filteredDays.length} days</span>
	</div>

	<div class="day-list">
		{#each filteredDays as day (day.id)}
			<div class="day-item">
				<div class="day-info">
					<span class="day-date">{formatDisplayDate(day.date)}</span>
					<span class="day-name">{day.name}</span>
					<span class="day-type" class:holiday={day.type === 'federal-holiday'}>
						{day.type === 'federal-holiday' ? 'Holiday' : 'Closure'}
					</span>
				</div>
				<button class="btn btn-danger btn-sm" onclick={() => handleRemove(day)} title="Remove"> &times; </button>
			</div>
		{:else}
			<div class="empty-state">No holidays or closures for {filterYear}</div>
		{/each}
	</div>

	{#snippet footer()}
		<button class="btn btn-secondary" onclick={handleResetHolidays}> Reset Federal Holidays </button>
		<button class="btn btn-primary" onclick={onClose}>Done</button>
	{/snippet}
</Modal>

{#if confirmRemove}
	<ConfirmDialog
		title="Remove Special Day"
		message={`Remove "${confirmRemove.name}"?`}
		confirmLabel="Remove"
		variant="danger"
		onConfirm={doRemove}
		onCancel={() => (confirmRemove = null)}
	/>
{/if}

{#if showResetConfirm}
	<ConfirmDialog
		title="Reset Federal Holidays"
		message="Reset federal holidays to defaults? Custom closures will be preserved."
		confirmLabel="Reset"
		variant="warning"
		onConfirm={doReset}
		onCancel={() => (showResetConfirm = false)}
	/>
{/if}

<style>
	.add-form {
		display: flex;
		gap: var(--spacing-sm);
		align-items: center;
		margin-bottom: var(--spacing-md);
		padding-bottom: var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
	}

	.filter-bar {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-md);
	}

	.filter-bar .label {
		margin: 0;
	}

	.count {
		margin-left: auto;
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.day-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
		max-height: 350px;
		overflow-y: auto;
	}

	.day-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm);
		background: var(--color-bg);
		border-radius: var(--radius-md);
	}

	.day-info {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	.day-date {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		min-width: 100px;
	}

	.day-name {
		font-weight: 500;
	}

	.day-type {
		font-size: var(--font-size-sm);
		padding: 2px var(--spacing-sm);
		border-radius: var(--radius-sm);
		background: var(--color-border);
		color: var(--color-text-muted);
	}

	.day-type.holiday {
		background: var(--color-holiday);
		color: var(--color-text);
	}

	.empty-state {
		text-align: center;
		color: var(--color-text-muted);
		padding: var(--spacing-lg);
	}
</style>
