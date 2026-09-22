<script lang="ts">
	import type { Personnel, StatusType, AvailabilityEntry } from '$lib/types';
	import { formatDate } from '$lib/utils/dates';
	import { toastStore } from '$lib/stores/toast.svelte';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { CalendarStatusBadge } from '$lib/components/ui/calendar-status-badge';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
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
	}

	let { person, date, statusTypes, existingEntries, onAdd, onRemove, onClose }: Props = $props();

	const dateStr = $derived(formatDate(date));

	// Local state for the entries list — updated immediately on add/remove to avoid
	// reactive prop propagation timing issues (notably in Firefox)
	let localEntries = $derived(
		existingEntries.filter((e) => e.personnelId === person.id && dateStr >= e.startDate && dateStr <= e.endDate)
	);

	function initialStatusId(): string {
		return statusTypes[0]?.id ?? '';
	}

	function initialDateStr(): string {
		return formatDate(date);
	}

	// Form state
	let selectedStatusId = $state(initialStatusId());
	let startDate = $state(initialDateStr());
	let endDate = $state(initialDateStr());
	let editingEntry = $state<AvailabilityEntry | null>(null);
	let note = $state('');

	const dateDisplay = $derived(
		date.toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		})
	);
	const selectedStatus = $derived(statusTypes.find((s) => s.id === selectedStatusId));

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

	function getStatusType(statusId: string): StatusType | undefined {
		return statusTypes.find((s) => s.id === statusId);
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

<AppDialog.Root open {onClose}>
	<AppDialog.Content>
		<AppDialog.Header>
			<AppDialog.Title id="availability-title">Set Personnel Status</AppDialog.Title>
			<AppDialog.Description>
				{person.rank}
				{person.lastName}, {person.firstName} · {dateDisplay}
			</AppDialog.Description>
		</AppDialog.Header>

		<AppDialog.Body class="space-y-4">
			{#if localEntries.length > 0}
				<div class="border-b pb-4">
					<h4 class="mb-3 text-sm font-medium">Current Status</h4>
					{#each localEntries as entry (entry.id)}
						{@const entryStatus = getStatusType(entry.statusTypeId)}
						<div
							class={[
								'mb-2 flex items-center gap-3 rounded-lg border p-2.5 transition-colors last:mb-0',
								editingEntry?.id === entry.id ? 'border-ring bg-muted/60' : 'border-border bg-muted/30'
							]}
						>
							{#if entryStatus}
								<CalendarStatusBadge statusType={entryStatus}>{entryStatus.name}</CalendarStatusBadge>
							{:else}
								<Badge variant="outline">Unknown</Badge>
							{/if}
							<div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
								<span class="text-sm font-medium">{formatEntryDates(entry)}</span>
								<span class="text-muted-foreground text-sm">
									({getDayCountForEntry(entry)}
									{getDayCountForEntry(entry) === 1 ? 'day' : 'days'})
								</span>
								{#if entry.note}
									<span class="text-muted-foreground max-w-[180px] truncate text-sm" title={entry.note}
										>{entry.note}</span
									>
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
					<h4 class="text-sm font-medium">Edit Status</h4>
				{:else}
					<h4 class="text-sm font-medium">
						{localEntries.length > 0 ? 'Add Another Status' : 'Add Status'}
					</h4>
				{/if}

				<Field.Root>
					<Field.Label id="statusType-label">Status Type <span class="text-destructive">*</span></Field.Label>
					<div class="flex flex-wrap items-center gap-2">
						<Select.Root type="single" bind:value={selectedStatusId}>
							<Select.Trigger id="statusType" aria-labelledby="statusType-label" class="min-w-[180px] flex-1">
								{selectedStatus?.name ?? 'Select status...'}
							</Select.Trigger>
							<Select.Content>
								{#each statusTypes as status (status.id)}
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

				<Field.Root>
					<Field.Label for="statusNote">Note</Field.Label>
					<Input
						id="statusNote"
						type="text"
						bind:value={note}
						maxlength={200}
						placeholder="Optional note (e.g., JRTC rotation)"
					/>
				</Field.Root>
			</div>
		</AppDialog.Body>

		<AppDialog.Footer>
			<Button variant="outline" onclick={editingEntry ? cancelEdit : onClose}>
				{editingEntry ? 'Cancel Edit' : 'Cancel'}
			</Button>
			<Button onclick={handleSubmit} disabled={!selectedStatusId || !!dateError}>
				{editingEntry ? 'Update Status' : 'Add Status'}
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

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
