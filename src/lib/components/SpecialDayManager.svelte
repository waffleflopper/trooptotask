<script lang="ts">
	import type { SpecialDay } from '../types';
	import { formatDate } from '../utils/dates';

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
		specialDays
			.filter((d) => d.date.startsWith(`${filterYear}-`))
			.sort((a, b) => a.date.localeCompare(b.date))
	);

	const yearOptions = $derived(() => {
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

	function handleRemove(day: SpecialDay) {
		if (confirm(`Are you sure you want to remove "${day.name}"?`)) {
			onRemove(day.id);
		}
	}

	function handleResetHolidays() {
		if (confirm('Reset federal holidays to defaults? Custom closures will be preserved.')) {
			onResetHolidays();
		}
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

<div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="special-day-title" tabindex="-1" onkeydown={(e) => e.key === 'Escape' && onClose()}>
	<button class="modal-backdrop" onclick={onClose} tabindex="-1" aria-label="Close dialog"></button>
	<div class="modal" style="width: 550px;" role="document">
		<div class="modal-header">
			<h2 id="special-day-title">Manage Holidays & Closures</h2>
			<button class="btn btn-secondary btn-sm" onclick={onClose}>&times;</button>
		</div>

		<div class="modal-body">
			<div class="add-form">
				<input type="date" class="input" bind:value={newDate} style="width: 150px;" />
				<input
					type="text"
					class="input"
					bind:value={newName}
					placeholder="Name (e.g., Training Day)"
					style="flex: 1;"
				/>
				<select class="select" bind:value={newType} style="width: 140px;">
					<option value="org-closure">Closure</option>
					<option value="federal-holiday">Federal Holiday</option>
				</select>
				<button class="btn btn-primary btn-sm" onclick={handleAdd} disabled={!newName.trim()}>
					Add
				</button>
			</div>

			<div class="filter-bar">
				<label class="label">Year:</label>
				<select class="select" bind:value={filterYear} style="width: 100px;">
					{#each yearOptions() as year}
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
						<button
							class="btn btn-danger btn-sm"
							onclick={() => handleRemove(day)}
							title="Remove"
						>
							&times;
						</button>
					</div>
				{:else}
					<div class="empty-state">No holidays or closures for {filterYear}</div>
				{/each}
			</div>
		</div>

		<div class="modal-footer">
			<button class="btn btn-secondary" onclick={handleResetHolidays}>
				Reset Federal Holidays
			</button>
			<button class="btn btn-primary" onclick={onClose}>Done</button>
		</div>
	</div>
</div>

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
