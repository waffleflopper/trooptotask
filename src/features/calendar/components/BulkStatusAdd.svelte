<script lang="ts">
	import type { Personnel } from '$features/personnel/contracts';
	import type { AvailabilityEntry, StatusType } from '$features/calendar/contracts';
	import { formatDate } from '$lib/utils/dates';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { rejectedRequestMessage } from '$lib/stores/core';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { useDataTableSelection } from '$lib/components/ui/data-table';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { CalendarRangeCoordinator } from '$features/calendar/contexts/CalendarRangeCoordinator.svelte';
	import { classifyBulkAddOverlaps, validateDateRange } from '$features/calendar/utils/availabilityMutation';
	import { layoutBars, shortRangeLabel, type AvailabilitySpan } from '$features/calendar/utils/barLayout';
	import { projectBulkRosterAvailability } from '$features/calendar/utils/bulkRosterAvailability';
	import { dayWindow, toDayNumber } from '$features/calendar/utils/dayNumber';
	import StatusBar from './calendar-bars/StatusBar.svelte';
	import BulkStepHeading from './BulkStepHeading.svelte';
	import RosterPicker from './RosterPicker.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	interface GroupData {
		group: string;
		personnel: Personnel[];
	}

	interface Props {
		personnelByGroup: GroupData[];
		statusTypes: StatusType[];
		availabilityEntries: readonly AvailabilityEntry[];
		orgId: string;
		/** Reads the entries that overlap the chosen dates into the availability store. */
		rangeCoordinator: CalendarRangeCoordinator;
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

	let { personnelByGroup, statusTypes, availabilityEntries, orgId, rangeCoordinator, onApply, onComplete }: Props =
		$props();

	const todayStr = formatDate(new Date());
	let statusSelection = $state('');
	let startDate = $state(todayStr);
	let endDate = $state(todayStr);
	let note = $state('');
	let isSubmitting = $state(false);

	const allPersonnel = $derived(personnelByGroup.flatMap((g) => g.personnel));
	const selection = useDataTableSelection<Personnel>({ rows: () => allPersonnel, rowKey: (p) => p.id });

	const statusId = $derived(
		statusTypes.some((s) => s.id === statusSelection) ? statusSelection : (statusTypes[0]?.id ?? '')
	);
	const selectedStatus = $derived(statusTypes.find((s) => s.id === statusId));
	const range = $derived(validateDateRange(startDate, endDate));
	const readRange = $derived(range.valid ? { rangeStart: startDate, rangeEnd: endDate } : null);

	$effect(() => {
		void rangeCoordinator.retryToken;
		if (readRange) void rangeCoordinator.ensureRange(orgId, readRange);
	});
	const readStatus = $derived(readRange ? rangeCoordinator.status(readRange) : null);

	const overlaps = $derived(
		readRange && statusId
			? classifyBulkAddOverlaps({ entries: availabilityEntries, statusTypeId: statusId, range: readRange })
			: new Map()
	);
	const availability = $derived(projectBulkRosterAvailability({ overlaps, statusTypes, range: readRange }));

	// A selected person who becomes blocked stays selected but is never part of the batch.
	const batch = $derived(selection.selectedRows.filter((p) => overlaps.get(p.id)?.kind !== 'already-on-status'));
	const overlapping = $derived(batch.filter((p) => overlaps.get(p.id)?.kind === 'overlap'));
	const overlappedStatusNames = $derived.by(() => {
		const names = new SvelteSet<string>();
		for (const person of overlapping) {
			for (const entry of overlaps.get(person.id)?.otherStatus ?? []) {
				names.add(statusTypes.find((s) => s.id === entry.statusTypeId)?.name ?? 'Unavailable');
			}
		}
		return [...names].join(', ');
	});
	const canSave = $derived(!!selectedStatus && readStatus === 'ready' && batch.length > 0 && !isSubmitting);

	const preview = $derived.by(() => {
		if (!readRange || !selectedStatus) return null;
		const start = toDayNumber(startDate);
		const end = toDayNumber(endDate);
		const entry: AvailabilityEntry = {
			id: 'preview',
			personnelId: '',
			statusTypeId: selectedStatus.id,
			startDate,
			endDate,
			note: note.trim() || null
		};
		const span: AvailabilitySpan = { entry, status: selectedStatus, start, end };
		const { bars } = layoutBars([span], dayWindow(startDate, end - start + 1), { view: 'month', showStatusText: true });
		return bars[0] ?? null;
	});
	const datesLabel = $derived(
		range.valid ? shortRangeLabel(toDayNumber(startDate), toDayNumber(endDate)) : (range.error ?? '')
	);

	async function handleSubmit() {
		if (!canSave) return;
		isSubmitting = true;
		try {
			const people = batch;
			const ids = people.map((p) => p.id);
			const insertedIds = await onApply(ids, statusId, startDate, endDate, note.trim() || null);
			if (insertedIds.length === 0) {
				toastStore.error('Failed to apply status');
				return;
			}
			if (insertedIds.length < ids.length) {
				const insertedSet = new Set(insertedIds);
				const failed = people.filter((p) => !insertedSet.has(p.id));
				selection.clear();
				for (const p of failed) selection.toggleRow(p, 0, true);
				toastStore.error(
					`Applied status to ${insertedIds.length} of ${ids.length} people — the ${failed.length} who failed are still selected so you can retry`
				);
			} else {
				toastStore.success(`Applied status to ${insertedIds.length} ${insertedIds.length === 1 ? 'person' : 'people'}`);
				selection.clear();
				onComplete();
			}
		} catch (error) {
			toastStore.error(rejectedRequestMessage(error, 'Failed to apply status'));
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div class="grid items-start gap-6 min-[1101px]:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
	<Card.Root class="min-[1101px]:sticky min-[1101px]:top-20">
		<Card.Header>
			<BulkStepHeading eyebrow="Step 1" title="What and when" />
		</Card.Header>

		<Card.Content class="grid gap-4">
			<Field.Root>
				<Field.Title id="bulk-add-status">Status</Field.Title>
				<ToggleGroup.Root
					type="single"
					variant="outline"
					class="flex-wrap gap-2 bg-transparent p-0"
					aria-labelledby="bulk-add-status"
					bind:value={
						() => statusId,
						(value) => {
							if (value) statusSelection = value;
						}
					}
				>
					{#each statusTypes as status (status.id)}
						<ToggleGroup.Item value={status.id}>
							<span class="size-2.5 rounded-sm" style:background-color={status.color} aria-hidden="true"></span>
							{status.name}
						</ToggleGroup.Item>
					{/each}
				</ToggleGroup.Root>
			</Field.Root>

			<div class="grid gap-2">
				<div class="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
					<Field.Root>
						<Field.Label for="startDate">Start Date</Field.Label>
						<DatePicker id="startDate" bind:value={startDate} placeholder="Select start date" />
					</Field.Root>
					<ArrowRight class="mb-2.5 size-4 text-muted-foreground" aria-hidden="true" />
					<Field.Root>
						<Field.Label for="endDate">End Date</Field.Label>
						<DatePicker id="endDate" bind:value={endDate} placeholder="Select end date" />
					</Field.Root>
				</div>
				{#if range.dayCount > 0}
					<p class="text-xs text-muted-foreground">
						<span class="font-semibold text-accent-text">{range.dayCount}</span>
						{range.dayCount === 1 ? 'day' : 'days'}
					</p>
				{/if}
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

			<div class="grid gap-1.5">
				<p class="font-mono text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Preview</p>
				<div class="rounded-md bg-muted p-3">
					{#if preview}
						<StatusBar class="w-fit max-w-full" status={preview.status} label={preview.label} />
					{:else}
						<p class="text-xs text-muted-foreground">Choose a status and valid dates to preview the bar.</p>
					{/if}
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	<div class="grid min-w-0 gap-4">
		{#if readStatus === 'error'}
			<Alert.Root variant="destructive">
				<Alert.Description class="flex flex-wrap items-center justify-between gap-2">
					<span>Could not read the existing entries for these dates, so overlaps are unknown.</span>
					<Button type="button" variant="outline" size="sm" onclick={() => rangeCoordinator.retryFailedRange()}>
						Retry
					</Button>
				</Alert.Description>
			</Alert.Root>
		{/if}
		<RosterPicker {personnelByGroup} {selection} {availability} />
	</div>
</div>

<section
	aria-label="Bulk add summary"
	class="sticky bottom-4 mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card p-3 shadow-md"
>
	<p class="mr-auto flex min-w-0 flex-wrap items-center gap-2 text-sm" aria-live="polite">
		{#if selectedStatus}
			<span class="size-3 rounded-sm" style:background-color={selectedStatus.color} aria-hidden="true"></span>
			<span>
				Add <strong>{selectedStatus.name}</strong> to {batch.length}
				{batch.length === 1 ? 'person' : 'people'} · {datesLabel}
			</span>
		{:else}
			<span class="text-muted-foreground">No status types are configured.</span>
		{/if}
	</p>
	{#if overlapping.length > 0}
		<p class="flex items-center gap-1.5 text-xs text-warning-foreground">
			<TriangleAlert class="size-3.5" aria-hidden="true" />
			{overlapping.length} overlaps existing {overlappedStatusNames}
		</p>
	{/if}
	{#if readStatus === 'loading'}
		<p class="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
			<Spinner class="size-3.5" />
			Checking existing entries…
		</p>
	{/if}
	<Button type="button" variant="outline" disabled={isSubmitting} onclick={() => selection.clear()}>Clear</Button>
	<Button type="button" disabled={!canSave} onclick={handleSubmit}>
		{#if isSubmitting}
			<Spinner />
			Applying...
		{:else}
			Add to {batch.length}
			{batch.length === 1 ? 'person' : 'people'}
		{/if}
	</Button>
</section>
