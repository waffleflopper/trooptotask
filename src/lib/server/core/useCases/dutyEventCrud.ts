import { fail } from '$lib/server/core/errors';
import type { AdvancedDutyPersistencePort, QueryPorts, WritePorts } from '$lib/server/core/ports';
import { DutyEventEntity } from '$lib/server/entities/dutyEvent';
import { DutyEventRunEntity } from '$lib/server/entities/dutyEventRun';
import { DutyEventSlotEntity } from '$lib/server/entities/dutyEventSlot';
import { DutyTemplateEntity } from '$lib/server/entities/dutyTemplate';
import { DutyTemplateRotationBaselineEntity } from '$lib/server/entities/dutyTemplateRotationBaseline';
import { DutyTemplateSlotEntity } from '$lib/server/entities/dutyTemplateSlot';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import type { Personnel } from '$lib/types';
import { requireAdvancedDutyAccess } from './advancedDutyAccess';
import { findDutyCoverageConflicts, resolveSlotBlockingMode } from './dutyAvailability';
import type {
	DutyEvent,
	DutyEventApplyInput,
	DutyEventSeriesApplyResult,
	DutyEventSeriesInput,
	DutyEventSeriesPattern,
	DutyEventRunPattern,
	DutyEventRunRecord,
	DutyEventRunDeleteResult,
	DutyEventSeriesPreview,
	DutyEventCollisionSummary,
	DutyEventFillSummary,
	DutyEventPreview,
	DutyEventPreviewSlotInstance,
	DutyEventRulesSnapshot,
	DutyEventSlotOverrideInput,
	DutyEventSlotInstance,
	DutyEventPersistedFairnessConfidence,
	ExistingDutyEventInput,
	ExistingDutyEventUpdateInput,
	SoftPreferenceConfig,
	DutyTemplate,
	DutyTemplateRotationBaseline,
	DutyTemplateSlot,
	DutyEventFairnessConfidence
} from '$features/duty-roster/duty-roster.types';
import {
	cloneDefaultSoftPreferences,
	DEFAULT_SOFT_PREFERENCE_ORDER as defaultSoftPreferenceOrder
} from '$features/duty-roster/duty-roster.types';

interface PoolHistorySummary {
	lastServedDate: string | null;
	lastWeekendDate: string | null;
	lastHolidayClosureDate: string | null;
}

interface SlotCollisionCheckResult {
	summary: DutyEventCollisionSummary;
	slotMessages: Map<string, string[]>;
	blockingConflicts: string[];
}

interface NormalizedSlotOverride extends DutyEventSlotOverrideInput {
	key: string;
}

