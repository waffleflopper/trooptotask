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
import { specialDayCreateInput, specialDayUpdateInput } from './calendarPersistenceMapping.server';
import { getDefaultFederalHolidays } from './utils/federalHolidays';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy, type CalendarCatalogPorts } from './calendarPolicy.server';
import { error } from '@sveltejs/kit';

const action = CALENDAR_POLICY_ACTIONS.configureSpecialDays;
const resource = { kind: 'organization' } as const;

export async function createSpecialDay(ctx: CalendarCatalogPorts, input: Record<string, unknown>) {
	const parsed = specialDayCreateInput.safeParse(input);
	if (!parsed.success) throw error(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	await requireCalendarPolicy(ctx, action, resource);
	const row = await ctx.calendarCatalogs.createSpecialDay(parsed.data);
	ctx.audit.log({
		action: 'special_day.created',
		resourceType: 'special_day',
		resourceId: row.id
	});
	return row;
}

export async function updateSpecialDay(ctx: CalendarCatalogPorts, input: Record<string, unknown>) {
	const parsed = specialDayUpdateInput.safeParse(input);
	if (!parsed.success) throw error(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	const { id, ...patch } = parsed.data;
	await requireCalendarPolicy(ctx, action, resource);
	const row = await ctx.calendarCatalogs.updateSpecialDay(id, patch);
	ctx.audit.log({ action: 'special_day.updated', resourceType: 'special_day', resourceId: id });
	return row;
}

export async function deleteSpecialDay(ctx: CalendarCatalogPorts, id: string): Promise<void> {
	await requireCalendarPolicy(ctx, action, resource);
	await ctx.calendarCatalogs.deleteSpecialDay(id);
	ctx.audit.log({ action: 'special_day.deleted', resourceType: 'special_day', resourceId: id });
}

export async function resetFederalHolidays(ctx: CalendarCatalogPorts): Promise<unknown[]> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.configureSpecialDays, { kind: 'organization' });

	await ctx.calendarCatalogs.deleteFederalHolidays();

	const holidays = getDefaultFederalHolidays();
	const rows = holidays.map((h) => ({
		date: h.date,
		name: h.name,
		type: h.type
	}));

	if (rows.length > 0) {
		await ctx.calendarCatalogs.createFederalHolidays(rows);
	}

	ctx.audit.log({
		action: 'special_day.federal_holidays_reset',
		resourceType: 'special_day'
	});

	return ctx.calendarCatalogs.listSpecialDays();
}
