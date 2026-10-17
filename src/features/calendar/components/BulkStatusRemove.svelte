<script lang="ts">
	import type { Personnel } from '$features/personnel/contracts';
	import type { StatusType, AvailabilityEntry } from '$features/calendar/contracts';
	import { formatDate } from '$lib/utils/dates';
	import { toastStore } from '$lib/stores/toast.svelte';
	import type { BatchRemovalOutcome } from '$lib/stores/core';
	import { CalendarStatusBadge } from './calendar-status-badge';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge as UiBadge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { useDataTableSelection } from '$lib/components/ui/data-table';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { SvelteMap } from 'svelte/reactivity';
	import {
		classifyAvailabilityOverlaps,
		validateDateRange,
		type ClassifiedOverlaps
	} from '$features/calendar/utils/availabilityMutation';
	import { MAX_CALENDAR_RANGE_DAYS } from '$features/calendar/utils/calendarRange';
	import BulkStepHeading from './BulkStepHeading.svelte';
	import RosterPicker from './RosterPicker.svelte';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	interface GroupData {
		group: string;
		personnel: Personnel[];
	}

	interface ReviewCriteria {
		personnelIds: Set<string>;
		selectedCount: number;
		statusTypeId: string;
		startDate: string;
		endDate: string;
	}

	interface Props {
		personnelByGroup: GroupData[];
		statusTypes: StatusType[];
		availabilityEntries: AvailabilityEntry[];
		personnelList: Personnel[];
		loadAvailabilityRange?: (range: { rangeStart: string; rangeEnd: string }) => Promise<AvailabilityEntry[]>;
		onRemove: (ids: string[]) => Promise<BatchRemovalOutcome>;
		onComplete: () => void;
	}

	let {
		personnelByGroup,
		statusTypes,
		availabilityEntries,
		personnelList,
		loadAvailabilityRange = async () => availabilityEntries,
		onRemove,
		onComplete
	}: Props = $props();

	const todayStr = formatDate(new Date());

	// Selection state
	let selectedStatusSelection = $state('');
	let startDate = $state(todayStr);
	let endDate = $state(todayStr);

	// Step state
	let step = $state<'select' | 'confirm'>('select');
	let matchResult = $state<ClassifiedOverlaps>({ exact: [], partial: [] });
	let reviewCriteria = $state<ReviewCriteria | null>(null);
	let isLoadingMatches = $state(false);
	let matchLoadError = $state<string | null>(null);
	let isSubmitting = $state(false);
	let entriesInReview = $state(0);
	let removedAcrossRetries = $state(0);

	const allPersonnel = $derived(personnelByGroup.flatMap((g) => g.personnel));
	const selection = useDataTableSelection<Personnel>({ rows: () => allPersonnel, rowKey: (p) => p.id });

	// ---- Validation ----
	const range = $derived.by(() => {
		const validated = validateDateRange(startDate, endDate);
		if (validated.valid && validated.dayCount > MAX_CALENDAR_RANGE_DAYS) {
			return {
				valid: false,
				dayCount: validated.dayCount,
				error: `Remove date range cannot exceed ${MAX_CALENDAR_RANGE_DAYS} days`
			};
		}
		return validated;
	});
	const selectedStatusId = $derived.by(() => {
		if (statusTypes.some((s) => s.id === selectedStatusSelection)) return selectedStatusSelection;
		return statusTypes[0]?.id ?? '';
	});
	const isValid = $derived(!!selectedStatusId && range.valid && selection.selectedCount > 0);
	const selectedStatus = $derived(statusTypes.find((s) => s.id === selectedStatusId));
	const reviewStatus = $derived(statusTypes.find((s) => s.id === reviewCriteria?.statusTypeId));
	const personnelMap = $derived(new SvelteMap(personnelList.map((p) => [p.id, p])));

	function formatDateDisplay(dateStr: string): string {
		const date = new Date(dateStr + 'T00:00:00');
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function handleStatusTypeChange(event: Event) {
		if (event.currentTarget instanceof HTMLSelectElement) {
			selectedStatusSelection = event.currentTarget.value;
		}
	}

	// ---- Two-step flow ----
	async function handleFindMatching() {
		if (!isValid || isLoadingMatches) return;

		const criteria: ReviewCriteria = {
			personnelIds: new Set(Array.from(selection.selectedKeys, (id) => String(id))),
			selectedCount: selection.selectedCount,
			statusTypeId: selectedStatusId,
			startDate,
			endDate
		};

		isLoadingMatches = true;
		matchLoadError = null;
		try {
			const loadedEntries = await loadAvailabilityRange({
				rangeStart: criteria.startDate,
				rangeEnd: criteria.endDate
			});
			matchResult = classifyAvailabilityOverlaps(loadedEntries, {
				personnelIds: criteria.personnelIds,
				statusTypeId: criteria.statusTypeId,
				startDate: criteria.startDate,
				endDate: criteria.endDate
			});
			reviewCriteria = criteria;
			entriesInReview = matchResult.exact.length + matchResult.partial.length;
			removedAcrossRetries = 0;
			step = 'confirm';
		} catch {
			matchLoadError = 'Unable to load status entries for the selected date range. Try again.';
		} finally {
			isLoadingMatches = false;
		}
	}

	function handleBack() {
		step = 'select';
		matchResult = { exact: [], partial: [] };
		reviewCriteria = null;
		matchLoadError = null;
	}

	async function handleConfirmRemoval() {
		if (isSubmitting) return;
		const allIds = [...matchResult.exact.map((e) => e.id), ...matchResult.partial.map((e) => e.id)];
		if (allIds.length === 0) return;

		isSubmitting = true;
		try {
			const outcome = await onRemove(allIds);
			if (outcome.kind === 'removed') {
				const deleted = removedAcrossRetries + outcome.deleted;
				const alreadyGone = entriesInReview - deleted;
				toastStore.success(
					`Removed ${deleted} status ${deleted === 1 ? 'entry' : 'entries'}` +
						(alreadyGone > 0 ? `; ${alreadyGone} ${alreadyGone === 1 ? 'was' : 'were'} already gone` : '')
				);
				onComplete();
			} else if (outcome.kind === 'partial') {
				const completed = new Set(outcome.completedIds);
				matchResult = {
					exact: matchResult.exact.filter((e) => !completed.has(e.id)),
					partial: matchResult.partial.filter((e) => !completed.has(e.id))
				};
				removedAcrossRetries += outcome.deleted;
				const remaining = allIds.length - completed.size;
				toastStore.error(
					`Removed ${removedAcrossRetries} of ${entriesInReview} status entries — ${remaining} ${remaining === 1 ? 'remains' : 'remain'}; confirm again to retry`
				);
			} else {
				toastStore.error('Failed to remove status entries');
			}
		} finally {
			isSubmitting = false;
		}
	}

	function getPersonName(personnelId: string): string {
		const p = personnelMap.get(personnelId);
		return p ? `${p.rank} ${p.lastName}, ${p.firstName}` : 'Unknown';
	}
</script>

{#if step === 'select'}
	<div class="grid items-start gap-6 min-[1101px]:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
		<Card.Root class="min-[1101px]:sticky min-[1101px]:top-20">
			<Card.Header>
				<BulkStepHeading
					eyebrow="Step 1"
					title="Define what to remove"
					description="Pick the status, date range, and people first. We will show you every matching entry before anything is deleted."
				/>
			</Card.Header>

			<Card.Content class="grid gap-4">
				<Field.Root>
					<Field.Label for="removeStatusType">Status Type</Field.Label>
					<NativeSelect id="removeStatusType" value={selectedStatusId} onchange={handleStatusTypeChange}>
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
						<Field.Label for="removeStartDate">Start Date</Field.Label>
						<DatePicker id="removeStartDate" bind:value={startDate} placeholder="Select start date" />
					</Field.Root>

					<Field.Root>
						<Field.Label for="removeEndDate">End Date</Field.Label>
						<DatePicker id="removeEndDate" bind:value={endDate} placeholder="Select end date" />
						{#if range.dayCount > 0}
							<div class="flex items-center gap-2 text-xs">
								<span class="font-semibold text-accent-text">{range.dayCount}</span>
								<span class="text-muted-foreground">{range.dayCount === 1 ? 'day selected' : 'days selected'}</span>
							</div>
						{/if}
					</Field.Root>
				</div>

				{#if range.error}
					<Alert.Root variant="destructive">
						<Alert.Description>{range.error}</Alert.Description>
					</Alert.Root>
				{/if}

				{#if matchLoadError}
					<Alert.Root variant="destructive">
						<Alert.Description>{matchLoadError}</Alert.Description>
					</Alert.Root>
				{/if}

				<div
					class="flex flex-col gap-2 rounded-md border border-warning/30 bg-warning-muted/60 p-4 text-xs"
					aria-live="polite"
				>
					<h3 class="font-semibold text-muted-foreground">Removal summary</h3>
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
						<p class="text-muted-foreground">
							Overlapping entries are removed in full, so the review step is especially important.
						</p>
					{:else if selection.selectedCount === 0}
						<p class="text-muted-foreground">Choose at least one person from the list to review possible removals.</p>
					{:else if range.error}
						<p class="text-destructive">{range.error}</p>
					{/if}
				</div>

				<Button variant="destructive" disabled={!isValid || isLoadingMatches} onclick={handleFindMatching}>
					{#if isLoadingMatches}
						<Spinner />
						Loading entries...
					{:else}
						Review Matching Entries
					{/if}
				</Button>
			</Card.Content>
		</Card.Root>

		<RosterPicker {personnelByGroup} {selection} tone="destructive" />
	</div>
{:else}
	<Card.Root class="mx-auto w-full max-w-[980px]">
		<Card.Header>
			<BulkStepHeading
				eyebrow="Review"
				tone="destructive"
				title="Review matching entries"
				description="Nothing is removed until you confirm. Entries that only partially overlap your selected dates are still removed in full."
			/>
		</Card.Header>

		<Card.Content class="grid gap-4">
			<div class="flex flex-wrap items-center gap-2">
				{#if reviewStatus}
					<CalendarStatusBadge statusType={reviewStatus}>{reviewStatus.name}</CalendarStatusBadge>
				{/if}
				{#if reviewCriteria}
					<UiBadge variant="outline">{reviewCriteria.selectedCount} selected</UiBadge>
					<UiBadge variant="outline">
						{reviewCriteria.startDate === reviewCriteria.endDate
							? formatDateDisplay(reviewCriteria.startDate)
							: `${formatDateDisplay(reviewCriteria.startDate)} to ${formatDateDisplay(reviewCriteria.endDate)}`}
					</UiBadge>
				{/if}
			</div>

			{#if matchResult.exact.length === 0 && matchResult.partial.length === 0}
				<p class="py-8 text-center text-muted-foreground">
					No matching status entries were found for the selected criteria.
				</p>
			{:else}
				{#if matchResult.exact.length > 0}
					<h3 class="text-base font-semibold">
						<span class="font-bold">{matchResult.exact.length}</span>
						exact {matchResult.exact.length === 1 ? 'match' : 'matches'} will be removed
					</h3>
				{/if}

				{#if matchResult.partial.length > 0}
					<Alert.Root variant="warning">
						<TriangleAlert />
						<Alert.Title>
							<h3>
								<span class="font-bold">{matchResult.partial.length}</span>
								partial {matchResult.partial.length === 1 ? 'overlap' : 'overlaps'} will also be removed entirely
							</h3>
						</Alert.Title>
						<Alert.Description>
							<p>These entries extend beyond your selected date range:</p>
							<ul class="max-h-44 divide-y overflow-y-auto rounded-md border text-xs">
								{#each matchResult.partial as entry (entry.id)}
									<li class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
										<span class="font-medium text-foreground">{getPersonName(entry.personnelId)}</span>
										<span class="whitespace-nowrap"
											>{formatDateDisplay(entry.startDate)} – {formatDateDisplay(entry.endDate)}</span
										>
									</li>
								{/each}
							</ul>
						</Alert.Description>
					</Alert.Root>
				{/if}

				<p class="rounded-md bg-muted p-4 text-center text-xs text-muted-foreground">
					<strong class="text-foreground">{matchResult.exact.length + matchResult.partial.length}</strong>
					total {matchResult.exact.length + matchResult.partial.length === 1 ? 'entry' : 'entries'} will be permanently removed.
				</p>
			{/if}
		</Card.Content>

		<Card.Footer class="justify-between">
			<Button variant="outline" onclick={handleBack}>Back</Button>
			{#if matchResult.exact.length > 0 || matchResult.partial.length > 0}
				<Button variant="destructive" disabled={isSubmitting} onclick={handleConfirmRemoval}>
					{#if isSubmitting}
						<Spinner />
						Removing...
					{:else}
						Confirm Removal
					{/if}
				</Button>
			{/if}
		</Card.Footer>
	</Card.Root>
{/if}
