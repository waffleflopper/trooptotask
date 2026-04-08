<script lang="ts">
	import DutyRosterGenerator from './DutyRosterGenerator.svelte';
	import WizardStepper from './WizardStepper.svelte';
	import AppliedEventManager from './AppliedEventManager.svelte';
	import LaneChooserStep from './LaneChooserStep.svelte';
	import SimpleTemplateListStep from './SimpleTemplateListStep.svelte';
	import AdvancedTemplateListStep from './AdvancedTemplateListStep.svelte';
	import AdvancedPolicyReviewStep from './AdvancedPolicyReviewStep.svelte';
	import AdvancedDatePatternStep from './AdvancedDatePatternStep.svelte';
	import AdvancedCandidateReviewStep from './AdvancedCandidateReviewStep.svelte';
	import AdvancedSeriesPreviewStep from './AdvancedSeriesPreviewStep.svelte';
	import { getLegacySimpleTemplates } from '../legacySimpleTemplates';
	import type {
		Personnel,
		AvailabilityEntry,
		SpecialDay,
		StatusType,
		AssignmentType,
		DailyAssignment
	} from '$lib/types';
	import type { RosterHistoryItem } from '../stores/dutyRosterHistory.svelte';
	import type { ColumnDef } from '$lib/components/ui/data-table/useDataTable.svelte';
	import type {
		DutyEvent,
		DutyEventApplyInput,
		DutyEventPreview,
		DutyEventPreviewSlotInstance,
		DutyEventRunDeleteResult,
		DutyEventSeriesApplyResult,
		DutyEventSeriesEventOverrideInput,
		DutyEventSeriesInput,
		DutyEventSeriesPattern,
		DutyEventSeriesPreview,
		DutyEventSlotOverrideInput,
		DutyTemplate,
		DutyTemplateWriteInput,
		ExistingDutyEventInput,
		ExistingDutyEventUpdateInput
	} from '../duty-roster.types';
	import {
		ADVANCED_STEPS,
		addCalendarDays,
		buildCandidatePersonnelIdsInput,
		buildNextSeriesOverrides,
		buildSingleEventInput,
		buildSeriesInput,
		findSeriesSlotOverride,
		formatCandidateReviewLabel,
		formatCandidateReviewMeta,
		formatCoverageLabel,
		formatDisplayDate,
		formatSeriesPatternLabel,
		formatSlotAssignee,
		getSlotExplanationSections,
		getTodayDate,
		hasSeriesSlotOverride,
		isRunCandidateSelected,
		matchesTemplateScope,
		matchesTemplateSlotEligibility,
		selectedRunCandidateCount,
		toggleRunCandidate,
		weekdayOptions,
		wrapSinglePreview
	} from './dutyRosterWizard.helpers';

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
		onDeleteAdvancedEvent: (dutyEventId: string) => Promise<boolean>;
		onDeleteAdvancedRun: (runId: string) => Promise<DutyEventRunDeleteResult | null>;
		onDeleteLegacyAdvancedGroup: (eventIds: string[]) => Promise<DutyEventRunDeleteResult | null>;
		onCreateAdvancedTemplate: (payload: DutyTemplateWriteInput) => Promise<DutyTemplate | null>;
		canManageAdvancedTemplates: boolean;
		onManageAdvancedTemplates: () => void;
	}

	type WizardView =
		| 'choose-lane'
		| 'simple-template-list'
		| 'simple-generator'
		| 'advanced-template-list'
		| 'advanced-policy-review'
		| 'advanced-date-pattern'
		| 'advanced-candidate-review'
		| 'advanced-series-preview';

	let props: Props = $props();
	let view = $state<WizardView>('choose-lane');
	let selectedSimpleAssignmentTypeId = $state<string | null>(null);
	let selectedAdvancedTemplateId = $state<string | null>(null);
	let advancedStartDate = $state('');
	let advancedEndDate = $state('');
	let advancedPattern = $state<DutyEventSeriesPattern>('daily');
	let selectedWeekdays = $state<Set<number>>(new Set([1, 3, 5]));
	let customDateDraft = $state('');
	let customDateEntries = $state<string[]>([]);
	let selectedRunCandidateIds = $state<string[] | null>(null);
	let advancedPreviewMode = $state<'series' | 'single' | null>(null);
	let advancedSeriesPreview = $state<DutyEventSeriesPreview | null>(null);
	let advancedSeriesOverrides = $state<DutyEventSeriesEventOverrideInput[]>([]);
	let collisionReviewConfirmed = $state(false);
	let shortfallReviewConfirmed = $state(false);
	let isPreviewingAdvancedSeries = $state(false);
	let isRefreshingAdvancedSeriesPreview = $state(false);
	let isApplyingAdvancedSeries = $state(false);
	let localAdvancedDutyEvents = $state<DutyEvent[]>([]);

	const simpleTemplates = $derived(getLegacySimpleTemplates(props.assignmentTypes));
	const selectedSimpleTemplate = $derived(
		simpleTemplates.find((template) => template.assignmentTypeId === selectedSimpleAssignmentTypeId) ?? null
	);
	const activeAdvancedTemplates = $derived(
		[...props.advancedDutyTemplates]
			.filter((template) => template.mode === 'advanced' && template.status === 'active')
			.sort((a, b) => a.name.localeCompare(b.name, 'en-US'))
	);
	const selectedAdvancedTemplate = $derived(
		activeAdvancedTemplates.find((template) => template.id === selectedAdvancedTemplateId) ?? null
	);
	const enabledSoftPrefs = $derived((selectedAdvancedTemplate?.softPreferences ?? []).filter((pref) => pref.enabled));
	const hasRotationBaselines = $derived((selectedAdvancedTemplate?.rotationBaselines.length ?? 0) > 0);
	const previewCollisionMessages = $derived.by(() =>
		advancedSeriesPreview
			? [...new Set(advancedSeriesPreview.events.flatMap((event) => event.collisionSummary.conflicts))]
			: []
	);
	const personnelById = $derived.by(
		() =>
			new Map(props.personnelByGroup.flatMap((group) => group.personnel.map((person) => [person.id, person] as const)))
	);
	const previewPersonnelOptions = $derived.by(() =>
		[...personnelById.values()].sort(
			(a, b) =>
				a.lastName.localeCompare(b.lastName, 'en-US') ||
				a.firstName.localeCompare(b.firstName, 'en-US') ||
				a.id.localeCompare(b.id)
		)
	);
	const candidateReviewOptions = $derived.by(() => {
		if (!selectedAdvancedTemplate) return [] as Personnel[];
		const exemptPersonnelIds = new Set(selectedAdvancedTemplate.exemptPersonnelIds ?? []);
		return previewPersonnelOptions.filter(
			(person) =>
				!exemptPersonnelIds.has(person.id) &&
				matchesTemplateScope(person, selectedAdvancedTemplate) &&
				selectedAdvancedTemplate.slots.some((slot) => matchesTemplateSlotEligibility(person, slot))
		);
	});
	const reviewedPreviewPersonnelOptions = $derived.by(() =>
		selectedRunCandidateIds == null
			? candidateReviewOptions
			: candidateReviewOptions.filter((person) => new Set(selectedRunCandidateIds).has(person.id))
	);
	const statusTypeNameById = $derived.by(
		() => new Map(props.statusTypes.map((statusType) => [statusType.id, statusType.name] as const))
	);
	const candidateReviewColumns: ColumnDef<Personnel>[] = [
		{ key: 'include', header: 'Include', value: () => '', searchable: false },
		{
			key: 'name',
			header: 'Candidate',
			value: (person) => formatCandidateReviewLabel(person),
			searchValue: (person) => `${formatCandidateReviewLabel(person)} ${formatCandidateReviewMeta(person)}`
		},
		{
			key: 'details',
			header: 'Details',
			value: (person) => formatCandidateReviewMeta(person),
			searchValue: (person) => formatCandidateReviewMeta(person)
		}
	];
	const stepperCurrentId = $derived.by(() =>
		view === 'advanced-policy-review'
			? 'policy'
			: view === 'advanced-date-pattern'
				? 'date-pattern'
				: view === 'advanced-candidate-review'
					? 'candidates'
					: view === 'advanced-series-preview'
						? 'preview'
						: 'template'
	);
	const showStepper = $derived(view.startsWith('advanced-'));

	$effect(() => {
		localAdvancedDutyEvents = [...props.advancedDutyEvents].sort((a, b) =>
			b.coverageStart.localeCompare(a.coverageStart)
		);
	});

	function onChooseSimple() {
		view = 'simple-template-list';
	}
	function onChooseAdvanced() {
		view = 'advanced-template-list';
	}
	function chooseSimpleTemplate(assignmentTypeId: string) {
		selectedSimpleAssignmentTypeId = assignmentTypeId;
		view = 'simple-generator';
	}
	function chooseAdvancedTemplate(templateId: string) {
		selectedAdvancedTemplateId = templateId;
		view = 'advanced-policy-review';
	}
	function goBackToLane() {
		view = 'choose-lane';
	}
	function goToPolicyReview() {
		view = 'advanced-policy-review';
	}
	function goToDatePattern() {
		advancedStartDate = getTodayDate();
		advancedEndDate = addCalendarDays(advancedStartDate, 6);
		advancedPattern = 'daily';
		selectedWeekdays = new Set([1, 3, 5]);
		customDateDraft = '';
		customDateEntries = [];
		selectedRunCandidateIds = null;
		advancedPreviewMode = null;
		advancedSeriesPreview = null;
		advancedSeriesOverrides = [];
		collisionReviewConfirmed = false;
		shortfallReviewConfirmed = false;
		view = 'advanced-date-pattern';
	}
	function goToCandidateReview() {
		if (selectedRunCandidateIds == null) selectedRunCandidateIds = candidateReviewOptions.map((person) => person.id);
		view = 'advanced-candidate-review';
	}
	function ensureCandidateReviewCompleted() {
		if (selectedRunCandidateIds != null) return true;
		goToCandidateReview();
		return false;
	}

	const simpleEventInput = () =>
		buildSingleEventInput(
			selectedAdvancedTemplateId,
			advancedStartDate,
			advancedSeriesOverrides,
			candidateReviewOptions,
			selectedRunCandidateIds
		);
	const seriesInput = () =>
		buildSeriesInput(
			selectedAdvancedTemplateId,
			advancedPattern,
			advancedStartDate,
			advancedEndDate,
			selectedWeekdays,
			customDateEntries,
			advancedSeriesOverrides,
			candidateReviewOptions,
			selectedRunCandidateIds
		);

	async function handlePreviewAdvancedSeries() {
		if (!ensureCandidateReviewCompleted()) return;
		const input = seriesInput();
		if (!input) return;
		isPreviewingAdvancedSeries = true;
		try {
			advancedPreviewMode = 'series';
			advancedSeriesPreview = await props.onPreviewAdvancedSeries(input);
			collisionReviewConfirmed = false;
			shortfallReviewConfirmed = false;
			if (advancedSeriesPreview) view = 'advanced-series-preview';
		} finally {
			isPreviewingAdvancedSeries = false;
		}
	}
	async function handlePreviewAdvancedEvent() {
		if (!ensureCandidateReviewCompleted()) return;
		const input = simpleEventInput();
		if (!input) return;
		isPreviewingAdvancedSeries = true;
		try {
			const preview = await props.onPreviewAdvancedEvent(input);
			advancedPreviewMode = 'single';
			advancedSeriesPreview = preview ? wrapSinglePreview(preview) : null;
			collisionReviewConfirmed = false;
			shortfallReviewConfirmed = false;
			if (advancedSeriesPreview) view = 'advanced-series-preview';
		} finally {
			isPreviewingAdvancedSeries = false;
		}
	}
	async function refreshSeriesPreviewWithOverrides(nextOverrides: DutyEventSeriesEventOverrideInput[]) {
		isRefreshingAdvancedSeriesPreview = true;
		advancedSeriesOverrides = nextOverrides;
		try {
			if (advancedPreviewMode === 'single') {
				const input = simpleEventInput();
				if (!input) return;
				const preview = await props.onPreviewAdvancedEvent(input);
				advancedSeriesPreview = preview ? wrapSinglePreview(preview) : null;
			} else {
				const input = seriesInput();
				if (!input) return;
				advancedSeriesPreview = await props.onPreviewAdvancedSeries({
					...input,
					eventOverrides: nextOverrides.length > 0 ? nextOverrides : undefined
				});
			}
			collisionReviewConfirmed = false;
			shortfallReviewConfirmed = false;
		} finally {
			isRefreshingAdvancedSeriesPreview = false;
		}
	}
	async function updateSeriesSlotAssignee(
		eventDate: string,
		slot: DutyEventPreviewSlotInstance,
		assigneeId: string | null
	) {
		const existingOverride = findSeriesSlotOverride(advancedSeriesOverrides, eventDate, slot);
		await refreshSeriesPreviewWithOverrides(
			buildNextSeriesOverrides(advancedSeriesOverrides, eventDate, slot, {
				templateSlotId: slot.templateSlotId,
				slotIndex: slot.slotIndex,
				assigneeId,
				assignmentSource:
					existingOverride?.assignmentSource === 'locked' || slot.assignmentSource === 'locked' ? 'locked' : 'manual'
			})
		);
	}
	async function toggleSeriesSlotLock(eventDate: string, slot: DutyEventPreviewSlotInstance) {
		const existingOverride = findSeriesSlotOverride(advancedSeriesOverrides, eventDate, slot);
		await refreshSeriesPreviewWithOverrides(
			buildNextSeriesOverrides(advancedSeriesOverrides, eventDate, slot, {
				templateSlotId: slot.templateSlotId,
				slotIndex: slot.slotIndex,
				assigneeId: slot.assigneeId,
				assignmentSource:
					existingOverride?.assignmentSource === 'locked' || slot.assignmentSource === 'locked' ? 'manual' : 'locked'
			})
		);
	}
	async function clearSeriesSlot(eventDate: string, slot: DutyEventPreviewSlotInstance) {
		const existingOverride = findSeriesSlotOverride(advancedSeriesOverrides, eventDate, slot);
		await refreshSeriesPreviewWithOverrides(
			buildNextSeriesOverrides(advancedSeriesOverrides, eventDate, slot, {
				templateSlotId: slot.templateSlotId,
				slotIndex: slot.slotIndex,
				assigneeId: null,
				assignmentSource:
					existingOverride?.assignmentSource === 'locked' || slot.assignmentSource === 'locked' ? 'locked' : 'manual'
			})
		);
	}
	async function resetSeriesSlot(eventDate: string, slot: DutyEventPreviewSlotInstance) {
		await refreshSeriesPreviewWithOverrides(buildNextSeriesOverrides(advancedSeriesOverrides, eventDate, slot, null));
	}
	async function handleApplyAdvancedSeries() {
		isApplyingAdvancedSeries = true;
		try {
			if (advancedPreviewMode === 'single') {
				const input = simpleEventInput();
				if (!input) return;
				const result = await props.onApplyAdvancedEvent({
					...input,
					collisionReviewConfirmed: previewCollisionMessages.length > 0 ? collisionReviewConfirmed : undefined
				});
				if (result)
					localAdvancedDutyEvents = [
						result,
						...localAdvancedDutyEvents.filter((existing) => existing.id !== result.id)
					].sort((a, b) => b.coverageStart.localeCompare(a.coverageStart));
			} else {
				const input = seriesInput();
				if (!input) return;
				const result = await props.onApplyAdvancedSeries({
					...input,
					collisionReviewConfirmed: previewCollisionMessages.length > 0 ? collisionReviewConfirmed : undefined
				});
				if (result)
					localAdvancedDutyEvents = [
						...result.events,
						...localAdvancedDutyEvents.filter((existing) => !result.events.some((event) => event.id === existing.id))
					].sort((a, b) => b.coverageStart.localeCompare(a.coverageStart));
			}
			advancedPreviewMode = null;
			advancedSeriesPreview = null;
			collisionReviewConfirmed = false;
			shortfallReviewConfirmed = false;
			view = 'advanced-template-list';
		} finally {
			isApplyingAdvancedSeries = false;
		}
	}
