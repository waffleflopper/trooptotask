<script lang="ts">
	import { untrack } from 'svelte';
	import type { StatusType, AvailabilityEntry } from '$features/calendar/contracts';
	import type { AvailabilityEditorRequest } from '$features/calendar/contexts/CalendarPageContext.svelte';
	import type { AvailabilityOutcome } from '$features/calendar/availabilitySave';
	import { validateDateRange, type AvailabilityChange } from '$features/calendar/utils/availabilityMutation';
	import { parseDate } from '$lib/utils/dates';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { CalendarStatusBadge } from './calendar-status-badge';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';

	interface Props {
		request: AvailabilityEditorRequest;
		statusTypes: StatusType[];
		existingEntries: AvailabilityEntry[];
		saving: boolean;
		onSave: (change: AvailabilityChange) => Promise<AvailabilityOutcome>;
		onClose: () => void;
	}

	let { request, statusTypes, existingEntries, saving, onSave, onClose }: Props = $props();

	const person = $derived(request.person);
	const dateStr = $derived(request.kind === 'create' ? request.startDate : request.entry.startDate);
	const dayEntries = $derived(
		existingEntries.filter((e) => e.personnelId === person.id && dateStr >= e.startDate && dateStr <= e.endDate)
	);

	let selectedStatusId = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let editingEntry = $state<AvailabilityEntry | null>(null);
	let note = $state('');
	let uncertain = $state(false);

	function resetForm() {
		editingEntry = null;
		selectedStatusId = statusTypes[0]?.id || '';
		startDate = request.kind === 'create' ? request.startDate : dateStr;
		endDate = request.kind === 'create' ? request.endDate : dateStr;
		note = '';
	}

	function startEdit(entry: AvailabilityEntry) {
		editingEntry = entry;
		selectedStatusId = entry.statusTypeId;
		startDate = entry.startDate;
		endDate = entry.endDate;
		note = entry.note ?? '';
	}

	untrack(() => (request.kind === 'edit' ? startEdit(request.entry) : resetForm()));

	const dateDisplay = $derived(
		parseDate(dateStr).toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		})
	);
	const selectedStatus = $derived(statusTypes.find((s) => s.id === selectedStatusId));
	const range = $derived(validateDateRange(startDate, endDate));
	const dateError = $derived(startDate && endDate ? range.error : null);

	function settle(outcome: AvailabilityOutcome) {
		if (outcome === 'saved') resetForm();
		else if (outcome === 'unconfirmed' || outcome === 'stale') uncertain = true;
	}

	async function handleSubmit() {
		if (saving || uncertain || !selectedStatusId || !range.valid) return;
		const values = { statusTypeId: selectedStatusId, startDate, endDate, note: note.trim() || null };
		settle(
			await onSave(
				editingEntry
					? { kind: 'update', entry: editingEntry, changes: values }
					: { kind: 'create', record: { personnelId: person.id, ...values } }
			)
		);
	}

	let removeEntry = $state<AvailabilityEntry | null>(null);

	async function doRemove() {
		const entry = removeEntry;
		removeEntry = null;
		if (!entry || saving || uncertain) return;
		settle(await onSave({ kind: 'remove', entry }));
	}

	function getStatusType(statusId: string): StatusType | undefined {
		return statusTypes.find((s) => s.id === statusId);
	}

	function formatEntryDates(entry: AvailabilityEntry): string {
		const format = (date: string) => parseDate(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
		if (entry.startDate === entry.endDate) return format(entry.startDate);
		return `${format(entry.startDate)} – ${format(entry.endDate)}`;
	}
</script>

<AppDialog.Root open busy={saving} {onClose}>
	<AppDialog.Content showCloseButton={!uncertain}>
		<AppDialog.Header>
			<AppDialog.Title id="availability-title">Set Personnel Status</AppDialog.Title>
			<AppDialog.Description>
				{person.rank}
				{person.lastName}, {person.firstName} · {dateDisplay}
			</AppDialog.Description>
		</AppDialog.Header>

		<AppDialog.Body class="space-y-4">
			{#if uncertain}
				<p role="alert" class="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
					Saved status could not be confirmed. Reload the calendar before making another change.
				</p>
			{/if}
			{#if !uncertain && dayEntries.length > 0}
				<div class="border-b pb-4">
					<h4 class="mb-3 text-sm font-medium">Current Status</h4>
					{#each dayEntries as entry (entry.id)}
						{@const entryStatus = getStatusType(entry.statusTypeId)}
						{@const days = validateDateRange(entry.startDate, entry.endDate).dayCount}
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
								<span class="text-muted-foreground text-sm">({days} {days === 1 ? 'day' : 'days'})</span>
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
									disabled={saving || uncertain}
								>
									<PencilIcon />
								</Button>
								<Button
									variant="destructive"
									size="icon-sm"
									onclick={() => (removeEntry = entry)}
									title="Remove"
									aria-label="Remove status"
									disabled={saving || uncertain}
								>
									<Trash2Icon />
								</Button>
							{/if}
						</div>
					{/each}
				</div>
			{/if}

			<fieldset class="grid min-w-0 gap-4 pt-1" disabled={saving}>
				{#if editingEntry}
					<h4 class="text-sm font-medium">Edit Status</h4>
				{:else}
					<h4 class="text-sm font-medium">
						{dayEntries.length > 0 ? 'Add Another Status' : 'Add Status'}
					</h4>
				{/if}

				<Field.Root>
					<Field.Label id="statusType-label"
						>Status Type <span class="text-destructive" aria-hidden="true">*</span></Field.Label
					>
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
					{#if range.valid}
						<div
							class="bg-muted/30 mt-0 flex min-w-14 flex-row items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5 sm:mt-6 sm:flex-col sm:gap-0"
						>
							<span class="text-foreground text-base leading-none font-semibold">{range.dayCount}</span>
							<span class="text-muted-foreground text-xs">{range.dayCount === 1 ? 'day' : 'days'}</span>
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
			</fieldset>
		</AppDialog.Body>

		<AppDialog.Footer>
			<Button variant="outline" onclick={uncertain ? onClose : editingEntry ? resetForm : onClose} disabled={saving}>
				{uncertain ? 'Close' : editingEntry ? 'Cancel Edit' : 'Cancel'}
			</Button>
			<Button onclick={handleSubmit} disabled={saving || uncertain || !selectedStatusId || !range.valid}>
				{editingEntry ? 'Update Status' : 'Add Status'}
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

{#if removeEntry}
	<ConfirmDialog
		title="Remove Status"
		message="Remove this status entry?"
		confirmLabel="Remove"
		onConfirm={doRemove}
		onCancel={() => (removeEntry = null)}
	/>
{/if}
