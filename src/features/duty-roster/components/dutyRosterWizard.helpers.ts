import type { Personnel } from '$lib/types';
import type { TeamDutyPacketExportModel } from '../advanced-run/advancedDutyRun';
import type {
	DutyEvent,
	DutyEventApplyInput,
	DutyEventPreview,
	DutyEventPreviewSlotInstance,
	DutyEventSeriesEventOverrideInput,
	DutyEventSeriesInput,
	DutyEventSeriesPattern,
	DutyEventSeriesPreview,
	DutyEventSlotOverrideInput,
	DutyTemplate
} from '../duty-roster.types';
export type SlotExplanationSection = {
	label: string;
	tone: 'default' | 'warning' | 'conflict';
	lines: string[];
};

export interface AppliedEventRunGroup {
	key: string;
	runId: string | null;
	templateName: string;
	eventCount: number;
	startDate: string;
	endDate: string;
	isLegacy: boolean;
	events: DutyEvent[];
}

export type CoverageDisplay = Pick<DutyEvent, 'coverageMode' | 'coverageStart' | 'coverageEnd'>;

export const ADVANCED_STEPS = [
	{ id: 'template', label: 'Choose Template' },
	{ id: 'policy', label: 'Review Policy' },
	{ id: 'date-pattern', label: 'Date Pattern' },
	{ id: 'candidates', label: 'Candidate Review' },
	{ id: 'preview', label: 'Preview & Apply' }
];

export const weekdayOptions = [
	{ value: 0, label: 'Sunday' },
	{ value: 1, label: 'Monday' },
	{ value: 2, label: 'Tuesday' },
	{ value: 3, label: 'Wednesday' },
	{ value: 4, label: 'Thursday' },
	{ value: 5, label: 'Friday' },
	{ value: 6, label: 'Saturday' }
];

export function buildAppliedEventGroups(appliedAdvancedEvents: DutyEvent[]): AppliedEventRunGroup[] {
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
}

export function getTodayDate(): string {
	return formatLocalDate(new Date());
}

export function addCalendarDays(date: string, days: number): string {
	const [year, month, day] = date.split('-').map(Number);
	const value = new Date(year, month - 1, day);
	value.setDate(value.getDate() + days);
	return formatLocalDate(value);
}

