<script lang="ts">
	import type { Personnel, StatusType, AvailabilityEntry } from '../types';
	import { formatDate } from '../utils/dates';

	interface Props {
		person: Personnel;
		date: Date;
		statusTypes: StatusType[];
		existingEntries: AvailabilityEntry[];
		onAdd: (data: Omit<AvailabilityEntry, 'id'>) => void;
		onRemove: (id: string) => void;
		onClose: () => void;
	}

	let { person, date, statusTypes, existingEntries, onAdd, onRemove, onClose }: Props = $props();

	const initialStatusId = $derived(statusTypes[0]?.id ?? '');
	const initialDate = $derived(formatDate(date));

	let selectedStatusId = $state('');
	let startDate = $state('');
	let endDate = $state('');

	$effect(() => {
		if (!selectedStatusId) selectedStatusId = initialStatusId;
	});

	$effect(() => {
		if (!startDate) startDate = initialDate;
		if (!endDate) endDate = initialDate;
	});

	const dateDisplay = $derived(
		date.toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		})
	);

	const entriesOnDate = $derived(
		existingEntries.filter(
			(e) => e.personnelId === person.id && formatDate(date) >= e.startDate && formatDate(date) <= e.endDate
		)
	);

	const dateError = $derived(() => {
		if (startDate && endDate && startDate > endDate) {
			return 'End date must be on or after start date';
		}
		return null;
	});

	const dayCount = $derived(() => {
		if (!startDate || !endDate || startDate > endDate) return 0;
		const start = new Date(startDate);
		const end = new Date(endDate);
		return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
	});

	function handleAdd() {
		if (selectedStatusId && startDate && endDate && startDate <= endDate) {
			onAdd({
				personnelId: person.id,
				statusTypeId: selectedStatusId,
				startDate,
				endDate
			});
			// Reset to allow adding another
			startDate = initialDate;
			endDate = initialDate;
		}
	}

	function handleRemove(entryId: string) {
		if (confirm('Remove this status entry?')) {
			onRemove(entryId);
		}
	}

	function getStatusName(statusId: string): string {
		return statusTypes.find((s) => s.id === statusId)?.name ?? 'Unknown';
	}

	function getStatusColor(statusId: string): string {
		return statusTypes.find((s) => s.id === statusId)?.color ?? '#6b7280';
	}

	function getStatusTextColor(statusId: string): string {
		return statusTypes.find((s) => s.id === statusId)?.textColor ?? '#ffffff';
	}

	function formatEntryDates(entry: AvailabilityEntry): string {
		const start = new Date(entry.startDate + 'T00:00:00');
		const end = new Date(entry.endDate + 'T00:00:00');
		const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
		const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
		if (entry.startDate === entry.endDate) {
			return startStr;
		}
		return `${startStr} – ${endStr}`;
	}

	function getDayCountForEntry(entry: AvailabilityEntry): number {
		const start = new Date(entry.startDate);
		const end = new Date(entry.endDate);
		return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
	}
</script>

