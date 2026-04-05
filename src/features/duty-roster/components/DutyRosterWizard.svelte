<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import DutyRosterGenerator from './DutyRosterGenerator.svelte';
	import { getLegacySimpleTemplates } from '../legacySimpleTemplates';
	import type { Personnel } from '$lib/types';
	import type { AvailabilityEntry, SpecialDay, StatusType } from '$lib/types';
	import type { AssignmentType, DailyAssignment } from '$lib/types';
	import type { RosterHistoryItem } from '../stores/dutyRosterHistory.svelte';
	import type {
		DutyEvent,
		DutyEventApplyInput,
		DutyEventPreview,
		DutyEventPreviewSlotInstance,
		DutyEventSeriesApplyResult,
		DutyEventSeriesEventOverrideInput,
		DutyEventSeriesInput,
		DutyEventSeriesPattern,
		DutyEventSeriesPreview,
		DutyEventSlotOverrideInput,
		DutyTemplate,
		ExistingDutyEventInput,
		ExistingDutyEventUpdateInput
	} from '../duty-roster.types';

	interface Props {
		assignmentTypes: AssignmentType[];
		assignments: DailyAssignment[];
		personnelByGroup: { group: string; personnel: Personnel[] }[];
		groups: string[];
		availabilityEntries: AvailabilityEntry[];
		statusTypes: StatusType[];
		specialDays: SpecialDay[];
		rosterHistory: RosterHistoryItem[];
		advancedDutyTemplates: DutyTemplate[];
		advancedDutyEvents: DutyEvent[];
		onApplyRoster: (assignments: { date: string; assignmentTypeId: string; assigneeId: string }[]) => Promise<boolean>;
		onSaveRoster: (payload: Omit<RosterHistoryItem, 'id' | 'createdAt'>) => Promise<RosterHistoryItem | null>;
		onDeleteRoster: (id: string) => Promise<void>;
		onUpdateExemptions: (assignmentTypeId: string, personnelIds: string[]) => Promise<void>;
		onPreviewAdvancedEvent: (input: DutyEventApplyInput) => Promise<DutyEventPreview | null>;
		onApplyAdvancedEvent: (input: DutyEventApplyInput) => Promise<DutyEvent | null>;
		onPreviewAdvancedSeries: (input: DutyEventSeriesInput) => Promise<DutyEventSeriesPreview | null>;
		onApplyAdvancedSeries: (input: DutyEventSeriesInput) => Promise<DutyEventSeriesApplyResult | null>;
		onPreviewExistingAdvancedEvent: (input: ExistingDutyEventInput) => Promise<DutyEventPreview | null>;
		onUpdateExistingAdvancedEvent: (input: ExistingDutyEventUpdateInput) => Promise<DutyEvent | null>;
		canManageAdvancedTemplates: boolean;
		onManageAdvancedTemplates: () => void;
	}

	let {
		assignmentTypes,
		assignments,
		personnelByGroup,
		groups,
		availabilityEntries,
		statusTypes,
		specialDays,
		rosterHistory,
		advancedDutyTemplates,
		advancedDutyEvents,
		onApplyRoster,
		onSaveRoster,
		onDeleteRoster,
		onUpdateExemptions,
		onPreviewAdvancedEvent,
		onApplyAdvancedEvent,
		onPreviewAdvancedSeries,
		onApplyAdvancedSeries,
		onPreviewExistingAdvancedEvent,
		onUpdateExistingAdvancedEvent,
		canManageAdvancedTemplates,
		onManageAdvancedTemplates
	}: Props = $props();

	type WizardView =
		| 'choose-lane'
		| 'simple-template-list'
		| 'simple-generator'
		| 'advanced-template-list'
		| 'advanced-generator';

	let view = $state<WizardView>('choose-lane');
	let selectedSimpleAssignmentTypeId = $state<string | null>(null);
	let selectedAdvancedTemplateId = $state<string | null>(null);
	let advancedStartDate = $state('');
	let advancedEndDate = $state('');
	let advancedPattern = $state<DutyEventSeriesPattern>('daily');
	let selectedWeekdays = $state<Set<number>>(new Set([1, 3, 5]));
	let customDateDraft = $state('');
	let customDateEntries = $state<string[]>([]);
	let advancedSeriesPreview = $state<DutyEventSeriesPreview | null>(null);
	let advancedSeriesOverrides = $state<DutyEventSeriesEventOverrideInput[]>([]);
	let collisionReviewConfirmed = $state(false);
	let isPreviewingAdvancedSeries = $state(false);
	let isRefreshingAdvancedSeriesPreview = $state(false);
	let isApplyingAdvancedSeries = $state(false);
	let appliedAdvancedEvents = $state<DutyEvent[]>([]);
	let selectedAppliedEventId = $state<string | null>(null);
	let appliedEventPreview = $state<DutyEventPreview | null>(null);
	let appliedEventOverrides = $state<DutyEventSlotOverrideInput[]>([]);
	let appliedEventCollisionReviewConfirmed = $state(false);
	let isLoadingAppliedEventPreview = $state(false);
	let isRefreshingAppliedEventPreview = $state(false);
	let isSavingAppliedEvent = $state(false);

	const weekdayOptions = [
		{ value: 0, label: 'Sunday' },
		{ value: 1, label: 'Monday' },
		{ value: 2, label: 'Tuesday' },
		{ value: 3, label: 'Wednesday' },
		{ value: 4, label: 'Thursday' },
		{ value: 5, label: 'Friday' },
		{ value: 6, label: 'Saturday' }
	];

	const simpleTemplates = $derived(getLegacySimpleTemplates(assignmentTypes));
	const selectedSimpleTemplate = $derived(
		simpleTemplates.find((template) => template.assignmentTypeId === selectedSimpleAssignmentTypeId) ?? null
	);
	const activeAdvancedTemplates = $derived(
		[...advancedDutyTemplates]
			.filter((template) => template.mode === 'advanced' && template.status === 'active')
			.sort((a, b) => a.name.localeCompare(b.name))
	);
	const selectedAdvancedTemplate = $derived(
		activeAdvancedTemplates.find((template) => template.id === selectedAdvancedTemplateId) ?? null
	);
	const previewCollisionMessages = $derived.by(() => {
		if (!advancedSeriesPreview) {
			return [];
		}

		return [...new Set(advancedSeriesPreview.events.flatMap((event) => event.collisionSummary.conflicts))];
	});
	const previewRequiresCollisionReview = $derived(previewCollisionMessages.length > 0);
	const personnelById = $derived.by(() => {
		const map = new Map<string, Personnel>();
		for (const group of personnelByGroup) {
			for (const person of group.personnel) {
				map.set(person.id, person);
			}
		}
		return map;
	});
	const previewPersonnelOptions = $derived.by(() =>
		[...personnelById.values()].sort(
			(a, b) =>
				a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName) || a.id.localeCompare(b.id)
		)
	);
	const appliedEventGroups = $derived.by(() => {
		const groups = new Map<
			string,
			{
				key: string;
				templateName: string;
				events: DutyEvent[];
			}
		>();

		for (const event of appliedAdvancedEvents) {
			const key = `${event.templateId}::${event.templateName}`;
			const group = groups.get(key);
			if (group) {
				group.events.push(event);
				continue;
			}
			groups.set(key, {
				key,
				templateName: event.templateName,
				events: [event]
			});
		}

		return [...groups.values()].sort(
			(a, b) => (b.events[0]?.coverageStart ?? '').localeCompare(a.events[0]?.coverageStart ?? '')
		);
	});
	const selectedAppliedEvent = $derived(
		selectedAppliedEventId ? appliedAdvancedEvents.find((event) => event.id === selectedAppliedEventId) ?? null : null
	);
	const appliedEventCollisionMessages = $derived(appliedEventPreview?.collisionSummary.conflicts ?? []);
	const appliedEventRequiresCollisionReview = $derived(appliedEventCollisionMessages.length > 0);

	$effect(() => {
		appliedAdvancedEvents = [...advancedDutyEvents].sort((a, b) => b.coverageStart.localeCompare(a.coverageStart));
	});

	function getTodayDate(): string {
		return new Date().toISOString().slice(0, 10);
	}

	function openSimpleLane() {
		view = 'simple-template-list';
	}

	function openAdvancedLane() {
		view = 'advanced-template-list';
	}

	function chooseSimpleTemplate(assignmentTypeId: string) {
		selectedSimpleAssignmentTypeId = assignmentTypeId;
		view = 'simple-generator';
	}

	function chooseAdvancedTemplate(templateId: string) {
		selectedAdvancedTemplateId = templateId;
		advancedStartDate = getTodayDate();
		advancedEndDate = addCalendarDays(advancedStartDate, 6);
		advancedPattern = 'daily';
		selectedWeekdays = new Set([1, 3, 5]);
		customDateDraft = '';
		customDateEntries = [];
		advancedSeriesPreview = null;
		advancedSeriesOverrides = [];
		collisionReviewConfirmed = false;
		view = 'advanced-generator';
	}

	function goBackToTemplates() {
		view = 'simple-template-list';
	}

	function goBackToAdvancedTemplates() {
		advancedSeriesPreview = null;
		advancedSeriesOverrides = [];
		collisionReviewConfirmed = false;
		view = 'advanced-template-list';
	}

	function addCalendarDays(date: string, days: number): string {
		const value = new Date(`${date}T00:00:00`);
		value.setDate(value.getDate() + days);
		return value.toISOString().slice(0, 10);
	}

	function formatSlotAssignee(assigneeId: string | null): string {
		if (!assigneeId) return 'Unfilled';
		const person = personnelById.get(assigneeId);
		return person ? `${person.rank} ${person.lastName}` : assigneeId;
	}

	function buildSlotOverridesFromPreview(slotInstances: DutyEventPreviewSlotInstance[]): DutyEventSlotOverrideInput[] {
		return slotInstances.map((slot) => ({
			templateSlotId: slot.templateSlotId,
			slotIndex: slot.slotIndex,
			assigneeId: slot.assigneeId,
			assignmentSource: slot.assignmentSource === 'generated' ? undefined : slot.assignmentSource
		}));
	}

	function formatDisplayDate(date: string): string {
		return new Intl.DateTimeFormat('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		}).format(new Date(`${date}T00:00:00`));
	}

	function formatCoverageTimeLabel(dateTime: string): string {
		return dateTime.slice(11, 16).replace(':', '');
	}

	function formatEventCoverageLabel(event: DutyEvent): string {
		if (event.coverageMode === 'all-day') {
			return 'All day';
		}

		const startsOn = event.coverageStart.slice(0, 10);
		const endsOn = event.coverageEnd.slice(0, 10);
		const start = formatCoverageTimeLabel(event.coverageStart);
		const end = formatCoverageTimeLabel(event.coverageEnd);
		return startsOn === endsOn ? `${start}-${end}` : `${start}-${end} next day`;
	}

	function formatAppliedGroupRange(events: DutyEvent[]): string {
		if (events.length === 0) return '';
		const orderedDates = [...events].map((event) => event.eventDate).sort((a, b) => a.localeCompare(b));
		const first = orderedDates[0];
		const last = orderedDates[orderedDates.length - 1];
		return first === last ? formatDisplayDate(first) : `${formatDisplayDate(first)} to ${formatDisplayDate(last)}`;
	}

	function formatAppliedFillSummary(event: DutyEvent): string {
		return `${event.fillSummary.filledSlots}/${event.fillSummary.totalSlots} filled`;
	}

	function toggleWeekday(day: number) {
		const next = new Set(selectedWeekdays);
		if (next.has(day)) {
			next.delete(day);
		} else {
			next.add(day);
		}
		selectedWeekdays = next;
	}

	function addCustomDate() {
		const nextDate = customDateDraft.trim();
		if (!nextDate) return;
		customDateEntries = [...new Set([...customDateEntries, nextDate])].sort((a, b) => a.localeCompare(b));
		customDateDraft = '';
	}

	function removeCustomDate(date: string) {
		customDateEntries = customDateEntries.filter((item) => item !== date);
	}

	function buildSeriesInput(): DutyEventSeriesInput | null {
		if (!selectedAdvancedTemplateId) return null;
		if (advancedPattern === 'custom-dates') {
			if (customDateEntries.length === 0) return null;
			return {
				templateId: selectedAdvancedTemplateId,
				pattern: advancedPattern,
				customDates: customDateEntries,
				eventOverrides: advancedSeriesOverrides.length > 0 ? advancedSeriesOverrides : undefined
			};
		}

		if (!advancedStartDate || !advancedEndDate) return null;

		return {
			templateId: selectedAdvancedTemplateId,
			startDate: advancedStartDate,
			endDate: advancedEndDate,
			pattern: advancedPattern,
			selectedWeekdays:
				advancedPattern === 'selected-weekdays' ? [...selectedWeekdays].sort((a, b) => a - b) : undefined,
			eventOverrides: advancedSeriesOverrides.length > 0 ? advancedSeriesOverrides : undefined
		};
	}

	async function handlePreviewAdvancedSeries() {
		const input = buildSeriesInput();
		if (!input) return;
		isPreviewingAdvancedSeries = true;
		try {
			advancedSeriesPreview = await onPreviewAdvancedSeries(input);
			collisionReviewConfirmed = false;
		} finally {
			isPreviewingAdvancedSeries = false;
		}
	}

	function findSeriesSlotOverride(eventDate: string, slot: DutyEventPreviewSlotInstance): DutyEventSlotOverrideInput | null {
		return (
			advancedSeriesOverrides
				.find((entry) => entry.eventDate === eventDate)
				?.slotOverrides.find(
					(override) => override.templateSlotId === slot.templateSlotId && override.slotIndex === slot.slotIndex
				) ?? null
		);
	}

	function buildNextSeriesOverrides(
		eventDate: string,
		slot: DutyEventPreviewSlotInstance,
		nextOverride: DutyEventSlotOverrideInput | null
	): DutyEventSeriesEventOverrideInput[] {
		const nextEntries = advancedSeriesOverrides.map((entry) =>
			entry.eventDate === eventDate ? { ...entry, slotOverrides: [...entry.slotOverrides] } : entry
		);
		const entryIndex = nextEntries.findIndex((entry) => entry.eventDate === eventDate);
		const currentEntry =
			entryIndex >= 0
				? nextEntries[entryIndex]
				: {
						eventDate,
						slotOverrides: []
					};
		const filteredSlotOverrides = currentEntry.slotOverrides.filter(
			(override) => !(override.templateSlotId === slot.templateSlotId && override.slotIndex === slot.slotIndex)
		);
		if (nextOverride) {
			filteredSlotOverrides.push(nextOverride);
		}
		if (filteredSlotOverrides.length === 0) {
			return entryIndex >= 0
				? nextEntries.filter((entry) => entry.eventDate !== eventDate)
				: nextEntries;
		}
		const nextEntry = { eventDate, slotOverrides: filteredSlotOverrides };
		if (entryIndex >= 0) {
			nextEntries[entryIndex] = nextEntry;
			return nextEntries;
		}
		return [...nextEntries, nextEntry];
	}

	async function refreshSeriesPreviewWithOverrides(nextOverrides: DutyEventSeriesEventOverrideInput[]) {
		const input = buildSeriesInput();
		if (!input) return;
		isRefreshingAdvancedSeriesPreview = true;
		advancedSeriesOverrides = nextOverrides;
		try {
			advancedSeriesPreview = await onPreviewAdvancedSeries({
				...input,
				eventOverrides: nextOverrides.length > 0 ? nextOverrides : undefined
			});
			collisionReviewConfirmed = false;
		} finally {
			isRefreshingAdvancedSeriesPreview = false;
		}
	}

	async function updateSeriesSlotAssignee(
		eventDate: string,
		slot: DutyEventPreviewSlotInstance,
		assigneeId: string | null
	) {
		const existingOverride = findSeriesSlotOverride(eventDate, slot);
		const nextOverride: DutyEventSlotOverrideInput = {
			templateSlotId: slot.templateSlotId,
			slotIndex: slot.slotIndex,
			assigneeId,
			assignmentSource:
				existingOverride?.assignmentSource === 'locked' || slot.assignmentSource === 'locked' ? 'locked' : 'manual'
		};
		await refreshSeriesPreviewWithOverrides(buildNextSeriesOverrides(eventDate, slot, nextOverride));
	}

	async function toggleSeriesSlotLock(eventDate: string, slot: DutyEventPreviewSlotInstance) {
		const existingOverride = findSeriesSlotOverride(eventDate, slot);
		const nextAssignmentSource =
			existingOverride?.assignmentSource === 'locked' || slot.assignmentSource === 'locked' ? 'manual' : 'locked';
		await refreshSeriesPreviewWithOverrides(
			buildNextSeriesOverrides(eventDate, slot, {
				templateSlotId: slot.templateSlotId,
				slotIndex: slot.slotIndex,
				assigneeId: slot.assigneeId,
				assignmentSource: nextAssignmentSource
			})
		);
	}

	async function clearSeriesSlot(eventDate: string, slot: DutyEventPreviewSlotInstance) {
		const existingOverride = findSeriesSlotOverride(eventDate, slot);
		await refreshSeriesPreviewWithOverrides(
			buildNextSeriesOverrides(eventDate, slot, {
				templateSlotId: slot.templateSlotId,
				slotIndex: slot.slotIndex,
				assigneeId: null,
				assignmentSource:
					existingOverride?.assignmentSource === 'locked' || slot.assignmentSource === 'locked' ? 'locked' : 'manual'
			})
		);
	}

	async function resetSeriesSlot(eventDate: string, slot: DutyEventPreviewSlotInstance) {
		await refreshSeriesPreviewWithOverrides(buildNextSeriesOverrides(eventDate, slot, null));
	}

	function slotEditorLabel(eventDate: string, slot: DutyEventPreviewSlotInstance): string {
		return `Assignee for ${eventDate} ${slot.roleLabel} #${slot.slotIndex + 1}`;
	}

	function hasSeriesSlotOverride(eventDate: string, slot: DutyEventPreviewSlotInstance): boolean {
		return !!findSeriesSlotOverride(eventDate, slot);
	}

	function findAppliedEventSlotOverride(slot: DutyEventPreviewSlotInstance): DutyEventSlotOverrideInput | null {
		return (
			appliedEventOverrides.find(
				(override) => override.templateSlotId === slot.templateSlotId && override.slotIndex === slot.slotIndex
			) ?? null
		);
	}

	function buildNextAppliedEventOverrides(
		slot: DutyEventPreviewSlotInstance,
		nextOverride: DutyEventSlotOverrideInput | null
	): DutyEventSlotOverrideInput[] {
		const filteredOverrides = appliedEventOverrides.filter(
			(override) => !(override.templateSlotId === slot.templateSlotId && override.slotIndex === slot.slotIndex)
		);
		if (!nextOverride) {
			return filteredOverrides;
		}
		return [...filteredOverrides, nextOverride];
	}

	async function openAppliedEventEditor(event: DutyEvent) {
		selectedAppliedEventId = event.id;
		isLoadingAppliedEventPreview = true;
		try {
			const preview = await onPreviewExistingAdvancedEvent({
				dutyEventId: event.id
			});
			if (preview) {
				appliedEventPreview = preview;
				appliedEventOverrides = buildSlotOverridesFromPreview(preview.slotInstances);
				appliedEventCollisionReviewConfirmed = false;
			}
		} finally {
			isLoadingAppliedEventPreview = false;
		}
	}

	async function refreshAppliedEventPreview(nextOverrides: DutyEventSlotOverrideInput[]) {
		if (!selectedAppliedEventId) return;
		isRefreshingAppliedEventPreview = true;
		appliedEventOverrides = nextOverrides;
		try {
			const preview = await onPreviewExistingAdvancedEvent({
				dutyEventId: selectedAppliedEventId,
				slotOverrides: nextOverrides
			});
			if (preview) {
				appliedEventPreview = preview;
				appliedEventCollisionReviewConfirmed = false;
			}
		} finally {
			isRefreshingAppliedEventPreview = false;
		}
	}

	async function updateAppliedEventSlotAssignee(slot: DutyEventPreviewSlotInstance, assigneeId: string | null) {
		const existingOverride = findAppliedEventSlotOverride(slot);
		await refreshAppliedEventPreview(
			buildNextAppliedEventOverrides(slot, {
				templateSlotId: slot.templateSlotId,
				slotIndex: slot.slotIndex,
				assigneeId,
				assignmentSource:
					existingOverride?.assignmentSource === 'locked' || slot.assignmentSource === 'locked' ? 'locked' : 'manual'
			})
		);
	}

	async function toggleAppliedEventSlotLock(slot: DutyEventPreviewSlotInstance) {
		const existingOverride = findAppliedEventSlotOverride(slot);
		const nextAssignmentSource =
			existingOverride?.assignmentSource === 'locked' || slot.assignmentSource === 'locked' ? 'manual' : 'locked';
		await refreshAppliedEventPreview(
			buildNextAppliedEventOverrides(slot, {
				templateSlotId: slot.templateSlotId,
				slotIndex: slot.slotIndex,
				assigneeId: slot.assigneeId,
				assignmentSource: nextAssignmentSource
			})
		);
	}

	async function clearAppliedEventSlot(slot: DutyEventPreviewSlotInstance) {
		const existingOverride = findAppliedEventSlotOverride(slot);
		await refreshAppliedEventPreview(
			buildNextAppliedEventOverrides(slot, {
				templateSlotId: slot.templateSlotId,
				slotIndex: slot.slotIndex,
				assigneeId: null,
				assignmentSource:
					existingOverride?.assignmentSource === 'locked' || slot.assignmentSource === 'locked' ? 'locked' : 'manual'
			})
		);
	}

	async function regenerateAppliedEventSlot(slot: DutyEventPreviewSlotInstance) {
		await refreshAppliedEventPreview(buildNextAppliedEventOverrides(slot, null));
	}

	async function regenerateAppliedEvent() {
		await refreshAppliedEventPreview([]);
	}

	async function handleSaveAppliedEvent() {
		if (!selectedAppliedEventId) return;
		isSavingAppliedEvent = true;
		try {
			const result = await onUpdateExistingAdvancedEvent({
				dutyEventId: selectedAppliedEventId,
				slotOverrides: appliedEventOverrides,
				collisionReviewConfirmed: appliedEventRequiresCollisionReview
					? appliedEventCollisionReviewConfirmed
					: undefined
			});
			if (result) {
				appliedAdvancedEvents = [
					result,
					...appliedAdvancedEvents.filter((existing) => existing.id !== result.id)
				].sort((a, b) => b.coverageStart.localeCompare(a.coverageStart));
				appliedEventPreview = {
					templateId: result.templateId,
					templateName: result.templateName,
					eventDate: result.eventDate,
					coverageMode: result.coverageMode,
					coverageStart: result.coverageStart,
					coverageEnd: result.coverageEnd,
					isBlocking: result.isBlocking,
					cooldownHours: result.cooldownHours,
					rulesSnapshot: result.rulesSnapshot,
					fillSummary: result.fillSummary,
					collisionSummary: result.collisionSummary,
					slotInstances: result.slotInstances.map((slot) => ({
						templateSlotId: slot.templateSlotId,
						roleLabel: slot.roleLabel,
						slotIndex: slot.slotIndex,
						assigneeId: slot.assigneeId,
						assignmentSource: slot.assignmentSource,
						warningState: slot.warningState,
						fairnessConfidence: slot.fairnessConfidence,
						selectionReason: slot.selectionReason,
						unfilledReason: slot.unfilledReason,
						overrideMessages: slot.overrideMessages,
						sortOrder: slot.sortOrder
					}))
				};
				appliedEventOverrides = buildSlotOverridesFromPreview(appliedEventPreview.slotInstances);
				appliedEventCollisionReviewConfirmed = false;
			}
		} finally {
			isSavingAppliedEvent = false;
		}
	}

	async function handleApplyAdvancedSeries() {
		const input = buildSeriesInput();
		if (!input) return;
		isApplyingAdvancedSeries = true;
		try {
			const result = await onApplyAdvancedSeries({
				...input,
				collisionReviewConfirmed: previewRequiresCollisionReview ? collisionReviewConfirmed : undefined
			});
			if (result) {
				appliedAdvancedEvents = [
					...result.events,
					...appliedAdvancedEvents.filter((existing) => !result.events.some((event) => event.id === existing.id))
				].sort((a, b) => b.coverageStart.localeCompare(a.coverageStart));
				advancedSeriesPreview = null;
				collisionReviewConfirmed = false;
			}
		} finally {
			isApplyingAdvancedSeries = false;
		}
	}

	function patternNeedsRange(pattern: DutyEventSeriesPattern): boolean {
		return pattern !== 'custom-dates';
	}

	function handlePatternChange(nextPattern: DutyEventSeriesPattern) {
		advancedPattern = nextPattern;
		advancedSeriesPreview = null;
		advancedSeriesOverrides = [];
		collisionReviewConfirmed = false;

		if (nextPattern === 'selected-weekdays') {
			selectedWeekdays = new Set();
		}
	}
</script>

<section class="wizard-shell">
	{#if view === 'simple-generator' && selectedSimpleAssignmentTypeId}
		<div class="wizard-banner">
			<div>
				<p class="eyebrow">Simple Lane</p>
				<h2>{selectedSimpleTemplate?.name ?? 'Simple duty roster'}</h2>
				<p class="wizard-copy">
					This path keeps the current one-person DA6-style behavior and existing calendar records intact.
				</p>
			</div>
			<button class="btn btn-secondary" type="button" onclick={goBackToTemplates}>Back to Simple Templates</button>
		</div>

		<DutyRosterGenerator
			initialAssignmentTypeId={selectedSimpleAssignmentTypeId}
			{assignmentTypes}
			{assignments}
			{personnelByGroup}
			{groups}
			{availabilityEntries}
			{statusTypes}
			{specialDays}
			{rosterHistory}
			{onApplyRoster}
			{onSaveRoster}
			{onDeleteRoster}
			{onUpdateExemptions}
		/>
	{:else}
		<div class="wizard-hero card card-flat">
			<div class="hero-copy">
				<p class="eyebrow">Duty wizard</p>
				<h2>Choose the lane that matches the duty.</h2>
				<p class="wizard-copy">
					Simple duties keep the existing one-person roster behavior. Advanced duties use reusable templates for the
					rebuilt flow.
				</p>
			</div>
		</div>

		{#if view === 'choose-lane'}
			<div class="lane-grid">
				<article class="lane-card card card-flat">
					<p class="eyebrow">Simple</p>
					<h3>Reuse an existing one-person duty.</h3>
					<p class="lane-copy">
						Bridge current assignment types into the new flow without migrating or rewriting legacy calendar data.
					</p>
					<button class="btn btn-primary" type="button" onclick={openSimpleLane}>Use Simple Duty</button>
				</article>

				<article class="lane-card card card-flat">
					<p class="eyebrow">Advanced</p>
					<h3>Build toward team-based duties.</h3>
					<p class="lane-copy">
						Select an advanced template, preview a recurring team duty series, and apply it as first-class duty events.
					</p>
					<button
						class="btn btn-secondary"
						type="button"
						disabled={!canManageAdvancedTemplates}
						onclick={openAdvancedLane}
					>
						Use Advanced Duty
					</button>
					{#if !canManageAdvancedTemplates}
						<p class="lane-note">Advanced duty generation is currently limited to organization admins.</p>
					{/if}
				</article>
			</div>
		{/if}

		{#if view === 'simple-template-list'}
			<section class="template-list card card-flat">
				<div class="list-header">
					<div>
						<p class="eyebrow">Simple templates</p>
						<h3>Select an existing duty type.</h3>
					</div>
					<button class="btn btn-secondary btn-sm" type="button" onclick={() => (view = 'choose-lane')}>Back</button>
				</div>

				{#if simpleTemplates.length === 0}
					<EmptyState
						message="No one-person duty types are available yet. Add a personnel assignment type first, then it will appear here automatically."
						variant="simple"
					/>
				{:else}
					<div class="template-grid">
						{#each simpleTemplates as template (template.id)}
							<article class="template-card">
								<div>
									<h4>{template.name}</h4>
									<p class="template-meta">{template.shortName} · {template.exemptPersonnelCount} exempt</p>
									<p class="template-description">{template.description}</p>
								</div>
								<button
									class="btn btn-primary btn-sm"
									type="button"
									onclick={() => chooseSimpleTemplate(template.assignmentTypeId)}
								>
									Continue with {template.name}
								</button>
							</article>
						{/each}
					</div>
				{/if}
			</section>
		{/if}

		{#if view === 'advanced-template-list'}
			<section class="template-list card card-flat">
				<div class="list-header">
					<div>
						<p class="eyebrow">Advanced templates</p>
						<h3>Select a saved template for a recurring run.</h3>
					</div>
					<div class="header-actions">
						<button class="btn btn-secondary btn-sm" type="button" onclick={() => (view = 'choose-lane')}>Back</button>
						<button class="btn btn-secondary btn-sm" type="button" onclick={onManageAdvancedTemplates}
							>Manage Templates</button
						>
					</div>
				</div>

				{#if activeAdvancedTemplates.length === 0}
					<EmptyState
						message="No active advanced duty templates are ready yet. Save and activate one in the template builder, then come back here to generate a recurring run."
						variant="simple"
					/>
				{:else}
					<div class="template-grid">
						{#each activeAdvancedTemplates as template (template.id)}
							<article class="template-card">
								<div>
									<h4>{template.name}</h4>
									<p class="template-meta">
										{template.coverageMode === 'timed' ? `${template.startTime} to ${template.endTime}` : 'All day'}
										· {template.slots.length} slot definition{template.slots.length === 1 ? '' : 's'}
									</p>
									<p class="template-description">{template.description ?? 'No description yet.'}</p>
								</div>
								<button
									class="btn btn-primary btn-sm"
									type="button"
									onclick={() => chooseAdvancedTemplate(template.id)}
								>
									Generate Series
								</button>
							</article>
						{/each}
					</div>
				{/if}
			</section>
		{/if}

		{#if view === 'advanced-generator' && selectedAdvancedTemplate}
			<section class="template-list card card-flat">
				<div class="list-header">
					<div>
						<p class="eyebrow">Advanced series</p>
						<h3>{selectedAdvancedTemplate.name}</h3>
						<p class="template-description">
							Choose a date pattern, preview the resulting event series, and apply the run as first-class team duty
							events.
						</p>
					</div>
					<div class="header-actions">
						<button class="btn btn-secondary btn-sm" type="button" onclick={goBackToAdvancedTemplates}>Back</button>
						<button class="btn btn-secondary btn-sm" type="button" onclick={onManageAdvancedTemplates}
							>Manage Templates</button
						>
					</div>
				</div>

				<div class="advanced-form">
					{#if patternNeedsRange(advancedPattern)}
						<label class="field">
							<span class="label">Start Date</span>
							<input class="input" type="date" bind:value={advancedStartDate} />
						</label>
						<label class="field">
							<span class="label">End Date</span>
							<input class="input" type="date" bind:value={advancedEndDate} />
						</label>
					{/if}
					<label class="field">
						<span class="label">Date Pattern</span>
						<select
							class="select"
							value={advancedPattern}
							aria-label="Date Pattern"
							onchange={(event) =>
								handlePatternChange((event.currentTarget as HTMLSelectElement).value as DutyEventSeriesPattern)}
						>
							<option value="daily">Daily</option>
							<option value="weekday-only">Weekdays Only</option>
							<option value="weekend-only">Weekends Only</option>
							<option value="selected-weekdays">Selected Weekdays</option>
							<option value="holiday-closure-only">Holiday/Closure Only</option>
							<option value="custom-dates">Custom Dates</option>
						</select>
					</label>
					<button
						class="btn btn-primary"
						type="button"
						disabled={!buildSeriesInput() || isPreviewingAdvancedSeries}
						onclick={handlePreviewAdvancedSeries}
					>
						{isPreviewingAdvancedSeries ? 'Preparing Preview...' : 'Preview Series'}
					</button>
				</div>

				{#if advancedPattern === 'selected-weekdays'}
					<div class="weekday-picker">
						{#each weekdayOptions as option (option.value)}
							<label class="weekday-option">
								<input
									type="checkbox"
									checked={selectedWeekdays.has(option.value)}
									onchange={() => toggleWeekday(option.value)}
									aria-label={option.label}
								/>
								<span>{option.label}</span>
							</label>
						{/each}
					</div>
				{/if}

				{#if advancedPattern === 'custom-dates'}
					<div class="custom-dates-panel">
						<label class="field">
							<span class="label">Custom Date</span>
							<input class="input" type="date" bind:value={customDateDraft} />
						</label>
						<button class="btn btn-secondary" type="button" onclick={addCustomDate}>Add Date</button>
						<div class="slot-chip-list">
							{#each customDateEntries as date (date)}
								<button class="slot-chip slot-chip-action" type="button" onclick={() => removeCustomDate(date)}
									>{date}</button
								>
							{/each}
						</div>
					</div>
				{/if}

				{#if advancedSeriesPreview}
					<section class="preview-card" aria-label="Advanced event preview">
						<div class="preview-header">
							<div>
								<p class="eyebrow">Series preview ready</p>
								<h4>{advancedSeriesPreview.templateName}</h4>
								<p class="template-meta">
									{advancedSeriesPreview.eventDates.length} event{advancedSeriesPreview.eventDates.length === 1
										? ''
										: 's'} · {advancedSeriesPreview.pattern}
								</p>
								{#if isRefreshingAdvancedSeriesPreview}
									<p class="template-meta">Refreshing preview around your edits...</p>
								{/if}
							</div>
							<button
								class="btn btn-primary"
								type="button"
								disabled={
									isApplyingAdvancedSeries ||
									isRefreshingAdvancedSeriesPreview ||
									(previewRequiresCollisionReview && !collisionReviewConfirmed)
								}
								onclick={handleApplyAdvancedSeries}
							>
								{isApplyingAdvancedSeries ? 'Applying Series...' : 'Apply Series'}
							</button>
						</div>

						{#if previewRequiresCollisionReview}
							<section class="collision-review-panel" aria-label="Collision review">
								<div>
									<p class="eyebrow">Collision review required</p>
									<h5>Review these conflicts before you apply the run.</h5>
								</div>
								<div class="collision-list">
									{#each previewCollisionMessages as conflict (conflict)}
										<p class="collision-item">{conflict}</p>
									{/each}
								</div>
								<label class="collision-checkbox">
									<input
										type="checkbox"
										bind:checked={collisionReviewConfirmed}
										aria-label="I reviewed the conflicts for this run"
									/>
									<span>I reviewed the conflicts for this run</span>
								</label>
							</section>
						{/if}

						<div class="slot-preview-list">
							{#each advancedSeriesPreview.events as event (event.eventDate)}
								{@const hasLowConfidence = event.slotInstances.some((slot) => slot.fairnessConfidence === 'low')}
								<article class="slot-preview-item">
									<div>
										<h5>{event.eventDate}</h5>
										<p class="template-meta">{event.coverageStart} to {event.coverageEnd}</p>
										<p class="summary-line">
											Blocking: <strong>{event.isBlocking ? 'Yes' : 'No'}</strong> · Fill:
											<strong>{event.fillSummary.filledSlots}/{event.fillSummary.totalSlots}</strong>
										</p>
										{#if hasLowConfidence}
											<p class="summary-line">Fairness confidence: <strong>Low</strong></p>
										{/if}
									</div>
									<div class="slot-preview-list nested-list">
										{#each event.slotInstances as slot (`${event.eventDate}-${slot.roleLabel}-${slot.slotIndex}`)}
											<div class="slot-preview-subitem">
												<div class="slot-preview-heading">
													<strong>{slot.roleLabel} #{slot.slotIndex + 1}</strong>
													<div class="slot-status-badges">
														{#if slot.assignmentSource === 'locked'}
															<span class="slot-status slot-status-lock">Locked</span>
														{:else if slot.assignmentSource === 'manual'}
															<span class="slot-status slot-status-manual">Manual</span>
														{/if}
														{#if slot.warningState === 'warning'}
															<span class="slot-status slot-status-warning">Soft warning</span>
														{:else if slot.warningState === 'conflict'}
															<span class="slot-status slot-status-conflict">Hard conflict</span>
														{/if}
													</div>
												</div>
												<span>{formatSlotAssignee(slot.assigneeId)}</span>
												<label class="field">
													<span class="label sr-only">{slotEditorLabel(event.eventDate, slot)}</span>
													<select
														class="select"
														aria-label={slotEditorLabel(event.eventDate, slot)}
														value={slot.assigneeId ?? ''}
														disabled={isRefreshingAdvancedSeriesPreview || isApplyingAdvancedSeries}
														onchange={(changeEvent) =>
															updateSeriesSlotAssignee(
																event.eventDate,
																slot,
																(changeEvent.currentTarget as HTMLSelectElement).value || null
															)}
													>
														<option value="">Leave Unfilled</option>
														{#each previewPersonnelOptions as person (person.id)}
															<option value={person.id}>{person.rank} {person.lastName}</option>
														{/each}
													</select>
												</label>
												<div class="slot-action-row">
													<button
														class="btn btn-secondary btn-sm"
														type="button"
														disabled={isRefreshingAdvancedSeriesPreview || isApplyingAdvancedSeries}
														aria-label={`${slot.assignmentSource === 'locked' ? 'Unlock' : 'Lock'} ${event.eventDate} ${slot.roleLabel} #${slot.slotIndex + 1}`}
														onclick={() => toggleSeriesSlotLock(event.eventDate, slot)}
													>
														{slot.assignmentSource === 'locked' ? 'Unlock' : 'Lock'}
													</button>
													<button
														class="btn btn-secondary btn-sm"
														type="button"
														disabled={isRefreshingAdvancedSeriesPreview || isApplyingAdvancedSeries}
														aria-label={`Clear ${event.eventDate} ${slot.roleLabel} #${slot.slotIndex + 1}`}
														onclick={() => clearSeriesSlot(event.eventDate, slot)}
													>
														Clear
													</button>
													<button
														class="btn btn-secondary btn-sm"
														type="button"
														disabled={
															isRefreshingAdvancedSeriesPreview ||
															isApplyingAdvancedSeries ||
															!hasSeriesSlotOverride(event.eventDate, slot)
														}
														aria-label={`Reset ${event.eventDate} ${slot.roleLabel} #${slot.slotIndex + 1}`}
														onclick={() => resetSeriesSlot(event.eventDate, slot)}
													>
														Reset
													</button>
												</div>
												{#if slot.overrideMessages && slot.overrideMessages.length > 0}
													<div class="slot-message-list">
														{#each slot.overrideMessages as message (`${event.eventDate}-${slot.slotIndex}-${message}`)}
															<span
																class={`slot-message ${slot.warningState === 'conflict' ? 'slot-message-conflict' : slot.warningState === 'warning' ? 'slot-message-warning' : ''}`}
																>{message}</span
															>
														{/each}
													</div>
												{:else}
													<span>{slot.unfilledReason ?? slot.selectionReason ?? 'Generated assignment ready to apply.'}</span>
												{/if}
											</div>
										{/each}
									</div>
								</article>
							{/each}
						</div>
					</section>
				{/if}
			</section>
		{/if}
	{/if}

	<section class="applied-events card card-flat">
		<div class="list-header">
			<div>
				<p class="eyebrow">Applied events</p>
				<h3>Applied advanced duty events</h3>
			</div>
		</div>

		{#if appliedAdvancedEvents.length === 0}
			<EmptyState
				message="No advanced duty events have been applied yet. Use the advanced lane to generate a series from an active template."
				variant="simple"
			/>
		{:else}
			<div class="applied-group-list">
				{#each appliedEventGroups as group, groupIndex (group.key)}
					<details class="applied-group" open={groupIndex === 0}>
						<summary class="applied-group-summary">
							<div>
								<h4>{group.templateName}</h4>
								<p class="template-meta">
									{group.events.length} applied event{group.events.length === 1 ? '' : 's'} · {formatAppliedGroupRange(group.events)}
								</p>
							</div>
							<span class="applied-group-hint">Show run</span>
						</summary>
						<div class="applied-ledger">
							{#each group.events as event (event.id)}
								<article class="applied-ledger-row">
									<div class="applied-ledger-primary">
										<strong>{formatDisplayDate(event.eventDate)}</strong>
										<p class="template-meta">
											{formatEventCoverageLabel(event)} · {formatAppliedFillSummary(event)}
										</p>
									</div>
									<div class="applied-assignment-list">
										{#each event.slotInstances as slot (slot.id)}
											<span class="slot-chip">
												{slot.roleLabel} #{slot.slotIndex + 1}: {formatSlotAssignee(slot.assigneeId)}
											</span>
										{/each}
									</div>
									<div class="applied-ledger-actions">
										<button
											class="btn btn-secondary btn-sm"
											type="button"
											aria-label={`Open Event ${formatDisplayDate(event.eventDate)}`}
											onclick={() => openAppliedEventEditor(event)}
										>
											Open Event
										</button>
									</div>
								</article>
							{/each}
						</div>
					</details>
				{/each}
			</div>
		{/if}

		{#if selectedAppliedEvent && appliedEventPreview}
			<section class="preview-card applied-event-editor" aria-label="Applied duty event editor">
				<div class="preview-header">
					<div>
						<p class="eyebrow">Applied event editor</p>
						<h4>Edit applied duty event</h4>
						<p class="template-meta">
							{selectedAppliedEvent.templateName} · {formatDisplayDate(selectedAppliedEvent.eventDate)} ·
							{formatEventCoverageLabel(selectedAppliedEvent)}
						</p>
						{#if isLoadingAppliedEventPreview || isRefreshingAppliedEventPreview}
							<p class="template-meta">Refreshing this event around your edits...</p>
						{/if}
					</div>
					<div class="header-actions">
						<button
							class="btn btn-secondary btn-sm"
							type="button"
							disabled={isRefreshingAppliedEventPreview || isSavingAppliedEvent}
							onclick={regenerateAppliedEvent}
						>
							Regenerate Event
						</button>
						<button
							class="btn btn-primary"
							type="button"
							disabled={
								isLoadingAppliedEventPreview ||
								isRefreshingAppliedEventPreview ||
								isSavingAppliedEvent ||
								(appliedEventRequiresCollisionReview && !appliedEventCollisionReviewConfirmed)
							}
							onclick={handleSaveAppliedEvent}
						>
							{isSavingAppliedEvent ? 'Saving Event...' : 'Save Event'}
						</button>
					</div>
				</div>

				{#if appliedEventRequiresCollisionReview}
					<section class="collision-review-panel" aria-label="Applied event collision review">
						<div>
							<p class="eyebrow">Collision review required</p>
							<h5>Review these conflicts before you save this event.</h5>
						</div>
						<div class="collision-list">
							{#each appliedEventCollisionMessages as conflict (conflict)}
								<p class="collision-item">{conflict}</p>
							{/each}
						</div>
						<label class="collision-checkbox">
							<input
								type="checkbox"
								bind:checked={appliedEventCollisionReviewConfirmed}
								aria-label="I reviewed the conflicts for this event"
							/>
							<span>I reviewed the conflicts for this event</span>
						</label>
					</section>
				{/if}

				<div class="slot-preview-list">
					<article class="slot-preview-item">
						<div>
							<h5>{formatDisplayDate(appliedEventPreview.eventDate)}</h5>
							<p class="template-meta">
								{formatEventCoverageLabel(selectedAppliedEvent)} · {appliedEventPreview.fillSummary.filledSlots}/
								{appliedEventPreview.fillSummary.totalSlots} filled
							</p>
						</div>
						<div class="slot-preview-list nested-list">
							{#each appliedEventPreview.slotInstances as slot (`${slot.roleLabel}-${slot.slotIndex}`)}
								<div class="slot-preview-subitem">
									<div class="slot-preview-heading">
										<strong>{slot.roleLabel} #{slot.slotIndex + 1}</strong>
										<div class="slot-status-badges">
											{#if slot.assignmentSource === 'locked'}
												<span class="slot-status slot-status-lock">Locked</span>
											{:else if slot.assignmentSource === 'manual'}
												<span class="slot-status slot-status-manual">Manual</span>
											{/if}
											{#if slot.warningState === 'warning'}
												<span class="slot-status slot-status-warning">Soft warning</span>
											{:else if slot.warningState === 'conflict'}
												<span class="slot-status slot-status-conflict">Hard conflict</span>
											{/if}
										</div>
									</div>
									<span>{formatSlotAssignee(slot.assigneeId)}</span>
									<label class="field">
										<span class="label sr-only">{slotEditorLabel(appliedEventPreview.eventDate, slot)}</span>
										<select
											class="select"
											aria-label={slotEditorLabel(appliedEventPreview.eventDate, slot)}
											value={slot.assigneeId ?? ''}
											disabled={isLoadingAppliedEventPreview || isRefreshingAppliedEventPreview || isSavingAppliedEvent}
											onchange={(changeEvent) =>
												updateAppliedEventSlotAssignee(
													slot,
													(changeEvent.currentTarget as HTMLSelectElement).value || null
												)}
										>
											<option value="">Leave Unfilled</option>
											{#each previewPersonnelOptions as person (person.id)}
												<option value={person.id}>{person.rank} {person.lastName}</option>
											{/each}
										</select>
									</label>
									<div class="slot-action-row">
										<button
											class="btn btn-secondary btn-sm"
											type="button"
											disabled={isLoadingAppliedEventPreview || isRefreshingAppliedEventPreview || isSavingAppliedEvent}
											aria-label={`${slot.assignmentSource === 'locked' ? 'Unlock' : 'Lock'} ${appliedEventPreview.eventDate} ${slot.roleLabel} #${slot.slotIndex + 1}`}
											onclick={() => toggleAppliedEventSlotLock(slot)}
										>
											{slot.assignmentSource === 'locked' ? 'Unlock' : 'Lock'}
										</button>
										<button
											class="btn btn-secondary btn-sm"
											type="button"
											disabled={isLoadingAppliedEventPreview || isRefreshingAppliedEventPreview || isSavingAppliedEvent}
											aria-label={`Clear ${appliedEventPreview.eventDate} ${slot.roleLabel} #${slot.slotIndex + 1}`}
											onclick={() => clearAppliedEventSlot(slot)}
										>
											Clear
										</button>
										<button
											class="btn btn-secondary btn-sm"
											type="button"
											disabled={isLoadingAppliedEventPreview || isRefreshingAppliedEventPreview || isSavingAppliedEvent}
											aria-label={`Regenerate ${appliedEventPreview.eventDate} ${slot.roleLabel} #${slot.slotIndex + 1}`}
											onclick={() => regenerateAppliedEventSlot(slot)}
										>
											Regenerate Slot
										</button>
									</div>
									{#if slot.overrideMessages && slot.overrideMessages.length > 0}
										<div class="slot-message-list">
											{#each slot.overrideMessages as message (`${slot.slotIndex}-${message}`)}
												<span
													class={`slot-message ${slot.warningState === 'conflict' ? 'slot-message-conflict' : slot.warningState === 'warning' ? 'slot-message-warning' : ''}`}
													>{message}</span
												>
											{/each}
										</div>
									{:else}
										<span>{slot.unfilledReason ?? slot.selectionReason ?? 'Assignment ready to save.'}</span>
									{/if}
								</div>
							{/each}
						</div>
					</article>
				</div>
			</section>
		{/if}
	</section>
</section>

<style>
	.wizard-shell {
		display: grid;
		gap: var(--sp-5);
	}

	.wizard-hero,
	.wizard-banner,
	.lane-card,
	.template-list,
	.applied-events {
		padding: var(--sp-5);
	}

	.wizard-hero,
	.wizard-banner {
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--surface-panel) 88%, var(--amber-light) 12%),
			var(--surface-panel)
		);
	}

	.wizard-banner,
	.list-header,
	.preview-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--sp-4);
	}

	.header-actions {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.eyebrow {
		margin: 0 0 var(--sp-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	h2,
	h3,
	h4,
	h5 {
		margin: 0;
	}

	.wizard-copy,
	.lane-copy,
	.template-description,
	.lane-note,
	.template-meta,
	.summary-line {
		margin: var(--sp-2) 0 0;
		color: var(--text-secondary);
	}

	.lane-grid,
	.template-grid {
		display: grid;
		gap: var(--sp-4);
	}

	.lane-grid {
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
	}

	.template-grid {
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		margin-top: var(--sp-4);
	}

	.lane-card,
	.template-card,
	.preview-card {
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	.lane-card {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.lane-card .lane-copy {
		flex: 1;
	}

	.lane-card > .btn {
		align-self: flex-start;
		margin-top: auto;
	}

	.lane-card,
	.template-card,
	.preview-card,
	.slot-preview-item {
		padding: var(--sp-4);
	}

	.template-card,
	.slot-preview-item {
		display: grid;
		gap: var(--sp-3);
	}

	.advanced-form,
	.slot-chip-list {
		display: flex;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}

	.collision-review-panel {
		display: grid;
		gap: var(--sp-3);
		margin-top: var(--sp-4);
		padding: var(--sp-4);
		border: 1px solid color-mix(in srgb, var(--border-danger) 55%, var(--border-default));
		border-radius: var(--radius-lg);
		background: color-mix(in srgb, var(--surface-panel) 82%, var(--danger-light) 18%);
	}

	.collision-list {
		display: grid;
		gap: var(--sp-2);
	}

	.collision-item {
		margin: 0;
		color: var(--text-primary);
	}

	.collision-checkbox {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		color: var(--text-primary);
	}

	.advanced-form {
		align-items: end;
		margin-top: var(--sp-4);
	}

	.field {
		display: grid;
		gap: var(--sp-2);
		min-width: min(220px, 100%);
	}

	.label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.preview-card,
	.slot-preview-list {
		margin-top: var(--sp-4);
	}

	.weekday-picker,
	.custom-dates-panel {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-3);
		margin-top: var(--sp-4);
	}

	.weekday-option {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		padding: 8px 10px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
	}

	.slot-preview-list {
		display: grid;
		gap: var(--sp-3);
	}

	.slot-preview-item {
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
	}

	.slot-chip {
		display: inline-flex;
		align-items: center;
		padding: 4px 8px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--amber-light) 75%, var(--surface-panel) 25%);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--amber-dark);
	}

	.slot-chip-action {
		border: none;
		cursor: pointer;
	}

	.applied-group-list {
		display: grid;
		gap: var(--sp-3);
		margin-top: var(--sp-4);
	}

	.applied-group {
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
		overflow: clip;
	}

	.applied-group-summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		padding: var(--sp-4);
		cursor: pointer;
		list-style: none;
	}

	.applied-group-summary::-webkit-details-marker {
		display: none;
	}

	.applied-group-hint {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.applied-ledger {
		display: grid;
		border-top: 1px solid var(--border-subtle);
	}

	.applied-ledger-row {
		display: grid;
		grid-template-columns: minmax(170px, 220px) minmax(0, 1fr) auto;
		gap: var(--sp-3);
		padding: var(--sp-4);
		border-top: 1px solid var(--border-subtle);
	}

	.applied-ledger-row:first-child {
		border-top: none;
	}

	.applied-ledger-primary {
		display: grid;
		align-content: start;
		gap: 4px;
	}

	.applied-assignment-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		align-content: start;
	}

	.applied-ledger-actions {
		display: flex;
		align-items: flex-start;
		justify-content: flex-end;
	}

	.applied-event-editor {
		margin-top: var(--sp-4);
	}

	.nested-list {
		margin-top: 0;
	}

	.slot-preview-subitem {
		display: grid;
		gap: var(--sp-2);
		padding: 10px 12px;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		color: var(--text-secondary);
	}

	.slot-preview-heading,
	.slot-status-badges,
	.slot-action-row,
	.slot-message-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.slot-preview-heading {
		align-items: center;
		justify-content: space-between;
	}

	.slot-status {
		display: inline-flex;
		align-items: center;
		padding: 2px 8px;
		border-radius: 999px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
	}

	.slot-status-lock,
	.slot-status-manual {
		background: color-mix(in srgb, var(--surface-subtle) 55%, var(--surface-panel) 45%);
		color: var(--text-secondary);
	}

	.slot-status-warning {
		background: color-mix(in srgb, var(--amber-light) 78%, var(--surface-panel) 22%);
		color: var(--amber-dark);
	}

	.slot-status-conflict {
		background: color-mix(in srgb, var(--danger-light) 82%, var(--surface-panel) 18%);
		color: var(--danger-dark);
	}

	.slot-message {
		display: block;
		width: 100%;
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.slot-message-warning {
		color: var(--amber-dark);
	}

	.slot-message-conflict {
		color: var(--danger-dark);
	}

	@media (max-width: 720px) {
		.wizard-banner,
		.list-header,
		.preview-header,
		.advanced-form {
			flex-direction: column;
			align-items: stretch;
		}

		.header-actions {
			width: 100%;
		}

		.header-actions :global(.btn) {
			flex: 1;
		}

		.applied-ledger-row {
			grid-template-columns: 1fr;
		}
	}
</style>
