/**
 * Calendar special-day operations — create, update, delete, and reset holidays.
 *
 * Special days mark dates with custom labels on the calendar (training holidays, federal holidays,
 * unit stand-downs, etc.).
 */
import { specialDayCreateInput, specialDayUpdateInput } from './calendarPersistenceMapping.server';
import { getDefaultFederalHolidays } from './utils/federalHolidays';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy, type CalendarCatalogPorts } from './calendarPolicy.server';
import { error } from '@sveltejs/kit';
import type { SavedFederalHoliday } from './contracts';
import { issueMessage } from '$lib/utils/inputSchemas';

const action = CALENDAR_POLICY_ACTIONS.configureSpecialDays;
const resource = { kind: 'organization' } as const;

export async function createSpecialDay(ctx: CalendarCatalogPorts, input: Record<string, unknown>) {
	const parsed = specialDayCreateInput.safeParse(input);
	if (!parsed.success) throw error(400, issueMessage(parsed.error));
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
	if (!parsed.success) throw error(400, issueMessage(parsed.error));
	const { id, ...patch } = parsed.data;
	await requireCalendarPolicy(ctx, action, resource);
	const row = await ctx.calendarCatalogs.updateSpecialDay(id, patch);
	if (!row) throw error(404, 'That special day is no longer available.');
	ctx.audit.log({ action: 'special_day.updated', resourceType: 'special_day', resourceId: id });
	return row;
}

export async function deleteSpecialDay(ctx: CalendarCatalogPorts, id: string): Promise<void> {
	await requireCalendarPolicy(ctx, action, resource);
	if (!(await ctx.calendarCatalogs.deleteSpecialDay(id))) return;
	ctx.audit.log({ action: 'special_day.deleted', resourceType: 'special_day', resourceId: id });
}

export async function resetFederalHolidays(ctx: CalendarCatalogPorts): Promise<SavedFederalHoliday[]> {
	await requireCalendarPolicy(ctx, action, resource);
	const saved = await ctx.calendarCatalogs.resetFederalHolidays(
		getDefaultFederalHolidays().map(({ date, name }) => ({ date, name }))
	);
	ctx.audit.log({ action: 'special_day.federal_holidays_reset', resourceType: 'special_day' });
	return saved;
}