</script>

<section class="wizard-shell">
	{#if view !== 'simple-generator'}
		<div class="wizard-hero card card-flat">
			<div>
				<p class="eyebrow">Duty planning</p>
				<h2>Duty Wizard</h2>
			</div>
		</div>
	{/if}
	{#if showStepper}<WizardStepper steps={ADVANCED_STEPS} current={stepperCurrentId} />{/if}
	{#if view === 'choose-lane'}<LaneChooserStep
			canManageAdvancedTemplates={props.canManageAdvancedTemplates}
			{onChooseSimple}
			{onChooseAdvanced}
		/>{/if}
	{#if view === 'simple-template-list'}<SimpleTemplateListStep
			{simpleTemplates}
			onBack={goBackToLane}
			onChooseTemplate={chooseSimpleTemplate}
		/>{/if}
	{#if view === 'simple-generator' && selectedSimpleTemplate}<DutyRosterGenerator
			initialAssignmentTypeId={selectedSimpleTemplate.assignmentTypeId}
			assignmentTypes={props.assignmentTypes}
			assignments={props.assignments}
			personnelByGroup={props.personnelByGroup}
			availabilityEntries={props.availabilityEntries}
			statusTypes={props.statusTypes}
			specialDays={props.specialDays}
			rosterHistory={props.rosterHistory}
			advancedDutyEvents={props.advancedDutyEvents}
			onApplyRoster={props.onApplyRoster}
			onSaveRoster={props.onSaveRoster}
			onDeleteRoster={props.onDeleteRoster}
			onUpdateExemptions={props.onUpdateExemptions}
		/>{/if}
	{#if view === 'advanced-template-list'}<AdvancedTemplateListStep
			{activeAdvancedTemplates}
			onBack={goBackToLane}
			onChooseTemplate={chooseAdvancedTemplate}
			onBuildFromScratch={props.onManageAdvancedTemplates}
		/>{/if}
	{#if view === 'advanced-policy-review' && selectedAdvancedTemplate}<AdvancedPolicyReviewStep
			template={selectedAdvancedTemplate}
			{enabledSoftPrefs}
			{hasRotationBaselines}
			{statusTypeNameById}
			onBack={() => (view = 'advanced-template-list')}
			onEditTemplate={props.onManageAdvancedTemplates}
			onContinue={goToDatePattern}
		/>{/if}
	{#if view === 'advanced-date-pattern' && selectedAdvancedTemplate}<AdvancedDatePatternStep
			{advancedPattern}
			{advancedStartDate}
			{advancedEndDate}
			{selectedWeekdays}
			{weekdayOptions}
			{customDateDraft}
			{customDateEntries}
			isPreviewing={isPreviewingAdvancedSeries}
			canPreviewSingle={Boolean(simpleEventInput())}
			canPreviewSeries={Boolean(seriesInput())}
			onBack={goToPolicyReview}
			onPatternChange={(pattern) => {
				advancedPattern = pattern;
				selectedRunCandidateIds = null;
				advancedPreviewMode = null;
				advancedSeriesPreview = null;
				advancedSeriesOverrides = [];
				collisionReviewConfirmed = false;
				shortfallReviewConfirmed = false;
				if (pattern === 'selected-weekdays') selectedWeekdays = new Set();
			}}
			onStartDateChange={(value) => (advancedStartDate = value)}
			onEndDateChange={(value) => (advancedEndDate = value)}
			onToggleWeekday={(day) => {
				const next = new Set(selectedWeekdays);
				if (next.has(day)) next.delete(day);
				else next.add(day);
				selectedWeekdays = next;
			}}
			onCustomDateDraftChange={(value) => (customDateDraft = value)}
			onAddCustomDate={() => {
				const nextDate = customDateDraft.trim();
				if (!nextDate) return;
				customDateEntries = [...new Set([...customDateEntries, nextDate])].sort((a, b) => a.localeCompare(b));
				customDateDraft = '';
			}}
			onRemoveCustomDate={(date) => (customDateEntries = customDateEntries.filter((item) => item !== date))}
			onReviewCandidates={goToCandidateReview}
			onPreviewSingle={handlePreviewAdvancedEvent}
			onPreviewSeries={handlePreviewAdvancedSeries}
		/>{/if}
	{#if view === 'advanced-candidate-review' && selectedAdvancedTemplate}<AdvancedCandidateReviewStep
			templateName={selectedAdvancedTemplate.name}
			candidates={candidateReviewOptions}
			columns={candidateReviewColumns}
			selectedCount={selectedRunCandidateCount(selectedRunCandidateIds, candidateReviewOptions)}
			totalCount={candidateReviewOptions.length}
			isPreviewing={isPreviewingAdvancedSeries}
			canPreviewSingle={Boolean(simpleEventInput())}
			canPreviewSeries={Boolean(seriesInput())}
			isSelected={(personId) => isRunCandidateSelected(selectedRunCandidateIds, candidateReviewOptions, personId)}
			formatLabel={formatCandidateReviewLabel}
			onToggleCandidate={(personId) =>
				(selectedRunCandidateIds = toggleRunCandidate(selectedRunCandidateIds, candidateReviewOptions, personId))}
			onBack={() => (view = 'advanced-date-pattern')}
			onPreviewSingle={handlePreviewAdvancedEvent}
			onPreviewSeries={handlePreviewAdvancedSeries}
		/>{/if}
	{#if view === 'advanced-series-preview' && selectedAdvancedTemplate && advancedSeriesPreview}<AdvancedSeriesPreviewStep
			preview={advancedSeriesPreview}
			template={selectedAdvancedTemplate}
			overrides={advancedSeriesOverrides}
			previewMode={advancedPreviewMode}
			isRefreshing={isRefreshingAdvancedSeriesPreview}
			isApplying={isApplyingAdvancedSeries}
			{collisionReviewConfirmed}
			{shortfallReviewConfirmed}
			{previewCollisionMessages}
			personnelOptions={reviewedPreviewPersonnelOptions}
			formatAssignee={(id) => formatSlotAssignee(id, personnelById)}
			{formatCoverageLabel}
			{formatSeriesPatternLabel}
			getExplanationSections={getSlotExplanationSections}
			hasSeriesSlotOverride={(eventDate, slot) => hasSeriesSlotOverride(advancedSeriesOverrides, eventDate, slot)}
			onBack={goToDatePattern}
			onApply={handleApplyAdvancedSeries}
			onCollisionConfirmedChange={(value) => (collisionReviewConfirmed = value)}
			onShortfallConfirmedChange={(value) => (shortfallReviewConfirmed = value)}
			onUpdateSlotAssignee={updateSeriesSlotAssignee}
			onToggleSlotLock={toggleSeriesSlotLock}
			onClearSlot={clearSeriesSlot}
			onResetSlot={resetSeriesSlot}
		/>{/if}

	{#if view !== 'simple-template-list' && view !== 'simple-generator'}
		<AppliedEventManager
			advancedDutyEvents={localAdvancedDutyEvents}
			{personnelById}
			{previewPersonnelOptions}
			onPreviewExistingAdvancedEvent={props.onPreviewExistingAdvancedEvent}
			onUpdateExistingAdvancedEvent={props.onUpdateExistingAdvancedEvent}
			onDeleteAdvancedEvent={props.onDeleteAdvancedEvent}
			onDeleteAdvancedRun={props.onDeleteAdvancedRun}
			onDeleteLegacyAdvancedGroup={props.onDeleteLegacyAdvancedGroup}
		/>
	{/if}
</section>

<style>
	.wizard-shell {
		display: grid;
		gap: var(--sp-5);
	}
	.wizard-hero {
		padding: var(--sp-5);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
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
	h2 {
		margin: 0;
	}
</style>
