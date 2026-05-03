import { fail } from '$lib/server/core/errors';
import type { AdvancedDutyPersistencePort, QueryPorts, WritePorts } from '$lib/server/core/ports';
import { AvailabilityEntryEntity } from '$lib/server/entities/availabilityEntry';
import { DutyEventEntity } from '$lib/server/entities/dutyEvent';
import { DutyEventRunEntity } from '$lib/server/entities/dutyEventRun';
import { DutyEventSlotEntity } from '$lib/server/entities/dutyEventSlot';
import { AdvancedDutyRunSnapshotEntity } from '$lib/server/entities/advancedDutyRunSnapshot';
import { DutyTemplateEntity } from '$lib/server/entities/dutyTemplate';
import { DutyTemplateRotationBaselineEntity } from '$lib/server/entities/dutyTemplateRotationBaseline';
import { DutyTemplateSlotEntity } from '$lib/server/entities/dutyTemplateSlot';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import { StatusTypeEntity } from '$lib/server/entities/statusType';
import type { AvailabilityEntry, Personnel, StatusType } from '$lib/types';
import { requireAdvancedDutyAccess } from './advancedDutyAccess';
import {
	createOrReopenAdvancedDutyRevisionDraft,
	discardAdvancedDutyRevisionDraftById,
	getActiveAdvancedDutyRevisionDraft,
	updateAdvancedDutyRevisionDraftChange
} from './advancedDutyRevisionDrafts';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from './calendarPolicy';
import { findDutyCoverageConflicts } from './dutyAvailability';
import {
	buildAdvancedDutyCoverage,
	buildAdvancedRunSnapshot,
	type AdvancedRunSnapshot,
	type AdvancedRunHistoryEvent
} from '$features/duty-roster/advanced-run/advancedDutyRun';
import type {
	DutyEvent,
	DutyEventApplyInput,
	DutyEventSeriesApplyResult,
	DutyEventSeriesInput,
	DutyEventRunPattern,
	DutyEventRunRecord,
	DutyEventRunDeleteResult,
	DutyEventSeriesPreview,
	DutyEventCollisionSummary,
	DutyEventPreview,
	DutyEventPreviewSlotInstance,
	DutyEventRulesSnapshot,
	AdvancedDutyRunSnapshotRecord,
	DutyEventSlotOverrideInput,
	DutyEventSlotInstance,
	DutyEventPersistedFairnessConfidence,
	ExistingDutyEventInput,
	ExistingDutyEventUpdateInput,
	SoftPreferenceConfig,
	DutyTemplate,
	DutyEventFairnessConfidence,
	AdvancedDutyRevisionDraftRecord,
	AdvancedDutyRevisionDraftSession
} from '$features/duty-roster/duty-roster.types';
import type {
	AdvancedDutyRevisionAppliedRun,
	AdvancedDutyRevisionDraftSlotChange
} from '$features/duty-roster/advanced-run/advancedDutyRevision';
import {
	cloneDefaultSoftPreferences,
	DEFAULT_SOFT_PREFERENCE_ORDER as defaultSoftPreferenceOrder
} from '$features/duty-roster/duty-roster.types';
import {
	assertAdvancedRunSnapshotIncludesEvent,
	assertApprovedSeriesAdvancedRunSnapshot,
	assertApprovedSingleAdvancedRunSnapshot,
	buildAdvancedRunOriginalProposal,
	buildApprovedAdvancedRunEventPreview,
	createDraftAdvancedRunSnapshot,
	getOriginalProposalFromAdvancedRunSnapshot,
	loadApprovedAdvancedRunSnapshot,
	markAdvancedRunSnapshotApplied,
	markAdvancedRunSnapshotApplying,
	markAdvancedRunSnapshotDraft,
	markAdvancedRunSnapshotPartialFailure,
	omitPreviewOnlyDa6Matrices,
	toAdvancedDutyRunEventPreview,
	toPublicAdvancedDutyPreview,
	type AdvancedDutyRunEventPreview
} from './advancedDutyRunSnapshotCustody';

export {
	deleteVisibleAdvancedDutyRunSnapshot,
	getVisibleAdvancedDutyRunSnapshot,
	listVisibleAdvancedDutyRunSnapshotSummaries,
	listVisibleAdvancedDutyRunSnapshots
} from './advancedDutyRunSnapshotCustody';

interface SlotCollisionCheckResult {
	summary: DutyEventCollisionSummary;
	slotMessages: Map<string, string[]>;
	blockingConflicts: string[];
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
	availabilityEntries?: AvailabilityEntry[];
	statusTypes?: StatusType[];
	holidayClosureDates?: Set<string>;
	historyRows?: Record<string, unknown>[];
	historySlotRows?: Record<string, unknown>[];
	templateHistoryRows?: Record<string, unknown>[];
	templateHistorySlotRows?: Record<string, unknown>[];
}

