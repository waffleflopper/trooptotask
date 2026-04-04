import { fail } from '$lib/server/core/errors';
import type { QueryPorts, WritePorts } from '$lib/server/core/ports';
import { DutyEventEntity } from '$lib/server/entities/dutyEvent';
import { DutyEventSlotEntity } from '$lib/server/entities/dutyEventSlot';
import { DutyTemplateEntity } from '$lib/server/entities/dutyTemplate';
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
	DutyTemplateSlot
} from '$features/duty-roster/duty-roster.types';

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
	slotRows: Record<string, unknown>[]
): DutyTemplate {
	return {
		...DutyTemplateEntity.fromDb(templateRow),
		slots: DutyTemplateSlotEntity.fromDbArray(slotRows).sort((a, b) => a.sortOrder - b.sortOrder)
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
			allowedMosValues: [...slot.allowedMosValues],
			allowedRoleValues: [...slot.allowedRoleValues],
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

function generateSlotInstances(template: DutyTemplate, personnel: Personnel[]): Omit<DutyEventSlotInstance, 'id' | 'dutyEventId'>[] {
	const sortedPersonnel = [...personnel].sort(sortPersonnel);
	const assignedIds = new Set<string>();
	const slotInstances: Omit<DutyEventSlotInstance, 'id' | 'dutyEventId'>[] = [];

	for (const slot of [...template.slots].sort((a, b) => a.sortOrder - b.sortOrder)) {
		for (let slotIndex = 0; slotIndex < slot.quantity; slotIndex += 1) {
			const assignee =
				sortedPersonnel.find((person) => !assignedIds.has(person.id) && matchesSlot(person, template, slot)) ?? null;

			if (assignee) {
				assignedIds.add(assignee.id);
			}

			slotInstances.push({
				templateSlotId: slot.id,
				roleLabel: slot.roleLabel,
				slotIndex,
				assigneeId: assignee?.id ?? null,
				assignmentSource: 'generated',
				warningState: 'none',
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
	const slotInstances = generateSlotInstances(template, personnel);
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

	return normalizeTemplate(templateRow, slotRows);
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
