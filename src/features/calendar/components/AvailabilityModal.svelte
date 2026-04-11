<script lang="ts">
	import type { Personnel, StatusType, AvailabilityEntry } from '$lib/types';
	import type { DutyEvent } from '$features/duty-roster/duty-roster.types';
	import { formatDate } from '$lib/utils/dates';
	import { toastStore } from '$lib/stores/toast.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import SearchSelect from '$lib/components/ui/SearchSelect.svelte';

	interface Props {
		person: Personnel;
		date: Date;
		statusTypes: StatusType[];
		existingEntries: AvailabilityEntry[];
		onAdd: (data: Omit<AvailabilityEntry, 'id'>) => void;
		onRemove: (id: string) => void;
		onClose: () => void;
		dutyEvents?: DutyEvent[];
		dutyRosterHref?: string;
	}

	let {
		person,
		date,
		statusTypes,
		existingEntries,
		onAdd,
		onRemove,
		onClose,
		dutyEvents = [],
		dutyRosterHref
	}: Props = $props();

	function eventCoversDate(event: DutyEvent, d: string): boolean {
		const startDate = event.coverageStart.slice(0, 10);
		const endDateRaw = event.coverageEnd.slice(0, 10);
		const endTime = event.coverageEnd.slice(11, 19);
		const endDate = endTime === '00:00:00' ? null : endDateRaw;
		if (d < startDate) return false;
		if (!endDate) return d === startDate;
		return d <= endDate;
	}

	function isPersonAssigned(event: DutyEvent): boolean {
		return event.slotInstances.some((slot) => slot.assigneeId === person.id);
	}

	const dateStr = $derived(formatDate(date));
	const dutyEventsForPerson = $derived(dutyEvents.filter((e) => isPersonAssigned(e) && eventCoversDate(e, dateStr)));

	// Local state for the entries list — updated immediately on add/remove to avoid
	// reactive prop propagation timing issues (notably in Firefox)
	let localEntries = $state<AvailabilityEntry[]>([]);

	// Sync local entries when the prop changes (e.g. server replaces temp IDs)
	$effect(() => {
		localEntries = existingEntries.filter(
			(e) => e.personnelId === person.id && dateStr >= e.startDate && dateStr <= e.endDate
		);
	});

	// Form state
	let selectedStatusId = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let editingEntry = $state<AvailabilityEntry | null>(null);
	let note = $state('');

	// Reset form state when props change (e.g. modal reopened with different data)
	$effect(() => {
		selectedStatusId = statusTypes[0]?.id ?? '';
		startDate = dateStr;
		endDate = dateStr;
	});

	const dateDisplay = $derived(
		date.toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		})
	);
	const statusOptions = $derived(statusTypes.map((status) => ({ value: status.id, label: status.name })));

	const dateError = $derived.by(() => {
		if (startDate && endDate && startDate > endDate) {
			return 'End date must be on or after start date';
		}
		return null;
	});

	const dayCount = $derived.by(() => {
		if (!startDate || !endDate || startDate > endDate) return 0;
		const start = new Date(startDate + 'T00:00:00');
		const end = new Date(endDate + 'T00:00:00');
		return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
	});

	function startEdit(entry: AvailabilityEntry) {
		editingEntry = entry;
		selectedStatusId = entry.statusTypeId;
		startDate = entry.startDate;
		endDate = entry.endDate;
		note = entry.note ?? '';
	}

	function cancelEdit() {
		editingEntry = null;
		selectedStatusId = statusTypes[0]?.id ?? '';
		startDate = dateStr;
		endDate = dateStr;
		note = '';
	}

	function handleSubmit() {
		if (!selectedStatusId || !startDate || !endDate || startDate > endDate) return;

		const newData = {
			personnelId: person.id,
			statusTypeId: selectedStatusId,
			startDate,
			endDate,
			note: note.trim() || null
		};

		if (editingEntry) {
			// Remove the old entry from local state immediately
			localEntries = localEntries.filter((e) => e.id !== editingEntry!.id);
			onRemove(editingEntry.id);
			editingEntry = null;
		}

		// Add to local state immediately so the list updates without waiting for prop
		if (dateStr >= newData.startDate && dateStr <= newData.endDate) {
			const tempEntry: AvailabilityEntry = { id: `temp-${crypto.randomUUID()}`, ...newData };
			localEntries = [...localEntries, tempEntry];
		}
		onAdd(newData);

		const statusName = statusTypes.find((s) => s.id === newData.statusTypeId)?.name ?? 'Status';
		const dateLabel =
			newData.startDate === newData.endDate
				? new Date(newData.startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
				: `${new Date(newData.startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${new Date(newData.endDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

		toastStore.success(
			editingEntry ? `${statusName} updated — ${dateLabel}` : `${statusName} added — ${dateLabel}`,
			5000
		);

		// Reset form
		selectedStatusId = statusTypes[0]?.id ?? '';
		startDate = dateStr;
		endDate = dateStr;
		note = '';
	}

	let removeEntryId = $state<string | null>(null);

	function handleRemove(entryId: string) {
		removeEntryId = entryId;
	}

	function doRemove() {
		if (removeEntryId) {
			localEntries = localEntries.filter((e) => e.id !== removeEntryId);
			onRemove(removeEntryId);
			toastStore.success('Status removed');
			removeEntryId = null;
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
		if (entry.startDate === entry.endDate) return startStr;
		return `${startStr} – ${endStr}`;
	}

	function getDayCountForEntry(entry: AvailabilityEntry): number {
		const start = new Date(entry.startDate + 'T00:00:00');
		const end = new Date(entry.endDate + 'T00:00:00');
		return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
	}
</script>

<Modal title="Set Personnel Status" {onClose} width="520px" titleId="availability-title">
	<!-- Person Info -->
	<div class="person-info">
		<div class="person-name">
			<span class="rank">{person.rank}</span>
			<span class="name">{person.lastName}, {person.firstName}</span>
		</div>
		<div class="clicked-date">{dateDisplay}</div>
	</div>

	<!-- Duty Events -->
	{#if dutyEventsForPerson.length > 0}
		<div class="duty-events-section">
			<h4 class="duty-events-heading">On duty</h4>
			{#each dutyEventsForPerson as event (event.id)}
				<div class="duty-event-row">
					{#if dutyRosterHref}
						<a href={dutyRosterHref} class="duty-event-name">{event.templateName}</a>
					{:else}
						<span class="duty-event-name">{event.templateName}</span>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Existing Entries -->
	{#if localEntries.length > 0}
		<div class="existing-entries">
			<h4>Current Status</h4>
			{#each localEntries as entry (entry.id)}
				<div class="entry-item" class:is-editing={editingEntry?.id === entry.id}>
					<Badge
						label={getStatusName(entry.statusTypeId)}
						color={getStatusColor(entry.statusTypeId)}
						textColor={getStatusTextColor(entry.statusTypeId)}
					/>
					<div class="entry-details">
						<span class="entry-dates">{formatEntryDates(entry)}</span>
						<span class="entry-days">
							({getDayCountForEntry(entry)}
							{getDayCountForEntry(entry) === 1 ? 'day' : 'days'})
						</span>
						{#if entry.note}
							<span class="entry-note" title={entry.note}>{entry.note}</span>
						{/if}
					</div>
					{#if !entry.id.startsWith('temp-')}
						<button
							class="btn btn-secondary btn-sm icon-btn"
							onclick={() => startEdit(entry)}
							title="Edit"
							aria-label="Edit status"
						>
							<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
								<path
									d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"
								/>
							</svg>
						</button>
						<button
							class="btn btn-danger btn-sm icon-btn"
							onclick={() => handleRemove(entry.id)}
							title="Remove"
							aria-label="Remove status"
						>
							<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
								<path
									fill-rule="evenodd"
									d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
									clip-rule="evenodd"
								/>
							</svg>
						</button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Add/Edit Form -->
	<div class="add-section">
		{#if editingEntry}
			<h4>Edit Status</h4>
		{:else}
			<h4>{localEntries.length > 0 ? 'Add Another Status' : 'Add Status'}</h4>
		{/if}

		<div class="form-group">
			<label class="label" for="statusType">Status Type <span class="required">*</span></label>
			<div class="status-select-row">
				<SearchSelect
					id="statusType"
					options={statusOptions}
					bind:value={selectedStatusId}
					placeholder="Select status..."
					ariaLabel="Status type"
					clearable={false}
				/>
				{#if selectedStatusId}
					{@const selectedStatus = statusTypes.find((s) => s.id === selectedStatusId)}
					{#if selectedStatus}
						<Badge label={selectedStatus.name} color={selectedStatus.color} textColor={selectedStatus.textColor} />
					{/if}
				{/if}
			</div>
		</div>

		<div class="date-range">
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

		<div class="form-group">
			<label class="label" for="statusNote">Note</label>
			<input
				id="statusNote"
				type="text"
				class="input"
				bind:value={note}
				maxlength={200}
				placeholder="Optional note (e.g., JRTC rotation)"
			/>
		</div>
	</div>

	{#snippet footer()}
		<button class="btn btn-secondary" onclick={editingEntry ? cancelEdit : onClose}>
			{editingEntry ? 'Cancel Edit' : 'Cancel'}
		</button>
		<button class="btn btn-primary" onclick={handleSubmit} disabled={!selectedStatusId || !!dateError}>
			{editingEntry ? 'Update Status' : 'Add Status'}
		</button>
	{/snippet}
</Modal>

{#if removeEntryId}
	<ConfirmDialog
		title="Remove Status"
		message="Remove this status entry?"
		confirmLabel="Remove"
		variant="danger"
		onConfirm={doRemove}
		onCancel={() => (removeEntryId = null)}
	/>
{/if}

<style>
	.person-info {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		padding-bottom: var(--sp-4);
		border-bottom: var(--border-thin);
		margin-bottom: var(--sp-4);
	}

	.person-name {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.person-name .rank {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--amber-dark);
	}

	.person-name .name {
		font-family: var(--font-display);
		font-size: clamp(1.35rem, 1.1rem + 0.6vw, 1.8rem);
		font-weight: var(--font-weight-display);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.clicked-date {
		font-family: var(--font-body);
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.duty-events-section {
		margin-bottom: var(--sp-4);
		padding-bottom: var(--sp-4);
		border-bottom: var(--border-thin);
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.duty-events-heading {
		margin: 0 0 var(--sp-1);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.duty-event-row {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.duty-event-name {
		font-size: var(--text-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text-primary);
		text-decoration: none;
	}

	a.duty-event-name:hover {
		text-decoration: underline;
	}

	.existing-entries {
		margin-bottom: var(--sp-4);
		padding-bottom: var(--sp-4);
		border-bottom: var(--border-thin);
	}

	.existing-entries h4,
	.add-section h4 {
		margin: 0 0 var(--sp-3);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
	}

	.entry-item {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-3);
		background: var(--surface-subtle);
		border-radius: var(--radius-sm);
		margin-bottom: var(--sp-2);
		border: 1px solid transparent;
		transition:
			border-color var(--transition-fast),
			background-color var(--transition-fast);
	}

	.entry-item:last-child {
		margin-bottom: 0;
	}

	.entry-item.is-editing {
		border-color: var(--amber);
		background: var(--amber-light);
	}

	.entry-details {
		flex: 1;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.entry-dates {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.entry-days {
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.icon-btn {
		padding: var(--sp-1);
		flex-shrink: 0;
	}

	.status-select-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.status-select-row :global(.search-select) {
		flex: 1;
		min-width: 180px;
	}

	.date-range {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.date-range .form-group {
		flex: 1;
		margin-bottom: 0;
	}

	.date-arrow {
		color: var(--text-tertiary);
		font-size: 1.1rem;
		padding-top: 32px;
	}

	.day-count {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: var(--sp-2) var(--sp-3);
		background: var(--surface-subtle);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		min-width: 60px;
		margin-top: 28px;
	}

	.day-count-number {
		font-family: var(--font-display);
		font-size: 1.5rem;
		font-weight: var(--font-weight-display);
		color: var(--amber-dark);
		line-height: 1;
	}

	.day-count-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-secondary);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.add-section {
		padding-top: var(--sp-2);
	}

	.entry-note {
		font-family: var(--font-body);
		font-size: var(--text-sm);
		color: var(--text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 180px;
	}
</style>
