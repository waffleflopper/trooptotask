/**
 * Calendar special-day operations — create, update, delete, and reset holidays.
 *
 * Special days mark dates with custom labels on the calendar (training holidays, federal holidays,
 * unit stand-downs, etc.).
 *
 * Reset deletes all current federal holiday entries for the org and re-inserts
 * the default set from `federalHolidays.ts`.
 * This is a destructive replace — any custom edits to federal holidays are lost.
 */
import { SpecialDayEntity } from './specialDayEntity.server';
import { getDefaultFederalHolidays } from './utils/federalHolidays';
import {
	CALENDAR_POLICY_ACTIONS,
	requireCalendarPolicy,
	type CalendarWritePorts
} from '$lib/server/core/useCases/calendarPolicy';
import { error } from '@sveltejs/kit';

const entity = SpecialDayEntity;
const action = CALENDAR_POLICY_ACTIONS.configureSpecialDays;
const resource = { kind: 'organization' } as const;

export async function createSpecialDay(ctx: CalendarWritePorts, input: Record<string, unknown>) {
	const parsed = entity.createSchema.safeParse(input);
	if (!parsed.success) throw error(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	await requireCalendarPolicy(ctx, action, resource);
	const row = await ctx.store.insert<Record<string, unknown>>(
		entity.table,
		ctx.auth.orgId,
		entity.toDbInsert(parsed.data, ctx.auth.orgId),
		entity.select
	);
	ctx.audit.log({
		action: 'special_day.created',
		resourceType: 'special_day',
		resourceId: row.id as string | undefined
	});
	return entity.fromDb(row);
}

export async function updateSpecialDay(ctx: CalendarWritePorts, input: Record<string, unknown>) {
	const parsed = entity.updateSchema.safeParse(input);
	if (!parsed.success) throw error(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	const id = parsed.data.id as string;
	await requireCalendarPolicy(ctx, action, resource);
	const row = await ctx.store.update<Record<string, unknown>>(
		entity.table,
		ctx.auth.orgId,
		id,
		entity.toDbUpdate(parsed.data),
		entity.select
	);
	ctx.audit.log({ action: 'special_day.updated', resourceType: 'special_day', resourceId: id });
	return entity.fromDb(row);
}

export async function deleteSpecialDay(ctx: CalendarWritePorts, id: string): Promise<void> {
	await requireCalendarPolicy(ctx, action, resource);
	await ctx.store.delete(entity.table, ctx.auth.orgId, id);
	ctx.audit.log({ action: 'special_day.deleted', resourceType: 'special_day', resourceId: id });
}

export async function resetFederalHolidays(ctx: CalendarWritePorts): Promise<unknown[]> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.configureSpecialDays, { kind: 'organization' });

	// Delete existing federal holidays
	await ctx.store.deleteWhere('special_days', ctx.auth.orgId, {
		type: 'federal-holiday'
	});

	// Insert fresh defaults
	const holidays = getDefaultFederalHolidays();
	const rows = holidays.map((h) => ({
		date: h.date,
		name: h.name,
		type: h.type
	}));

	if (rows.length > 0) {
		await ctx.store.insertMany('special_days', ctx.auth.orgId, rows);
	}

	ctx.audit.log({
		action: 'special_day.federal_holidays_reset',
		resourceType: 'special_day'
	});

	// Return all special days
	const allDays = await ctx.store.findMany<Record<string, unknown>>('special_days', ctx.auth.orgId);

	return allDays.map((row) => SpecialDayEntity.fromDb(row));
}