interface TransientPreviewEvent {
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

interface ResolvedPreviewData {
	allPersonnel?: Personnel[];
	holidayClosureDates?: Set<string>;
	templateHistoryRows?: Record<string, unknown>[];
	templateHistorySlotRows?: Record<string, unknown>[];
}

type RankedSlotPreviewInstance = DutyEventPreviewSlotInstance & {
	blockingMessages: string[];
	isBlocking: boolean;
};

type InternalDutyEventPreview = Omit<DutyEventPreview, 'slotInstances'> & {
	slotInstances: RankedSlotPreviewInstance[];
	blockingConflicts: string[];
};

function buildCoverageDateTime(date: string, time: string): string {
	return `${date}T${time}:00`;
}

function addDays(date: string, days: number): string {
	const value = new Date(`${date}T00:00:00Z`);
	value.setUTCDate(value.getUTCDate() + days);
	return value.toISOString().slice(0, 10);
}

function buildSlotKey(templateSlotId: string | null, slotIndex: number): string {
	return `${templateSlotId ?? 'null'}::${slotIndex}`;
}

function normalizePersistedFairnessConfidence(
	confidence: DutyEventFairnessConfidence
): DutyEventPersistedFairnessConfidence {
	return confidence === 'medium' ? 'low' : confidence;
}

function toPublicDutyEventPreview(preview: InternalDutyEventPreview): DutyEventPreview {
	return {
		templateId: preview.templateId,
		templateName: preview.templateName,
		eventDate: preview.eventDate,
		coverageMode: preview.coverageMode,
		coverageStart: preview.coverageStart,
		coverageEnd: preview.coverageEnd,
		isBlocking: preview.isBlocking,
		cooldownHours: preview.cooldownHours,
		rulesSnapshot: preview.rulesSnapshot,
		fillSummary: preview.fillSummary,
		collisionSummary: preview.collisionSummary,
		slotInstances: preview.slotInstances.map<DutyEventPreviewSlotInstance>((slot) => ({
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
}

function failForHardRuleConflicts(message: string, preview: InternalDutyEventPreview): void {
	if (preview.blockingConflicts.length > 0) {
		fail(400, message);
	}
}

function isLegacyFairnessConstraintError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}
	return (
		error.message.includes('duty_event_slots_fairness_confidence_check') ||
		error.message.includes('fairness_confidence')
	);
}

function eachDate(startDate: string, endDate: string): string[] {
	const dates: string[] = [];
	let current = startDate;
	while (current <= endDate) {
		dates.push(current);
		current = addDays(current, 1);
	}
	return dates;
}

function normalizeDates(values: string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function buildCoverageWindow(template: DutyTemplate, eventDate: string) {
	if (template.coverageMode === 'all-day') {
		return {
			coverageStart: `${eventDate}T00:00:00`,
			coverageEnd: `${eventDate}T23:59:59`
		};
	}

	if (!template.startTime || !template.endTime) {
		fail(400, 'Timed duty templates require both a start time and end time.');
	}

	const endsNextDay = template.endTime <= template.startTime;
	return {
		coverageStart: buildCoverageDateTime(eventDate, template.startTime),
		coverageEnd: buildCoverageDateTime(endsNextDay ? addDays(eventDate, 1) : eventDate, template.endTime)
	};
}

function buildCoveredDates(coverageStart: string, coverageEnd: string): string[] {
	return eachDate(coverageStart.slice(0, 10), coverageEnd.slice(0, 10));
}

function getDayOfWeek(date: string): number {
	return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function normalizeTemplate(
	templateRow: Record<string, unknown>,
	slotRows: Record<string, unknown>[],
	baselineRows: Record<string, unknown>[] = []
): DutyTemplate {
	const template = DutyTemplateEntity.fromDb(templateRow);
	return {
		...template,
		scopeGroupIds: Array.isArray(template.scopeGroupIds) ? template.scopeGroupIds : [],
		exemptPersonnelIds: Array.isArray(template.exemptPersonnelIds) ? template.exemptPersonnelIds : [],
		exemptStatusTypeIds: Array.isArray(template.exemptStatusTypeIds) ? template.exemptStatusTypeIds : [],
		slots: DutyTemplateSlotEntity.fromDbArray(slotRows).sort((a, b) => a.sortOrder - b.sortOrder),
		rotationBaselines: DutyTemplateRotationBaselineEntity.fromDbArray(baselineRows).sort(
			(a, b) =>
				a.rotationPoolKey.localeCompare(b.rotationPoolKey) ||
				a.lastServedDate.localeCompare(b.lastServedDate) ||
				a.personId.localeCompare(b.personId)
		)
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
		exemptStatusTypeIds: [...(template.exemptStatusTypeIds ?? [])],
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

function buildTemplateFromRulesSnapshot(snapshot: DutyEventRulesSnapshot): DutyTemplate {
	return {
		id: snapshot.templateId,
		orgId: '',
		mode: 'advanced',
		status: snapshot.templateStatus,
		name: snapshot.templateName,
		description: null,
		scopeType: snapshot.scopeType,
		scopeGroupIds: [...snapshot.scopeGroupIds],
		exemptPersonnelIds: [...(snapshot.exemptPersonnelIds ?? [])],
		exemptStatusTypeIds: [...(snapshot.exemptStatusTypeIds ?? [])],
		coverageMode: snapshot.coverageMode,
		startTime: snapshot.startTime,
		endTime: snapshot.endTime,
		spansMidnight: snapshot.spansMidnight ?? false,
		isBlocking: snapshot.isBlocking,
		cooldownHours: snapshot.cooldownHours,
		softPreferences: normalizeSoftPreferencesForRanking(snapshot.softPreferences),
		createdAt: '',
		updatedAt: '',
		slots: snapshot.slots.map((slot) => ({
			id: slot.templateSlotId,
			templateId: snapshot.templateId,
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
		})),
		rotationBaselines: (snapshot.rotationBaselines ?? []).map((baseline, index) => ({
			id: `snapshot-baseline-${index}`,
			templateId: snapshot.templateId,
			rotationPoolKey: baseline.rotationPoolKey,
			personId: baseline.personId,
			lastServedDate: baseline.lastServedDate
		}))
	};
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

	const provided = new Map(softPreferences.map((preference) => [preference.type, preference]));
	const orderedTypes = [
		...softPreferences.map((preference) => preference.type),
		...defaultSoftPreferenceOrder.filter((type) => !provided.has(type))
	];

	return [...new Set(orderedTypes)].map(
		(type) => provided.get(type) ?? { type, enabled: defaults.find((item) => item.type === type)?.enabled ?? true }
	);
}

function usesDefaultSoftPreferenceOrder(template: DutyTemplate): boolean {
	const resolved = normalizeSoftPreferencesForRanking(template.softPreferences);
	return resolved.every(
		(preference, index) => preference.enabled === true && preference.type === defaultSoftPreferenceOrder[index]
	);
}

function describeSoftPreferenceOrder(template: DutyTemplate): string {
	const enabled = normalizeSoftPreferencesForRanking(template.softPreferences).filter(
		(preference) => preference.enabled
	);
	if (enabled.length === 0) {
		return 'eligibility rules and name tie-breakers only';
	}

	const labels: Record<SoftPreferenceConfig['type'], string> = {
		'longest-break': 'longest break',
		'holiday-closure': 'holiday and closure spacing',
		weekend: 'weekend spacing',
		'preferred-group': 'preferred groups'
	};

	return enabled.map((preference) => labels[preference.type]).join(', then ');
}

function buildGeneratedSelectionReason(
	template: DutyTemplate,
	slot: DutyTemplateSlot,
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

	if (usesDefaultSoftPreferenceOrder(template)) {
		return `Selected by longest break in rotation pool "${slot.rotationPoolKey}".${fairnessSuffix}`;
	}

	return `Selected using this template's soft-preference order for rotation pool "${slot.rotationPoolKey}": ${describeSoftPreferenceOrder(template)}.${fairnessSuffix}`;
}

function formatPersonLabel(personnelById: Map<string, Personnel>, personId: string): string {
	const person = personnelById.get(personId);
	return person ? `${person.rank} ${person.lastName}` : personId;
}

function createEmptyPoolHistorySummary(): PoolHistorySummary {
	return {
		lastServedDate: null,
		lastWeekendDate: null,
		lastHolidayClosureDate: null
	};
}

function recordServiceDate(
	summary: PoolHistorySummary,
	date: string,
	holidayClosureDates: Set<string>
): PoolHistorySummary {
	const next = { ...summary };
	if (!next.lastServedDate || next.lastServedDate < date) {
		next.lastServedDate = date;
	}
	if (new Set([0, 6]).has(getDayOfWeek(date)) && (!next.lastWeekendDate || next.lastWeekendDate < date)) {
		next.lastWeekendDate = date;
	}
	if (holidayClosureDates.has(date) && (!next.lastHolidayClosureDate || next.lastHolidayClosureDate < date)) {
		next.lastHolidayClosureDate = date;
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

async function buildPoolHistoryIndex(
	ctx: QueryPorts,
	template: DutyTemplate,
	cutoffDate: string,
	holidayClosureDates: Set<string>,
	transientEvents: TransientPreviewEvent[] = [],
	excludeDutyEventIds: string[] = [],
	resolvedData: ResolvedPreviewData = {}
): Promise<Map<string, PoolHistorySummary>> {
	const historyByPoolPerson = new Map<string, PoolHistorySummary>();

	for (const baseline of template.rotationBaselines) {
		const key = `${baseline.rotationPoolKey}::${baseline.personId}`;
		historyByPoolPerson.set(
			key,
			recordServiceDate(
				historyByPoolPerson.get(key) ?? createEmptyPoolHistorySummary(),
				baseline.lastServedDate,
				holidayClosureDates
			)
		);
	}

	const eventRows =
		resolvedData.templateHistoryRows ??
		(await ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId, {
			template_id: template.id
		}));
	const excludedEventIds = new Set(excludeDutyEventIds);
	const filteredEventRows = eventRows.filter(
		(row) => !excludedEventIds.has(String(row.id)) && String(row.event_date) <= cutoffDate
	);
	if (filteredEventRows.length > 0) {
		const eventIds = new Set(filteredEventRows.map((row) => String(row.id)));
		const slotRows = resolvedData.templateHistorySlotRows
			? resolvedData.templateHistorySlotRows.filter((row) => eventIds.has(String(row.duty_event_id)))
			: await ctx.store.findMany<Record<string, unknown>>('duty_event_slots', ctx.auth.orgId, undefined, {
					inFilters: { duty_event_id: [...eventIds] }
				});
		const eventById = new Map(filteredEventRows.map((row) => [String(row.id), row]));
		for (const slotRow of slotRows) {
			const assigneeId = slotRow.assignee_id;
			const templateSlotId = slotRow.template_slot_id;
			const dutyEventId = String(slotRow.duty_event_id);
			if (!assigneeId || !templateSlotId) {
				continue;
			}

			const eventRow = eventById.get(dutyEventId);
			if (!eventRow) {
				continue;
			}

			const rulesSnapshot = eventRow.rules_snapshot as
				| { slots?: Array<{ templateSlotId?: string; rotationPoolKey?: string }> }
				| undefined;
			const snapshotSlot = rulesSnapshot?.slots?.find((slot) => slot.templateSlotId === templateSlotId);
			const rotationPoolKey = snapshotSlot?.rotationPoolKey;
			if (!rotationPoolKey) {
				continue;
			}

			const eventDate = String(eventRow.event_date);
			const key = `${rotationPoolKey}::${String(assigneeId)}`;
			historyByPoolPerson.set(
				key,
				recordServiceDate(
					historyByPoolPerson.get(key) ?? createEmptyPoolHistorySummary(),
					eventDate,
					holidayClosureDates
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
					holidayClosureDates
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
	const isHolidayClosure = holidayClosureDates.has(eventDate);
	const isWeekend = new Set([0, 6]).has(getDayOfWeek(eventDate));
	const softPreferences = normalizeSoftPreferencesForRanking(template.softPreferences).filter(
		(preference) => preference.enabled
	);
	return [...personnel].sort((a, b) => {
		const aSummary = historyByPoolPerson.get(`${slot.rotationPoolKey}::${a.id}`) ?? createEmptyPoolHistorySummary();
		const bSummary = historyByPoolPerson.get(`${slot.rotationPoolKey}::${b.id}`) ?? createEmptyPoolHistorySummary();

		for (const preference of softPreferences) {
			switch (preference.type) {
				case 'longest-break': {
					const diff = compareOldestFirst(aSummary.lastServedDate, bSummary.lastServedDate);
					if (diff !== 0) {
						return diff;
					}
					break;
				}
				case 'holiday-closure': {
					if (!isHolidayClosure) {
						break;
					}
					const diff = compareOldestFirst(aSummary.lastHolidayClosureDate, bSummary.lastHolidayClosureDate);
					if (diff !== 0) {
						return diff;
					}
					break;
				}
				case 'weekend': {
					if (!isWeekend) {
						break;
					}
					const diff = compareOldestFirst(aSummary.lastWeekendDate, bSummary.lastWeekendDate);
					if (diff !== 0) {
						return diff;
					}
					break;
				}
				case 'preferred-group': {
					const aPreferred =
						slot.preferredGroupIds.length > 0 && !!a.groupId && slot.preferredGroupIds.includes(a.groupId);
					const bPreferred =
						slot.preferredGroupIds.length > 0 && !!b.groupId && slot.preferredGroupIds.includes(b.groupId);
					if (aPreferred !== bPreferred) {
						return aPreferred ? -1 : 1;
					}
					break;
				}
			}
		}

		return sortPersonnel(a, b);
	});
}

interface FairnessResult {
	confidence: DutyEventFairnessConfidence;
	missingHistoryCount: number;
	eligibleCount: number;
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
			fail(400, 'Duplicate slot overrides are not allowed.');
		}
		overrideMap.set(key, {
			...override,
			key
		});
	}

	return overrideMap;
}

function generateSlotInstances(
	template: DutyTemplate,
	personnel: Personnel[],
	personnelById: Map<string, Personnel>,
	historyByPoolPerson: Map<string, PoolHistorySummary>,
	eventDate: string,
	holidayClosureDates: Set<string>,
	statusExemptPersonnelDates: Map<string, string>,
	slotOverrides: DutyEventSlotOverrideInput[] = []
): RankedSlotPreviewInstance[] {
	const overrideMap = normalizeSlotOverrides(slotOverrides);
	const assignedIds = new Set(
		[...overrideMap.values()].map((override) => override.assigneeId).filter((value): value is string => !!value)
	);
	const matchedOverrideKeys = new Set<string>();
	const slotInstances: RankedSlotPreviewInstance[] = [];

	// Permanently exempt personnel are excluded from all slot candidate pools for this template.
	const permanentExemptIds = new Set(template.exemptPersonnelIds ?? []);
	const hasAnyExemptions = permanentExemptIds.size > 0 || statusExemptPersonnelDates.size > 0;
	const eligiblePersonnel = hasAnyExemptions
		? personnel.filter((person) => !permanentExemptIds.has(person.id) && !statusExemptPersonnelDates.has(person.id))
		: personnel;

	// Expand all (slot, slotIndex) pairs into a flat work list and pre-compute each slot's
	// static eligible-candidate pool. This count drives the hardest-slot-first fill order:
	// slots with fewer eligible people are filled before slots with larger pools, so the
	// rarest candidates are reserved for the positions that need them most.
	type WorkItem = {
		slot: DutyTemplateSlot;
		slotIndex: number;
		rankedPersonnel: Personnel[];
		eligibleCandidates: Personnel[];
		fairnessConfidence: DutyEventFairnessConfidence;
		missingHistoryCount: number;
		eligibleCount: number;
		displayOrder: number;
	};

	const workItems: WorkItem[] = [];
	for (const slot of template.slots) {
		const rankedPersonnel = rankCandidatesForSlot(
			template,
			slot,
			eligiblePersonnel,
			historyByPoolPerson,
			eventDate,
			holidayClosureDates
		);
		const eligibleCandidates = rankedPersonnel.filter((person) => matchesSlot(person, template, slot));
		const fairnessResult = buildFairnessResult(template, slot, eligiblePersonnel, historyByPoolPerson);
		for (let slotIndex = 0; slotIndex < slot.quantity; slotIndex += 1) {
			workItems.push({
				slot,
				slotIndex,
				rankedPersonnel,
				eligibleCandidates,
				fairnessConfidence: fairnessResult.confidence,
				missingHistoryCount: fairnessResult.missingHistoryCount,
				eligibleCount: fairnessResult.eligibleCount,
				displayOrder: slot.sortOrder * 100 + slotIndex
			});
		}
	}

	// Sort hardest first (fewest eligible candidates), with displayOrder as the tie-breaker
	// so slots that are equally difficult preserve their authored sequence.
	workItems.sort((a, b) => {
		const diff = a.eligibleCandidates.length - b.eligibleCandidates.length;
		if (diff !== 0) return diff;
		return a.displayOrder - b.displayOrder;
	});

	for (const {
		slot,
		slotIndex,
		eligibleCandidates,
		fairnessConfidence,
		missingHistoryCount,
		eligibleCount,
		displayOrder
	} of workItems) {
		const isBlocking = resolveSlotBlockingMode(template.isBlocking, slot.blockingMode);
		const override = overrideMap.get(buildSlotKey(slot.id, slotIndex));
		const recommendedAvailabilityIds = new Set(assignedIds);
		if (override?.assigneeId) {
			recommendedAvailabilityIds.delete(override.assigneeId);
		}
		const availableCandidates = eligibleCandidates.filter((person) => !assignedIds.has(person.id));
		const recommendedCandidates = eligibleCandidates.filter((person) => !recommendedAvailabilityIds.has(person.id));
		const assignee = availableCandidates[0] ?? null;
		const recommendedAssignee = recommendedCandidates[0] ?? null;

		if (override) {
			matchedOverrideKeys.add(override.key);

			const overrideMessages: string[] = [];
			const blockingMessages: string[] = [];
			let warningState: DutyEventSlotInstance['warningState'] = fairnessConfidence === 'low' ? 'warning' : 'none';
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
				const overridePerson = personnelById.get(override.assigneeId);
				if (!overridePerson) {
					fail(400, 'Slot override assignee was not found.');
				}

				if (permanentExemptIds.has(overridePerson.id)) {
					warningState = 'conflict';
					const message = `${formatPersonLabel(personnelById, override.assigneeId)} is exempt from this duty template and cannot be manually assigned.`;
					overrideMessages.push(message);
					blockingMessages.push(message);
				} else if (statusExemptPersonnelDates.has(overridePerson.id)) {
					warningState = 'conflict';
					const message = `${formatPersonLabel(personnelById, override.assigneeId)} has an exempt status for ${statusExemptPersonnelDates.get(overridePerson.id) ?? eventDate} and cannot be manually assigned.`;
					overrideMessages.push(message);
					blockingMessages.push(message);
				} else if (!matchesSlot(overridePerson, template, slot)) {
					warningState = 'conflict';
					const message = `${formatPersonLabel(personnelById, override.assigneeId)} does not match this slot's eligibility rules.`;
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
				templateSlotId: slot.id,
				roleLabel: slot.roleLabel,
				slotIndex,
				assigneeId: override.assigneeId,
				assignmentSource: override.assignmentSource ?? 'manual',
				warningState,
				fairnessConfidence,
				selectionReason,
				unfilledReason,
				overrideMessages,
				blockingMessages,
				isBlocking,
				sortOrder: displayOrder
			});
			continue;
		}

		if (assignee) {
			assignedIds.add(assignee.id);
		}

		slotInstances.push({
			templateSlotId: slot.id,
			roleLabel: slot.roleLabel,
			slotIndex,
			assigneeId: assignee?.id ?? null,
			assignmentSource: 'generated',
			warningState: fairnessConfidence === 'low' ? 'warning' : 'none',
			fairnessConfidence,
			selectionReason: assignee
				? buildGeneratedSelectionReason(template, slot, fairnessConfidence, missingHistoryCount, eligibleCount)
				: null,
			unfilledReason: assignee
				? null
				: eligibleCandidates.length === 0
					? 'No personnel matched this slot eligibility rules.'
					: 'Every eligible person was already assigned elsewhere in this duty event.',
			overrideMessages: [],
			blockingMessages: [],
			isBlocking,
			sortOrder: displayOrder
		});
	}

	if (matchedOverrideKeys.size !== overrideMap.size) {
		fail(400, 'Slot override target was not found in the generated preview.');
	}

	// Return in display order regardless of fill order.
	return slotInstances.sort((a, b) => a.sortOrder - b.sortOrder);
}

async function buildDutyEventPreview(
	ctx: QueryPorts,
	input: DutyEventApplyInput,
	transientEvents: TransientPreviewEvent[] = [],
	excludeDutyEventIds: string[] = [],
	resolvedData: ResolvedPreviewData = {}
): Promise<InternalDutyEventPreview> {
	const template = await getTemplate(ctx, input.templateId);
	if (template.status !== 'active') {
		fail(400, 'Only active advanced duty templates can be applied.');
	}
	return buildDutyEventPreviewFromResolvedTemplate(
		ctx,
		template,
		input.eventDate,
		input.candidatePersonnelIds,
		input.slotOverrides,
		transientEvents,
		excludeDutyEventIds,
		resolvedData
	);
}

async function buildDutyEventPreviewFromResolvedTemplate(
	ctx: QueryPorts,
	template: DutyTemplate,
	eventDate: string,
	candidatePersonnelIds: string[] | undefined,
	slotOverrides: DutyEventSlotOverrideInput[] | undefined,
	transientEvents: TransientPreviewEvent[] = [],
	excludeDutyEventIds: string[] = [],
	resolvedData: ResolvedPreviewData = {}
): Promise<InternalDutyEventPreview> {
	const allPersonnel = resolvedData.allPersonnel ?? (await listPersonnel(ctx));
	const personnelById = new Map(allPersonnel.map((person) => [person.id, person]));
	const personnel = candidatePersonnelIds?.length
		? allPersonnel.filter((person) => candidatePersonnelIds.includes(person.id))
		: allPersonnel;
	const holidayClosureDates = resolvedData.holidayClosureDates ?? (await listHolidayClosureDateSet(ctx));
	const coverage = buildCoverageWindow(template, eventDate);
	const historyByPoolPerson = await buildPoolHistoryIndex(
		ctx,
		template,
		eventDate,
		holidayClosureDates,
		transientEvents,
		excludeDutyEventIds,
		resolvedData
	);
	const statusExemptPersonnelDates = await listStatusExemptPersonnelDatesForCoverage(
		ctx,
		coverage.coverageStart.slice(0, 10),
		coverage.coverageEnd.slice(0, 10),
		template.exemptStatusTypeIds ?? []
	);
	const slotInstances = generateSlotInstances(
		template,
		personnel,
		personnelById,
		historyByPoolPerson,
		eventDate,
		holidayClosureDates,
		statusExemptPersonnelDates,
		slotOverrides
	);
	const fillSummary = buildFillSummary(slotInstances);
	const rulesSnapshot = buildRulesSnapshot(template);
	const collisionCheck = await buildCollisionSummary(
		ctx,
		slotInstances,
		eventDate,
		coverage.coverageStart,
		coverage.coverageEnd,
		template.cooldownHours,
		personnelById,
		transientEvents,
		excludeDutyEventIds
	);
	const finalSlotInstances = slotInstances.map((slot) => {
		const collisionMessages = collisionCheck.slotMessages.get(buildSlotKey(slot.templateSlotId, slot.slotIndex)) ?? [];
		return {
			...slot,
			warningState: collisionMessages.length > 0 ? 'conflict' : slot.warningState,
			overrideMessages: [...(slot.overrideMessages ?? []), ...collisionMessages]
		};
	});

	return {
		templateId: template.id,
		templateName: template.name,
		eventDate,
		coverageMode: template.coverageMode,
		coverageStart: coverage.coverageStart,
		coverageEnd: coverage.coverageEnd,
		isBlocking: template.isBlocking,
		cooldownHours: template.cooldownHours,
		rulesSnapshot,
		fillSummary,
		collisionSummary: collisionCheck.summary,
		slotInstances: finalSlotInstances,
		blockingConflicts: [
			...new Set([...collisionCheck.blockingConflicts, ...finalSlotInstances.flatMap((slot) => slot.blockingMessages)])
		]
	};
}

async function getHolidayClosureDates(ctx: QueryPorts, startDate: string, endDate: string): Promise<string[]> {
	const rows = await ctx.store.findMany<Record<string, unknown>>('special_days', ctx.auth.orgId, undefined, {
		rangeFilters: [
			{ column: 'date', op: 'gte', value: startDate },
			{ column: 'date', op: 'lte', value: endDate }
		],
		inFilters: { type: ['federal-holiday', 'org-closure'] },
		orderBy: [{ column: 'date', ascending: true }]
	});

	return normalizeDates(rows.map((row) => String(row.date)));
}

async function listHolidayClosureDateSet(ctx: QueryPorts): Promise<Set<string>> {
	const rows = await ctx.store.findMany<Record<string, unknown>>('special_days', ctx.auth.orgId, undefined, {
		inFilters: { type: ['federal-holiday', 'org-closure'] }
	});

	return new Set(rows.map((row) => String(row.date)));
}

async function expandSeriesDates(ctx: QueryPorts, input: DutyEventSeriesInput): Promise<string[]> {
	switch (input.pattern) {
		case 'custom-dates':
			if (!input.customDates || input.customDates.length === 0) {
				fail(400, 'Custom date runs require at least one date.');
			}
			return normalizeDates(input.customDates);
		case 'daily':
			if (!input.startDate || !input.endDate) {
				fail(400, 'Daily runs require both a start date and end date.');
			}
			return eachDate(input.startDate, input.endDate);
		case 'selected-weekdays': {
			if (!input.startDate || !input.endDate) {
				fail(400, 'Selected weekday runs require both a start date and end date.');
			}
			const selected = [...new Set(input.selectedWeekdays ?? [])].filter((day) => day >= 0 && day <= 6);
			if (selected.length === 0) {
				fail(400, 'Selected weekday runs require at least one weekday.');
			}
			return eachDate(input.startDate, input.endDate).filter((date) => selected.includes(getDayOfWeek(date)));
		}
		case 'weekday-only':
		case 'weekend-only': {
			if (!input.startDate || !input.endDate) {
				fail(400, `${input.pattern} runs require both a start date and end date.`);
			}
			const weekendDays = new Set([0, 6]);
			return eachDate(input.startDate, input.endDate).filter((date) => {
				const isWeekend = weekendDays.has(getDayOfWeek(date));
				return input.pattern === 'weekend-only' ? isWeekend : !isWeekend;
			});
		}
		case 'holiday-closure-only':
			if (!input.startDate || !input.endDate) {
				fail(400, 'Holiday/closure runs require both a start date and end date.');
			}
			return getHolidayClosureDates(ctx, input.startDate, input.endDate);
	}
}

function getEventSlotOverrides(
	input: DutyEventSeriesInput,
	eventDate: string
): DutyEventSlotOverrideInput[] | undefined {
	return input.eventOverrides?.find((entry) => entry.eventDate === eventDate)?.slotOverrides;
}

async function insertDutyEventSlots(
	ctx: WritePorts,
	input: {
		dutyEventId: string;
		slotInstances: DutyEventPreviewSlotInstance[];
		createdAt: string;
	}
): Promise<Record<string, unknown>[]> {
	if (input.slotInstances.length === 0) {
		return [];
	}

	const buildRows = (normalizeFairnessForLegacyDb: boolean) =>
		buildDutyEventSlotRows(ctx.auth.orgId, {
			dutyEventId: input.dutyEventId,
			slotInstances: input.slotInstances,
			createdAt: input.createdAt,
			normalizeFairnessForLegacyDb
		});

	try {
		return await ctx.store.insertMany<Record<string, unknown>>('duty_event_slots', ctx.auth.orgId, buildRows(false));
	} catch (error) {
		if (!isLegacyFairnessConstraintError(error)) {
			throw error;
		}
		return await ctx.store.insertMany<Record<string, unknown>>('duty_event_slots', ctx.auth.orgId, buildRows(true));
	}
}

function buildDutyEventSlotRows(
	orgId: string,
	input: {
		dutyEventId: string;
		slotInstances: DutyEventPreviewSlotInstance[];
		createdAt: string;
		normalizeFairnessForLegacyDb: boolean;
	}
): Record<string, unknown>[] {
	if (input.slotInstances.length === 0) {
		return [];
	}

	return input.slotInstances.map((slot) => ({
		...DutyEventSlotEntity.toDbInsert(
			{
				dutyEventId: input.dutyEventId,
				templateSlotId: slot.templateSlotId,
				roleLabel: slot.roleLabel,
				slotIndex: slot.slotIndex,
				assigneeId: slot.assigneeId,
				assignmentSource: slot.assignmentSource,
				warningState: slot.warningState,
				fairnessConfidence: input.normalizeFairnessForLegacyDb
					? normalizePersistedFairnessConfidence(slot.fairnessConfidence)
					: slot.fairnessConfidence,
				selectionReason: slot.selectionReason,
				unfilledReason: slot.unfilledReason,
				sortOrder: slot.sortOrder
			},
			orgId
		),
		duty_event_id: input.dutyEventId,
		created_at: input.createdAt
	}));
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

function addSlotConflict(
	slotMessages: Map<string, string[]>,
	summaryMessages: string[],
	seenSummaryMessages: Set<string>,
	slotKey: string,
	message: string
) {
	const messages = slotMessages.get(slotKey) ?? [];
	if (!messages.includes(message)) {
		messages.push(message);
		slotMessages.set(slotKey, messages);
	}
	if (!seenSummaryMessages.has(message)) {
		seenSummaryMessages.add(message);
		summaryMessages.push(message);
	}
}

async function buildCollisionSummary(
	ctx: QueryPorts,
	slotInstances: Array<{
		templateSlotId: string | null;
		slotIndex: number;
		assigneeId: string | null;
		isBlocking: boolean;
	}>,
	eventDate: string,
	coverageStart: string,
	coverageEnd: string,
	cooldownHours: number,
	personnelById: Map<string, Personnel>,
	transientEvents: TransientPreviewEvent[] = [],
	excludeDutyEventIds: string[] = []
): Promise<SlotCollisionCheckResult> {
	const slotMessages = new Map<string, string[]>();
	const filledSlots = slotInstances.filter(
		(slot): slot is (typeof slotInstances)[number] & { assigneeId: string } => !!slot.assigneeId
	);
	if (filledSlots.length === 0) {
		return {
			summary: {
				hasConflicts: false,
				conflicts: []
			},
			slotMessages,
			blockingConflicts: []
		};
	}

	const blockingFilledSlots = filledSlots.filter((slot) => slot.isBlocking);
	const assigneeIds = [...new Set(blockingFilledSlots.map((slot) => slot.assigneeId))];

	const conflicts: string[] = [];
	const seenConflicts = new Set<string>();
	const blockingConflicts: string[] = [];
	const seenBlockingConflicts = new Set<string>();
	const slotsByAssignee = new Map<string, Array<(typeof filledSlots)[number]>>();
	for (const slot of filledSlots) {
		const items = slotsByAssignee.get(slot.assigneeId) ?? [];
		items.push(slot);
		slotsByAssignee.set(slot.assigneeId, items);
	}
	const blockingSlotsByAssignee = new Map<string, Array<(typeof blockingFilledSlots)[number]>>();
	for (const slot of blockingFilledSlots) {
		const items = blockingSlotsByAssignee.get(slot.assigneeId) ?? [];
		items.push(slot);
		blockingSlotsByAssignee.set(slot.assigneeId, items);
	}

	for (const [assigneeId, slots] of slotsByAssignee) {
		if (slots.length < 2) {
			continue;
		}
		const message = `${formatPersonLabel(personnelById, assigneeId)} is assigned to multiple slots in the same duty preview.`;
		if (!seenBlockingConflicts.has(message)) {
			seenBlockingConflicts.add(message);
			blockingConflicts.push(message);
		}
		for (const slot of slots) {
			addSlotConflict(
				slotMessages,
				conflicts,
				seenConflicts,
				buildSlotKey(slot.templateSlotId, slot.slotIndex),
				message
			);
		}
	}

	if (assigneeIds.length === 0) {
		return {
			summary: {
				hasConflicts: conflicts.length > 0,
				conflicts
			},
			slotMessages,
			blockingConflicts
		};
	}

	const dailyAssignmentRows = await ctx.store.findMany<Record<string, unknown>>(
		'daily_assignments',
		ctx.auth.orgId,
		undefined,
		{
			inFilters: { assignee_id: assigneeIds, date: buildCoveredDates(coverageStart, coverageEnd) }
		}
	);

	for (const row of dailyAssignmentRows) {
		const assigneeId = String(row.assignee_id);
		const message = `${formatPersonLabel(personnelById, assigneeId)} already has a daily assignment on ${String(row.date)}. Review this collision before apply.`;
		for (const slot of blockingSlotsByAssignee.get(assigneeId) ?? []) {
			addSlotConflict(
				slotMessages,
				conflicts,
				seenConflicts,
				buildSlotKey(slot.templateSlotId, slot.slotIndex),
				message
			);
		}
	}

	const dutyCoverageConflicts = await findDutyCoverageConflicts(ctx, {
		assigneeIds,
		coverageStart,
		coverageEnd,
		cooldownHours,
		personnelById,
		excludeDutyEventIds,
		transientCoverage: transientEvents.flatMap((event) =>
			event.slotInstances
				.filter((slot): slot is typeof slot & { assigneeId: string } => !!slot.assigneeId)
				.map((slot) => ({
					assigneeId: slot.assigneeId,
					coverageStart: event.coverageStart,
					coverageEnd: event.coverageEnd,
					cooldownHours: event.cooldownHours,
					isBlocking: slot.isBlocking
				}))
		)
	});

	for (const [assigneeId, messages] of dutyCoverageConflicts) {
		for (const message of messages) {
			for (const slot of blockingSlotsByAssignee.get(assigneeId) ?? []) {
				addSlotConflict(
					slotMessages,
					conflicts,
					seenConflicts,
					buildSlotKey(slot.templateSlotId, slot.slotIndex),
					`${message} Review this collision before apply.`
				);
			}
		}
	}

	return {
		summary: {
			hasConflicts: conflicts.length > 0,
			conflicts
		},
		slotMessages,
		blockingConflicts
	};
}

function hydrateDutyEventRun(row: Record<string, unknown>): DutyEventRunRecord {
	return DutyEventRunEntity.fromDb(row);
}

function hydrateDutyEvent(
	eventRow: Record<string, unknown>,
	slotRows: Record<string, unknown>[] | DutyEventSlotInstance[],
	runById = new Map<string, DutyEventRunRecord>()
): DutyEvent {
	const event = DutyEventEntity.fromDb(eventRow);
	return {
		...event,
		slotInstances:
			Array.isArray(slotRows) && slotRows.length > 0 && 'dutyEventId' in slotRows[0]
				? ([...slotRows] as DutyEventSlotInstance[]).sort((a, b) => a.sortOrder - b.sortOrder)
				: DutyEventSlotEntity.fromDbArray(slotRows as Record<string, unknown>[]).sort(
						(a, b) => a.sortOrder - b.sortOrder
					),
		run: event.runId ? (runById.get(event.runId) ?? null) : null
	};
}

async function loadDutyEventRunsByIds(ctx: QueryPorts, runIds: string[]): Promise<Map<string, DutyEventRunRecord>> {
	if (runIds.length === 0) {
		return new Map();
	}

	const rows = await ctx.store.findMany<Record<string, unknown>>('duty_event_runs', ctx.auth.orgId, undefined, {
		inFilters: { id: [...new Set(runIds)] }
	});
	const runById = new Map<string, DutyEventRunRecord>();
	for (const row of rows) {
		const run = hydrateDutyEventRun(row);
		runById.set(run.id, run);
	}
	return runById;
}

async function reconcileDutyEventRun(ctx: WritePorts, runId: string | null | undefined): Promise<void> {
	if (!runId) {
		return;
	}

	const runRow = await ctx.store.findOne<Record<string, unknown>>('duty_event_runs', ctx.auth.orgId, { id: runId });
	if (!runRow) {
		return;
	}

	const eventRows = await ctx.store.findMany<Record<string, unknown>>(
		'duty_events',
		ctx.auth.orgId,
		{ run_id: runId },
		{
			orderBy: [{ column: 'event_date', ascending: true }]
		}
	);
	if (eventRows.length === 0) {
		await ctx.store.delete('duty_event_runs', ctx.auth.orgId, runId);
		return;
	}

	const orderedDates = eventRows.map((row) => String(row.event_date)).sort((a, b) => a.localeCompare(b));
	await ctx.store.update<Record<string, unknown>>('duty_event_runs', ctx.auth.orgId, runId, {
		start_date: orderedDates[0],
		end_date: orderedDates[orderedDates.length - 1],
		event_count: eventRows.length,
		updated_at: new Date().toISOString()
	});
}

async function reconcileDutyEventRunBestEffort(ctx: WritePorts, runId: string | null | undefined): Promise<void> {
	// Run metadata is display bookkeeping. If this refresh fails after event writes
	// succeeded, do not fail the entire request and strand the wizard UI.
	try {
		await reconcileDutyEventRun(ctx, runId);
	} catch {
		// Intentionally swallowed.
	}
}

async function cleanupDutyEventRunBestEffort(ctx: WritePorts, runId: string | null | undefined): Promise<void> {
	if (!runId) {
		return;
	}

	try {
		const eventRows = await ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId, {
			run_id: runId
		});
		for (const row of eventRows) {
			await ctx.store.deleteWhere('duty_event_slots', ctx.auth.orgId, {
				duty_event_id: String(row.id)
			});
		}
		await ctx.store.deleteWhere('duty_events', ctx.auth.orgId, { run_id: runId });
		await ctx.store.delete('duty_event_runs', ctx.auth.orgId, runId);
	} catch {
		// Intentionally swallowed.
	}
}

async function createDutyEventRun(
	ctx: WritePorts,
	input: {
		template: DutyTemplate;
		pattern: DutyEventRunPattern;
		eventDates: string[];
		isLegacy?: boolean;
	}
): Promise<DutyEventRunRecord> {
	const orderedDates = [...input.eventDates].sort((a, b) => a.localeCompare(b));
	if (orderedDates.length === 0) {
		fail(400, 'Duty runs require at least one event date.');
	}
	const now = new Date().toISOString();
	const row = await ctx.store.insert<Record<string, unknown>>('duty_event_runs', ctx.auth.orgId, {
		...DutyEventRunEntity.toDbInsert(
			{
				templateId: input.template.id,
				templateName: input.template.name,
				pattern: input.pattern,
				startDate: orderedDates[0],
				endDate: orderedDates[orderedDates.length - 1],
				eventCount: orderedDates.length,
				isLegacy: input.isLegacy ?? false
			},
			ctx.auth.orgId
		),
		created_at: now,
		updated_at: now
	});

	return hydrateDutyEventRun(row);
}

function buildPreviewFromDutyEvent(event: DutyEvent): DutyEventPreview {
	return {
		templateId: event.templateId,
		templateName: event.templateName,
		eventDate: event.eventDate,
		coverageMode: event.coverageMode,
		coverageStart: event.coverageStart,
		coverageEnd: event.coverageEnd,
		isBlocking: event.isBlocking,
		cooldownHours: event.cooldownHours,
		rulesSnapshot: event.rulesSnapshot,
		fillSummary: event.fillSummary,
		collisionSummary: event.collisionSummary,
		slotInstances: event.slotInstances.map((slot) => ({
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
}

function buildReplacementCollisionMessage(templateName: string, eventDate: string): string {
	return `An applied advanced duty event already exists for ${templateName} on ${eventDate}. Applying again will replace its current team assignments. Review this replacement before apply.`;
}

function buildDutyEventRestorePayload(eventRow: Record<string, unknown>): Record<string, unknown> {
	return {
		run_id: eventRow.run_id ?? null,
		template_id: eventRow.template_id,
		template_name: eventRow.template_name,
		event_date: eventRow.event_date,
		coverage_mode: eventRow.coverage_mode,
		coverage_start: eventRow.coverage_start,
		coverage_end: eventRow.coverage_end,
		is_blocking: eventRow.is_blocking,
		cooldown_hours: eventRow.cooldown_hours,
		rules_snapshot: eventRow.rules_snapshot,
		fill_summary: eventRow.fill_summary,
		collision_summary: eventRow.collision_summary,
		original_proposal: eventRow.original_proposal ?? null,
		updated_at: eventRow.updated_at
	};
}

function withCollisionMessage(preview: InternalDutyEventPreview, message: string): InternalDutyEventPreview {
	if (preview.collisionSummary.conflicts.includes(message)) {
		return preview;
	}

	return {
		...preview,
		collisionSummary: {
			hasConflicts: true,
			conflicts: [message, ...preview.collisionSummary.conflicts]
		}
	};
}

function buildSlotOverridesFromDutyEvent(event: DutyEvent): DutyEventSlotOverrideInput[] {
	return event.slotInstances.map((slot) => ({
		templateSlotId: slot.templateSlotId,
		slotIndex: slot.slotIndex,
		assigneeId: slot.assigneeId,
		assignmentSource: slot.assignmentSource === 'generated' ? undefined : slot.assignmentSource
	}));
}

async function getDutyEventById(ctx: QueryPorts, dutyEventId: string): Promise<DutyEvent> {
	const eventRow = await ctx.store.findOne<Record<string, unknown>>('duty_events', ctx.auth.orgId, {
		id: dutyEventId
	});
	if (!eventRow) {
		fail(404, 'Duty event not found');
	}

	const slotRows = await ctx.store.findMany<Record<string, unknown>>(
		'duty_event_slots',
		ctx.auth.orgId,
		{ duty_event_id: dutyEventId },
		{ orderBy: [{ column: 'sort_order', ascending: true }] }
	);
	const runId = eventRow.run_id ? String(eventRow.run_id) : null;
	const runById = runId ? await loadDutyEventRunsByIds(ctx, [runId]) : new Map<string, DutyEventRunRecord>();

	return hydrateDutyEvent(eventRow, slotRows, runById);
}

async function findExistingTemplateDutyEvent(
	ctx: QueryPorts,
	templateId: string,
	eventDate: string
): Promise<Record<string, unknown> | null> {
	return ctx.store.findOne<Record<string, unknown>>('duty_events', ctx.auth.orgId, {
		template_id: templateId,
		event_date: eventDate
	});
}

async function getTemplate(ctx: QueryPorts, templateId: string): Promise<DutyTemplate> {
	const templateRow = await ctx.store.findOne<Record<string, unknown>>('duty_templates', ctx.auth.orgId, {
		id: templateId,
		mode: 'advanced'
	});
	if (!templateRow) {
		fail(404, 'Duty template not found');
	}

	const slotRows = await ctx.store.findMany<Record<string, unknown>>(
		'duty_template_slots',
		ctx.auth.orgId,
		{ template_id: templateId },
		{ orderBy: [{ column: 'sort_order', ascending: true }] }
	);
	const baselineRows = await ctx.store.findMany<Record<string, unknown>>(
		'duty_template_rotation_baselines',
		ctx.auth.orgId,
		{ template_id: templateId },
		{
			orderBy: [
				{ column: 'rotation_pool_key', ascending: true },
				{ column: 'last_served_date', ascending: true },
				{ column: 'person_id', ascending: true }
			]
		}
	);

	return normalizeTemplate(templateRow, slotRows, baselineRows);
}

async function listPersonnel(ctx: QueryPorts): Promise<Personnel[]> {
	const rows = await ctx.store.findMany<Record<string, unknown>>('personnel', ctx.auth.orgId, undefined, {
		isNull: { archived_at: true },
		orderBy: [
			{ column: 'last_name', ascending: true },
			{ column: 'first_name', ascending: true }
		]
	});
	return PersonnelEntity.fromDbArray(rows);
}

async function listStatusExemptPersonnelDatesForCoverage(
	ctx: QueryPorts,
	coverageStartDate: string,
	coverageEndDate: string,
	exemptStatusTypeIds: string[]
): Promise<Map<string, string>> {
	const statusTypeIds = [...new Set(exemptStatusTypeIds.map((statusTypeId) => statusTypeId.trim()).filter(Boolean))];
	if (statusTypeIds.length === 0) {
		return new Map();
	}

	const rows = await ctx.store.findMany<Record<string, unknown>>('availability_entries', ctx.auth.orgId, undefined, {
		inFilters: { status_type_id: statusTypeIds },
		rangeFilters: [
			{ column: 'start_date', op: 'lte', value: coverageEndDate },
			{ column: 'end_date', op: 'gte', value: coverageStartDate }
		]
	});

	const personnelDates = new Map<string, string>();
	for (const row of rows) {
		const personnelId = row.personnel_id == null ? '' : String(row.personnel_id);
		if (!personnelId || personnelDates.has(personnelId)) {
			continue;
		}

		const statusStart = String(row.start_date);
		personnelDates.set(personnelId, statusStart > coverageStartDate ? statusStart : coverageStartDate);
	}

	return personnelDates;
}

export async function applyDutyEventFromTemplate(
	ctx: WritePorts,
	input: DutyEventApplyInput & { runId?: string }
): Promise<DutyEvent> {
	requireAdvancedDutyAccess(ctx.auth);

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) {
		fail(403, 'Organization is in read-only mode');
	}

	const template = await getTemplate(ctx, input.templateId);

	// Look up any existing event for this template + date BEFORE building the preview so we can
	// exclude it from the collision check — otherwise its own stored assignments would show as
	// blocking conflicts against themselves.
	const existingEventRow = await findExistingTemplateDutyEvent(ctx, input.templateId, input.eventDate);
	const excludeIds = existingEventRow ? [existingEventRow.id as string] : [];
	const replacementCollisionMessage = existingEventRow
		? buildReplacementCollisionMessage(template.name, input.eventDate)
		: null;

	const generatedPreview = await buildDutyEventPreview(
		ctx,
		{
			templateId: input.templateId,
			eventDate: input.eventDate,
			candidatePersonnelIds: input.candidatePersonnelIds
		},
		[],
		excludeIds
	);
	const originalProposal = {
		fillSummary: generatedPreview.fillSummary,
		collisionSummary: generatedPreview.collisionSummary,
		slotInstances: toPublicDutyEventPreview(generatedPreview).slotInstances
	};
	const preview = input.slotOverrides?.length
		? await buildDutyEventPreview(ctx, input, [], excludeIds)
		: generatedPreview;
	const collisionReviewPreview = replacementCollisionMessage
		? withCollisionMessage(preview, replacementCollisionMessage)
		: preview;
	failForHardRuleConflicts('Resolve hard-rule assignment conflicts before applying this duty event.', preview);
	if (collisionReviewPreview.collisionSummary.hasConflicts && !input.collisionReviewConfirmed) {
		fail(400, 'Collision review is required before applying this duty event.');
	}
	const now = new Date().toISOString();

	let eventRow: Record<string, unknown>;
	const previousRunId = existingEventRow?.run_id ? String(existingEventRow.run_id) : null;
	let runId = input.runId ?? previousRunId;
	const previousEventSnapshot = existingEventRow
		? (JSON.parse(JSON.stringify(existingEventRow)) as Record<string, unknown>)
		: null;
	const previousSlotSnapshots = existingEventRow
		? ((JSON.parse(
				JSON.stringify(
					await ctx.store.findMany<Record<string, unknown>>('duty_event_slots', ctx.auth.orgId, {
						duty_event_id: String(existingEventRow.id)
					})
				)
			) as Record<string, unknown>[]) ?? [])
		: [];

	if (existingEventRow) {
		const existingId = existingEventRow.id as string;
		eventRow = await ctx.store.update<Record<string, unknown>>('duty_events', ctx.auth.orgId, existingId, {
			...DutyEventEntity.toDbUpdate({
				runId,
				templateId: preview.templateId,
				templateName: preview.templateName,
				eventDate: input.eventDate,
				coverageMode: preview.coverageMode,
				coverageStart: preview.coverageStart,
				coverageEnd: preview.coverageEnd,
				isBlocking: preview.isBlocking,
				cooldownHours: preview.cooldownHours,
				rulesSnapshot: preview.rulesSnapshot,
				fillSummary: preview.fillSummary,
				collisionSummary: preview.collisionSummary
			}),
			original_proposal: originalProposal,
			updated_at: now
		});
		await ctx.store.deleteWhere('duty_event_slots', ctx.auth.orgId, { duty_event_id: existingId });
	} else {
		eventRow = await ctx.store.insert<Record<string, unknown>>('duty_events', ctx.auth.orgId, {
			...DutyEventEntity.toDbInsert(
				{
					runId: runId ?? null,
					templateId: preview.templateId,
					templateName: preview.templateName,
					eventDate: input.eventDate,
					coverageMode: preview.coverageMode,
					coverageStart: preview.coverageStart,
					coverageEnd: preview.coverageEnd,
					isBlocking: preview.isBlocking,
					cooldownHours: preview.cooldownHours,
					rulesSnapshot: preview.rulesSnapshot,
					fillSummary: preview.fillSummary,
					collisionSummary: preview.collisionSummary,
					originalProposal
				},
				ctx.auth.orgId
			),
			created_at: now,
			updated_at: now
		});
	}

	let insertedSlotRows: Record<string, unknown>[] = [];
	try {
		insertedSlotRows = await insertDutyEventSlots(ctx, {
			dutyEventId: eventRow.id as string,
			slotInstances: preview.slotInstances,
			createdAt: now
		});

		if (!input.runId && !previousRunId) {
			const createdRun = await createDutyEventRun(ctx, {
				template,
				pattern: 'single',
				eventDates: [input.eventDate]
			});
			runId = createdRun.id;
			eventRow = await ctx.store.update<Record<string, unknown>>('duty_events', ctx.auth.orgId, eventRow.id as string, {
				run_id: runId,
				updated_at: new Date().toISOString()
			});
		}
	} catch (error) {
		if (!input.runId && !existingEventRow) {
			await ctx.store.deleteWhere('duty_event_slots', ctx.auth.orgId, { duty_event_id: String(eventRow.id) });
			await ctx.store.delete('duty_events', ctx.auth.orgId, String(eventRow.id));
		} else if (previousEventSnapshot) {
			try {
				await ctx.store.update<Record<string, unknown>>(
					'duty_events',
					ctx.auth.orgId,
					String(previousEventSnapshot.id),
					buildDutyEventRestorePayload(previousEventSnapshot)
				);
				await ctx.store.deleteWhere('duty_event_slots', ctx.auth.orgId, {
					duty_event_id: String(previousEventSnapshot.id)
				});
				if (previousSlotSnapshots.length > 0) {
					await ctx.store.insertMany('duty_event_slots', ctx.auth.orgId, previousSlotSnapshots);
				}
			} catch (restoreError) {
				console.error('Failed to restore duty event after slot persistence error', restoreError);
			}
		}
		throw error;
	}

	if (previousRunId && previousRunId !== runId) {
		await reconcileDutyEventRunBestEffort(ctx, previousRunId);
	}
	await reconcileDutyEventRunBestEffort(ctx, runId);

	ctx.audit.log({
		action: existingEventRow ? 'duty_event.updated' : 'duty_event.applied',
		resourceType: 'duty_event',
		resourceId: eventRow.id as string
	});

	let runById = new Map<string, DutyEventRunRecord>();
	try {
		runById = runId ? await loadDutyEventRunsByIds(ctx, [runId]) : new Map();
	} catch {
		// If run hydration fails after successful writes, still return the event payload.
	}
	return hydrateDutyEvent(eventRow, insertedSlotRows, runById);
}

export async function previewDutyEventFromTemplate(
	ctx: QueryPorts,
	input: DutyEventApplyInput
): Promise<DutyEventPreview> {
	requireAdvancedDutyAccess(ctx.auth);
	const existingEventRow = await findExistingTemplateDutyEvent(ctx, input.templateId, input.eventDate);
	const preview = await buildDutyEventPreview(ctx, input, [], existingEventRow ? [String(existingEventRow.id)] : []);
	return toPublicDutyEventPreview(
		existingEventRow
			? withCollisionMessage(preview, buildReplacementCollisionMessage(preview.templateName, input.eventDate))
			: preview
	);
}

export async function previewExistingDutyEvent(
	ctx: QueryPorts,
	input: ExistingDutyEventInput
): Promise<DutyEventPreview> {
	requireAdvancedDutyAccess(ctx.auth);

	const event = await getDutyEventById(ctx, input.dutyEventId);
	if (input.slotOverrides === undefined) {
		return buildPreviewFromDutyEvent(event);
	}

	const template = buildTemplateFromRulesSnapshot(event.rulesSnapshot);
	return toPublicDutyEventPreview(
		await buildDutyEventPreviewFromResolvedTemplate(
			ctx,
			template,
			event.eventDate,
			undefined,
			input.slotOverrides,
			[],
			[event.id]
		)
	);
}

export async function updateExistingDutyEvent(
	ctx: WritePorts & { advancedDutyPersistence: AdvancedDutyPersistencePort },
	input: ExistingDutyEventUpdateInput
): Promise<DutyEvent> {
	requireAdvancedDutyAccess(ctx.auth);

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) {
		fail(403, 'Organization is in read-only mode');
	}

	const existingEvent = await getDutyEventById(ctx, input.dutyEventId);
	const template = buildTemplateFromRulesSnapshot(existingEvent.rulesSnapshot);
	const preview = await buildDutyEventPreviewFromResolvedTemplate(
		ctx,
		template,
		existingEvent.eventDate,
		undefined,
		input.slotOverrides ?? buildSlotOverridesFromDutyEvent(existingEvent),
		[],
		[existingEvent.id]
	);
	failForHardRuleConflicts('Resolve hard-rule assignment conflicts before saving this duty event.', preview);

	if (preview.collisionSummary.hasConflicts && !input.collisionReviewConfirmed) {
		fail(400, 'Collision review is required before saving this duty event.');
	}

	const now = new Date().toISOString();
	let aggregate;
	try {
		aggregate = await ctx.advancedDutyPersistence.updateDutyEventAggregate({
			orgId: ctx.auth.orgId,
			dutyEventId: existingEvent.id,
			eventData: {
				...DutyEventEntity.toDbUpdate({
					templateId: preview.templateId,
					templateName: preview.templateName,
					eventDate: existingEvent.eventDate,
					coverageMode: preview.coverageMode,
					coverageStart: preview.coverageStart,
					coverageEnd: preview.coverageEnd,
					isBlocking: preview.isBlocking,
					cooldownHours: preview.cooldownHours,
					rulesSnapshot: preview.rulesSnapshot,
					fillSummary: preview.fillSummary,
					collisionSummary: preview.collisionSummary,
					originalProposal: existingEvent.originalProposal
				}),
				updated_at: now
			},
			slotRows: buildDutyEventSlotRows(ctx.auth.orgId, {
				dutyEventId: existingEvent.id,
				slotInstances: preview.slotInstances,
				createdAt: now,
				normalizeFairnessForLegacyDb: true
			})
		});
	} catch (error) {
		if (error instanceof Error && error.message.includes('update_advanced_duty_event_aggregate')) {
			fail(500, 'Failed to update duty event. Verify duty event migrations are current and retry.');
		}
		throw error;
	}

	ctx.audit.log({
		action: 'duty_event.updated',
		resourceType: 'duty_event',
		resourceId: existingEvent.id
	});

	const runById = existingEvent.runId ? await loadDutyEventRunsByIds(ctx, [existingEvent.runId]) : new Map();
	return hydrateDutyEvent(aggregate.eventRow, aggregate.slotRows, runById);
}

export async function previewDutyEventSeriesFromTemplate(
	ctx: QueryPorts,
	input: DutyEventSeriesInput
): Promise<DutyEventSeriesPreview> {
	requireAdvancedDutyAccess(ctx.auth);

	const eventDates = await expandSeriesDates(ctx, input);
	const template = await getTemplate(ctx, input.templateId);
	const events: DutyEventPreview[] = [];
	const transientEvents: TransientPreviewEvent[] = [];

	// Fetch all existing events for this template so we can exclude each one from its own
	// collision check — prevents phantom conflicts when previewing a re-apply over existing dates.
	const existingEventRows = await ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId, {
		template_id: input.templateId
	});
	const existingIdByDate = new Map<string, string>(
		existingEventRows.map((row) => [row.event_date as string, row.id as string])
	);
	const templateHistoryIds = existingEventRows.map((row) => String(row.id));
	const resolvedPreviewData: ResolvedPreviewData = {
		allPersonnel: await listPersonnel(ctx),
		holidayClosureDates: await listHolidayClosureDateSet(ctx),
		templateHistoryRows: existingEventRows,
		templateHistorySlotRows:
			templateHistoryIds.length > 0
				? await ctx.store.findMany<Record<string, unknown>>('duty_event_slots', ctx.auth.orgId, undefined, {
						inFilters: { duty_event_id: templateHistoryIds }
					})
				: []
	};

	for (const eventDate of eventDates) {
		const existingId = existingIdByDate.get(eventDate);
		const preview = await buildDutyEventPreview(
			ctx,
			{
				templateId: input.templateId,
				eventDate,
				candidatePersonnelIds: input.candidatePersonnelIds,
				slotOverrides: getEventSlotOverrides(input, eventDate)
			},
			transientEvents,
			existingId ? [existingId] : [],
			resolvedPreviewData
		);
		events.push(
			toPublicDutyEventPreview(
				existingId ? withCollisionMessage(preview, buildReplacementCollisionMessage(template.name, eventDate)) : preview
			)
		);
		transientEvents.push({
			eventDate: preview.eventDate,
			coverageStart: preview.coverageStart,
			coverageEnd: preview.coverageEnd,
			cooldownHours: preview.cooldownHours,
			isBlocking: preview.isBlocking,
			slotInstances: preview.slotInstances.map((slot) => ({
				templateSlotId: slot.templateSlotId,
				slotIndex: slot.slotIndex,
				assigneeId: slot.assigneeId,
				isBlocking: slot.isBlocking
			}))
		});
	}

	return {
		templateId: template.id,
		templateName: template.name,
		pattern: input.pattern,
		eventDates,
		events
	};
}

export async function applyDutyEventSeriesFromTemplate(
	ctx: WritePorts,
	input: DutyEventSeriesInput
): Promise<DutyEventSeriesApplyResult> {
	requireAdvancedDutyAccess(ctx.auth);

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) {
		fail(403, 'Organization is in read-only mode');
	}

	const eventDates = await expandSeriesDates(ctx, input);
	if (eventDates.length === 0) {
		fail(400, 'No dates matched the selected pattern.');
	}
	const template = await getTemplate(ctx, input.templateId);
	let run: DutyEventRunRecord | null = null;
	try {
		run = await createDutyEventRun(ctx, {
			template,
			pattern: input.pattern,
			eventDates
		});
		const events: DutyEvent[] = [];

		for (const eventDate of eventDates) {
			events.push(
				await applyDutyEventFromTemplate(ctx, {
					runId: run.id,
					templateId: input.templateId,
					eventDate,
					collisionReviewConfirmed: input.collisionReviewConfirmed,
					candidatePersonnelIds: input.candidatePersonnelIds,
					slotOverrides: getEventSlotOverrides(input, eventDate)
				})
			);
		}

		let resolvedRun = run;
		try {
			await reconcileDutyEventRunBestEffort(ctx, run.id);
			const refreshedRunRow = await ctx.store.findOne<Record<string, unknown>>('duty_event_runs', ctx.auth.orgId, {
				id: run.id
			});
			if (refreshedRunRow) {
				resolvedRun = hydrateDutyEventRun(refreshedRunRow);
			}
		} catch {
			// Keep the originally created run payload if post-write refresh fails.
		}

		return {
			run: resolvedRun,
			templateId: template.id,
			templateName: template.name,
			pattern: input.pattern,
			eventDates,
			events
		};
	} catch (error) {
		await cleanupDutyEventRunBestEffort(ctx, run?.id);
		throw error;
	}
}

async function hydrateDutyEventRows(ctx: QueryPorts, eventRows: Record<string, unknown>[]): Promise<DutyEvent[]> {
	if (eventRows.length === 0) {
		return [];
	}

	const eventIds = eventRows.map((row) => row.id as string);
	const runById = await loadDutyEventRunsByIds(
		ctx,
		eventRows.map((row) => String(row.run_id ?? '')).filter((runId) => runId.length > 0)
	);
	const slotRows = await ctx.store.findMany<Record<string, unknown>>('duty_event_slots', ctx.auth.orgId, undefined, {
		inFilters: { duty_event_id: eventIds },
		orderBy: [{ column: 'sort_order', ascending: true }]
	});

	const slotsByEvent = new Map<string, DutyEventSlotInstance[]>();
	for (const slot of DutyEventSlotEntity.fromDbArray(slotRows)) {
		const existing = slotsByEvent.get(slot.dutyEventId) ?? [];
		existing.push(slot);
		slotsByEvent.set(slot.dutyEventId, existing);
	}

	return eventRows.map((row) => hydrateDutyEvent(row, slotsByEvent.get(row.id as string) ?? [], runById));
}

export async function listDutyEvents(ctx: QueryPorts): Promise<DutyEvent[]> {
	requireAdvancedDutyAccess(ctx.auth);

	const eventRows = await ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId, undefined, {
		orderBy: [
			{ column: 'coverage_start', ascending: false },
			{ column: 'created_at', ascending: false }
		]
	});

	return hydrateDutyEventRows(ctx, eventRows);
}

export async function listDutyEventsForCalendar(ctx: QueryPorts): Promise<DutyEvent[]> {
	ctx.auth.requireView('calendar');

	const eventRows = await ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId, undefined, {
		orderBy: [
			{ column: 'coverage_start', ascending: false },
			{ column: 'created_at', ascending: false }
		]
	});

	return hydrateDutyEventRows(ctx, eventRows);
}

export async function listDutyEventsInRange(
	ctx: QueryPorts,
	input: { rangeStart: string; rangeEnd: string }
): Promise<DutyEvent[]> {
	ctx.auth.requireView('calendar');

	// Use coverage window overlap rather than event_date equality so that overnight
	// duty events (coverage spanning into the next calendar day) appear on every day
	// their window touches. An event overlaps the range when its coverage starts
	// before the end of the range AND ends after the start of the range.
	const rangeEndNextDay = addDays(input.rangeEnd, 1);
	const eventRows = await ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId, undefined, {
		rangeFilters: [
			{ column: 'coverage_start', op: 'lt', value: rangeEndNextDay },
			{ column: 'coverage_end', op: 'gt', value: input.rangeStart }
		],
		orderBy: [
			{ column: 'event_date', ascending: true },
			{ column: 'coverage_start', ascending: true }
		]
	});

	return hydrateDutyEventRows(ctx, eventRows);
}

export async function deleteDutyEventById(
	ctx: WritePorts,
	input: { dutyEventId: string }
): Promise<DutyEventRunDeleteResult> {
	requireAdvancedDutyAccess(ctx.auth);

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) {
		fail(403, 'Organization is in read-only mode');
	}

	const eventRow = await ctx.store.findOne<Record<string, unknown>>('duty_events', ctx.auth.orgId, {
		id: input.dutyEventId
	});
	if (!eventRow) {
		fail(404, 'Duty event not found');
	}

	const runId = eventRow.run_id ? String(eventRow.run_id) : null;
	await ctx.store.deleteWhere('duty_event_slots', ctx.auth.orgId, { duty_event_id: input.dutyEventId });
	await ctx.store.delete('duty_events', ctx.auth.orgId, input.dutyEventId);
	await reconcileDutyEventRun(ctx, runId);

	ctx.audit.log({
		action: 'duty_event.deleted',
		resourceType: 'duty_event',
		resourceId: input.dutyEventId
	});

	return { deletedEvents: 1 };
}

export async function deleteDutyEventRun(ctx: WritePorts, input: { runId: string }): Promise<DutyEventRunDeleteResult> {
	requireAdvancedDutyAccess(ctx.auth);

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) {
		fail(403, 'Organization is in read-only mode');
	}

	const runRow = await ctx.store.findOne<Record<string, unknown>>('duty_event_runs', ctx.auth.orgId, {
		id: input.runId
	});
	if (!runRow) {
		fail(404, 'Duty event run not found');
	}

	const eventRows = await ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId, {
		run_id: input.runId
	});
	const eventIds = eventRows.map((row) => String(row.id));
	for (const eventId of eventIds) {
		await ctx.store.deleteWhere('duty_event_slots', ctx.auth.orgId, { duty_event_id: eventId });
	}
	if (eventIds.length > 0) {
		await ctx.store.deleteManyByIds('duty_events', ctx.auth.orgId, eventIds);
	}
	await ctx.store.delete('duty_event_runs', ctx.auth.orgId, input.runId);

	ctx.audit.log({
		action: 'duty_event_run.deleted',
		resourceType: 'duty_event_run',
		resourceId: input.runId,
		details: { deletedEvents: eventIds.length }
	});

	return { deletedEvents: eventIds.length };
}

export async function deleteLegacyDutyEventGroup(
	ctx: WritePorts,
	input: { eventIds: string[] }
): Promise<DutyEventRunDeleteResult> {
	requireAdvancedDutyAccess(ctx.auth);

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) {
		fail(403, 'Organization is in read-only mode');
	}

	const eventIds = [...new Set(input.eventIds.map((id) => id.trim()).filter(Boolean))];
	if (eventIds.length === 0) {
		fail(400, 'At least one duty event id is required.');
	}

	const eventRows = await ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId, undefined, {
		inFilters: { id: eventIds }
	});
	const runIds = new Set(
		eventRows
			.map((row) => row.run_id)
			.filter((value): value is string => typeof value === 'string' && value.length > 0)
			.map((value) => String(value))
	);
	if (runIds.size > 0) {
		fail(400, 'Legacy delete only supports events that are not attached to a run.');
	}

	for (const eventId of eventIds) {
		await ctx.store.deleteWhere('duty_event_slots', ctx.auth.orgId, { duty_event_id: eventId });
	}
	const deletedEvents = await ctx.store.deleteManyByIds('duty_events', ctx.auth.orgId, eventIds);

	ctx.audit.log({
		action: 'duty_event.legacy_group_deleted',
		resourceType: 'duty_event',
		details: { deletedEvents }
	});

	return { deletedEvents };
}