const MAX_DUTY_EVENT_COOLDOWN_HOURS = 168;

function addDays(date: string, days: number): string {
	const value = new Date(`${date}T00:00:00Z`);
	value.setUTCDate(value.getUTCDate() + days);
	return value.toISOString().slice(0, 10);
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

function buildSlotKey(templateSlotId: string | null, slotIndex: number): string {
	return `${templateSlotId ?? 'null'}::${slotIndex}`;
}

function normalizePersistedFairnessConfidence(
	confidence: DutyEventFairnessConfidence
): DutyEventPersistedFairnessConfidence {
	return confidence === 'medium' ? 'low' : confidence;
}

function failForHardRuleConflicts(message: string, preview: AdvancedDutyRunEventPreview): void {
	if (preview.blockingConflicts.length > 0) {
		fail(400, message);
	}
}

function requireActiveAdvancedDutyTemplate(template: DutyTemplate): void {
	if (template.status !== 'active') {
		fail(400, 'Only active advanced duty templates can be applied.');
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

function buildCoveredDates(coverageStart: string, coverageEnd: string): string[] {
	return eachDate(coverageStart.slice(0, 10), coverageEnd.slice(0, 10));
}

function mergeRowsById(...rowGroups: Record<string, unknown>[][]): Record<string, unknown>[] {
	const rowsById = new Map<string, Record<string, unknown>>();
	for (const rows of rowGroups) {
		for (const row of rows) {
			rowsById.set(String(row.id), row);
		}
	}
	return [...rowsById.values()];
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

function formatPersonLabel(personnelById: Map<string, Personnel>, personId: string): string {
	const person = personnelById.get(personId);
	return person ? `${person.rank} ${person.lastName}` : personId;
}

async function buildDutyEventPreviewFromResolvedTemplate(
	ctx: QueryPorts,
	template: DutyTemplate,
	eventDate: string,
	candidatePersonnelIds: string[] | undefined,
	slotOverrides: DutyEventSlotOverrideInput[] | undefined,
	_transientEvents: TransientPreviewEvent[] = [],
	excludeDutyEventIds: string[] = [],
	resolvedData: ResolvedPreviewData = {}
): Promise<AdvancedDutyRunEventPreview> {
	const snapshot = await buildSingleDutyEventPreviewSnapshot(
		ctx,
		template,
		eventDate,
		candidatePersonnelIds,
		slotOverrides,
		excludeDutyEventIds,
		resolvedData
	);

	return toAdvancedDutyRunEventPreview(snapshot.events[0]);
}

async function buildSingleDutyEventPreviewSnapshot(
	ctx: QueryPorts,
	template: DutyTemplate,
	eventDate: string,
	candidatePersonnelIds: string[] | undefined,
	slotOverrides: DutyEventSlotOverrideInput[] | undefined,
	excludeDutyEventIds: string[] = [],
	resolvedData: ResolvedPreviewData = {}
): Promise<AdvancedRunSnapshot> {
	const allPersonnel = resolvedData.allPersonnel ?? (await listPersonnel(ctx));
	const holidayClosureDates = resolvedData.holidayClosureDates ?? (await listHolidayClosureDateSet(ctx));
	const coverage = buildAdvancedDutyCoverage(template, eventDate);
	const availabilityEntries =
		resolvedData.availabilityEntries ??
		(await listAvailabilityEntriesForCoverage(
			ctx,
			coverage.coverageStart.slice(0, 10),
			coverage.coverageEnd.slice(0, 10)
		));
	const statusTypes = resolvedData.statusTypes ?? (await listStatusTypes(ctx));
	const templateHistoryRows =
		resolvedData.templateHistoryRows ??
		(await ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId, {
			template_id: template.id
		}));
	const coverageHistoryRows =
		resolvedData.historyRows ??
		(await listDutyEventHistoryRowsForCoverage(ctx, coverage.coverageStart, coverage.coverageEnd));
	const historyRows = mergeRowsById(templateHistoryRows, coverageHistoryRows);
	const historySlotRows =
		resolvedData.historySlotRows ??
		(await listDutyEventSlotRowsForEvents(
			ctx,
			historyRows.map((row) => String(row.id))
		));
	const previewData = {
		...resolvedData,
		historyRows,
		historySlotRows
	};
	const personnelById = new Map(allPersonnel.map((person) => [person.id, person]));
	const historyEvents = await buildAdvancedRunHistoryEvents(ctx, template.id, previewData, excludeDutyEventIds);
	return buildAdvancedRunSnapshot({
		template,
		eventDates: [eventDate],
		personnel: allPersonnel,
		holidayClosureDates,
		historyEvents,
		availabilityEntries,
		statusTypes,
		candidatePersonnelIds,
		slotOverridesByEventDate: new Map([[eventDate, slotOverrides]]),
		buildCollisionSummary: async (collisionInput) =>
			buildCollisionSummary(
				ctx,
				collisionInput.slotProposals,
				collisionInput.eventDate,
				collisionInput.coverageStart,
				collisionInput.coverageEnd,
				collisionInput.cooldownHours,
				personnelById,
				collisionInput.transientEvents,
				excludeDutyEventIds
			)
	});
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

async function buildAdvancedRunHistoryEvents(
	ctx: QueryPorts,
	templateId: string,
	resolvedData: ResolvedPreviewData,
	excludeDutyEventIds: string[] = []
): Promise<AdvancedRunHistoryEvent[]> {
	const excludedEventIds = new Set(excludeDutyEventIds);
	const eventRows = (
		resolvedData.historyRows ??
		resolvedData.templateHistoryRows ??
		(await ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId, {
			template_id: templateId
		}))
	).filter((row) => !excludedEventIds.has(String(row.id)));
	if (eventRows.length === 0) {
		return [];
	}

	const eventIds = new Set(eventRows.map((row) => String(row.id)));
	const resolvedSlotRows = resolvedData.historySlotRows ?? resolvedData.templateHistorySlotRows;
	const slotRows = resolvedSlotRows
		? resolvedSlotRows.filter((row) => eventIds.has(String(row.duty_event_id)))
		: await ctx.store.findMany<Record<string, unknown>>('duty_event_slots', ctx.auth.orgId, undefined, {
				inFilters: { duty_event_id: [...eventIds] }
			});
	const slotsByEventId = new Map<string, Record<string, unknown>[]>();
	for (const slotRow of slotRows) {
		const dutyEventId = String(slotRow.duty_event_id);
		const slots = slotsByEventId.get(dutyEventId) ?? [];
		slots.push(slotRow);
		slotsByEventId.set(dutyEventId, slots);
	}

	return eventRows.map((row) => ({
		id: String(row.id),
		templateId: row.template_id == null ? undefined : String(row.template_id),
		eventDate: String(row.event_date),
		coverageStart: String(row.coverage_start),
		coverageEnd: String(row.coverage_end),
		cooldownHours: Number(row.cooldown_hours ?? 0),
		isBlocking: Boolean(row.is_blocking),
		rulesSnapshot: row.rules_snapshot as AdvancedRunHistoryEvent['rulesSnapshot'],
		slotInstances: (slotsByEventId.get(String(row.id)) ?? []).map((slotRow) => ({
			templateSlotId: slotRow.template_slot_id == null ? null : String(slotRow.template_slot_id),
			assigneeId: slotRow.assignee_id == null ? null : String(slotRow.assignee_id)
		}))
	}));
}

async function listDutyEventHistoryRowsForCoverage(
	ctx: QueryPorts,
	coverageStart: string,
	coverageEnd: string
): Promise<Record<string, unknown>[]> {
	return ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId, undefined, {
		rangeFilters: [
			{ column: 'coverage_start', op: 'lt', value: coverageEnd },
			{ column: 'coverage_end', op: 'gt', value: addHours(coverageStart, -MAX_DUTY_EVENT_COOLDOWN_HOURS) }
		]
	});
}

async function listDutyEventSlotRowsForEvents(ctx: QueryPorts, eventIds: string[]): Promise<Record<string, unknown>[]> {
	return eventIds.length > 0
		? ctx.store.findMany<Record<string, unknown>>('duty_event_slots', ctx.auth.orgId, undefined, {
				inFilters: { duty_event_id: eventIds }
			})
		: [];
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
				fail(400, 'Holiday/DONSA runs require both a start date and end date.');
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

async function updateDutyEventAggregateWithLegacyFairnessFallback(
	ctx: WritePorts & { advancedDutyPersistence: AdvancedDutyPersistencePort },
	input: {
		dutyEventId: string;
		eventData: Record<string, unknown>;
		slotInstances: DutyEventPreviewSlotInstance[];
		createdAt: string;
	}
) {
	const buildSlotRows = (normalizeFairnessForLegacyDb: boolean) =>
		buildDutyEventSlotRows(ctx.auth.orgId, {
			dutyEventId: input.dutyEventId,
			slotInstances: input.slotInstances,
			createdAt: input.createdAt,
			normalizeFairnessForLegacyDb
		});

	try {
		return await ctx.advancedDutyPersistence.updateDutyEventAggregate({
			orgId: ctx.auth.orgId,
			dutyEventId: input.dutyEventId,
			eventData: input.eventData,
			slotRows: buildSlotRows(false)
		});
	} catch (error) {
		if (!isLegacyFairnessConstraintError(error)) {
			throw error;
		}

		return await ctx.advancedDutyPersistence.updateDutyEventAggregate({
			orgId: ctx.auth.orgId,
			dutyEventId: input.dutyEventId,
			eventData: input.eventData,
			slotRows: buildSlotRows(true)
		});
	}
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
	const assignmentTypeIds = [
		...new Set(
			dailyAssignmentRows
				.map((row) => row.assignment_type_id)
				.filter((id): id is string => typeof id === 'string' && id.length > 0)
		)
	];
	const assignmentTypeRows =
		assignmentTypeIds.length > 0
			? await ctx.store.findMany<Record<string, unknown>>('assignment_types', ctx.auth.orgId, undefined, {
					inFilters: { id: assignmentTypeIds }
				})
			: [];
	const assignmentTypeNameById = new Map(
		assignmentTypeRows.map((row) => [String(row.id), String(row.name ?? row.short_name ?? row.id)])
	);

	for (const row of dailyAssignmentRows) {
		const assigneeId = String(row.assignee_id);
		const assignmentTypeId = typeof row.assignment_type_id === 'string' ? row.assignment_type_id : '';
		const assignmentLabel = assignmentTypeNameById.get(assignmentTypeId) ?? 'a daily assignment';
		const message = `${formatPersonLabel(personnelById, assigneeId)} already has ${assignmentLabel} on ${String(row.date)}. Review this collision before apply.`;
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

async function listStatusTypes(ctx: QueryPorts): Promise<StatusType[]> {
	const rows = await ctx.store.findMany<Record<string, unknown>>('status_types', ctx.auth.orgId, undefined, {
		select: StatusTypeEntity.select,
		orderBy: [{ column: 'sort_order', ascending: true }]
	});
	return StatusTypeEntity.fromDbArray(rows);
}

async function listAvailabilityEntriesForCoverage(
	ctx: QueryPorts,
	coverageStartDate: string,
	coverageEndDate: string
): Promise<AvailabilityEntry[]> {
	const rows = await ctx.store.findMany<Record<string, unknown>>('availability_entries', ctx.auth.orgId, undefined, {
		select: AvailabilityEntryEntity.select,
		rangeFilters: [
			{ column: 'start_date', op: 'lte', value: coverageEndDate },
			{ column: 'end_date', op: 'gte', value: coverageStartDate }
		]
	});
	return AvailabilityEntryEntity.fromDbArray(rows);
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

function withCollisionMessage(preview: AdvancedDutyRunEventPreview, message: string): AdvancedDutyRunEventPreview {
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

export async function applyDutyEventFromTemplate(
	ctx: WritePorts,
	input: DutyEventApplyInput & { runId?: string; approvedSnapshot?: AdvancedDutyRunSnapshotRecord }
): Promise<DutyEvent> {
	requireAdvancedDutyAccess(ctx.auth);

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) {
		fail(403, 'Organization is in read-only mode');
	}

	const approvedSnapshot = input.approvedSnapshot ?? (await loadApprovedAdvancedRunSnapshot(ctx, input));
	if (!input.approvedSnapshot) {
		assertApprovedSingleAdvancedRunSnapshot(approvedSnapshot, input);
	} else {
		assertAdvancedRunSnapshotIncludesEvent(approvedSnapshot, input);
	}

	const template = await getTemplate(ctx, input.templateId);

	// Look up any existing event for this template + date BEFORE building the preview so we can
	// exclude it from the collision check — otherwise its own stored assignments would show as
	// blocking conflicts against themselves.
	const existingEventRow = await findExistingTemplateDutyEvent(ctx, input.templateId, input.eventDate);
	const replacementCollisionMessage = existingEventRow
		? buildReplacementCollisionMessage(template.name, input.eventDate)
		: null;

	const generatedPreview = buildApprovedAdvancedRunEventPreview(approvedSnapshot, input.eventDate);
	const originalProposal =
		getOriginalProposalFromAdvancedRunSnapshot(approvedSnapshot, input.eventDate) ??
		buildAdvancedRunOriginalProposal(generatedPreview);
	const preview = generatedPreview;
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
		if (!input.approvedSnapshot) {
			await markAdvancedRunSnapshotApplying(ctx, approvedSnapshot.id, now);
		}
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
		if (!input.approvedSnapshot) {
			await markAdvancedRunSnapshotPartialFailure(ctx, approvedSnapshot.id, error);
		}
		throw error;
	}

	if (previousRunId && previousRunId !== runId) {
		await reconcileDutyEventRunBestEffort(ctx, previousRunId);
	}
	await reconcileDutyEventRunBestEffort(ctx, runId);
	if (!input.approvedSnapshot) {
		await markAdvancedRunSnapshotApplied(ctx, approvedSnapshot.id, { appliedRunId: runId ?? null });
	}

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
	ctx: QueryPorts & { advancedDutyPersistence: AdvancedDutyPersistencePort },
	input: DutyEventApplyInput
): Promise<DutyEventPreview> {
	requireAdvancedDutyAccess(ctx.auth);
	const existingEventRow = await findExistingTemplateDutyEvent(ctx, input.templateId, input.eventDate);
	const template = await getTemplate(ctx, input.templateId);
	requireActiveAdvancedDutyTemplate(template);
	const snapshot = await buildSingleDutyEventPreviewSnapshot(
		ctx,
		template,
		input.eventDate,
		input.candidatePersonnelIds,
		input.slotOverrides,
		existingEventRow ? [String(existingEventRow.id)] : []
	);
	const originalProposal = input.slotOverrides?.length
		? buildAdvancedRunOriginalProposal(
				toAdvancedDutyRunEventPreview(
					(
						await buildSingleDutyEventPreviewSnapshot(
							ctx,
							template,
							input.eventDate,
							input.candidatePersonnelIds,
							undefined,
							existingEventRow ? [String(existingEventRow.id)] : []
						)
					).events[0]
				)
			)
		: null;
	const preview = toAdvancedDutyRunEventPreview(snapshot.events[0]);
	const publicPreview = toPublicAdvancedDutyPreview(
		existingEventRow
			? withCollisionMessage(preview, buildReplacementCollisionMessage(preview.templateName, input.eventDate))
			: preview
	);
	const snapshotMetadata = await createDraftAdvancedRunSnapshot(ctx, {
		templateId: template.id,
		templateName: template.name,
		pattern: 'single',
		eventDates: [input.eventDate],
		candidatePersonnelIds: input.candidatePersonnelIds,
		inputPayload: input as unknown as Record<string, unknown>,
		snapshotPayload: originalProposal
			? {
					...snapshot,
					originalProposalsByEventDate: {
						[input.eventDate]: originalProposal
					}
				}
			: snapshot,
		previewPayload: publicPreview as unknown as Record<string, unknown>
	});

	return {
		...publicPreview,
		...snapshotMetadata
	};
}

function buildRevisionSlotKey(
	slot: Pick<DutyEventPreviewSlotInstance, 'templateSlotId' | 'roleLabel' | 'slotIndex'>
): string {
	return `${slot.templateSlotId ?? slot.roleLabel}:${slot.slotIndex}`;
}

function revisionDraftSlotChangesToOverrides(
	draft: AdvancedDutyRevisionDraftRecord
): DutyEventSlotOverrideInput[] | undefined {
	const changes = draft.slotChanges as AdvancedDutyRevisionDraftSlotChange[];
	if (changes.length === 0) return undefined;
	return changes.map((change) => ({
		templateSlotId: change.templateSlotId ?? null,
		slotIndex: change.slotIndex ?? 0,
		assigneeId: change.newPersonnelId ?? null,
		assignmentSource:
			change.assignmentSource === 'locked' ||
			change.changeIntent === 'lock-open' ||
			change.changeIntent === 'lock-assigned'
				? 'locked'
				: 'manual'
	}));
}

function findRevisionPreviewSlot(
	preview: DutyEventPreview,
	override: DutyEventSlotOverrideInput
): DutyEventPreviewSlotInstance | null {
	return (
		preview.slotInstances.find(
			(slot) =>
				slot.slotIndex === override.slotIndex &&
				(override.templateSlotId ? slot.templateSlotId === override.templateSlotId : true)
		) ?? null
	);
}

function revisionChangeIntentFromOverride(
	override: DutyEventSlotOverrideInput
): AdvancedDutyRevisionDraftSlotChange['changeIntent'] {
	if (override.assigneeId === null) {
		return override.assignmentSource === 'locked' ? 'lock-open' : 'clear';
	}
	return override.assignmentSource === 'locked' ? 'lock-assigned' : 'assign';
}

function revisionDraftChangeFromOverride(input: {
	event: DutyEvent;
	preview: DutyEventPreview;
	override: DutyEventSlotOverrideInput;
}): AdvancedDutyRevisionDraftSlotChange {
	const slot = findRevisionPreviewSlot(input.preview, input.override);
	return {
		eventDate: input.event.eventDate,
		slotKey: slot
			? buildRevisionSlotKey(slot)
			: `${input.override.templateSlotId ?? 'slot'}:${input.override.slotIndex}`,
		dutyEventId: input.event.id,
		templateSlotId: input.override.templateSlotId ?? slot?.templateSlotId ?? null,
		roleLabel: slot?.roleLabel,
		slotIndex: input.override.slotIndex,
		newPersonnelId: input.override.assigneeId,
		assignmentSource: input.override.assignmentSource ?? 'manual',
		warningState: slot?.warningState ?? 'none',
		changeIntent: revisionChangeIntentFromOverride(input.override)
	};
}

async function loadAppliedAdvancedDutyRunForRevision(
	ctx: QueryPorts,
	event: DutyEvent
): Promise<AdvancedDutyRevisionAppliedRun> {
	if (!event.runId) {
		fail(400, 'Legacy applied duty events cannot use Advanced Duty revision drafts yet.');
	}
	const runById = await loadDutyEventRunsByIds(ctx, [event.runId]);
	const run = runById.get(event.runId);
	if (!run) {
		fail(404, 'Applied Advanced Duty run not found.');
	}
	const sourceSnapshot = await ctx.store.findOne<Record<string, unknown>>(
		AdvancedDutyRunSnapshotEntity.table,
		ctx.auth.orgId,
		{
			applied_run_id: run.id,
			status: 'applied'
		}
	);
	return {
		id: run.id,
		orgId: run.orgId,
		sourceSnapshotId: sourceSnapshot ? String(sourceSnapshot.id) : null,
		sourceSnapshotFingerprint: sourceSnapshot ? String(sourceSnapshot.snapshot_fingerprint ?? '') || null : null,
		createdAt: run.createdAt,
		updatedAt: run.updatedAt
	};
}

async function previewExistingDutyEventWithOverrides(
	ctx: QueryPorts,
	event: DutyEvent,
	slotOverrides: DutyEventSlotOverrideInput[] | undefined
): Promise<DutyEventPreview> {
	if (slotOverrides === undefined) {
		return buildPreviewFromDutyEvent(event);
	}

	const template = buildTemplateFromRulesSnapshot(event.rulesSnapshot);
	return toPublicAdvancedDutyPreview(
		await buildDutyEventPreviewFromResolvedTemplate(
			ctx,
			template,
			event.eventDate,
			undefined,
			slotOverrides,
			[],
			[event.id]
		)
	);
}

async function buildRevisionDraftSessionPreview(
	ctx: QueryPorts,
	event: DutyEvent,
	draft: AdvancedDutyRevisionDraftRecord
): Promise<DutyEventPreview> {
	return previewExistingDutyEventWithOverrides(ctx, event, revisionDraftSlotChangesToOverrides(draft));
}

export async function previewExistingDutyEvent(
	ctx: QueryPorts,
	input: ExistingDutyEventInput
): Promise<DutyEventPreview> {
	requireAdvancedDutyAccess(ctx.auth);

	const event = await getDutyEventById(ctx, input.dutyEventId);
	return previewExistingDutyEventWithOverrides(ctx, event, input.slotOverrides);
}

export async function startAdvancedDutyRevisionDraftForEvent(
	ctx: WritePorts & { advancedDutyPersistence: AdvancedDutyPersistencePort },
	input: { dutyEventId: string }
): Promise<AdvancedDutyRevisionDraftSession & { action: 'created' | 'reopened' }> {
	requireAdvancedDutyAccess(ctx.auth);
	const event = await getDutyEventById(ctx, input.dutyEventId);
	const appliedRun = await loadAppliedAdvancedDutyRunForRevision(ctx, event);
	const result = await createOrReopenAdvancedDutyRevisionDraft(ctx, { appliedRun });
	return {
		action: result.action,
		draft: result.draft,
		preview: await buildRevisionDraftSessionPreview(ctx, event, result.draft)
	};
}

export async function updateAdvancedDutyRevisionDraftForEvent(
	ctx: WritePorts & { advancedDutyPersistence: AdvancedDutyPersistencePort },
	input: ExistingDutyEventInput
): Promise<AdvancedDutyRevisionDraftSession & { action: 'updated' }> {
	requireAdvancedDutyAccess(ctx.auth);
	const event = await getDutyEventById(ctx, input.dutyEventId);
	const appliedRun = await loadAppliedAdvancedDutyRunForRevision(ctx, event);
	let { draft } = await createOrReopenAdvancedDutyRevisionDraft(ctx, { appliedRun });
	const preview = await previewExistingDutyEventWithOverrides(
		ctx,
		event,
		input.slotOverrides ?? revisionDraftSlotChangesToOverrides(draft)
	);

	for (const override of input.slotOverrides ?? []) {
		draft = await updateAdvancedDutyRevisionDraftChange(ctx, {
			draftId: draft.id,
			change: revisionDraftChangeFromOverride({ event, preview, override })
		});
	}

	return {
		action: 'updated',
		draft,
		preview
	};
}

export async function discardAdvancedDutyRevisionDraftForEvent(
	ctx: WritePorts & { advancedDutyPersistence: AdvancedDutyPersistencePort },
	input: { dutyEventId: string }
): Promise<AdvancedDutyRevisionDraftRecord> {
	requireAdvancedDutyAccess(ctx.auth);
	const event = await getDutyEventById(ctx, input.dutyEventId);
	const appliedRun = await loadAppliedAdvancedDutyRunForRevision(ctx, event);
	const activeDraft = await getActiveAdvancedDutyRevisionDraft(ctx, { appliedRunId: appliedRun.id });
	if (!activeDraft) {
		fail(404, 'Advanced Duty revision draft not found.');
	}
	return discardAdvancedDutyRevisionDraftById(ctx, { draftId: activeDraft.id });
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
		aggregate = await updateDutyEventAggregateWithLegacyFairnessFallback(ctx, {
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
			slotInstances: preview.slotInstances,
			createdAt: now
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
	ctx: QueryPorts & { advancedDutyPersistence: AdvancedDutyPersistencePort },
	input: DutyEventSeriesInput
): Promise<DutyEventSeriesPreview> {
	requireAdvancedDutyAccess(ctx.auth);

	const eventDates = await expandSeriesDates(ctx, input);
	const template = await getTemplate(ctx, input.templateId);
	requireActiveAdvancedDutyTemplate(template);

	// Fetch all existing events for this template so we can exclude each one from its own
	// collision check — prevents phantom conflicts when previewing a re-apply over existing dates.
	const existingEventRows = await ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId, {
		template_id: input.templateId
	});
	const existingIdByDate = new Map<string, string>(
		existingEventRows.map((row) => [row.event_date as string, row.id as string])
	);
	const templateHistoryIds = existingEventRows.map((row) => String(row.id));
	const seriesCoverages = eventDates.map((eventDate) => buildAdvancedDutyCoverage(template, eventDate));
	const coverageStart = seriesCoverages.map((coverage) => coverage.coverageStart).sort((a, b) => a.localeCompare(b))[0];
	const coverageEnd = seriesCoverages.map((coverage) => coverage.coverageEnd).sort((a, b) => b.localeCompare(a))[0];
	const coverageStartDate = seriesCoverages
		.map((coverage) => coverage.coverageStart.slice(0, 10))
		.sort((a, b) => a.localeCompare(b))[0];
	const coverageEndDate = seriesCoverages
		.map((coverage) => coverage.coverageEnd.slice(0, 10))
		.sort((a, b) => b.localeCompare(a))[0];
	const coverageHistoryRows = await listDutyEventHistoryRowsForCoverage(ctx, coverageStart, coverageEnd);
	const historyRows = mergeRowsById(existingEventRows, coverageHistoryRows);
	const historySlotRows = await listDutyEventSlotRowsForEvents(
		ctx,
		historyRows.map((row) => String(row.id))
	);
	const resolvedPreviewData: ResolvedPreviewData = {
		allPersonnel: await listPersonnel(ctx),
		availabilityEntries: await listAvailabilityEntriesForCoverage(ctx, coverageStartDate, coverageEndDate),
		statusTypes: await listStatusTypes(ctx),
		holidayClosureDates: await listHolidayClosureDateSet(ctx),
		historyRows,
		historySlotRows,
		templateHistoryRows: existingEventRows,
		templateHistorySlotRows:
			templateHistoryIds.length > 0
				? await ctx.store.findMany<Record<string, unknown>>('duty_event_slots', ctx.auth.orgId, undefined, {
						inFilters: { duty_event_id: templateHistoryIds }
					})
				: []
	};
	const allPersonnel = resolvedPreviewData.allPersonnel ?? [];
	const personnelById = new Map(allPersonnel.map((person) => [person.id, person]));
	const slotOverridesByEventDate = new Map<string, DutyEventSlotOverrideInput[] | undefined>(
		eventDates.map((eventDate) => [eventDate, getEventSlotOverrides(input, eventDate)])
	);
	const excludedHistoryEventIdsByEventDate = new Map<string, string[]>(
		eventDates.map((eventDate) => [
			eventDate,
			existingIdByDate.get(eventDate) ? [existingIdByDate.get(eventDate)!] : []
		])
	);
	const snapshot = await buildAdvancedRunSnapshot({
		template,
		eventDates,
		personnel: allPersonnel,
		holidayClosureDates: resolvedPreviewData.holidayClosureDates ?? new Set(),
		historyEvents: await buildAdvancedRunHistoryEvents(ctx, template.id, resolvedPreviewData),
		excludedHistoryEventIdsByEventDate,
		availabilityEntries: resolvedPreviewData.availabilityEntries,
		statusTypes: resolvedPreviewData.statusTypes,
		candidatePersonnelIds: input.candidatePersonnelIds,
		slotOverridesByEventDate,
		buildCollisionSummary: async (collisionInput) =>
			buildCollisionSummary(
				ctx,
				collisionInput.slotProposals,
				collisionInput.eventDate,
				collisionInput.coverageStart,
				collisionInput.coverageEnd,
				collisionInput.cooldownHours,
				personnelById,
				collisionInput.transientEvents,
				existingIdByDate.get(collisionInput.eventDate) ? [existingIdByDate.get(collisionInput.eventDate)!] : []
			)
	});
	const originalProposalsByEventDate: Record<string, ReturnType<typeof buildAdvancedRunOriginalProposal>> = {};
	if ((input.eventOverrides ?? []).length > 0) {
		const originalSnapshot = await buildAdvancedRunSnapshot({
			template,
			eventDates,
			personnel: allPersonnel,
			holidayClosureDates: resolvedPreviewData.holidayClosureDates ?? new Set(),
			historyEvents: await buildAdvancedRunHistoryEvents(ctx, template.id, resolvedPreviewData),
			excludedHistoryEventIdsByEventDate,
			availabilityEntries: resolvedPreviewData.availabilityEntries,
			statusTypes: resolvedPreviewData.statusTypes,
			candidatePersonnelIds: input.candidatePersonnelIds,
			slotOverridesByEventDate: new Map(eventDates.map((eventDate) => [eventDate, undefined])),
			buildCollisionSummary: async (collisionInput) =>
				buildCollisionSummary(
					ctx,
					collisionInput.slotProposals,
					collisionInput.eventDate,
					collisionInput.coverageStart,
					collisionInput.coverageEnd,
					collisionInput.cooldownHours,
					personnelById,
					collisionInput.transientEvents,
					existingIdByDate.get(collisionInput.eventDate) ? [existingIdByDate.get(collisionInput.eventDate)!] : []
				)
		});
		for (const eventOverride of input.eventOverrides ?? []) {
			const event = originalSnapshot.events.find((item) => item.eventDate === eventOverride.eventDate);
			if (event) {
				originalProposalsByEventDate[eventOverride.eventDate] = buildAdvancedRunOriginalProposal(
					toAdvancedDutyRunEventPreview(event)
				);
			}
		}
	}
	const events = snapshot.events.map((event) => {
		const internalPreview = toAdvancedDutyRunEventPreview(event);
		const existingId = existingIdByDate.get(event.eventDate);
		return toPublicAdvancedDutyPreview(
			existingId
				? withCollisionMessage(internalPreview, buildReplacementCollisionMessage(template.name, event.eventDate))
				: internalPreview
		);
	});

	const publicPreview = {
		templateId: template.id,
		templateName: template.name,
		pattern: input.pattern,
		eventDates,
		events,
		da6Matrices: snapshot.da6Matrices
	};
	if (eventDates.length === 0) {
		return publicPreview;
	}
	const snapshotMetadata = await createDraftAdvancedRunSnapshot(ctx, {
		templateId: template.id,
		templateName: template.name,
		pattern: input.pattern,
		eventDates,
		candidatePersonnelIds: input.candidatePersonnelIds,
		inputPayload: input as unknown as Record<string, unknown>,
		snapshotPayload:
			Object.keys(originalProposalsByEventDate).length > 0
				? {
						...snapshot,
						originalProposalsByEventDate
					}
				: snapshot,
		previewPayload: omitPreviewOnlyDa6Matrices(publicPreview as unknown as Record<string, unknown>)
	});

	return {
		...publicPreview,
		...snapshotMetadata
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
	const approvedSnapshot = await loadApprovedAdvancedRunSnapshot(ctx, input);
	assertApprovedSeriesAdvancedRunSnapshot(approvedSnapshot, input, eventDates);

	const template = await getTemplate(ctx, input.templateId);
	let run: DutyEventRunRecord | null = null;
	try {
		await markAdvancedRunSnapshotApplying(ctx, approvedSnapshot.id);
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
					slotOverrides: getEventSlotOverrides(input, eventDate),
					approvedSnapshot
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
		await markAdvancedRunSnapshotApplied(ctx, approvedSnapshot.id, { appliedRunId: resolvedRun.id });

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
		if (error instanceof Error && error.message === 'Collision review is required before applying this duty event.') {
			await markAdvancedRunSnapshotDraft(ctx, approvedSnapshot.id);
			fail(400, 'Collision review is required before applying this duty series.');
		}
		await markAdvancedRunSnapshotPartialFailure(ctx, approvedSnapshot.id, error);
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
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewAvailability);

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
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewAvailability);

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
