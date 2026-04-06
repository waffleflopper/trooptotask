<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import DutyRosterGenerator from './DutyRosterGenerator.svelte';
	import WizardStepper from './WizardStepper.svelte';
	import SeriesPreviewPanel from './SeriesPreviewPanel.svelte';
	import AppliedEventLedger from './AppliedEventLedger.svelte';
	import AppliedEventEditor from './AppliedEventEditor.svelte';
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
	import type { SlotExplanationSection } from './SlotPreviewItem.svelte';

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
		onDeleteAdvancedEvent,
		onDeleteAdvancedRun,
		onDeleteLegacyAdvancedGroup,
		onCreateAdvancedTemplate,
		canManageAdvancedTemplates,
		onManageAdvancedTemplates
	}: Props = $props();

	interface AppliedEventRunGroup {
		key: string;
		runId: string | null;
		templateName: string;
		eventCount: number;
		startDate: string;
		endDate: string;
		isLegacy: boolean;
		events: DutyEvent[];
	}

	type WizardView =
		| 'choose-lane'
		| 'simple-template-list'
		| 'simple-generator'
		| 'advanced-preset-pick'
		| 'advanced-template-list'
		| 'advanced-policy-review'
		| 'advanced-date-pattern'
		| 'advanced-series-preview';

	type CoverageDisplay = Pick<DutyEvent, 'coverageMode' | 'coverageStart' | 'coverageEnd'>;

	// ---- Wizard state ----
	let view = $state<WizardView>('choose-lane');
	let selectedSimpleAssignmentTypeId = $state<string | null>(null);
	let selectedAdvancedTemplateId = $state<string | null>(null);
	let isCreatingPreset = $state(false);

	// Advanced generator state
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

	// Applied event editor state
	let appliedAdvancedEvents = $state<DutyEvent[]>([]);
	let selectedAppliedEventId = $state<string | null>(null);
	let appliedEventPreview = $state<DutyEventPreview | null>(null);
	let appliedEventOverrides = $state<DutyEventSlotOverrideInput[]>([]);
	let appliedEventCollisionReviewConfirmed = $state(false);
	let isLoadingAppliedEventPreview = $state(false);
	let isRefreshingAppliedEventPreview = $state(false);
	let isSavingAppliedEvent = $state(false);
	let pendingEventDelete = $state<DutyEvent | null>(null);
	let pendingRunDelete = $state<AppliedEventRunGroup | null>(null);

	const weekdayOptions = [
		{ value: 0, label: 'Sunday' },
		{ value: 1, label: 'Monday' },
		{ value: 2, label: 'Tuesday' },
		{ value: 3, label: 'Wednesday' },
		{ value: 4, label: 'Thursday' },
		{ value: 5, label: 'Friday' },
		{ value: 6, label: 'Saturday' }
	];

	// ---- Stepper config ----
	const ADVANCED_STEPS = [
		{ id: 'template', label: 'Choose Template' },
		{ id: 'policy', label: 'Review Policy' },
		{ id: 'date-pattern', label: 'Date Pattern' },
		{ id: 'preview', label: 'Preview & Apply' }
	];

	const stepperCurrentId = $derived.by(() => {
		switch (view) {
			case 'advanced-preset-pick':
			case 'advanced-template-list':
				return 'template';
			case 'advanced-policy-review':
				return 'policy';
			case 'advanced-date-pattern':
				return 'date-pattern';
			case 'advanced-series-preview':
				return 'preview';
			default:
				return 'template';
		}
	});

	const showStepper = $derived(
		view === 'advanced-preset-pick' ||
			view === 'advanced-template-list' ||
			view === 'advanced-policy-review' ||
			view === 'advanced-date-pattern' ||
			view === 'advanced-series-preview'
	);

	// ---- Quick-start presets ----
	interface WizardPreset {
		id: string;
		label: string;
		description: string;
		payload: DutyTemplateWriteInput;
	}

	const WIZARD_PRESETS: WizardPreset[] = [
		{
			id: 'battalion-staff-duty',
			label: 'Battalion Staff Duty',
			description: 'Two-person overnight: one NCO and one runner rotating in a shared pool.',
			payload: {
				mode: 'advanced',
				status: 'draft',
				name: 'Battalion Staff Duty',
				description: 'Overnight battalion staff duty with one NCO and one runner rotating together.',
				scopeType: 'organization',
				scopeGroupIds: [],
				coverageMode: 'timed',
				startTime: '08:00',
				endTime: '08:00',
				isBlocking: true,
				cooldownHours: 24,
				slots: [
					{ roleLabel: 'NCO', quantity: 1, allowedRanks: ['SGT', 'SSG', 'SFC'], rotationPoolKey: 'staff-duty-core' },
					{ roleLabel: 'Runner', quantity: 1, allowedRanks: ['PFC', 'SPC', 'CPL'], rotationPoolKey: 'staff-duty-core' }
				]
			}
		},
		{
			id: 'company-cq',
			label: 'Company CQ',
			description: 'Evening–morning CQ with a desk NCO and a runner.',
			payload: {
				mode: 'advanced',
				status: 'draft',
				name: 'Company CQ',
				description: 'Company charge of quarters with overnight desk coverage and one runner.',
				scopeType: 'organization',
				scopeGroupIds: [],
				coverageMode: 'timed',
				startTime: '17:00',
				endTime: '09:00',
				isBlocking: true,
				cooldownHours: 12,
				slots: [
					{ roleLabel: 'CQ NCO', quantity: 1, allowedRanks: ['SGT', 'SSG'], rotationPoolKey: 'cq-core' },
					{ roleLabel: 'Runner', quantity: 1, allowedRanks: ['PFC', 'SPC', 'CPL'], rotationPoolKey: 'cq-core' }
				]
			}
		}
	];

	// ---- Derived ----
	const simpleTemplates = $derived(getLegacySimpleTemplates(assignmentTypes));
	const selectedSimpleTemplate = $derived(
		simpleTemplates.find((template) => template.assignmentTypeId === selectedSimpleAssignmentTypeId) ?? null
	);
	const activeAdvancedTemplates = $derived(
		[...advancedDutyTemplates]
			.filter((template) => template.mode === 'advanced' && template.status === 'active')
			.sort((a, b) => a.name.localeCompare(b.name, 'en-US'))
	);
	const selectedAdvancedTemplate = $derived(
		activeAdvancedTemplates.find((template) => template.id === selectedAdvancedTemplateId) ?? null
	);
	const previewCollisionMessages = $derived.by(() => {
		if (!advancedSeriesPreview) return [];
		return [...new Set(advancedSeriesPreview.events.flatMap((event) => event.collisionSummary.conflicts))];
	});
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
				a.lastName.localeCompare(b.lastName, 'en-US') ||
				a.firstName.localeCompare(b.firstName, 'en-US') ||
				a.id.localeCompare(b.id)
		)
	);
	const statusTypeNameById = $derived.by(() => {
		const map = new Map<string, string>();
		for (const statusType of statusTypes) {
			map.set(statusType.id, statusType.name);
		}
		return map;
	});
	const appliedEventGroups = $derived.by<AppliedEventRunGroup[]>(() => {
		const groupMap = new Map<string, AppliedEventRunGroup>();
		for (const event of appliedAdvancedEvents) {
			if (event.runId) {
				const existing = groupMap.get(event.runId);
				const runStart = event.run?.startDate ?? event.eventDate;
				const runEnd = event.run?.endDate ?? event.eventDate;
				if (existing) {
					existing.events.push(event);
					existing.startDate = existing.startDate.localeCompare(runStart) <= 0 ? existing.startDate : runStart;
					existing.endDate = existing.endDate.localeCompare(runEnd) >= 0 ? existing.endDate : runEnd;
					existing.eventCount = Math.max(existing.eventCount, event.run?.eventCount ?? existing.events.length);
					continue;
				}
				groupMap.set(event.runId, {
					key: event.runId,
					runId: event.runId,
					templateName: event.templateName,
					eventCount: event.run?.eventCount ?? 1,
					startDate: runStart,
					endDate: runEnd,
					isLegacy: event.run?.isLegacy ?? false,
					events: [event]
				});
				continue;
			}

			const legacyKey = `legacy::${event.templateId}::${event.templateName}`;
			const existing = groupMap.get(legacyKey);
			if (existing) {
				existing.events.push(event);
				existing.startDate =
					existing.startDate.localeCompare(event.eventDate) <= 0 ? existing.startDate : event.eventDate;
				existing.endDate = existing.endDate.localeCompare(event.eventDate) >= 0 ? existing.endDate : event.eventDate;
				existing.eventCount = existing.events.length;
				continue;
			}
			groupMap.set(legacyKey, {
				key: legacyKey,
				runId: null,
				templateName: `${event.templateName} (Legacy import)`,
				eventCount: 1,
				startDate: event.eventDate,
				endDate: event.eventDate,
				isLegacy: true,
				events: [event]
			});
		}
		return [...groupMap.values()]
			.map((group) => ({
				...group,
				events: [...group.events].sort((a, b) => b.eventDate.localeCompare(a.eventDate)),
				eventCount: Math.max(group.eventCount, group.events.length)
			}))
			.sort((a, b) => {
				const aKey = a.endDate || a.events[0]?.coverageStart || '';
				const bKey = b.endDate || b.events[0]?.coverageStart || '';
				return bKey.localeCompare(aKey);
			});
	});

	const selectedAppliedEvent = $derived(
		selectedAppliedEventId ? (appliedAdvancedEvents.find((event) => event.id === selectedAppliedEventId) ?? null) : null
	);
	const appliedEventCollisionMessages = $derived(appliedEventPreview?.collisionSummary.conflicts ?? []);

	$effect(() => {
		appliedAdvancedEvents = [...advancedDutyEvents].sort((a, b) => b.coverageStart.localeCompare(a.coverageStart));
	});

	// ---- Helpers ----
	function getTodayDate(): string {
		return new Date().toISOString().slice(0, 10);
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

	function formatDisplayDate(date: string): string {
		return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
			new Date(`${date}T00:00:00`)
		);
	}

	function formatCoverageTimeLabel(dateTime: string): string {
		return dateTime.slice(11, 16).replace(':', '');
	}

	function formatCoverageLabel(event: CoverageDisplay): string {
		if (event.coverageMode === 'all-day') return 'All day';
		const startsOn = event.coverageStart.slice(0, 10);
		const endsOn = event.coverageEnd.slice(0, 10);
		const start = formatCoverageTimeLabel(event.coverageStart);
		const end = formatCoverageTimeLabel(event.coverageEnd);
		return startsOn === endsOn ? `${start}-${end}` : `${start}-${end} next day`;
	}

	function formatAppliedGroupRange(group: Pick<AppliedEventRunGroup, 'startDate' | 'endDate'>): string {
		const first = group.startDate;
		const last = group.endDate;
		if (!first || !last) return '';
		return first === last ? formatDisplayDate(first) : `${formatDisplayDate(first)} to ${formatDisplayDate(last)}`;
	}

	function formatAppliedFillSummary(event: DutyEvent): string {
		return `${event.fillSummary.filledSlots}/${event.fillSummary.totalSlots} filled`;
	}

	function describeFairnessConfidence(confidence: DutyEventPreviewSlotInstance['fairnessConfidence']): string {
		if (confidence === 'low') {
			return 'Low confidence — most eligible Soldiers lack rotation history for this pool. Seed starting baselines in the template builder to improve fairness.';
		}
		if (confidence === 'medium') {
			return 'Medium confidence — some Soldiers lack rotation history. Picks are reasonably fair but history is incomplete.';
		}
		return 'High confidence — all eligible Soldiers have rotation history. Picks are fully informed.';
	}

	function getSlotExplanationSections(slot: DutyEventPreviewSlotInstance): SlotExplanationSection[] {
		const sections: SlotExplanationSection[] = [
			{
				label: 'Fairness confidence',
				tone: 'default',
				lines: [describeFairnessConfidence(slot.fairnessConfidence)]
			}
		];
		if (slot.selectionReason) {
			sections.push({ label: 'Why this pick', tone: 'default', lines: [slot.selectionReason] });
		}
		if (slot.overrideMessages && slot.overrideMessages.length > 0) {
			sections.push({
				label: 'Warnings and skips',
				tone: slot.warningState === 'conflict' ? 'conflict' : slot.warningState === 'warning' ? 'warning' : 'default',
				lines: [...slot.overrideMessages]
			});
		}
		if (slot.unfilledReason) {
			sections.push({
				label: 'Unfilled outcome',
				tone: slot.warningState === 'conflict' ? 'conflict' : 'default',
				lines: [slot.unfilledReason]
			});
		}
		return sections;
	}

	function buildSlotOverridesFromPreview(slotInstances: DutyEventPreviewSlotInstance[]): DutyEventSlotOverrideInput[] {
		return slotInstances.map((slot) => ({
			templateSlotId: slot.templateSlotId,
			slotIndex: slot.slotIndex,
			assigneeId: slot.assigneeId,
			assignmentSource: slot.assignmentSource === 'generated' ? undefined : slot.assignmentSource
		}));
	}

	function escapePacketHtml(value: string): string {
		return value
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#39;');
	}

	function buildDutyPacketMarkup(
		event: DutyEvent,
		preview: DutyEventPreview,
		personnelLookup: Map<string, Personnel>
	): string {
		const slotSections = preview.slotInstances
			.map((slot) => {
				const explanationMarkup = getSlotExplanationSections(slot)
					.map(
						(section) => `
						<div class="slot-section">
							<p><strong>${escapePacketHtml(section.label)}</strong></p>
							<ul>${section.lines.map((line) => `<li>${escapePacketHtml(line)}</li>`).join('')}</ul>
						</div>`
					)
					.join('');
				return `
				<section class="slot-card">
					<div class="slot-heading">
						<h3>${escapePacketHtml(`${slot.roleLabel} #${slot.slotIndex + 1}`)}</h3>
						<p>${escapePacketHtml(formatSlotAssignee(slot.assigneeId))}</p>
					</div>
					<p class="slot-meta">Source: ${escapePacketHtml(slot.assignmentSource)}${slot.warningState !== 'none' ? ` · ${escapePacketHtml(slot.warningState)}` : ''}</p>
					${explanationMarkup || '<p>No extra explanation recorded for this slot.</p>'}
				</section>`;
			})
			.join('');

		const assignedPersonnel = preview.slotInstances
			.map((slot) => slot.assigneeId)
			.filter((id): id is string => Boolean(id))
			.map((id) => personnelLookup.get(id))
			.filter((person): person is Personnel => Boolean(person));
		const rosterLine =
			assignedPersonnel.length > 0
				? assignedPersonnel
						.map((p) => `${p.rank} ${p.lastName}`)
						.sort((a, b) => a.localeCompare(b))
						.join(', ')
				: 'No Soldier assigned yet';

		return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>${escapePacketHtml(`${event.templateName} Team Duty Packet`)}</title>
<style>body{font-family:Georgia,"Times New Roman",serif;margin:32px;color:#1f2937;}h1,h2,h3,p{margin:0;}header,section{margin-bottom:24px;}.meta-grid{display:grid;gap:8px;margin-top:12px;}.roster-line{margin-top:12px;font-weight:600;}.slot-grid{display:grid;gap:16px;}.slot-card{border:1px solid #d6d3d1;border-radius:12px;padding:16px;background:#fafaf9;}.slot-heading{display:flex;justify-content:space-between;gap:12px;align-items:baseline;}.slot-meta{margin-top:6px;color:#57534e;font-size:14px;}ul{margin:12px 0 0 18px;padding:0;}li+li{margin-top:6px;}</style>
</head>
<body>
<header><p>Team Duty Packet</p><h1>${escapePacketHtml(event.templateName)}</h1>
<div class="meta-grid"><p>Date: ${escapePacketHtml(formatDisplayDate(preview.eventDate))}</p><p>Coverage: ${escapePacketHtml(formatCoverageLabel(preview))}</p><p>Fill: ${escapePacketHtml(`${preview.fillSummary.filledSlots}/${preview.fillSummary.totalSlots} filled`)}</p><p>Blocking: ${escapePacketHtml(preview.isBlocking ? 'Yes' : 'No')}</p></div>
<p class="roster-line">Assigned team: ${escapePacketHtml(rosterLine)}</p></header>
<section><h2>Duty team</h2><div class="slot-grid">${slotSections}</div></section>
</body></html>`;
	}

	function exportAppliedDutyPacket() {
		if (!selectedAppliedEvent || !appliedEventPreview) return;
		const packetMarkup = buildDutyPacketMarkup(selectedAppliedEvent, appliedEventPreview, personnelById);
		const fileDate = appliedEventPreview.eventDate.replaceAll('-', '');
		const blob = new Blob([packetMarkup], { type: 'text/html;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `${selectedAppliedEvent.templateName.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}-${fileDate}-team-duty-packet.html`;
		document.body.append(anchor);
		anchor.click();
		anchor.remove();
		URL.revokeObjectURL(url);
	}

	// ---- Navigation ----
	function openSimpleLane() {
		view = 'simple-template-list';
	}

	function openAdvancedLane() {
		view = 'advanced-preset-pick';
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

	function goBackToPresetPick() {
		view = 'advanced-preset-pick';
	}

	function goBackToTemplateList() {
		selectedAdvancedTemplateId = null;
		view = 'advanced-template-list';
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
		advancedSeriesPreview = null;
		advancedSeriesOverrides = [];
		collisionReviewConfirmed = false;
		view = 'advanced-date-pattern';
	}

	function goToSeriesPreview() {
		view = 'advanced-series-preview';
	}

	// ---- Preset creation ----
	async function createFromPreset(preset: WizardPreset) {
		if (isCreatingPreset) return;
		isCreatingPreset = true;
		try {
			const template = await onCreateAdvancedTemplate(preset.payload);
			if (template) {
				selectedAdvancedTemplateId = template.id;
				view = 'advanced-policy-review';
			}
		} finally {
			isCreatingPreset = false;
		}
	}

	// ---- Series logic ----
	function toggleWeekday(day: number) {
		const next = new Set(selectedWeekdays);
		if (next.has(day)) next.delete(day);
		else next.add(day);
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

	function patternNeedsRange(pattern: DutyEventSeriesPattern): boolean {
		return pattern !== 'custom-dates';
	}

	function handlePatternChange(nextPattern: DutyEventSeriesPattern) {
		advancedPattern = nextPattern;
		advancedSeriesPreview = null;
		advancedSeriesOverrides = [];
		collisionReviewConfirmed = false;
		if (nextPattern === 'selected-weekdays') selectedWeekdays = new Set();
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
			if (advancedSeriesPreview) goToSeriesPreview();
		} finally {
			isPreviewingAdvancedSeries = false;
		}
	}

	function findSeriesSlotOverride(
		eventDate: string,
		slot: DutyEventPreviewSlotInstance
	): DutyEventSlotOverrideInput | null {
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
		const currentEntry = entryIndex >= 0 ? nextEntries[entryIndex] : { eventDate, slotOverrides: [] };
		const filteredSlotOverrides = currentEntry.slotOverrides.filter(
			(override) => !(override.templateSlotId === slot.templateSlotId && override.slotIndex === slot.slotIndex)
		);
		if (nextOverride) filteredSlotOverrides.push(nextOverride);
		if (filteredSlotOverrides.length === 0) {
			return entryIndex >= 0 ? nextEntries.filter((entry) => entry.eventDate !== eventDate) : nextEntries;
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
		await refreshSeriesPreviewWithOverrides(
			buildNextSeriesOverrides(eventDate, slot, {
				templateSlotId: slot.templateSlotId,
				slotIndex: slot.slotIndex,
				assigneeId,
				assignmentSource:
					existingOverride?.assignmentSource === 'locked' || slot.assignmentSource === 'locked' ? 'locked' : 'manual'
			})
		);
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

	function hasSeriesSlotOverride(eventDate: string, slot: DutyEventPreviewSlotInstance): boolean {
		return !!findSeriesSlotOverride(eventDate, slot);
	}

	async function handleApplyAdvancedSeries() {
		const input = buildSeriesInput();
		if (!input) return;
		isApplyingAdvancedSeries = true;
		try {
			const result = await onApplyAdvancedSeries({
				...input,
				collisionReviewConfirmed: previewCollisionMessages.length > 0 ? collisionReviewConfirmed : undefined
			});
			if (result) {
				appliedAdvancedEvents = [
					...result.events,
					...appliedAdvancedEvents.filter((existing) => !result.events.some((event) => event.id === existing.id))
				].sort((a, b) => b.coverageStart.localeCompare(a.coverageStart));
				advancedSeriesPreview = null;
				collisionReviewConfirmed = false;
				view = 'advanced-template-list';
			}
		} finally {
			isApplyingAdvancedSeries = false;
		}
	}

	// ---- Applied event editor ----
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
		return nextOverride ? [...filteredOverrides, nextOverride] : filteredOverrides;
	}

	async function openAppliedEventEditor(event: DutyEvent) {
		const eventId = event.id;
		selectedAppliedEventId = eventId;
		appliedEventPreview = null;
		appliedEventOverrides = [];
		appliedEventCollisionReviewConfirmed = false;
		isLoadingAppliedEventPreview = true;
		try {
			const preview = await onPreviewExistingAdvancedEvent({ dutyEventId: event.id });
			if (preview && selectedAppliedEventId === eventId) {
				appliedEventPreview = preview;
				appliedEventOverrides = buildSlotOverridesFromPreview(preview.slotInstances);
				appliedEventCollisionReviewConfirmed = false;
			}
		} finally {
			if (selectedAppliedEventId === eventId) {
				isLoadingAppliedEventPreview = false;
			}
		}
	}

	async function refreshAppliedEventPreview(nextOverrides: DutyEventSlotOverrideInput[]) {
		if (!selectedAppliedEventId) return;
		const eventId = selectedAppliedEventId;
		isRefreshingAppliedEventPreview = true;
		appliedEventOverrides = nextOverrides;
		try {
			const preview = await onPreviewExistingAdvancedEvent({
				dutyEventId: eventId,
				slotOverrides: nextOverrides
			});
			if (preview && selectedAppliedEventId === eventId) {
				appliedEventPreview = preview;
				appliedEventCollisionReviewConfirmed = false;
			}
		} finally {
			if (selectedAppliedEventId === eventId) {
				isRefreshingAppliedEventPreview = false;
			}
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
				collisionReviewConfirmed:
					appliedEventCollisionMessages.length > 0 ? appliedEventCollisionReviewConfirmed : undefined
			});
			if (result) {
				appliedAdvancedEvents = [result, ...appliedAdvancedEvents.filter((existing) => existing.id !== result.id)].sort(
					(a, b) => b.coverageStart.localeCompare(a.coverageStart)
				);
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

	function requestDeleteAppliedEvent(event: DutyEvent) {
		pendingEventDelete = event;
	}

	function requestDeleteAppliedRun(group: AppliedEventRunGroup) {
		pendingRunDelete = group;
	}

	function cancelPendingDelete() {
		pendingEventDelete = null;
		pendingRunDelete = null;
	}

	function closeAppliedEventEditor() {
		selectedAppliedEventId = null;
		appliedEventPreview = null;
		appliedEventOverrides = [];
		appliedEventCollisionReviewConfirmed = false;
		isLoadingAppliedEventPreview = false;
		isRefreshingAppliedEventPreview = false;
	}

	async function confirmDeleteAppliedEvent() {
		if (!pendingEventDelete) return;
		const eventId = pendingEventDelete.id;
		const deleted = await onDeleteAdvancedEvent(eventId);
		if (deleted) {
			appliedAdvancedEvents = appliedAdvancedEvents.filter((event) => event.id !== eventId);
			if (selectedAppliedEventId === eventId) {
				selectedAppliedEventId = null;
				appliedEventPreview = null;
				appliedEventOverrides = [];
				appliedEventCollisionReviewConfirmed = false;
			}
		}
		pendingEventDelete = null;
	}

	async function confirmDeleteAppliedRun() {
		if (!pendingRunDelete) return;
		const group = pendingRunDelete;
		if (group.runId) {
			const result = await onDeleteAdvancedRun(group.runId);
			if (result) {
				const remainingIds = new Set(group.events.map((event) => event.id));
				appliedAdvancedEvents = appliedAdvancedEvents.filter((event) => !remainingIds.has(event.id));
			}
		} else {
			const eventIds = group.events.map((event) => event.id);
			const result = await onDeleteLegacyAdvancedGroup(eventIds);
			if (result) {
				const removed = new Set(eventIds);
				appliedAdvancedEvents = appliedAdvancedEvents.filter((event) => !removed.has(event.id));
			}
		}

		if (selectedAppliedEventId && group.events.some((event) => event.id === selectedAppliedEventId)) {
			selectedAppliedEventId = null;
			appliedEventPreview = null;
			appliedEventOverrides = [];
			appliedEventCollisionReviewConfirmed = false;
		}
		pendingRunDelete = null;
	}
</script>

<section class="wizard-shell">
	<!-- Simple path: generator view has its own banner/layout -->
	{#if view === 'simple-generator' && selectedSimpleAssignmentTypeId}
		<div class="wizard-banner">
			<div>
				<p class="eyebrow">Automatic Assignment Generator</p>
				<h2>{selectedSimpleTemplate?.name ?? 'Automatic Assignment Generator'}</h2>
				<p class="wizard-copy">
					This path keeps the current one-person DA6-style assignment behavior and existing calendar records intact.
				</p>
			</div>
			<button class="btn btn-secondary" type="button" onclick={() => (view = 'simple-template-list')}
				>Back to Assignment Types</button
			>
		</div>

		<DutyRosterGenerator
			initialAssignmentTypeId={selectedSimpleAssignmentTypeId}
			{assignmentTypes}
			{assignments}
			{advancedDutyEvents}
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
		<!-- Hero bar — always visible for non-simple-generator views -->
		<div class="wizard-hero card card-flat">
			<div class="hero-copy">
				<p class="eyebrow">Duty wizard</p>
				<h2>Choose the lane that matches the duty.</h2>
				<p class="wizard-copy">
					The automatic assignment generator uses the existing one-person assignment flow. Advanced duties use reusable
					templates.
				</p>
			</div>
		</div>

		<!-- Stepper (advanced flow only) -->
		{#if showStepper}
			<WizardStepper steps={ADVANCED_STEPS} current={stepperCurrentId} />
		{/if}

		<!-- ── Choose lane ── -->
		{#if view === 'choose-lane'}
			<div class="lane-grid">
				<article class="lane-card card card-flat">
					<p class="eyebrow">Automatic Assignment</p>
					<h3>Reuse an existing one-person assignment type.</h3>
					<p class="lane-copy">
						Bridge current assignment types into the new flow without migrating legacy calendar data.
					</p>
					<button class="btn btn-primary" type="button" onclick={openSimpleLane}>
						Use Automatic Assignment Generator
					</button>
				</article>

				<article class="lane-card card card-flat">
					<p class="eyebrow">Advanced</p>
					<h3>Build toward team-based duties.</h3>
					<p class="lane-copy">
						Select a template, preview a recurring team series, and apply first-class duty events.
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
						<p class="lane-note">Advanced duty is limited to full-organization admins and full editors.</p>
					{/if}
				</article>
			</div>
		{/if}

		<!-- ── Simple template list ── -->
		{#if view === 'simple-template-list'}
			<section class="step-card card card-flat">
				<div class="list-header">
					<div>
						<p class="eyebrow">Assignment templates</p>
						<h3>Select an existing assignment type.</h3>
					</div>
					<button class="btn btn-secondary btn-sm" type="button" onclick={goBackToLane}>Back</button>
				</div>

				{#if simpleTemplates.length === 0}
					<EmptyState
						message="No one-person assignment types available yet. Add a personnel assignment type first."
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

		<!-- ── Step 1: Preset picker ── -->
		{#if view === 'advanced-preset-pick'}
			<section class="step-card card card-flat">
				<div class="list-header">
					<div>
						<p class="eyebrow">Step 1 of 4 · Choose template</p>
						<h3>Start with a preset or pick an existing template.</h3>
						<p class="wizard-copy">
							Presets create a draft template you can refine later. Pick an existing active template to jump straight to
							policy review.
						</p>
					</div>
					<button class="btn btn-secondary btn-sm" type="button" onclick={goBackToLane}>Back</button>
				</div>

				<div class="preset-grid">
					{#each WIZARD_PRESETS as preset (preset.id)}
						<article class="preset-card">
							<div>
								<h4>{preset.label}</h4>
								<p class="template-description">{preset.description}</p>
							</div>
							<button
								class="btn btn-secondary btn-sm"
								type="button"
								disabled={isCreatingPreset}
								onclick={() => createFromPreset(preset)}
							>
								{isCreatingPreset ? 'Creating...' : `Use ${preset.label}`}
							</button>
						</article>
					{/each}

					<article class="preset-card preset-card-blank">
						<div>
							<h4>Build from scratch</h4>
							<p class="template-description">Open the template builder and configure every field yourself.</p>
						</div>
						<button class="btn btn-secondary btn-sm" type="button" onclick={onManageAdvancedTemplates}>
							Open Template Builder
						</button>
					</article>
				</div>

				{#if activeAdvancedTemplates.length > 0}
					<div class="existing-templates-section">
						<div class="existing-header">
							<p class="eyebrow">Or use an existing template</p>
						</div>
						<div class="template-grid">
							{#each activeAdvancedTemplates as template (template.id)}
								<article class="template-card">
									<div>
										<h4>{template.name}</h4>
										<p class="template-meta">
											{template.coverageMode === 'timed' ? `${template.startTime} to ${template.endTime}` : 'All day'} · {template
												.slots.length} slot{template.slots.length === 1 ? '' : 's'}
										</p>
										<p class="template-description">{template.description ?? 'No description.'}</p>
									</div>
									<button
										class="btn btn-primary btn-sm"
										type="button"
										onclick={() => chooseAdvancedTemplate(template.id)}
									>
										Use This Template
									</button>
								</article>
							{/each}
						</div>
					</div>
				{/if}
			</section>
		{/if}

		<!-- ── Step 1b: Advanced template list (direct nav from "Manage Templates" back path) ── -->
		{#if view === 'advanced-template-list'}
			<section class="step-card card card-flat">
				<div class="list-header">
					<div>
						<p class="eyebrow">Step 1 of 4 · Choose template</p>
						<h3>Select a saved template for a recurring run.</h3>
					</div>
					<div class="header-actions">
						<button class="btn btn-secondary btn-sm" type="button" onclick={goBackToPresetPick}>Back</button>
						<button class="btn btn-secondary btn-sm" type="button" onclick={onManageAdvancedTemplates}
							>Manage Templates</button
						>
					</div>
				</div>

				{#if activeAdvancedTemplates.length === 0}
					<EmptyState
						message="No active advanced duty templates ready. Save and activate one in the template builder, then return here."
						variant="simple"
					/>
				{:else}
					<div class="template-grid">
						{#each activeAdvancedTemplates as template (template.id)}
							<article class="template-card">
								<div>
									<h4>{template.name}</h4>
									<p class="template-meta">
										{template.coverageMode === 'timed' ? `${template.startTime} to ${template.endTime}` : 'All day'} · {template
											.slots.length} slot{template.slots.length === 1 ? '' : 's'}
									</p>
									<p class="template-description">{template.description ?? 'No description.'}</p>
								</div>
								<button
									class="btn btn-primary btn-sm"
									type="button"
									onclick={() => chooseAdvancedTemplate(template.id)}
								>
									Use This Template
								</button>
							</article>
						{/each}
					</div>
				{/if}
			</section>
		{/if}

		<!-- ── Step 2: Policy review ── -->
		{#if view === 'advanced-policy-review' && selectedAdvancedTemplate}
			<section class="step-card card card-flat">
				<div class="list-header">
					<div>
						<p class="eyebrow">Step 2 of 4 · Review policy</p>
						<h3>{selectedAdvancedTemplate.name}</h3>
						<p class="wizard-copy">Confirm the rules for this duty before generating the series.</p>
					</div>
					<div class="header-actions">
						<button class="btn btn-secondary btn-sm" type="button" onclick={goBackToPresetPick}>Back</button>
						<button class="btn btn-secondary btn-sm" type="button" onclick={onManageAdvancedTemplates}
							>Edit Template</button
						>
					</div>
				</div>

				<div class="policy-grid">
					<div class="policy-item">
						<p class="policy-label">Coverage</p>
						<p class="policy-value">
							{selectedAdvancedTemplate.coverageMode === 'timed'
								? `${selectedAdvancedTemplate.startTime ?? '--:--'} to ${selectedAdvancedTemplate.endTime ?? '--:--'}`
								: 'All day'}
						</p>
					</div>
					<div class="policy-item">
						<p class="policy-label">Blocking duty</p>
						<p class="policy-value">
							{selectedAdvancedTemplate.isBlocking
								? 'Yes — placed Soldiers are unavailable for overlapping duties.'
								: 'No — does not block overlapping assignments.'}
						</p>
					</div>
					<div class="policy-item">
						<p class="policy-label">Cooldown</p>
						<p class="policy-value">
							{selectedAdvancedTemplate.cooldownHours > 0
								? `${selectedAdvancedTemplate.cooldownHours} hour${selectedAdvancedTemplate.cooldownHours === 1 ? '' : 's'} after the shift ends.`
								: 'No cooldown window.'}
						</p>
					</div>
					<div class="policy-item">
						<p class="policy-label">Status exemptions</p>
						<p class="policy-value">
							{#if (selectedAdvancedTemplate.exemptStatusTypeIds ?? []).length > 0}
								{(selectedAdvancedTemplate.exemptStatusTypeIds ?? [])
									.map((statusTypeId) => statusTypeNameById.get(statusTypeId) ?? statusTypeId)
									.join(', ')}
							{:else}
								None configured.
							{/if}
						</p>
					</div>
					<div class="policy-item">
						<p class="policy-label">Positions to fill</p>
						<p class="policy-value">
							{selectedAdvancedTemplate.slots.reduce((total, slot) => total + slot.quantity, 0)} total across {selectedAdvancedTemplate
								.slots.length} slot definition{selectedAdvancedTemplate.slots.length === 1 ? '' : 's'}.
						</p>
					</div>
					{#each selectedAdvancedTemplate.slots as slot (slot.id)}
						<div class="policy-item policy-slot">
							<p class="policy-label">{slot.roleLabel} × {slot.quantity}</p>
							<p class="policy-value policy-value-secondary">
								Pool: {slot.rotationPoolKey}
								{#if slot.allowedRanks.length > 0}
									· Ranks: {slot.allowedRanks.join(', ')}{/if}
							</p>
						</div>
					{/each}
				</div>

				<div class="step-actions">
					<button class="btn btn-primary" type="button" onclick={goToDatePattern}>
						Looks Good — Set Date Pattern
					</button>
				</div>
			</section>
		{/if}

		<!-- ── Step 3: Date pattern ── -->
		{#if view === 'advanced-date-pattern' && selectedAdvancedTemplate}
			<section class="step-card card card-flat">
				<div class="list-header">
					<div>
						<p class="eyebrow">Step 3 of 4 · Date pattern</p>
						<h3>Choose when this series runs.</h3>
					</div>
					<button class="btn btn-secondary btn-sm" type="button" onclick={goToPolicyReview}>Back</button>
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
						<span class="label">Pattern</span>
						<select
							class="select"
							value={advancedPattern}
							aria-label="Date Pattern"
							onchange={(e) =>
								handlePatternChange((e.currentTarget as HTMLSelectElement).value as DutyEventSeriesPattern)}
						>
							<option value="daily">Daily</option>
							<option value="weekday-only">Weekdays Only</option>
							<option value="weekend-only">Weekends Only</option>
							<option value="selected-weekdays">Selected Weekdays</option>
							<option value="holiday-closure-only">Holiday/Closure Only</option>
							<option value="custom-dates">Custom Dates</option>
						</select>
					</label>
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
							<span class="label">Add Date</span>
							<input class="input" type="date" bind:value={customDateDraft} />
						</label>
						<button class="btn btn-secondary" type="button" onclick={addCustomDate}>Add</button>
						<div class="slot-chip-list">
							{#each customDateEntries as date (date)}
								<button class="slot-chip slot-chip-action" type="button" onclick={() => removeCustomDate(date)}
									>{date}</button
								>
							{/each}
						</div>
					</div>
				{/if}

				<div class="step-actions">
					<button
						class="btn btn-primary"
						type="button"
						disabled={!buildSeriesInput() || isPreviewingAdvancedSeries}
						onclick={handlePreviewAdvancedSeries}
					>
						{isPreviewingAdvancedSeries ? 'Generating Preview...' : 'Preview Series'}
					</button>
				</div>
			</section>
		{/if}

		<!-- ── Step 4: Series preview ── -->
		{#if view === 'advanced-series-preview' && selectedAdvancedTemplate && advancedSeriesPreview}
			<div class="step-back-row">
				<button class="btn btn-secondary btn-sm" type="button" onclick={goToDatePattern}>Back to Date Pattern</button>
			</div>
			<SeriesPreviewPanel
				preview={advancedSeriesPreview}
				template={selectedAdvancedTemplate}
				overrides={advancedSeriesOverrides}
				isRefreshing={isRefreshingAdvancedSeriesPreview}
				isApplying={isApplyingAdvancedSeries}
				{collisionReviewConfirmed}
				{previewCollisionMessages}
				personnelOptions={previewPersonnelOptions}
				formatAssignee={formatSlotAssignee}
				{formatCoverageLabel}
				getExplanationSections={getSlotExplanationSections}
				{hasSeriesSlotOverride}
				onApply={handleApplyAdvancedSeries}
				onCollisionConfirmedChange={(v) => (collisionReviewConfirmed = v)}
				onUpdateSlotAssignee={updateSeriesSlotAssignee}
				onToggleSlotLock={toggleSeriesSlotLock}
				onClearSlot={clearSeriesSlot}
				onResetSlot={resetSeriesSlot}
			/>
		{/if}
	{/if}

	<!-- ── Applied events (always visible) ── -->
	<section class="applied-events card card-flat">
		<div class="list-header">
			<div>
				<p class="eyebrow">Applied events</p>
				<h3>Applied advanced duty events</h3>
			</div>
		</div>

		<AppliedEventLedger
			groups={appliedEventGroups}
			{formatDisplayDate}
			formatGroupRange={formatAppliedGroupRange}
			{formatCoverageLabel}
			formatFillSummary={formatAppliedFillSummary}
			{formatSlotAssignee}
			onOpenEvent={openAppliedEventEditor}
			onRequestDeleteEvent={requestDeleteAppliedEvent}
			onRequestDeleteRun={requestDeleteAppliedRun}
			selectedEventId={selectedAppliedEventId}
		/>
	</section>

	{#if selectedAppliedEvent}
		<Modal
			title={`Edit applied event: ${selectedAppliedEvent.templateName} · ${formatDisplayDate(selectedAppliedEvent.eventDate)}`}
			onClose={closeAppliedEventEditor}
			width="1100px"
			titleId="applied-event-editor-title"
			canClose={!isRefreshingAppliedEventPreview && !isSavingAppliedEvent}
		>
			{#if appliedEventPreview}
				<AppliedEventEditor
					event={selectedAppliedEvent}
					preview={appliedEventPreview}
					isLoadingPreview={isLoadingAppliedEventPreview}
					isRefreshing={isRefreshingAppliedEventPreview}
					isSaving={isSavingAppliedEvent}
					collisionReviewConfirmed={appliedEventCollisionReviewConfirmed}
					collisionMessages={appliedEventCollisionMessages}
					personnelOptions={previewPersonnelOptions}
					formatAssignee={formatSlotAssignee}
					{formatDisplayDate}
					{formatCoverageLabel}
					getExplanationSections={getSlotExplanationSections}
					onSave={handleSaveAppliedEvent}
					onRegenerate={regenerateAppliedEvent}
					onExportPacket={exportAppliedDutyPacket}
					onCollisionConfirmedChange={(v) => (appliedEventCollisionReviewConfirmed = v)}
					onUpdateSlotAssignee={updateAppliedEventSlotAssignee}
					onToggleSlotLock={toggleAppliedEventSlotLock}
					onClearSlot={clearAppliedEventSlot}
					onRegenerateSlot={regenerateAppliedEventSlot}
				/>
			{:else}
				<div class="applied-editor-loading" aria-live="polite">
					<p>Loading applied event editor...</p>
				</div>
			{/if}
		</Modal>
	{/if}

	{#if pendingRunDelete}
		<ConfirmDialog
			title="Delete Applied History Run?"
			message={`Delete ${pendingRunDelete.eventCount} applied event${pendingRunDelete.eventCount === 1 ? '' : 's'} from ${formatAppliedGroupRange(pendingRunDelete)}? This removes every generated day in this history item.`}
			confirmLabel="Delete Run"
			cancelLabel="Cancel"
			variant="danger"
			onConfirm={confirmDeleteAppliedRun}
			onCancel={cancelPendingDelete}
		/>
	{/if}

	{#if pendingEventDelete}
		<ConfirmDialog
			title="Delete Applied Day?"
			message={`Delete ${formatDisplayDate(pendingEventDelete.eventDate)} from applied history? If this is the last day in its run, the history item is removed automatically.`}
			confirmLabel="Delete Day"
			cancelLabel="Cancel"
			variant="danger"
			onConfirm={confirmDeleteAppliedEvent}
			onCancel={cancelPendingDelete}
		/>
	{/if}
</section>

<style>
	.wizard-shell {
		display: grid;
		gap: var(--sp-5);
	}

	.wizard-hero,
	.wizard-banner,
	.step-card,
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

	.wizard-banner {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--sp-4);
	}

	.step-card {
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	.applied-events {
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	.list-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--sp-4);
	}

	.header-actions {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
		flex-shrink: 0;
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
	h4 {
		margin: 0;
	}

	.wizard-copy,
	.lane-copy,
	.template-description,
	.lane-note,
	.template-meta {
		margin: var(--sp-2) 0 0;
		color: var(--text-secondary);
	}

	.lane-grid {
		display: grid;
		gap: var(--sp-4);
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
	}

	.template-grid {
		display: grid;
		gap: var(--sp-4);
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		margin-top: var(--sp-4);
	}

	.preset-grid {
		display: grid;
		gap: var(--sp-4);
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		margin-top: var(--sp-4);
	}

	.lane-card,
	.template-card,
	.preset-card {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		padding: var(--sp-4);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	.lane-card .lane-copy,
	.template-card .template-description,
	.preset-card .template-description {
		flex: 1;
	}

	.lane-card > .btn,
	.template-card > .btn,
	.preset-card > .btn {
		align-self: flex-start;
		margin-top: auto;
	}

	.preset-card-blank {
		border-style: dashed;
		background: var(--surface-subtle);
	}

	.existing-templates-section {
		margin-top: var(--sp-5);
		padding-top: var(--sp-5);
		border-top: 1px solid var(--border-subtle);
	}

	.existing-header {
		margin-bottom: var(--sp-2);
	}

	/* Policy review */
	.policy-grid {
		display: grid;
		gap: var(--sp-3);
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		margin-top: var(--sp-4);
	}

	.policy-item {
		padding: var(--sp-3);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
	}

	.policy-slot {
		border-left: 3px solid color-mix(in srgb, var(--amber-light) 80%, transparent);
	}

	.policy-label {
		margin: 0 0 4px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.policy-value {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--text-primary);
		font-weight: var(--font-weight-medium);
	}

	.policy-value-secondary {
		font-weight: var(--font-weight-normal);
		color: var(--text-secondary);
	}

	/* Date pattern form */
	.advanced-form {
		display: flex;
		gap: var(--sp-3);
		flex-wrap: wrap;
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

	.slot-chip-list {
		display: flex;
		gap: var(--sp-3);
		flex-wrap: wrap;
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

	.step-actions {
		margin-top: var(--sp-5);
		padding-top: var(--sp-4);
		border-top: 1px solid var(--border-subtle);
		display: flex;
		gap: var(--sp-3);
	}

	.step-back-row {
		display: flex;
		justify-content: flex-start;
	}

	.applied-editor-loading {
		min-height: 180px;
		display: grid;
		place-items: center;
		color: var(--text-secondary);
	}

	@media (max-width: 720px) {
		.wizard-banner,
		.list-header {
			flex-direction: column;
			align-items: stretch;
		}

		.header-actions {
			width: 100%;
		}

		.header-actions :global(.btn) {
			flex: 1;
		}
	}
</style>