<div class="modal-overlay availability-overlay" role="dialog" aria-modal="true" aria-labelledby="availability-title" tabindex="-1" onkeydown={(e) => e.key === 'Escape' && onClose()}>
	<button class="modal-backdrop" onclick={onClose} tabindex="-1" aria-label="Close dialog"></button>
	<div class="modal availability-modal" role="document">
		<div class="modal-header">
			<h2 id="availability-title">Set Status</h2>
			<button class="btn btn-secondary btn-sm close-btn" onclick={onClose} aria-label="Close">&times;</button>
		</div>

		<div class="modal-body">
			<!-- Person Info -->
			<div class="person-info">
				<div class="person-name">
					<span class="rank">{person.rank}</span>
					<span class="name">{person.lastName}, {person.firstName}</span>
				</div>
				<div class="clicked-date">{dateDisplay}</div>
			</div>

			<!-- Existing Entries -->
			{#if entriesOnDate.length > 0}
				<div class="existing-entries">
					<h4>Current Status</h4>
					{#each entriesOnDate as entry (entry.id)}
						<div class="entry-item">
							<span
								class="status-badge"
								style="background-color: {getStatusColor(entry.statusTypeId)}; color: {getStatusTextColor(entry.statusTypeId)}"
							>
								{getStatusName(entry.statusTypeId)}
							</span>
							<div class="entry-details">
								<span class="entry-dates">{formatEntryDates(entry)}</span>
								<span class="entry-days">({getDayCountForEntry(entry)} {getDayCountForEntry(entry) === 1 ? 'day' : 'days'})</span>
							</div>
							<button
								class="btn btn-danger btn-sm remove-btn"
								onclick={() => handleRemove(entry.id)}
								title="Remove"
								aria-label="Remove status"
							>
								<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
									<path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
								</svg>
							</button>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Add New Status -->
			<div class="add-section">
				<h4>{entriesOnDate.length > 0 ? 'Add Another Status' : 'Add Status'}</h4>

				<div class="form-group">
					<label class="label" for="statusType">Status Type</label>
					<div class="status-select-row">
						<select id="statusType" class="select" bind:value={selectedStatusId}>
							{#each statusTypes as status}
								<option value={status.id}>{status.name}</option>
							{/each}
						</select>
						{#if selectedStatusId}
							{@const selectedStatus = statusTypes.find((s) => s.id === selectedStatusId)}
							{#if selectedStatus}
								<span
									class="status-badge preview-badge"
									style="background-color: {selectedStatus.color}; color: {selectedStatus.textColor}"
								>
									{selectedStatus.name}
								</span>
							{/if}
						{/if}
					</div>
				</div>

				<div class="date-range">
					<div class="form-group">
						<label class="label" for="startDate">Start Date</label>
						<input id="startDate" type="date" class="input" bind:value={startDate} />
					</div>
					<span class="date-arrow">→</span>
					<div class="form-group">
						<label class="label" for="endDate">End Date</label>
						<input id="endDate" type="date" class="input" bind:value={endDate} />
					</div>
					{#if dayCount() > 0}
						<div class="day-count">
							<span class="day-count-number">{dayCount()}</span>
							<span class="day-count-label">{dayCount() === 1 ? 'day' : 'days'}</span>
						</div>
					{/if}
				</div>

				{#if dateError()}
					<div class="date-error">{dateError()}</div>
				{/if}
			</div>
		</div>

		<div class="modal-footer">
			<button class="btn btn-secondary" onclick={onClose}>Cancel</button>
			<button
				class="btn btn-primary"
				onclick={handleAdd}
				disabled={!selectedStatusId || !!dateError()}
			>
				Add Status
			</button>
		</div>
	</div>
</div>

<style>
	.availability-overlay {
		z-index: 1100;
	}

	.availability-modal {
		width: 480px;
		max-width: 95vw;
	}

	.close-btn {
		font-size: 1.25rem;
		line-height: 1;
		padding: var(--spacing-xs) var(--spacing-sm);
	}

	.person-info {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
		padding-bottom: var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
		margin-bottom: var(--spacing-md);
	}

	.person-name {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: var(--font-size-lg);
	}

	.person-name .rank {
		font-weight: 700;
		color: var(--color-primary);
	}

	.person-name .name {
		font-weight: 600;
	}

	.clicked-date {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.existing-entries {
		margin-bottom: var(--spacing-md);
		padding-bottom: var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
	}

	.existing-entries h4,
	.add-section h4 {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: var(--spacing-sm);
	}

	.entry-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm);
		background: var(--color-bg);
		border-radius: var(--radius-md);
		margin-bottom: var(--spacing-xs);
	}

	.entry-item:last-child {
		margin-bottom: 0;
	}

	.entry-details {
		flex: 1;
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.entry-dates {
		font-size: var(--font-size-sm);
		font-weight: 500;
	}

	.entry-days {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.remove-btn {
		padding: var(--spacing-xs);
	}

	.status-select-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.status-select-row .select {
		flex: 1;
	}

	.preview-badge {
		flex-shrink: 0;
	}

	.date-range {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.date-range .form-group {
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
		background: var(--color-bg);
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

	.status-badge {
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		font-size: var(--font-size-sm);
		font-weight: 500;
	}
</style>
