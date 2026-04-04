import { fail } from '$lib/server/core/errors';
import type { QueryPorts, WritePorts } from '$lib/server/core/ports';
import { DutyEventEntity } from '$lib/server/entities/dutyEvent';
import { DutyEventSlotEntity } from '$lib/server/entities/dutyEventSlot';
import { DutyTemplateEntity } from '$lib/server/entities/dutyTemplate';
import { DutyTemplateRotationBaselineEntity } from '$lib/server/entities/dutyTemplateRotationBaseline';
import { DutyTemplateSlotEntity } from '$lib/server/entities/dutyTemplateSlot';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import type { Personnel } from '$lib/types';
import type {
	DutyEvent,
	DutyEventApplyInput,
	DutyEventSeriesApplyResult,
	DutyEventSeriesInput,
	DutyEventSeriesPattern,
	DutyEventSeriesPreview,
	DutyEventCollisionSummary,
	DutyEventFillSummary,
	DutyEventPreview,
	DutyEventPreviewSlotInstance,
	DutyEventRulesSnapshot,
	DutyEventSlotInstance,
	DutyTemplate,
	DutyTemplateRotationBaseline,
	DutyTemplateSlot
} from '$features/duty-roster/duty-roster.types';

interface PoolHistorySummary {
	lastServedDate: string | null;
	lastWeekendDate: string | null;
	lastHolidayClosureDate: string | null;
}

function buildCoverageDateTime(date: string, time: string): string {
	return `${date}T${time}:00`;
}

