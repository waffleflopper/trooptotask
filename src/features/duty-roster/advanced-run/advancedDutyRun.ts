import { resolveSlotBlockingMode } from '$features/duty-roster/blockingMode';
import { highestPriorityDa6Treatment } from '$features/calendar/utils/da6AvailabilityTreatment';
import {
	cloneDefaultSoftPreferences,
	DEFAULT_SOFT_PREFERENCE_ORDER as defaultSoftPreferenceOrder,
	type DutyEventCollisionSummary,
	type DutyEventFairnessConfidence,
	type DutyEventFillSummary,
	type DutyEventPreview,
	type DutyEventPreviewSlotInstance,
	type DutyEventSlotCandidateRanking,
	type DutyEventRulesSnapshot,
	type DutyEventSlotInstance,
	type DutyEventSlotOverrideInput,
	type DutyTemplate,
	type DutyTemplateSlot,
	type SoftPreferenceConfig
} from '$features/duty-roster/duty-roster.types';
import type { AvailabilityEntry, Da6AvailabilityTreatment, Personnel, StatusType } from '$lib/types';

interface PoolHistorySummary {
	lastServedDate: string | null;
	lastWeekendHolidayDate: string | null;
}

interface Da6RankingPolicy {
	separateWeekendDa6: boolean;
	includeHolidayDonsa: boolean;
}

export interface AdvancedRunHistoryEvent {
	id: string;
	templateId?: string;
	eventDate: string;
	coverageStart?: string;
	coverageEnd?: string;
	cooldownHours?: number;
	isBlocking?: boolean;
	slotInstances: Array<{
		templateSlotId: string | null;
		assigneeId: string | null;
		isBlocking?: boolean;
	}>;
	rulesSnapshot?: {
		slots?: Array<{
			templateSlotId?: string | null;
			rotationPoolKey?: string | null;
			blockingMode?: DutyTemplateSlot['blockingMode'];
		}>;
	};
}

export interface AdvancedRunTransientEvent {
	eventDate: string;
	coverageStart: string;
	coverageEnd: string;
	cooldownHours: number;
	isBlocking: boolean;
	slotInstances: Array<{
		templateSlotId: string | null;
		slotIndex: number;
		assigneeId: string | null;
		isBlocking: boolean;
	}>;
}

type AdvancedSlotProposal = DutyEventPreviewSlotInstance & {
	blockingMessages: string[];
	isBlocking: boolean;
};

export type TeamDutyPacketExportStatus = 'preview' | 'applied';

export interface TeamDutyPacketSlotAssignment {
	templateSlotId: string | null;
	roleLabel: string;
	slotIndex: number;
	assignee: {
		id: string;
		label: string;
		displayName: string;
		rank: string;
		firstName: string;
		lastName: string;
	} | null;
	assignmentSource: DutyEventPreviewSlotInstance['assignmentSource'];
	warningState: DutyEventPreviewSlotInstance['warningState'];
	warnings: string[];
	explanations: string[];
}

export interface TeamDutyPacketExportModel {
	status: TeamDutyPacketExportStatus;
	statusLabel: string;
	templateName: string;
	eventDate: string;
	coverage: {
		mode: DutyTemplate['coverageMode'];
		start: string;
		end: string;
		label: string;
	};
	isBlocking: boolean;
	fillSummary: DutyEventFillSummary;
	slotAssignments: TeamDutyPacketSlotAssignment[];
	collisionNotes: string[];
}

type TeamDutyPacketSlotSource = Pick<
	DutyEventPreviewSlotInstance,
	| 'templateSlotId'
	| 'roleLabel'
	| 'slotIndex'
	| 'assigneeId'
	| 'assignmentSource'
	| 'warningState'
	| 'selectionReason'
	| 'unfilledReason'
	| 'overrideMessages'
>;

export interface AdvancedEventSnapshot {
	eventDate: string;
	coverageStart: string;
	coverageEnd: string;
	preview: DutyEventPreview;
	slotProposals: AdvancedSlotProposal[];
	blockingConflicts: string[];
	availabilityClassifications: AdvancedAvailabilityClassification[];
	exportModel: TeamDutyPacketExportModel;
}

export type AdvancedAvailabilityReasonCode =
	| 'authorized-absence'
	| 'other-duty-status'
	| 'misconduct-unavailable'
	| 'advanced-duty-overlap'
	| 'advanced-duty-cooldown'
	| 'template-exemption';

export interface AdvancedAvailabilityClassification {
	personnelId: string;
	selectable: boolean;
	chargeable: boolean;
	treatment: Da6AvailabilityTreatment | 'template-exemption' | null;
	statusNames: string[];
	reason: string | null;
	reasonCode: AdvancedAvailabilityReasonCode | null;
}

export interface AdvancedRunPersonnelSnapshot {
	id: string;
	rank: string;
	firstName: string;
	lastName: string;
	displayName: string;
	mos: string;
	clinicRole: string;
	groupId: string | null;
	groupName: string;
}

export interface AdvancedRunSnapshot {
	snapshotVersion: 1;
	templateId: string;
	templateName: string;
	eventDates: string[];
	candidatePersonnelIds: string[];
	template: {
		rulesSnapshot: DutyEventRulesSnapshot;
	};
	personnel: AdvancedRunPersonnelSnapshot[];
	events: AdvancedEventSnapshot[];
}

export interface AdvancedRunCollisionResult {
	summary: DutyEventCollisionSummary;
	slotMessages: Map<string, string[]>;
	blockingConflicts: string[];
}

export interface AdvancedRunEventCollisionInput {
	eventDate: string;
	coverageStart: string;
	coverageEnd: string;
	cooldownHours: number;
	slotProposals: AdvancedSlotProposal[];
	transientEvents: AdvancedRunTransientEvent[];
}

