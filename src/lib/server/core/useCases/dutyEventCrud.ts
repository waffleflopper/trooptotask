import type { QueryPorts } from '$lib/server/core/ports';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from './calendarPolicy';
import { DutyEventEntity } from '$lib/server/entities/dutyEvent';
import { DutyEventRunEntity } from '$lib/server/entities/dutyEventRun';
import { DutyEventSlotEntity } from '$lib/server/entities/dutyEventSlot';
import type { DutyEvent, DutyEventRunRecord, DutyEventSlotInstance } from '$features/duty-roster/duty-roster.types';

function addDays(date: string, days: number): string {
	const value = new Date(`${date}T00:00:00Z`);
	value.setUTCDate(value.getUTCDate() + days);
	return value.toISOString().slice(0, 10);
}

async function loadDutyEventRunsByIds(ctx: QueryPorts, runIds: string[]): Promise<Map<string, DutyEventRunRecord>> {
	const uniqueRunIds = [...new Set(runIds.filter(Boolean))];
	if (uniqueRunIds.length === 0) {
		return new Map();
	}

	const rows = await ctx.store.findMany<Record<string, unknown>>('duty_event_runs', ctx.auth.orgId, undefined, {
		inFilters: { id: uniqueRunIds }
	});
	return new Map(DutyEventRunEntity.fromDbArray(rows).map((run) => [run.id, run]));
}

function hydrateDutyEvent(
	row: Record<string, unknown>,
	slotRows: DutyEventSlotInstance[],
	runById: Map<string, DutyEventRunRecord>
): DutyEvent {
	const event = DutyEventEntity.fromDb(row);
	return {
		...event,
		slotInstances: slotRows,
		run: event.runId ? (runById.get(event.runId) ?? null) : null
	};
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
