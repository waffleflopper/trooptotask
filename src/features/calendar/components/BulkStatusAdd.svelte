<script lang="ts">
	import type { Personnel } from '$features/personnel/contracts';
	import type { StatusType } from '$features/calendar/contracts';
	import { formatDate } from '$lib/utils/dates';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { CalendarStatusBadge } from './calendar-status-badge';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge as UiBadge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { useDataTableSelection } from '$lib/components/ui/data-table';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { validateDateRange } from '$features/calendar/utils/availabilityMutation';
	import BulkStepHeading from './BulkStepHeading.svelte';
	import RosterPicker from './RosterPicker.svelte';

	interface GroupData {
		group: string;
		personnel: Personnel[];
	}

	interface Props {
		personnelByGroup: GroupData[];
		statusTypes: StatusType[];
		/** Applies the status to the given people and resolves with the personnel ids that were inserted. */
		onApply: (
			personnelIds: string[],
			statusTypeId: string,
			startDate: string,
			endDate: string,
			note: string | null
		) => Promise<string[]>;
		onComplete: () => void;
	}

	let { personnelByGroup, statusTypes, onApply, onComplete }: Props = $props();

	const todayStr = formatDate(new Date());
	let selectedStatusId = $state('');
	let startDate = $state(todayStr);
	let endDate = $state(todayStr);
	let isSubmitting = $state(false);
	let note = $state('');
	let step = $state<'select' | 'confirm'>('select');

	const allPersonnel = $derived(personnelByGroup.flatMap((g) => g.personnel));
	const selection = useDataTableSelection<Personnel>({ rows: () => allPersonnel, rowKey: (p) => p.id });

	// ---- Validation ----
	const range = $derived(validateDateRange(startDate, endDate));
	const isValid = $derived(!!selectedStatusId && range.valid && selection.selectedCount > 0);
	const selectedStatus = $derived(statusTypes.find((s) => s.id === selectedStatusId));
	const selectedPersonnel = $derived(
		[...selection.selectedRows].sort(
			(a, b) => (a.groupName || '').localeCompare(b.groupName || '') || a.lastName.localeCompare(b.lastName)
		)
	);

	$effect(() => {
		if (!selectedStatusId && statusTypes.length > 0) {
			selectedStatusId = statusTypes[0].id;
		}
	});

	function formatDateDisplay(dateStr: string): string {
		const date = new Date(dateStr + 'T00:00:00');
		return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
	}

	function handleReview() {
		if (!isValid) return;
		step = 'confirm';
	}

	function handleBack() {
		step = 'select';
	}

	async function handleSubmit() {
		if (!isValid || isSubmitting) return;
		isSubmitting = true;
		try {
			const selected = [...selection.selectedRows];
			const ids = selected.map((p) => p.id);
			const insertedIds = await onApply(ids, selectedStatusId, startDate, endDate, note.trim() || null);
			if (insertedIds.length === 0) {
				toastStore.error('Failed to apply status');
				return;
			}
			if (insertedIds.length < ids.length) {
				const insertedSet = new Set(insertedIds);
				const failed = selected.filter((p) => !insertedSet.has(p.id));
				selection.clear();
				for (const p of failed) selection.toggleRow(p, 0, true);
				toastStore.error(
					`Applied status to ${insertedIds.length} of ${ids.length} people — the ${failed.length} who failed are still selected so you can retry`
				);
			} else {
				toastStore.success(`Applied status to ${insertedIds.length} ${insertedIds.length === 1 ? 'person' : 'people'}`);
				selection.clear();
			}
			step = 'select';
			if (insertedIds.length === ids.length) onComplete();
		} finally {
			isSubmitting = false;
		}
	}
</script>