export interface AdvancedRunSnapshotInput {
	template: DutyTemplate;
	eventDates: string[];
	personnel: Personnel[];
	holidayClosureDates: Set<string>;
	historyEvents: AdvancedRunHistoryEvent[];
	excludedHistoryEventIdsByEventDate?: Map<string, string[]>;
	availabilityEntries?: AvailabilityEntry[];
	statusTypes?: StatusType[];
	misconductUnavailablePersonnelDates?: Record<string, string[]>;
	candidatePersonnelIds?: string[];
	slotOverridesByEventDate?: Map<string, DutyEventSlotOverrideInput[] | undefined>;
	buildCollisionSummary?: (input: AdvancedRunEventCollisionInput) => Promise<AdvancedRunCollisionResult>;
}

interface NormalizedSlotOverride extends DutyEventSlotOverrideInput {
	key: string;
}

interface FairnessResult {
	confidence: DutyEventFairnessConfidence;
	missingHistoryCount: number;
	eligibleCount: number;
}

const emptyCollisionResult: AdvancedRunCollisionResult = {
	summary: { hasConflicts: false, conflicts: [] },
	slotMessages: new Map(),
	blockingConflicts: []
};

function addDays(date: string, days: number): string {
	const value = new Date(`${date}T00:00:00Z`);
	value.setUTCDate(value.getUTCDate() + days);
	return value.toISOString().slice(0, 10);
}

function buildCoverageDateTime(date: string, time: string): string {
	return `${date}T${time}:00`;
}

export function buildAdvancedDutyCoverage(template: DutyTemplate, eventDate: string) {
	if (template.coverageMode === 'all-day') {
		return {
			coverageStart: `${eventDate}T00:00:00`,
			coverageEnd: `${eventDate}T23:59:59`
		};
	}

	if (!template.startTime || !template.endTime) {
		throw new Error('Timed duty templates require both a start time and end time.');
	}

	const endsNextDay = template.endTime <= template.startTime;
	return {
		coverageStart: buildCoverageDateTime(eventDate, template.startTime),
		coverageEnd: buildCoverageDateTime(endsNextDay ? addDays(eventDate, 1) : eventDate, template.endTime)
	};
}

