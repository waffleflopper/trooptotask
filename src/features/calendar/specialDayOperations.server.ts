import { closureDaysInput, specialDayUpdateInput } from './calendarPersistenceMapping.server';
import { getDefaultFederalHolidays } from './utils/federalHolidays';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy, type CalendarCatalogPorts } from './calendarPolicy.server';
import { error } from '@sveltejs/kit';
import type { SavedFederalHoliday, SavedSpecialDay } from './contracts';
import { issueMessage } from '$lib/utils/inputSchemas';

const action = CALENDAR_POLICY_ACTIONS.configureSpecialDays;
const resource = { kind: 'organization' } as const;

/** One Special Day per new date; dates that already hold a holiday or closure are skipped. */
export async function addClosureDays(
	ctx: CalendarCatalogPorts,
	input: Record<string, unknown>
): Promise<{ created: SavedSpecialDay[] }> {
	const parsed = closureDaysInput.safeParse(input);
	if (!parsed.success) throw error(400, issueMessage(parsed.error));
	await requireCalendarPolicy(ctx, action, resource);
	const created = await ctx.calendarCatalogs.addClosureDays(parsed.data.name, parsed.data.dates);
	for (const row of created)
		ctx.audit.log({ action: 'special_day.created', resourceType: 'special_day', resourceId: row.id });
	return { created };
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