{#if step === 'select'}
	<div class="grid items-start gap-6 min-[1101px]:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
		<Card.Root class="min-[1101px]:sticky min-[1101px]:top-20">
			<Card.Header>
				<BulkStepHeading
					eyebrow="Step 1"
					title="Define the status change"
					description="Set the status and date range first, then choose who it should apply to."
				/>
			</Card.Header>

			<Card.Content class="grid gap-4">
				<Field.Root>
					<Field.Label for="statusType">Status Type</Field.Label>
					<NativeSelect id="statusType" bind:value={selectedStatusId}>
						{#each statusTypes as status (status.id)}
							<option value={status.id}>{status.name}</option>
						{/each}
					</NativeSelect>
					{#if selectedStatus}
						<div class="flex flex-wrap items-center gap-2">
							<CalendarStatusBadge statusType={selectedStatus}>{selectedStatus.name}</CalendarStatusBadge>
							<span class="text-xs text-muted-foreground">Selected status</span>
						</div>
					{/if}
				</Field.Root>

				<div class="grid items-start gap-4 sm:grid-cols-2">
					<Field.Root>
						<Field.Label for="startDate">Start Date</Field.Label>
						<DatePicker id="startDate" bind:value={startDate} placeholder="Select start date" />
					</Field.Root>

					<Field.Root>
						<Field.Label for="endDate">End Date</Field.Label>
						<DatePicker id="endDate" bind:value={endDate} placeholder="Select end date" />
						{#if range.dayCount > 0}
							<div class="flex items-center gap-2 text-xs">
								<span class="font-semibold text-accent">{range.dayCount}</span>
								<span class="text-muted-foreground">{range.dayCount === 1 ? 'day selected' : 'days selected'}</span>
							</div>
						{/if}
					</Field.Root>
				</div>

				{#if range.error}
					<Alert.Root id="date-error" variant="destructive">
						<Alert.Description>{range.error}</Alert.Description>
					</Alert.Root>
				{/if}

				<Field.Root>
					<Field.Label for="bulkNote">Note</Field.Label>
					<Input
						id="bulkNote"
						type="text"
						bind:value={note}
						maxlength={200}
						placeholder="Optional note (e.g., JRTC rotation)"
					/>
				</Field.Root>

				<div class="flex flex-col gap-2 rounded-md border bg-muted p-4 text-xs" aria-live="polite">
					<h3 class="font-semibold text-muted-foreground">Ready to apply</h3>
					{#if selection.selectedCount > 0 && selectedStatus && range.valid}
						<div class="flex flex-wrap items-center gap-2">
							<CalendarStatusBadge statusType={selectedStatus}>{selectedStatus.name}</CalendarStatusBadge>
							<span>
								<strong>{selection.selectedCount}</strong>
								{selection.selectedCount === 1 ? 'person' : 'people'}
								selected
							</span>
						</div>
						<p>
							{#if startDate === endDate}
								{formatDateDisplay(startDate)}
							{:else}
								{formatDateDisplay(startDate)} to {formatDateDisplay(endDate)}
							{/if}
						</p>
					{:else if selection.selectedCount === 0}
						<p class="text-muted-foreground">Choose at least one person from the list to enable the bulk update.</p>
					{:else if range.error}
						<p class="text-destructive">{range.error}</p>
					{/if}
				</div>

				<Button disabled={!isValid} onclick={handleReview}>Review & Confirm</Button>
			</Card.Content>
		</Card.Root>

		<RosterPicker {personnelByGroup} {selection} />
	</div>
{:else}
	<Card.Root class="mx-auto w-full max-w-[980px]">
		<Card.Header>
			<BulkStepHeading
				eyebrow="Review"
				title="Confirm status change"
				description="Review exactly who will be affected before applying. Nothing changes until you confirm."
			/>
		</Card.Header>

		<Card.Content class="grid gap-4">
			<div class="flex flex-wrap items-center gap-2">
				{#if selectedStatus}
					<CalendarStatusBadge statusType={selectedStatus}>{selectedStatus.name}</CalendarStatusBadge>
				{/if}
				<UiBadge variant="outline"
					>{selection.selectedCount} {selection.selectedCount === 1 ? 'person' : 'people'}</UiBadge
				>
				<UiBadge variant="outline">
					{startDate === endDate
						? formatDateDisplay(startDate)
						: `${formatDateDisplay(startDate)} to ${formatDateDisplay(endDate)}`}
				</UiBadge>
				{#if note.trim()}
					<UiBadge variant="outline">Note: {note.trim()}</UiBadge>
				{/if}
			</div>
			<ul class="max-h-80 divide-y overflow-y-auto rounded-md border text-xs">
				{#each selectedPersonnel as person (person.id)}
					<li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
						<span class="font-semibold text-accent">{person.rank}</span>
						<span class="flex-1 font-medium">{person.lastName}, {person.firstName}</span>
						{#if person.groupName}
							<span class="font-mono uppercase tracking-wider text-muted-foreground">{person.groupName}</span>
						{/if}
					</li>
				{/each}
			</ul>
		</Card.Content>

		<Card.Footer class="justify-between">
			<Button variant="outline" onclick={handleBack} disabled={isSubmitting}>Back</Button>
			<Button disabled={isSubmitting} onclick={handleSubmit}>
				{#if isSubmitting}
					<Spinner />
					Applying...
				{:else}
					Confirm Apply
				{/if}
			</Button>
		</Card.Footer>
	</Card.Root>
{/if}
