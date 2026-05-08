<script lang="ts">
	import type { Personnel, StatusType, AvailabilityEntry } from '$lib/types';
	import type { DutyEvent } from '$features/duty-roster/duty-roster.types';
	import { formatDate } from '$lib/utils/dates';
	import { toastStore } from '$lib/stores/toast.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import SearchSelect from '$lib/components/ui/SearchSelect.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';

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
	let localEntries = $derived(
		existingEntries.filter((e) => e.personnelId === person.id && dateStr >= e.startDate && dateStr <= e.endDate)
	);

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
		const wasEditing = !!editingEntry;

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
			wasEditing ? `${statusName} updated — ${dateLabel}` : `${statusName} added — ${dateLabel}`,
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
	<div class="mb-4 flex flex-col gap-2 border-b pb-4">
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-primary font-mono text-xs font-semibold tracking-wide uppercase">{person.rank}</span>
			<span class="font-display text-xl font-bold tracking-wide uppercase">{person.lastName}, {person.firstName}</span>
		</div>
		<div class="text-muted-foreground text-sm">{dateDisplay}</div>
	</div>

	{#if dutyEventsForPerson.length > 0}
		<div class="mb-4 flex flex-col gap-2 border-b pb-4">
			<h4 class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">On duty</h4>
			{#each dutyEventsForPerson as event (event.id)}
				<div class="flex items-center gap-2">
					{#if dutyRosterHref}
						<a href={dutyRosterHref} class="text-sm font-medium hover:underline">{event.templateName}</a>
					{:else}
						<span class="text-sm font-medium">{event.templateName}</span>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	{#if localEntries.length > 0}
		<div class="mb-4 border-b pb-4">
			<h4 class="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">Current Status</h4>
			{#each localEntries as entry (entry.id)}
				<div
					class={[
						'mb-2 flex items-center gap-3 rounded-lg border p-3 transition-colors last:mb-0',
						editingEntry?.id === entry.id ? 'border-ring bg-muted' : 'border-transparent bg-muted/40'
					]}
				>
					<Badge
						label={getStatusName(entry.statusTypeId)}
						color={getStatusColor(entry.statusTypeId)}
						textColor={getStatusTextColor(entry.statusTypeId)}
					/>
					<div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
						<span class="font-mono text-xs font-semibold tracking-wide uppercase">{formatEntryDates(entry)}</span>
						<span class="text-muted-foreground text-sm">
							({getDayCountForEntry(entry)}
							{getDayCountForEntry(entry) === 1 ? 'day' : 'days'})
						</span>
						{#if entry.note}
							<span class="text-muted-foreground max-w-[180px] truncate text-sm" title={entry.note}>{entry.note}</span>
						{/if}
					</div>
					{#if !entry.id.startsWith('temp-')}
						<Button
							variant="outline"
							size="icon-sm"
							onclick={() => startEdit(entry)}
							title="Edit"
							aria-label="Edit status"
						>
							<PencilIcon />
						</Button>
						<Button
							variant="destructive"
							size="icon-sm"
							onclick={() => handleRemove(entry.id)}
							title="Remove"
							aria-label="Remove status"
						>
							<Trash2Icon />
						</Button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<div class="grid gap-4 pt-1">
		{#if editingEntry}
			<h4 class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Edit Status</h4>
		{:else}
			<h4 class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
				{localEntries.length > 0 ? 'Add Another Status' : 'Add Status'}
			</h4>
		{/if}

		<div class="grid gap-2">
			<label class="text-sm font-medium" for="statusType">Status Type <span class="text-destructive">*</span></label>
			<div class="flex flex-wrap items-center gap-2 [&_.search-select]:min-w-[180px] [&_.search-select]:flex-1">
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
					class="bg-card mt-0 flex min-w-14 flex-row items-center justify-center gap-1 rounded-lg border px-3 py-2 sm:mt-6 sm:flex-col sm:gap-0"
				>
					<span class="text-primary font-display text-xl leading-none font-bold">{dayCount}</span>
					<span class="text-muted-foreground font-mono text-xs tracking-wide uppercase"
						>{dayCount === 1 ? 'day' : 'days'}</span
					>
				</div>
			{/if}
		</div>

		{#if dateError}
			<div class="form-error">{dateError}</div>
		{/if}

		<div class="grid gap-2">
			<label class="text-sm font-medium" for="statusNote">Note</label>
			<Input
				id="statusNote"
				type="text"
				bind:value={note}
				maxlength={200}
				placeholder="Optional note (e.g., JRTC rotation)"
			/>
		</div>
	</div>

	{#snippet footer()}
		<Button variant="outline" onclick={editingEntry ? cancelEdit : onClose}>
			{editingEntry ? 'Cancel Edit' : 'Cancel'}
		</Button>
		<Button onclick={handleSubmit} disabled={!selectedStatusId || !!dateError}>
			{editingEntry ? 'Update Status' : 'Add Status'}
		</Button>
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
