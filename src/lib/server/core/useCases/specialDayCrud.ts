/**
 * Special day CRUD use cases — create, update, delete calendar special days, and reset holidays.
 *
 * Special days mark dates with custom labels on the calendar (training holidays, federal holidays,
 * unit stand-downs, etc.).
 *
 * `createResetFederalHolidaysUseCase()` returns a use case that deletes all current federal
 * holiday entries for the org and re-inserts the default set from `federalHolidays.ts`.
 * This is a destructive replace — any custom edits to federal holidays are lost.
 */
import { SpecialDayEntity } from '$lib/server/entities/specialDay';
import { getDefaultFederalHolidays } from '$features/calendar/utils/federalHolidays';
import type { WritePorts } from '$lib/server/core/ports';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from './calendarPolicy';

export function createResetFederalHolidaysUseCase() {
	return async (ctx: WritePorts): Promise<unknown[]> => {
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
	};
}