function formatLocalDate(value: Date): string {
	const year = value.getFullYear();
	const month = String(value.getMonth() + 1).padStart(2, '0');
	const day = String(value.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export function formatDisplayDate(date: string): string {
	return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
		new Date(`${date}T00:00:00`)
	);
}

function formatCoverageTimeLabel(dateTime: string): string {
	return dateTime.slice(11, 16).replace(':', '');
}

export function formatCoverageLabel(event: CoverageDisplay): string {
	if (event.coverageMode === 'all-day') return 'All day';
	const startsOn = event.coverageStart.slice(0, 10);
	const endsOn = event.coverageEnd.slice(0, 10);
	const start = formatCoverageTimeLabel(event.coverageStart);
	const end = formatCoverageTimeLabel(event.coverageEnd);
	return startsOn === endsOn ? `${start}-${end}` : `${start}-${end} next day`;
}

export function formatSeriesPatternLabel(pattern: DutyEventSeriesPattern): string {
	switch (pattern) {
		case 'daily':
			return 'Daily';
		case 'weekday-only':
			return 'Weekdays only';
		case 'weekend-only':
			return 'Weekends only';
		case 'selected-weekdays':
			return 'Selected weekdays';
		case 'holiday-closure-only':
			return 'Holiday/closure only';
		case 'custom-dates':
			return 'Custom dates';
	}
}

export function formatAppliedGroupRange(group: Pick<AppliedEventRunGroup, 'startDate' | 'endDate'>): string {
	return group.startDate === group.endDate
		? formatDisplayDate(group.startDate)
		: `${formatDisplayDate(group.startDate)} to ${formatDisplayDate(group.endDate)}`;
}

export function formatAppliedFillSummary(event: DutyEvent): string {
	return `${event.fillSummary.filledSlots}/${event.fillSummary.totalSlots} filled`;
}

export function formatSlotAssignee(assigneeId: string | null, personnelById: Map<string, Personnel>): string {
	if (!assigneeId) return 'Unfilled';
	const person = personnelById.get(assigneeId);
	return person ? `${person.rank} ${person.lastName}` : assigneeId;
}

export function describeFairnessConfidence(confidence: DutyEventPreviewSlotInstance['fairnessConfidence']): string {
	if (confidence === 'low')
		return 'Low confidence — most eligible Soldiers lack rotation history for this pool. Seed starting baselines in the template builder to improve fairness.';
	if (confidence === 'medium')
		return 'Medium confidence — some Soldiers lack rotation history. Picks are reasonably fair but history is incomplete.';
	return 'High confidence — all eligible Soldiers have rotation history. Picks are fully informed.';
}

export function getSlotExplanationSections(slot: DutyEventPreviewSlotInstance): SlotExplanationSection[] {
	const sections: SlotExplanationSection[] = [
		{ label: 'Fairness confidence', tone: 'default', lines: [describeFairnessConfidence(slot.fairnessConfidence)] }
	];
	if (slot.selectionReason)
		sections.push({ label: 'Why this Soldier was selected', tone: 'default', lines: [slot.selectionReason] });
	if (slot.overrideMessages && slot.overrideMessages.length > 0) {
		sections.push({
			label: 'Why others were skipped',
			tone: slot.warningState === 'conflict' ? 'conflict' : slot.warningState === 'warning' ? 'warning' : 'default',
			lines: [...slot.overrideMessages]
		});
	}
	if (slot.unfilledReason) {
		sections.push({
			label: 'Why this slot stayed unfilled',
			tone: slot.warningState === 'conflict' ? 'conflict' : 'default',
			lines: [slot.unfilledReason]
		});
	}
	return sections;
}

export function buildSlotOverridesFromPreview(
	slotInstances: DutyEventPreviewSlotInstance[]
): DutyEventSlotOverrideInput[] {
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

export function buildDutyPacketMarkup(exportModel: TeamDutyPacketExportModel): string {
	const slotSections = exportModel.slotAssignments
		.map((slot) => {
			const explanationLines = [...slot.explanations, ...slot.warnings];
			const explanationMarkup = explanationLines
				.map(
					(line) => `
			<li>${escapePacketHtml(line)}</li>`
				)
				.join('');
			return `<section class="slot-card"><div class="slot-heading"><h3>${escapePacketHtml(`${slot.roleLabel} #${slot.slotIndex + 1}`)}</h3><p>${escapePacketHtml(slot.assignee?.label ?? 'Unfilled')}</p></div><p class="slot-meta">Source: ${escapePacketHtml(slot.assignmentSource)}${slot.warningState !== 'none' ? ` · ${escapePacketHtml(slot.warningState)}` : ''}</p>${explanationMarkup ? `<ul>${explanationMarkup}</ul>` : '<p>No extra explanation recorded for this slot.</p>'}</section>`;
		})
		.join('');
	const rosterLine =
		exportModel.slotAssignments
			.map((slot) => slot.assignee?.label)
			.filter((label): label is string => Boolean(label))
			.sort((a, b) => a.localeCompare(b))
			.join(', ') || 'No Soldier assigned yet';
	const collisionSection =
		exportModel.collisionNotes.length > 0
			? `<section><h2>Collision notes</h2><ul>${exportModel.collisionNotes.map((note) => `<li>${escapePacketHtml(note)}</li>`).join('')}</ul></section>`
			: '';
	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>${escapePacketHtml(`${exportModel.templateName} Team Duty Packet`)}</title><style>body{font-family:Georgia,"Times New Roman",serif;margin:32px;color:#1f2937;}h1,h2,h3,p{margin:0;}header,section{margin-bottom:24px;}.meta-grid{display:grid;gap:8px;margin-top:12px;}.roster-line{margin-top:12px;font-weight:600;}.slot-grid{display:grid;gap:16px;}.slot-card{border:1px solid #d6d3d1;border-radius:12px;padding:16px;background:#fafaf9;}.slot-heading{display:flex;justify-content:space-between;gap:12px;align-items:baseline;}.slot-meta{margin-top:6px;color:#57534e;font-size:14px;}ul{margin:12px 0 0 18px;padding:0;}li+li{margin-top:6px;}</style></head><body><header><p>Team Duty Packet</p><h1>${escapePacketHtml(exportModel.templateName)}</h1><div class="meta-grid"><p>Status: ${escapePacketHtml(exportModel.statusLabel)}</p><p>Date: ${escapePacketHtml(formatDisplayDate(exportModel.eventDate))}</p><p>Coverage: ${escapePacketHtml(exportModel.coverage.label)}</p><p>Fill: ${escapePacketHtml(`${exportModel.fillSummary.filledSlots}/${exportModel.fillSummary.totalSlots} filled`)}</p><p>Blocking: ${escapePacketHtml(exportModel.isBlocking ? 'Yes' : 'No')}</p></div><p class="roster-line">Assigned team: ${escapePacketHtml(rosterLine)}</p></header><section><h2>Duty team</h2><div class="slot-grid">${slotSections}</div></section>${collisionSection}</body></html>`;
}

export function patternNeedsRange(pattern: DutyEventSeriesPattern): boolean {
	return pattern !== 'custom-dates';
}

export function matchesTemplateScope(person: Personnel, template: DutyTemplate): boolean {
	return template.scopeType === 'organization'
		? true
		: person.groupId != null && template.scopeGroupIds.includes(person.groupId);
}

export function matchesTemplateSlotEligibility(person: Personnel, slot: DutyTemplate['slots'][number]): boolean {
	return (
		(slot.allowedRanks.length === 0 || slot.allowedRanks.includes(person.rank)) &&
		(slot.allowedGroupIds.length === 0 || (person.groupId != null && slot.allowedGroupIds.includes(person.groupId))) &&
		(slot.allowedMosValues.length === 0 || slot.allowedMosValues.includes(person.mos)) &&
		(slot.allowedRoleValues.length === 0 || slot.allowedRoleValues.includes(person.clinicRole))
	);
}

export function buildDefaultRunCandidateIds(candidateReviewOptions: Personnel[]): string[] {
	return candidateReviewOptions.map((person) => person.id);
}

export function buildCandidatePersonnelIdsInput(
	selectedRunCandidateIds: string[] | null,
	candidateReviewOptions: Personnel[]
): string[] | undefined {
	const defaultIds = buildDefaultRunCandidateIds(candidateReviewOptions);
	if (defaultIds.length === 0) return undefined;
	const selectedIds = (selectedRunCandidateIds ?? defaultIds).filter((id) => defaultIds.includes(id));
	return selectedIds.length === defaultIds.length ? undefined : selectedIds;
}

export function formatCandidateReviewLabel(person: Personnel): string {
	return `${person.rank} ${person.lastName}, ${person.firstName}`;
}
export function formatCandidateReviewMeta(person: Personnel): string {
	return [person.groupName, person.mos, person.clinicRole].filter(Boolean).join(' · ');
}
export function selectedRunCandidateCount(
	selectedRunCandidateIds: string[] | null,
	candidateReviewOptions: Personnel[]
): number {
	return (selectedRunCandidateIds ?? buildDefaultRunCandidateIds(candidateReviewOptions)).length;
}
export function isRunCandidateSelected(
	selectedRunCandidateIds: string[] | null,
	candidateReviewOptions: Personnel[],
	personId: string
): boolean {
	return (selectedRunCandidateIds ?? buildDefaultRunCandidateIds(candidateReviewOptions)).includes(personId);
}
export function toggleRunCandidate(
	selectedRunCandidateIds: string[] | null,
	candidateReviewOptions: Personnel[],
	personId: string
): string[] {
	const current = selectedRunCandidateIds ?? buildDefaultRunCandidateIds(candidateReviewOptions);
	return current.includes(personId)
		? current.filter((id) => id !== personId)
		: [...current, personId].sort((a, b) => a.localeCompare(b));
}

export function wrapSinglePreview(preview: DutyEventPreview): DutyEventSeriesPreview {
	return {
		templateId: preview.templateId,
		templateName: preview.templateName,
		pattern: 'custom-dates',
		eventDates: [preview.eventDate],
		events: [preview]
	};
}

export function findSeriesSlotOverride(
	baseOverrides: DutyEventSeriesEventOverrideInput[],
	eventDate: string,
	slot: DutyEventPreviewSlotInstance
): DutyEventSlotOverrideInput | null {
	return (
		baseOverrides
			.find((entry) => entry.eventDate === eventDate)
			?.slotOverrides.find(
				(override) => override.templateSlotId === slot.templateSlotId && override.slotIndex === slot.slotIndex
			) ?? null
	);
}

export function buildNextSeriesOverrides(
	baseOverrides: DutyEventSeriesEventOverrideInput[],
	eventDate: string,
	slot: DutyEventPreviewSlotInstance,
	nextOverride: DutyEventSlotOverrideInput | null
): DutyEventSeriesEventOverrideInput[] {
	const nextEntries = baseOverrides.map((entry) =>
		entry.eventDate === eventDate ? { ...entry, slotOverrides: [...entry.slotOverrides] } : entry
	);
	const entryIndex = nextEntries.findIndex((entry) => entry.eventDate === eventDate);
	const currentEntry = entryIndex >= 0 ? nextEntries[entryIndex] : { eventDate, slotOverrides: [] };
	const filteredSlotOverrides = currentEntry.slotOverrides.filter(
		(override) => !(override.templateSlotId === slot.templateSlotId && override.slotIndex === slot.slotIndex)
	);
	if (nextOverride) filteredSlotOverrides.push(nextOverride);
	if (filteredSlotOverrides.length === 0)
		return entryIndex >= 0 ? nextEntries.filter((entry) => entry.eventDate !== eventDate) : nextEntries;
	const nextEntry = { eventDate, slotOverrides: filteredSlotOverrides };
	if (entryIndex >= 0) {
		nextEntries[entryIndex] = nextEntry;
		return nextEntries;
	}
	return [...nextEntries, nextEntry];
}

export function hasSeriesSlotOverride(
	baseOverrides: DutyEventSeriesEventOverrideInput[],
	eventDate: string,
	slot: DutyEventPreviewSlotInstance
): boolean {
	return !!findSeriesSlotOverride(baseOverrides, eventDate, slot);
}

export function findAppliedEventSlotOverride(
	appliedEventOverrides: DutyEventSlotOverrideInput[],
	slot: DutyEventPreviewSlotInstance
): DutyEventSlotOverrideInput | null {
	return (
		appliedEventOverrides.find(
			(override) => override.templateSlotId === slot.templateSlotId && override.slotIndex === slot.slotIndex
		) ?? null
	);
}

export function buildNextAppliedEventOverrides(
	appliedEventOverrides: DutyEventSlotOverrideInput[],
	slot: DutyEventPreviewSlotInstance,
	nextOverride: DutyEventSlotOverrideInput | null
): DutyEventSlotOverrideInput[] {
	const filteredOverrides = appliedEventOverrides.filter(
		(override) => !(override.templateSlotId === slot.templateSlotId && override.slotIndex === slot.slotIndex)
	);
	return nextOverride ? [...filteredOverrides, nextOverride] : filteredOverrides;
}

export function buildSingleEventInput(
	selectedAdvancedTemplateId: string | null,
	advancedStartDate: string,
	advancedSeriesOverrides: DutyEventSeriesEventOverrideInput[],
	candidateReviewOptions: Personnel[],
	selectedRunCandidateIds: string[] | null
): DutyEventApplyInput | null {
	if (!selectedAdvancedTemplateId || !advancedStartDate) return null;
	const slotOverrides = advancedSeriesOverrides.find((entry) => entry.eventDate === advancedStartDate)?.slotOverrides;
	return {
		templateId: selectedAdvancedTemplateId,
		eventDate: advancedStartDate,
		candidatePersonnelIds: buildCandidatePersonnelIdsInput(selectedRunCandidateIds, candidateReviewOptions),
		slotOverrides: slotOverrides && slotOverrides.length > 0 ? slotOverrides : undefined
	};
}

export function buildSeriesInput(
	selectedAdvancedTemplateId: string | null,
	advancedPattern: DutyEventSeriesPattern,
	advancedStartDate: string,
	advancedEndDate: string,
	selectedWeekdays: Set<number>,
	customDateEntries: string[],
	advancedSeriesOverrides: DutyEventSeriesEventOverrideInput[],
	candidateReviewOptions: Personnel[],
	selectedRunCandidateIds: string[] | null
): DutyEventSeriesInput | null {
	if (!selectedAdvancedTemplateId) return null;
	if (advancedPattern === 'custom-dates') {
		if (customDateEntries.length === 0) return null;
		return {
			templateId: selectedAdvancedTemplateId,
			pattern: advancedPattern,
			customDates: customDateEntries,
			candidatePersonnelIds: buildCandidatePersonnelIdsInput(selectedRunCandidateIds, candidateReviewOptions),
			eventOverrides: advancedSeriesOverrides.length > 0 ? advancedSeriesOverrides : undefined
		};
	}
	if (!advancedStartDate || !advancedEndDate) return null;
	return {
		templateId: selectedAdvancedTemplateId,
		startDate: advancedStartDate,
		endDate: advancedEndDate,
		pattern: advancedPattern,
		candidatePersonnelIds: buildCandidatePersonnelIdsInput(selectedRunCandidateIds, candidateReviewOptions),
		selectedWeekdays: advancedPattern === 'selected-weekdays' ? [...selectedWeekdays].sort((a, b) => a - b) : undefined,
		eventOverrides: advancedSeriesOverrides.length > 0 ? advancedSeriesOverrides : undefined
	};
}