function getDayOfWeek(date: string): number {
	return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function buildSlotKey(templateSlotId: string | null, slotIndex: number): string {
	return `${templateSlotId ?? 'null'}::${slotIndex}`;
}

function matchesSlot(person: Personnel, template: DutyTemplate, slot: DutyTemplateSlot): boolean {
	const scopedGroupIds = template.scopeType === 'groups' ? template.scopeGroupIds : [];
	if (scopedGroupIds.length > 0 && (!person.groupId || !scopedGroupIds.includes(person.groupId))) {
		return false;
	}
	if (slot.allowedGroupIds.length > 0 && (!person.groupId || !slot.allowedGroupIds.includes(person.groupId))) {
		return false;
	}
	if (slot.allowedRanks.length > 0 && !slot.allowedRanks.includes(person.rank)) {
		return false;
	}
	if (slot.allowedMosValues.length > 0 && !slot.allowedMosValues.includes(person.mos)) {
		return false;
	}
	if (slot.allowedRoleValues.length > 0 && !slot.allowedRoleValues.includes(person.clinicRole)) {
		return false;
	}
	return true;
}

function sortPersonnel(a: Personnel, b: Personnel): number {
	return (
		a.lastName.localeCompare(b.lastName, 'en-US') ||
		a.firstName.localeCompare(b.firstName, 'en-US') ||
		a.rank.localeCompare(b.rank, 'en-US') ||
		a.id.localeCompare(b.id)
	);
}

function compareOldestFirst(a: string | null, b: string | null): number {
	if (a && b && a !== b) {
		return a.localeCompare(b);
	}
	if (a && !b) {
		return 1;
	}
	if (!a && b) {
		return -1;
	}
	return 0;
}

function normalizeSoftPreferencesForRanking(
	softPreferences: SoftPreferenceConfig[] | undefined
): SoftPreferenceConfig[] {
	const defaults = cloneDefaultSoftPreferences();
	if (!softPreferences || softPreferences.length === 0) {
		return defaults;
	}

	const byType = new Map<SoftPreferenceConfig['type'], SoftPreferenceConfig>(
		defaults.map((preference) => [preference.type, { ...preference }])
	);
	const hasCurrentWeekendPolicy = softPreferences.some((preference) => preference.type === 'separate-weekend-da6');
	const hasCurrentHolidayDonsaPolicy = softPreferences.some(
		(preference) => preference.type === 'include-holiday-donsa-da6'
	);

	for (const preference of softPreferences) {
		switch (preference.type) {
			case 'longest-break':
				byType.set('longest-break', { type: 'longest-break', enabled: true });
				break;
			case 'separate-weekend-da6':
			case 'include-holiday-donsa-da6':
				byType.set(preference.type, { type: preference.type, enabled: preference.enabled });
				break;
			case 'weekend':
				if (!hasCurrentWeekendPolicy) {
					byType.set('separate-weekend-da6', { type: 'separate-weekend-da6', enabled: preference.enabled });
				}
				break;
			case 'holiday-closure':
				if (!hasCurrentHolidayDonsaPolicy) {
					byType.set('include-holiday-donsa-da6', {
						type: 'include-holiday-donsa-da6',
						enabled: preference.enabled
					});
				}
				break;
			case 'preferred-group':
				break;
		}
	}

	const separateWeekendDa6 = byType.get('separate-weekend-da6')?.enabled ?? false;
	if (!separateWeekendDa6) {
		byType.set('include-holiday-donsa-da6', { type: 'include-holiday-donsa-da6', enabled: false });
	}

	return defaultSoftPreferenceOrder.map((type) => byType.get(type) ?? defaults.find((item) => item.type === type)!);
}

function resolveDa6RankingPolicy(softPreferences: SoftPreferenceConfig[] | undefined): Da6RankingPolicy {
	const resolved = normalizeSoftPreferencesForRanking(softPreferences);
	const separateWeekendDa6 = resolved.some(
		(preference) => preference.type === 'separate-weekend-da6' && preference.enabled
	);
	return {
		separateWeekendDa6,
		includeHolidayDonsa:
			separateWeekendDa6 &&
			resolved.some((preference) => preference.type === 'include-holiday-donsa-da6' && preference.enabled)
	};
}

function isWeekendHolidaySequenceDate(date: string, holidayDonsaDates: Set<string>, policy: Da6RankingPolicy): boolean {
	if (!policy.separateWeekendDa6) {
		return false;
	}
	if (new Set([0, 6]).has(getDayOfWeek(date))) {
		return true;
	}
	return policy.includeHolidayDonsa && holidayDonsaDates.has(date);
}

function describeDa6RankingPolicy(policy: Da6RankingPolicy, isWeekendHolidaySequence: boolean): string {
	if (!policy.separateWeekendDa6) {
		return 'single DA6 sequence';
	}
	return isWeekendHolidaySequence
		? policy.includeHolidayDonsa
			? 'separate weekend, holiday, and DONSA DA6 sequence'
			: 'separate weekend DA6 sequence'
		: 'weekday DA6 sequence';
}

function buildAdvancedDa6SequenceMetadata(
	template: DutyTemplate,
	eventDate: string,
	holidayDonsaDates: Set<string>
): Pick<DutyEventPreview, 'advancedDa6SequenceKey' | 'advancedDa6SequenceLabel'> {
	const policy = resolveDa6RankingPolicy(template.softPreferences);
	const isWeekendHolidaySequence = isWeekendHolidaySequenceDate(eventDate, holidayDonsaDates, policy);
	return {
		advancedDa6SequenceKey: !policy.separateWeekendDa6
			? 'single'
			: isWeekendHolidaySequence
				? 'weekend-holiday'
				: 'weekday',
		advancedDa6SequenceLabel: describeDa6RankingPolicy(policy, isWeekendHolidaySequence)
	};
}

function buildGeneratedSelectionReason(
	template: DutyTemplate,
	slot: DutyTemplateSlot,
	eventDate: string,
	holidayDonsaDates: Set<string>,
	fairnessConfidence: DutyEventFairnessConfidence,
	missingHistoryCount: number,
	eligibleCount: number
): string {
	let fairnessSuffix = '';
	if (fairnessConfidence === 'low') {
		fairnessSuffix = ` Fairness confidence is low: ${missingHistoryCount} of ${eligibleCount} eligible Soldier${eligibleCount === 1 ? '' : 's'} lack rotation history. Seed starting baselines in the template builder to improve ranking accuracy.`;
	} else if (fairnessConfidence === 'medium') {
		fairnessSuffix = ` Fairness confidence is medium: ${missingHistoryCount} of ${eligibleCount} eligible Soldier${eligibleCount === 1 ? '' : 's'} lack rotation history.`;
	}

	const policy = resolveDa6RankingPolicy(template.softPreferences);
	const isWeekendHolidaySequence = isWeekendHolidaySequenceDate(eventDate, holidayDonsaDates, policy);
	return `Selected by longest break in the ${describeDa6RankingPolicy(policy, isWeekendHolidaySequence)} for rotation pool "${slot.rotationPoolKey}".${fairnessSuffix}`;
}

function formatPersonLabel(personnelById: Map<string, Personnel>, personId: string): string {
	const person = personnelById.get(personId);
	return person ? `${person.rank} ${person.lastName}` : personId;
}

function formatAdvancedStatusTreatment(value: Da6AvailabilityTreatment): string {
	switch (value) {
		case 'authorized-absence':
			return 'authorized absence';
		case 'other-duty':
			return 'other duty';
		case 'misconduct-unavailable':
			return 'misconduct-unavailable';
	}
}

function hasDateOverlap(
	entry: Pick<AvailabilityEntry, 'startDate' | 'endDate'>,
	coverageStartDate: string,
	coverageEndDate: string
): boolean {
	return entry.startDate <= coverageEndDate && entry.endDate >= coverageStartDate;
}

function addHours(dateTime: string, hours: number): string {
	const value = new Date(dateTime);
	value.setHours(value.getHours() + hours);
	const year = value.getFullYear();
	const month = String(value.getMonth() + 1).padStart(2, '0');
	const day = String(value.getDate()).padStart(2, '0');
	const hour = String(value.getHours()).padStart(2, '0');
	const minute = String(value.getMinutes()).padStart(2, '0');
	const second = String(value.getSeconds()).padStart(2, '0');
	return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

function historyEventBlocksPersonnel(event: AdvancedRunHistoryEvent, personnelId: string): boolean {
	return event.slotInstances.some((slot) => {
		if (slot.assigneeId !== personnelId) {
			return false;
		}
		if (typeof slot.isBlocking === 'boolean') {
			return slot.isBlocking;
		}
		const snapshotSlot = event.rulesSnapshot?.slots?.find(
			(candidate) => candidate.templateSlotId === slot.templateSlotId
		);
		return resolveSlotBlockingMode(event.isBlocking ?? true, snapshotSlot?.blockingMode);
	});
}

function classifyAdvancedDutyBlock(input: {
	personnelId: string;
	coverageStart: string;
	coverageEnd: string;
	historyEvents: AdvancedRunHistoryEvent[];
	excludedHistoryEventIds: Set<string>;
}): 'advanced-duty-overlap' | 'advanced-duty-cooldown' | null {
	for (const event of input.historyEvents) {
		if (
			input.excludedHistoryEventIds.has(event.id) ||
			!event.coverageStart ||
			!event.coverageEnd ||
			!historyEventBlocksPersonnel(event, input.personnelId)
		) {
			continue;
		}

		if (event.coverageStart < input.coverageEnd && event.coverageEnd > input.coverageStart) {
			return 'advanced-duty-overlap';
		}

		if (
			event.coverageEnd <= input.coverageStart &&
			addHours(event.coverageEnd, event.cooldownHours ?? 0) > input.coverageStart
		) {
			return 'advanced-duty-cooldown';
		}
	}

	return null;
}

function classifyAdvancedAvailability(input: {
	personnel: Personnel[];
	personnelById: Map<string, Personnel>;
	template: DutyTemplate;
	eventDate: string;
	coverageStart: string;
	coverageEnd: string;
	availabilityEntries: AvailabilityEntry[];
	statusTypes: StatusType[];
	misconductUnavailablePersonnelDates: Record<string, string[]>;
	historyEvents: AdvancedRunHistoryEvent[];
	excludedHistoryEventIds: Set<string>;
}): AdvancedAvailabilityClassification[] {
	const permanentExemptIds = new Set(input.template.exemptPersonnelIds ?? []);
	const coverageStartDate = input.coverageStart.slice(0, 10);
	const coverageEndDate = input.coverageEnd.slice(0, 10);

	return input.personnel.map((person) => {
		if (permanentExemptIds.has(person.id)) {
			return {
				personnelId: person.id,
				selectable: false,
				chargeable: false,
				treatment: 'template-exemption',
				statusNames: [],
				reason: `${formatPersonLabel(input.personnelById, person.id)} is exempt from this duty template and cannot be manually assigned.`,
				reasonCode: 'template-exemption'
			};
		}

		const matchingEntries = input.availabilityEntries.filter(
			(entry) => entry.personnelId === person.id && hasDateOverlap(entry, coverageStartDate, coverageEndDate)
		);
		const statusTreatment = highestPriorityDa6Treatment(
			input.statusTypes,
			matchingEntries.map((entry) => entry.statusTypeId)
		);
		const statusNames = matchingEntries
			.filter((entry) => {
				const statusType = input.statusTypes.find((status) => status.id === entry.statusTypeId);
				return statusType?.da6AvailabilityTreatment === statusTreatment;
			})
			.map((entry) => input.statusTypes.find((status) => status.id === entry.statusTypeId)?.name)
			.filter((name): name is string => !!name);

		if (input.misconductUnavailablePersonnelDates[person.id]?.includes(input.eventDate)) {
			return {
				personnelId: person.id,
				selectable: false,
				chargeable: true,
				treatment: 'misconduct-unavailable',
				statusNames: [],
				reason: `${formatPersonLabel(input.personnelById, person.id)} is unavailable due to a misconduct/AWOL-style status.`,
				reasonCode: 'misconduct-unavailable'
			};
		}

		if (statusTreatment) {
			const reasonCode: AdvancedAvailabilityReasonCode =
				statusTreatment === 'other-duty' ? 'other-duty-status' : statusTreatment;
			return {
				personnelId: person.id,
				selectable: false,
				chargeable: statusTreatment !== 'authorized-absence',
				treatment: statusTreatment,
				statusNames,
				reason: `${formatPersonLabel(input.personnelById, person.id)} has ${formatAdvancedStatusTreatment(statusTreatment)} status${statusNames.length > 0 ? ` (${statusNames.join(', ')})` : ''} during this duty window.`,
				reasonCode
			};
		}

		const advancedDutyBlock = classifyAdvancedDutyBlock({
			personnelId: person.id,
			coverageStart: input.coverageStart,
			coverageEnd: input.coverageEnd,
			historyEvents: input.historyEvents,
			excludedHistoryEventIds: input.excludedHistoryEventIds
		});
		if (advancedDutyBlock) {
			return {
				personnelId: person.id,
				// Generated runs must respect blocking duty and cooldown. Manual overrides still surface this as a conflict.
				selectable: false,
				chargeable: true,
				treatment: null,
				statusNames: [],
				reason:
					advancedDutyBlock === 'advanced-duty-overlap'
						? `${formatPersonLabel(input.personnelById, person.id)} is already assigned to blocking advanced duty coverage.`
						: `${formatPersonLabel(input.personnelById, person.id)} is in cooldown from blocking advanced duty coverage.`,
				reasonCode: advancedDutyBlock
			};
		}

		return {
			personnelId: person.id,
			selectable: true,
			chargeable: true,
			treatment: null,
			statusNames: [],
			reason: null,
			reasonCode: null
		};
	});
}

function formatCoverageTimeLabel(dateTime: string): string {
	return dateTime.slice(11, 16).replace(':', '');
}

function formatExportCoverageLabel(
	event: Pick<DutyEventPreview, 'coverageMode' | 'coverageStart' | 'coverageEnd'>
): string {
	if (event.coverageMode === 'all-day') return 'All day';
	const startsOn = event.coverageStart.slice(0, 10);
	const endsOn = event.coverageEnd.slice(0, 10);
	const start = formatCoverageTimeLabel(event.coverageStart);
	const end = formatCoverageTimeLabel(event.coverageEnd);
	return startsOn === endsOn ? `${start}-${end}` : `${start}-${end} next day`;
}

function buildSlotExplanations(slot: TeamDutyPacketSlotSource): string[] {
	return [...new Set([slot.selectionReason, slot.unfilledReason].filter((line): line is string => !!line))];
}

export function buildTeamDutyPacketExportModel(input: {
	templateName: string;
	event: DutyEventPreview;
	slotAssignments?: TeamDutyPacketSlotSource[];
	collisionNotes?: string[];
	personnelById: Map<string, Personnel>;
	status?: TeamDutyPacketExportStatus;
}): TeamDutyPacketExportModel {
	const status = input.status ?? 'preview';
	const slotAssignments = input.slotAssignments ?? input.event.slotInstances;
	const collisionNotes = [
		...input.event.collisionSummary.conflicts,
		...(input.collisionNotes ?? []),
		...slotAssignments.flatMap((slot) => slot.overrideMessages ?? [])
	];
	return {
		status,
		statusLabel: status === 'preview' ? 'Preview - not applied' : 'Applied',
		templateName: input.templateName,
		eventDate: input.event.eventDate,
		coverage: {
			mode: input.event.coverageMode,
			start: input.event.coverageStart,
			end: input.event.coverageEnd,
			label: formatExportCoverageLabel(input.event)
		},
		isBlocking: input.event.isBlocking,
		fillSummary: input.event.fillSummary,
		slotAssignments: slotAssignments.map((slot) => {
			const assignee = slot.assigneeId ? input.personnelById.get(slot.assigneeId) : null;
			return {
				templateSlotId: slot.templateSlotId,
				roleLabel: slot.roleLabel,
				slotIndex: slot.slotIndex,
				assignee: assignee
					? {
							id: assignee.id,
							label: `${assignee.rank} ${assignee.lastName}`,
							displayName: `${assignee.rank} ${assignee.lastName}, ${assignee.firstName}`,
							rank: assignee.rank,
							firstName: assignee.firstName,
							lastName: assignee.lastName
						}
					: null,
				assignmentSource: slot.assignmentSource,
				warningState: slot.warningState,
				warnings: [...(slot.overrideMessages ?? [])],
				explanations: buildSlotExplanations(slot)
			};
		}),
		collisionNotes: [...new Set(collisionNotes)]
	};
}

function buildRulesSnapshot(template: DutyTemplate): DutyEventRulesSnapshot {
	return {
		templateId: template.id,
		templateName: template.name,
		templateStatus: template.status,
		coverageMode: template.coverageMode,
		startTime: template.startTime,
		endTime: template.endTime,
		scopeType: template.scopeType,
		scopeGroupIds: [...template.scopeGroupIds],
		exemptPersonnelIds: [...(template.exemptPersonnelIds ?? [])],
		exemptStatusTypeIds: [],
		isBlocking: template.isBlocking,
		cooldownHours: template.cooldownHours,
		softPreferences: normalizeSoftPreferencesForRanking(template.softPreferences),
		rotationBaselines: template.rotationBaselines.map((baseline) => ({
			rotationPoolKey: baseline.rotationPoolKey,
			personId: baseline.personId,
			lastServedDate: baseline.lastServedDate
		})),
		slots: template.slots.map((slot) => ({
			templateSlotId: slot.id,
			roleLabel: slot.roleLabel,
			quantity: slot.quantity,
			allowedRanks: [...slot.allowedRanks],
			allowedGroupIds: [...slot.allowedGroupIds],
			preferredGroupIds: [...slot.preferredGroupIds],
			allowedMosValues: [...slot.allowedMosValues],
			allowedRoleValues: [...slot.allowedRoleValues],
			blockingMode: slot.blockingMode ?? 'inherit',
			rotationPoolKey: slot.rotationPoolKey,
			sortOrder: slot.sortOrder
		}))
	};
}

function createEmptyPoolHistorySummary(): PoolHistorySummary {
	return {
		lastServedDate: null,
		lastWeekendHolidayDate: null
	};
}

function recordServiceDate(
	summary: PoolHistorySummary,
	date: string,
	holidayDonsaDates: Set<string>,
	policy: Da6RankingPolicy
): PoolHistorySummary {
	const next = { ...summary };
	if (isWeekendHolidaySequenceDate(date, holidayDonsaDates, policy)) {
		if (!next.lastWeekendHolidayDate || next.lastWeekendHolidayDate < date) {
			next.lastWeekendHolidayDate = date;
		}
		return next;
	}
	if (!next.lastServedDate || next.lastServedDate < date) {
		next.lastServedDate = date;
	}
	return next;
}

function getLastServedDate(
	rotationPoolKey: string,
	personId: string,
	historyByPoolPerson = new Map<string, PoolHistorySummary>()
): string | null {
	return historyByPoolPerson.get(`${rotationPoolKey}::${personId}`)?.lastServedDate ?? null;
}

function buildPoolHistoryIndex(
	template: DutyTemplate,
	cutoffDate: string,
	holidayClosureDates: Set<string>,
	historyEvents: AdvancedRunHistoryEvent[],
	excludedHistoryEventIds: Set<string>,
	transientEvents: AdvancedRunTransientEvent[]
): Map<string, PoolHistorySummary> {
	const historyByPoolPerson = new Map<string, PoolHistorySummary>();
	const policy = resolveDa6RankingPolicy(template.softPreferences);

	for (const baseline of template.rotationBaselines) {
		const key = `${baseline.rotationPoolKey}::${baseline.personId}`;
		historyByPoolPerson.set(
			key,
			recordServiceDate(
				historyByPoolPerson.get(key) ?? createEmptyPoolHistorySummary(),
				baseline.lastServedDate,
				holidayClosureDates,
				policy
			)
		);
	}

	for (const event of historyEvents) {
		if (
			event.eventDate > cutoffDate ||
			excludedHistoryEventIds.has(event.id) ||
			(event.templateId && event.templateId !== template.id)
		) {
			continue;
		}
		for (const slot of event.slotInstances) {
			if (!slot.assigneeId || !slot.templateSlotId) {
				continue;
			}
			const snapshotSlot = event.rulesSnapshot?.slots?.find((item) => item.templateSlotId === slot.templateSlotId);
			const rotationPoolKey = snapshotSlot?.rotationPoolKey;
			if (!rotationPoolKey) {
				continue;
			}
			const key = `${rotationPoolKey}::${slot.assigneeId}`;
			historyByPoolPerson.set(
				key,
				recordServiceDate(
					historyByPoolPerson.get(key) ?? createEmptyPoolHistorySummary(),
					event.eventDate,
					holidayClosureDates,
					policy
				)
			);
		}
	}

	for (const event of transientEvents) {
		if (event.eventDate > cutoffDate) {
			continue;
		}

		for (const slot of event.slotInstances) {
			if (!slot.assigneeId || !slot.templateSlotId) {
				continue;
			}

			const templateSlot = template.slots.find((item) => item.id === slot.templateSlotId);
			if (!templateSlot) {
				continue;
			}

			const key = `${templateSlot.rotationPoolKey}::${slot.assigneeId}`;
			historyByPoolPerson.set(
				key,
				recordServiceDate(
					historyByPoolPerson.get(key) ?? createEmptyPoolHistorySummary(),
					event.eventDate,
					holidayClosureDates,
					policy
				)
			);
		}
	}

	return historyByPoolPerson;
}

function rankCandidatesForSlot(
	template: DutyTemplate,
	slot: DutyTemplateSlot,
	personnel: Personnel[],
	historyByPoolPerson: Map<string, PoolHistorySummary>,
	eventDate: string,
	holidayClosureDates: Set<string>
): Personnel[] {
	const policy = resolveDa6RankingPolicy(template.softPreferences);
	const isWeekendHolidaySequence = isWeekendHolidaySequenceDate(eventDate, holidayClosureDates, policy);
	return [...personnel].sort((a, b) => {
		const aSummary = historyByPoolPerson.get(`${slot.rotationPoolKey}::${a.id}`) ?? createEmptyPoolHistorySummary();
		const bSummary = historyByPoolPerson.get(`${slot.rotationPoolKey}::${b.id}`) ?? createEmptyPoolHistorySummary();
		const aLastServed = isWeekendHolidaySequence ? aSummary.lastWeekendHolidayDate : aSummary.lastServedDate;
		const bLastServed = isWeekendHolidaySequence ? bSummary.lastWeekendHolidayDate : bSummary.lastServedDate;
		const diff = compareOldestFirst(aLastServed, bLastServed);
		if (diff !== 0) return diff;

		return sortPersonnel(a, b);
	});
}

function buildFairnessResult(
	template: DutyTemplate,
	slot: DutyTemplateSlot,
	personnel: Personnel[],
	historyByPoolPerson: Map<string, PoolHistorySummary>
): FairnessResult {
	const eligibleCandidates = personnel.filter((person) => matchesSlot(person, template, slot));
	const eligibleCount = eligibleCandidates.length;
	if (eligibleCount === 0) {
		return { confidence: 'low', missingHistoryCount: 0, eligibleCount: 0 };
	}
	const seededCount = eligibleCandidates.filter((person) =>
		getLastServedDate(slot.rotationPoolKey, person.id, historyByPoolPerson)
	).length;
	const missingHistoryCount = eligibleCount - seededCount;
	const ratio = seededCount / eligibleCount;
	const confidence: DutyEventFairnessConfidence = ratio === 1 ? 'high' : ratio >= 0.6 ? 'medium' : 'low';
	return { confidence, missingHistoryCount, eligibleCount };
}

function normalizeSlotOverrides(slotOverrides: DutyEventSlotOverrideInput[] = []): Map<string, NormalizedSlotOverride> {
	const overrideMap = new Map<string, NormalizedSlotOverride>();

	for (const override of slotOverrides) {
		const key = buildSlotKey(override.templateSlotId, override.slotIndex);
		if (overrideMap.has(key)) {
			throw new Error('Duplicate slot overrides are not allowed.');
		}
		overrideMap.set(key, { ...override, key });
	}

	return overrideMap;
}

function buildFillSummary(slotInstances: Array<{ assigneeId: string | null }>): DutyEventFillSummary {
	const totalSlots = slotInstances.length;
	const filledSlots = slotInstances.filter((slot) => slot.assigneeId).length;
	return {
		totalSlots,
		filledSlots,
		unfilledSlots: totalSlots - filledSlots
	};
}

function buildCandidateRankings(candidates: Personnel[]): DutyEventSlotCandidateRanking[] {
	return candidates.map((person, index) => ({
		personnelId: person.id,
		rank: index + 1
	}));
}

function generateSlotInstances(input: {
	template: DutyTemplate;
	personnel: Personnel[];
	personnelById: Map<string, Personnel>;
	historyByPoolPerson: Map<string, PoolHistorySummary>;
	eventDate: string;
	holidayClosureDates: Set<string>;
	availabilityClassifications: AdvancedAvailabilityClassification[];
	slotOverrides?: DutyEventSlotOverrideInput[];
}): AdvancedSlotProposal[] {
	const overrideMap = normalizeSlotOverrides(input.slotOverrides);
	const assignedIds = new Set(
		[...overrideMap.values()].map((override) => override.assigneeId).filter((value): value is string => !!value)
	);
	const matchedOverrideKeys = new Set<string>();
	const slotInstances: AdvancedSlotProposal[] = [];
	const availabilityByPersonnelId = new Map(
		input.availabilityClassifications.map((classification) => [classification.personnelId, classification])
	);
	const hasAnyUnselectableClassifications = input.availabilityClassifications.some(
		(classification) => !classification.selectable
	);
	const hasAvailabilityBlocks = input.availabilityClassifications.some(
		(classification) => !classification.selectable && classification.reasonCode !== 'template-exemption'
	);
	const eligiblePersonnel = hasAnyUnselectableClassifications
		? input.personnel.filter((person) => availabilityByPersonnelId.get(person.id)?.selectable ?? true)
		: input.personnel;

	type WorkItem = {
		slot: DutyTemplateSlot;
		slotIndex: number;
		eligibleCandidates: Personnel[];
		fairnessConfidence: DutyEventFairnessConfidence;
		missingHistoryCount: number;
		eligibleCount: number;
		displayOrder: number;
	};

	const workItems: WorkItem[] = [];
	for (const slot of input.template.slots) {
		const rankedPersonnel = rankCandidatesForSlot(
			input.template,
			slot,
			eligiblePersonnel,
			input.historyByPoolPerson,
			input.eventDate,
			input.holidayClosureDates
		);
		const eligibleCandidates = rankedPersonnel.filter((person) => matchesSlot(person, input.template, slot));
		const fairnessResult = buildFairnessResult(input.template, slot, eligiblePersonnel, input.historyByPoolPerson);
		for (let slotIndex = 0; slotIndex < slot.quantity; slotIndex += 1) {
			workItems.push({
				slot,
				slotIndex,
				eligibleCandidates,
				fairnessConfidence: fairnessResult.confidence,
				missingHistoryCount: fairnessResult.missingHistoryCount,
				eligibleCount: fairnessResult.eligibleCount,
				displayOrder: slot.sortOrder * 100 + slotIndex
			});
		}
	}

	workItems.sort((a, b) => {
		const diff = a.eligibleCandidates.length - b.eligibleCandidates.length;
		if (diff !== 0) return diff;
		return a.displayOrder - b.displayOrder;
	});

	for (const item of workItems) {
		const isBlocking = resolveSlotBlockingMode(input.template.isBlocking, item.slot.blockingMode);
		const override = overrideMap.get(buildSlotKey(item.slot.id, item.slotIndex));
		const recommendedAvailabilityIds = new Set(assignedIds);
		if (override?.assigneeId) {
			recommendedAvailabilityIds.delete(override.assigneeId);
		}
		const availableCandidates = item.eligibleCandidates.filter((person) => !assignedIds.has(person.id));
		const recommendedCandidates = item.eligibleCandidates.filter(
			(person) => !recommendedAvailabilityIds.has(person.id)
		);
		const assignee = availableCandidates[0] ?? null;
		const recommendedAssignee = recommendedCandidates[0] ?? null;
		const candidateRankings = buildCandidateRankings(recommendedCandidates);

		if (override) {
			matchedOverrideKeys.add(override.key);
			const overrideMessages: string[] = [];
			const blockingMessages: string[] = [];
			let warningState: DutyEventSlotInstance['warningState'] = item.fairnessConfidence === 'low' ? 'warning' : 'none';
			const selectionReason: string | null =
				override.assigneeId == null
					? override.assignmentSource === 'locked'
						? 'Assignment was locked open in preview.'
						: 'Assignment was cleared in preview.'
					: override.assignmentSource === 'locked'
						? 'Assignment was locked in preview.'
						: 'Assignment was manually overridden in preview.';
			const unfilledReason: string | null = override.assigneeId == null ? 'Assignment was cleared in preview.' : null;

			if (override.assigneeId) {
				const overridePerson = input.personnelById.get(override.assigneeId);
				if (!overridePerson) {
					throw new Error('Slot override assignee was not found.');
				}
				const overrideAvailability = availabilityByPersonnelId.get(overridePerson.id);
				if (overrideAvailability && !overrideAvailability.selectable) {
					warningState = 'conflict';
					const message =
						overrideAvailability.reason ??
						`${formatPersonLabel(input.personnelById, override.assigneeId)} is unavailable for this duty window and cannot be manually assigned.`;
					overrideMessages.push(message);
					blockingMessages.push(message);
				} else if (!matchesSlot(overridePerson, input.template, item.slot)) {
					warningState = 'conflict';
					const message = `${formatPersonLabel(input.personnelById, override.assigneeId)} does not match this slot's eligibility rules.`;
					overrideMessages.push(message);
					blockingMessages.push(message);
				} else if (recommendedAssignee && override.assigneeId !== recommendedAssignee.id) {
					warningState = 'warning';
					overrideMessages.push(
						override.assignmentSource === 'locked'
							? 'Locked assignment bypasses the generator fairness order for this slot.'
							: 'Manual override bypasses the generator fairness order for this slot.'
					);
				}
			}

			slotInstances.push({
				templateSlotId: item.slot.id,
				roleLabel: item.slot.roleLabel,
				slotIndex: item.slotIndex,
				assigneeId: override.assigneeId,
				assignmentSource: override.assignmentSource ?? 'manual',
				warningState,
				fairnessConfidence: item.fairnessConfidence,
				selectionReason,
				unfilledReason,
				overrideMessages,
				candidateRankings,
				blockingMessages,
				isBlocking,
				sortOrder: item.displayOrder
			});
			continue;
		}

		if (assignee) {
			assignedIds.add(assignee.id);
		}

		slotInstances.push({
			templateSlotId: item.slot.id,
			roleLabel: item.slot.roleLabel,
			slotIndex: item.slotIndex,
			assigneeId: assignee?.id ?? null,
			assignmentSource: 'generated',
			warningState: item.fairnessConfidence === 'low' ? 'warning' : 'none',
			fairnessConfidence: item.fairnessConfidence,
			selectionReason: assignee
				? buildGeneratedSelectionReason(
						input.template,
						item.slot,
						input.eventDate,
						input.holidayClosureDates,
						item.fairnessConfidence,
						item.missingHistoryCount,
						item.eligibleCount
					)
				: null,
			unfilledReason: assignee
				? null
				: item.eligibleCandidates.length === 0
					? hasAvailabilityBlocks
						? 'No eligible Soldier remained after availability and blocking checks.'
						: 'No personnel matched this slot eligibility rules.'
					: 'Every eligible person was already assigned elsewhere in this duty event.',
			overrideMessages: [],
			candidateRankings,
			blockingMessages: [],
			isBlocking,
			sortOrder: item.displayOrder
		});
	}

	if (matchedOverrideKeys.size !== overrideMap.size) {
		throw new Error('Slot override target was not found in the generated preview.');
	}

	return slotInstances.sort((a, b) => a.sortOrder - b.sortOrder);
}

function toPublicSlotProposal(slot: AdvancedSlotProposal): DutyEventPreviewSlotInstance {
	return {
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
		candidateRankings: slot.candidateRankings,
		sortOrder: slot.sortOrder
	};
}

async function buildAdvancedEventSnapshot(input: {
	template: DutyTemplate;
	eventDate: string;
	personnel: Personnel[];
	holidayClosureDates: Set<string>;
	historyEvents: AdvancedRunHistoryEvent[];
	excludedHistoryEventIdsByEventDate?: Map<string, string[]>;
	transientEvents: AdvancedRunTransientEvent[];
	candidatePersonnelIds?: string[];
	slotOverrides?: DutyEventSlotOverrideInput[];
	buildCollisionSummary?: (input: AdvancedRunEventCollisionInput) => Promise<AdvancedRunCollisionResult>;
	availabilityEntries?: AvailabilityEntry[];
	statusTypes?: StatusType[];
	misconductUnavailablePersonnelDates?: Record<string, string[]>;
}): Promise<AdvancedEventSnapshot> {
	const allPersonnelById = new Map(input.personnel.map((person) => [person.id, person]));
	const candidatePersonnel = input.candidatePersonnelIds?.length
		? input.personnel.filter((person) => input.candidatePersonnelIds?.includes(person.id))
		: input.personnel;
	const coverage = buildAdvancedDutyCoverage(input.template, input.eventDate);
	const excludedHistoryEventIds = new Set(input.excludedHistoryEventIdsByEventDate?.get(input.eventDate) ?? []);
	const availabilityClassifications = classifyAdvancedAvailability({
		personnel: candidatePersonnel,
		personnelById: allPersonnelById,
		template: input.template,
		eventDate: input.eventDate,
		coverageStart: coverage.coverageStart,
		coverageEnd: coverage.coverageEnd,
		availabilityEntries: input.availabilityEntries ?? [],
		statusTypes: input.statusTypes ?? [],
		misconductUnavailablePersonnelDates: input.misconductUnavailablePersonnelDates ?? {},
		historyEvents: input.historyEvents,
		excludedHistoryEventIds
	});
	const historyByPoolPerson = buildPoolHistoryIndex(
		input.template,
		input.eventDate,
		input.holidayClosureDates,
		input.historyEvents,
		excludedHistoryEventIds,
		input.transientEvents
	);
	const baseSlotProposals = generateSlotInstances({
		template: input.template,
		personnel: candidatePersonnel,
		personnelById: allPersonnelById,
		historyByPoolPerson,
		eventDate: input.eventDate,
		holidayClosureDates: input.holidayClosureDates,
		availabilityClassifications,
		slotOverrides: input.slotOverrides
	});
	const collisionCheck = input.buildCollisionSummary
		? await input.buildCollisionSummary({
				eventDate: input.eventDate,
				coverageStart: coverage.coverageStart,
				coverageEnd: coverage.coverageEnd,
				cooldownHours: input.template.cooldownHours,
				slotProposals: baseSlotProposals,
				transientEvents: input.transientEvents
			})
		: emptyCollisionResult;
	const slotProposals = baseSlotProposals.map((slot) => {
		const collisionMessages = collisionCheck.slotMessages.get(buildSlotKey(slot.templateSlotId, slot.slotIndex)) ?? [];
		return {
			...slot,
			warningState: collisionMessages.length > 0 ? 'conflict' : slot.warningState,
			overrideMessages: [...(slot.overrideMessages ?? []), ...collisionMessages]
		};
	});
	const preview: DutyEventPreview = {
		templateId: input.template.id,
		templateName: input.template.name,
		eventDate: input.eventDate,
		...buildAdvancedDa6SequenceMetadata(input.template, input.eventDate, input.holidayClosureDates),
		coverageMode: input.template.coverageMode,
		coverageStart: coverage.coverageStart,
		coverageEnd: coverage.coverageEnd,
		isBlocking: input.template.isBlocking,
		cooldownHours: input.template.cooldownHours,
		rulesSnapshot: buildRulesSnapshot(input.template),
		fillSummary: buildFillSummary(slotProposals),
		collisionSummary: collisionCheck.summary,
		slotInstances: slotProposals.map(toPublicSlotProposal)
	};
	const blockingConflicts = [
		...new Set([...collisionCheck.blockingConflicts, ...slotProposals.flatMap((slot) => slot.blockingMessages)])
	];

	return {
		eventDate: input.eventDate,
		coverageStart: coverage.coverageStart,
		coverageEnd: coverage.coverageEnd,
		preview,
		slotProposals,
		blockingConflicts,
		availabilityClassifications,
		exportModel: buildTeamDutyPacketExportModel({
			templateName: input.template.name,
			event: preview,
			slotAssignments: slotProposals,
			collisionNotes: blockingConflicts,
			personnelById: allPersonnelById
		})
	};
}

function snapshotPersonnel(personnel: Personnel[]): AdvancedRunPersonnelSnapshot[] {
	return personnel.map((person) => ({
		id: person.id,
		rank: person.rank,
		firstName: person.firstName,
		lastName: person.lastName,
		displayName: `${person.rank} ${person.lastName}, ${person.firstName}`,
		mos: person.mos,
		clinicRole: person.clinicRole,
		groupId: person.groupId,
		groupName: person.groupName
	}));
}

export async function buildAdvancedRunSnapshot(input: AdvancedRunSnapshotInput): Promise<AdvancedRunSnapshot> {
	const eventDates = [...input.eventDates];
	const events: AdvancedEventSnapshot[] = [];
	const transientEvents: AdvancedRunTransientEvent[] = [];

	for (const eventDate of eventDates) {
		const event = await buildAdvancedEventSnapshot({
			template: input.template,
			eventDate,
			personnel: input.personnel,
			holidayClosureDates: input.holidayClosureDates,
			historyEvents: input.historyEvents,
			excludedHistoryEventIdsByEventDate: input.excludedHistoryEventIdsByEventDate,
			transientEvents,
			candidatePersonnelIds: input.candidatePersonnelIds,
			slotOverrides: input.slotOverridesByEventDate?.get(eventDate),
			buildCollisionSummary: input.buildCollisionSummary,
			availabilityEntries: input.availabilityEntries,
			statusTypes: input.statusTypes,
			misconductUnavailablePersonnelDates: input.misconductUnavailablePersonnelDates
		});
		events.push(event);
		transientEvents.push({
			eventDate: event.eventDate,
			coverageStart: event.coverageStart,
			coverageEnd: event.coverageEnd,
			cooldownHours: input.template.cooldownHours,
			isBlocking: input.template.isBlocking,
			slotInstances: event.slotProposals.map((slot) => ({
				templateSlotId: slot.templateSlotId,
				slotIndex: slot.slotIndex,
				assigneeId: slot.assigneeId,
				isBlocking: slot.isBlocking
			}))
		});
	}

	return {
		snapshotVersion: 1,
		templateId: input.template.id,
		templateName: input.template.name,
		eventDates,
		candidatePersonnelIds: [...(input.candidatePersonnelIds ?? [])],
		template: {
			rulesSnapshot: buildRulesSnapshot(input.template)
		},
		personnel: snapshotPersonnel(input.personnel),
		events
	};
}