function addDays(date: string, days: number): string {
	const value = new Date(`${date}T00:00:00`);
	value.setDate(value.getDate() + days);
	return value.toISOString().slice(0, 10);
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

function getDayOfWeek(date: string): number {
	return new Date(`${date}T00:00:00`).getDay();
}

function normalizeTemplate(
	templateRow: Record<string, unknown>,
	slotRows: Record<string, unknown>[],
	baselineRows: Record<string, unknown>[] = []
): DutyTemplate {
	return {
		...DutyTemplateEntity.fromDb(templateRow),
		slots: DutyTemplateSlotEntity.fromDbArray(slotRows).sort((a, b) => a.sortOrder - b.sortOrder),
		rotationBaselines: DutyTemplateRotationBaselineEntity.fromDbArray(baselineRows).sort((a, b) =>
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
		isBlocking: template.isBlocking,
		cooldownHours: template.cooldownHours,
		slots: template.slots.map((slot) => ({
			templateSlotId: slot.id,
			roleLabel: slot.roleLabel,
			quantity: slot.quantity,
			allowedRanks: [...slot.allowedRanks],
			allowedGroupIds: [...slot.allowedGroupIds],
			preferredGroupIds: [...slot.preferredGroupIds],
			allowedMosValues: [...slot.allowedMosValues],
			allowedRoleValues: [...slot.allowedRoleValues],
			rotationPoolKey: slot.rotationPoolKey,
			sortOrder: slot.sortOrder
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
		a.lastName.localeCompare(b.lastName) ||
		a.firstName.localeCompare(b.firstName) ||
		a.rank.localeCompare(b.rank) ||
		a.id.localeCompare(b.id)
	);
}

function createEmptyPoolHistorySummary(): PoolHistorySummary {
	return {
		lastServedDate: null,
		lastWeekendDate: null,
		lastHolidayClosureDate: null
	};
}

function recordServiceDate(summary: PoolHistorySummary, date: string, holidayClosureDates: Set<string>): PoolHistorySummary {
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
	holidayClosureDates: Set<string>
): Promise<Map<string, PoolHistorySummary>> {
	const historyByPoolPerson = new Map<string, PoolHistorySummary>();

	for (const baseline of template.rotationBaselines) {
		const key = `${baseline.rotationPoolKey}::${baseline.personId}`;
		historyByPoolPerson.set(
			key,
			recordServiceDate(historyByPoolPerson.get(key) ?? createEmptyPoolHistorySummary(), baseline.lastServedDate, holidayClosureDates)
		);
	}

	const eventRows = await ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId, {
		template_id: template.id
	});
	if (eventRows.length === 0) {
		return historyByPoolPerson;
	}

	const eventIds = eventRows.map((row) => String(row.id));
	const slotRows = await ctx.store.findMany<Record<string, unknown>>('duty_event_slots', ctx.auth.orgId, undefined, {
		inFilters: { duty_event_id: eventIds }
	});
	const eventById = new Map(eventRows.map((row) => [String(row.id), row]));
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

		const rulesSnapshot = eventRow.rules_snapshot as { slots?: Array<{ templateSlotId?: string; rotationPoolKey?: string }> } | undefined;
		const snapshotSlot = rulesSnapshot?.slots?.find((slot) => slot.templateSlotId === templateSlotId);
		const rotationPoolKey = snapshotSlot?.rotationPoolKey;
		if (!rotationPoolKey) {
			continue;
		}

		const eventDate = String(eventRow.event_date);
		const key = `${rotationPoolKey}::${String(assigneeId)}`;
		historyByPoolPerson.set(
			key,
			recordServiceDate(historyByPoolPerson.get(key) ?? createEmptyPoolHistorySummary(), eventDate, holidayClosureDates)
		);
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
	return [...personnel].sort((a, b) => {
		const aSummary = historyByPoolPerson.get(`${slot.rotationPoolKey}::${a.id}`) ?? createEmptyPoolHistorySummary();
		const bSummary = historyByPoolPerson.get(`${slot.rotationPoolKey}::${b.id}`) ?? createEmptyPoolHistorySummary();
		const aLastServed = aSummary.lastServedDate;
		const bLastServed = bSummary.lastServedDate;

		if (aLastServed && bLastServed && aLastServed !== bLastServed) {
			return aLastServed.localeCompare(bLastServed);
		}
		if (aLastServed && !bLastServed) {
			return 1;
		}
		if (!aLastServed && bLastServed) {
			return -1;
		}
		if (isHolidayClosure) {
			if (
				aSummary.lastHolidayClosureDate &&
				bSummary.lastHolidayClosureDate &&
				aSummary.lastHolidayClosureDate !== bSummary.lastHolidayClosureDate
			) {
				return aSummary.lastHolidayClosureDate.localeCompare(bSummary.lastHolidayClosureDate);
			}
			if (aSummary.lastHolidayClosureDate && !bSummary.lastHolidayClosureDate) {
				return 1;
			}
			if (!aSummary.lastHolidayClosureDate && bSummary.lastHolidayClosureDate) {
				return -1;
			}
		}
		if (isWeekend) {
			if (aSummary.lastWeekendDate && bSummary.lastWeekendDate && aSummary.lastWeekendDate !== bSummary.lastWeekendDate) {
				return aSummary.lastWeekendDate.localeCompare(bSummary.lastWeekendDate);
			}
			if (aSummary.lastWeekendDate && !bSummary.lastWeekendDate) {
				return 1;
			}
			if (!aSummary.lastWeekendDate && bSummary.lastWeekendDate) {
				return -1;
			}
		}
		const aPreferred = slot.preferredGroupIds.length > 0 && !!a.groupId && slot.preferredGroupIds.includes(a.groupId);
		const bPreferred = slot.preferredGroupIds.length > 0 && !!b.groupId && slot.preferredGroupIds.includes(b.groupId);
		if (aPreferred !== bPreferred) {
			return aPreferred ? -1 : 1;
		}

		return sortPersonnel(a, b);
	});
}

function buildFairnessConfidence(
	template: DutyTemplate,
	slot: DutyTemplateSlot,
	personnel: Personnel[],
	historyByPoolPerson: Map<string, PoolHistorySummary>
): 'high' | 'low' {
	const eligibleCandidates = personnel.filter((person) => matchesSlot(person, template, slot));
	if (eligibleCandidates.length === 0) {
		return 'low';
	}

	return eligibleCandidates.every((person) =>
		getLastServedDate(slot.rotationPoolKey, person.id, historyByPoolPerson)
	)
		? 'high'
		: 'low';
}

function generateSlotInstances(
	template: DutyTemplate,
	personnel: Personnel[],
	historyByPoolPerson: Map<string, PoolHistorySummary>,
	eventDate: string,
	holidayClosureDates: Set<string>
): Omit<DutyEventSlotInstance, 'id' | 'dutyEventId'>[] {
	const assignedIds = new Set<string>();
	const slotInstances: Omit<DutyEventSlotInstance, 'id' | 'dutyEventId'>[] = [];

	for (const slot of [...template.slots].sort((a, b) => a.sortOrder - b.sortOrder)) {
		const rankedPersonnel = rankCandidatesForSlot(template, slot, personnel, historyByPoolPerson, eventDate, holidayClosureDates);
		const fairnessConfidence = buildFairnessConfidence(template, slot, personnel, historyByPoolPerson);
		for (let slotIndex = 0; slotIndex < slot.quantity; slotIndex += 1) {
			const assignee =
				rankedPersonnel.find((person) => !assignedIds.has(person.id) && matchesSlot(person, template, slot)) ?? null;

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
					? fairnessConfidence === 'low'
						? `Selected by longest break in rotation pool "${slot.rotationPoolKey}". Fairness confidence is low because not every eligible person has seeded or historical service data yet.`
						: `Selected by longest break in rotation pool "${slot.rotationPoolKey}".`
					: null,
				unfilledReason: assignee ? null : 'No eligible personnel available for this slot.',
				sortOrder: slot.sortOrder * 100 + slotIndex
			});
		}
	}

	return slotInstances;
}

async function buildDutyEventPreview(ctx: QueryPorts, input: DutyEventApplyInput): Promise<DutyEventPreview> {
	const template = await getTemplate(ctx, input.templateId);
	if (template.status !== 'active') {
		fail(400, 'Only active advanced duty templates can be applied.');
	}

	const personnel = await listPersonnel(ctx);
	const holidayClosureDates = await listHolidayClosureDateSet(ctx);
	const historyByPoolPerson = await buildPoolHistoryIndex(ctx, template, holidayClosureDates);
	const slotInstances = generateSlotInstances(template, personnel, historyByPoolPerson, input.eventDate, holidayClosureDates);
	const fillSummary = buildFillSummary(slotInstances);
	const collisionSummary = buildCollisionSummary();
	const rulesSnapshot = buildRulesSnapshot(template);
	const coverage = buildCoverageWindow(template, input.eventDate);

	return {
		templateId: template.id,
		templateName: template.name,
		eventDate: input.eventDate,
		coverageMode: template.coverageMode,
		coverageStart: coverage.coverageStart,
		coverageEnd: coverage.coverageEnd,
		isBlocking: template.isBlocking,
		cooldownHours: template.cooldownHours,
		rulesSnapshot,
		fillSummary,
		collisionSummary,
		slotInstances: slotInstances.map<DutyEventPreviewSlotInstance>((slot) => ({
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

function buildFillSummary(slotInstances: Array<{ assigneeId: string | null }>): DutyEventFillSummary {
	const totalSlots = slotInstances.length;
	const filledSlots = slotInstances.filter((slot) => slot.assigneeId).length;
	return {
		totalSlots,
		filledSlots,
		unfilledSlots: totalSlots - filledSlots
	};
}

function buildCollisionSummary(): DutyEventCollisionSummary {
	return {
		hasConflicts: false,
		conflicts: []
	};
}

function hydrateDutyEvent(
	eventRow: Record<string, unknown>,
	slotRows: Record<string, unknown>[] | DutyEventSlotInstance[]
): DutyEvent {
	return {
		...DutyEventEntity.fromDb(eventRow),
		slotInstances: Array.isArray(slotRows) && slotRows.length > 0 && 'dutyEventId' in slotRows[0]
			? ([...slotRows] as DutyEventSlotInstance[]).sort((a, b) => a.sortOrder - b.sortOrder)
			: DutyEventSlotEntity.fromDbArray(slotRows as Record<string, unknown>[]).sort((a, b) => a.sortOrder - b.sortOrder)
	};
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

export async function applyDutyEventFromTemplate(ctx: WritePorts, input: DutyEventApplyInput): Promise<DutyEvent> {
	ctx.auth.requirePrivileged();

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) {
		fail(403, 'Organization is in read-only mode');
	}

	const preview = await buildDutyEventPreview(ctx, input);
	const now = new Date().toISOString();

	const eventRow = await ctx.store.insert<Record<string, unknown>>('duty_events', ctx.auth.orgId, {
		...DutyEventEntity.toDbInsert(
			{
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
			},
			ctx.auth.orgId
		),
		created_at: now,
		updated_at: now
	});

	const insertedSlotRows =
		preview.slotInstances.length === 0
			? []
			: await ctx.store.insertMany<Record<string, unknown>>(
					'duty_event_slots',
					ctx.auth.orgId,
					preview.slotInstances.map((slot) => ({
						...DutyEventSlotEntity.toDbInsert(
							{
								dutyEventId: eventRow.id as string,
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
							},
							ctx.auth.orgId
						),
						duty_event_id: eventRow.id as string
					}))
				);

	ctx.audit.log({
		action: 'duty_event.applied',
		resourceType: 'duty_event',
		resourceId: eventRow.id as string
	});

	return hydrateDutyEvent(eventRow, insertedSlotRows);
}

export async function previewDutyEventFromTemplate(ctx: QueryPorts, input: DutyEventApplyInput): Promise<DutyEventPreview> {
	ctx.auth.requirePrivileged();
	return buildDutyEventPreview(ctx, input);
}

export async function previewDutyEventSeriesFromTemplate(
	ctx: QueryPorts,
	input: DutyEventSeriesInput
): Promise<DutyEventSeriesPreview> {
	ctx.auth.requirePrivileged();

	const eventDates = await expandSeriesDates(ctx, input);
	const template = await getTemplate(ctx, input.templateId);
	const events = await Promise.all(
		eventDates.map((eventDate) =>
			buildDutyEventPreview(ctx, {
				templateId: input.templateId,
				eventDate
			})
		)
	);

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
	ctx.auth.requirePrivileged();

	const eventDates = await expandSeriesDates(ctx, input);
	const template = await getTemplate(ctx, input.templateId);
	const events: DutyEvent[] = [];

	for (const eventDate of eventDates) {
		events.push(
			await applyDutyEventFromTemplate(ctx, {
				templateId: input.templateId,
				eventDate
			})
		);
	}

	return {
		templateId: template.id,
		templateName: template.name,
		pattern: input.pattern,
		eventDates,
		events
	};
}

export async function listDutyEvents(ctx: QueryPorts): Promise<DutyEvent[]> {
	ctx.auth.requireView('calendar');

	const eventRows = await ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId, undefined, {
		orderBy: [
			{ column: 'coverage_start', ascending: false },
			{ column: 'created_at', ascending: false }
		]
	});

	if (eventRows.length === 0) {
		return [];
	}

	const eventIds = eventRows.map((row) => row.id as string);
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

	return eventRows.map((row) => hydrateDutyEvent(row, slotsByEvent.get(row.id as string) ?? []));
}
