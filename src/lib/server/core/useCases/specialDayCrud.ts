import { SpecialDayEntity } from '$lib/server/entities/specialDay';
import { getDefaultFederalHolidays } from '$features/calendar/utils/federalHolidays';
import type { CrudConfig } from './crud';
import type { UseCaseContext } from '$lib/server/core/ports';

function fail(status: number, message: string): never {
	const err = new Error(message);
	(err as unknown as Record<string, unknown>).status = status;
	throw err;
}

export const specialDayCrudConfig: CrudConfig = {
	entity: SpecialDayEntity,
	permission: 'calendar',
	auditResource: 'special_day'
};

export function createResetFederalHolidaysUseCase() {
	return async (ctx: UseCaseContext): Promise<unknown[]> => {
		ctx.auth.requireEdit('calendar');

		const isReadOnly = await ctx.readOnlyGuard.check();
		if (isReadOnly) {
			fail(403, 'Organization is in read-only mode');
		}

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
