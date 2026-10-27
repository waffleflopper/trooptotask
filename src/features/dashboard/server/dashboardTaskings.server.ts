import { loadTaskingAttention, type CalendarProjectionReader } from '$features/calendar/index.server';
import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';
import { FORECAST_DAYS, type DashboardTaskings } from '../contracts';
import { dashboardSourceAccess } from './dashboardSources.server';

type DashboardTaskingContext = Parameters<typeof loadTaskingAttention>[0] &
	Parameters<typeof dashboardSourceAccess>[0] & { calendarProjection: CalendarProjectionReader };

/** Null when the unit has Events & Taskings off or the viewer has no Calendar, which is not an empty queue. */
export async function fetchDashboardTaskings(
	ctx: DashboardTaskingContext,
	today: string
): Promise<DashboardTaskings | null> {
	if (!dashboardSourceAccess(ctx)('taskingAttention')) return null;
	const rangeEnd = fromDayNumber(toDayNumber(today) + FORECAST_DAYS - 1);
	const [attention, { events, suspenses }] = await Promise.all([
		loadTaskingAttention(ctx, today),
		ctx.calendarProjection.read({ rangeStart: today, rangeEnd })
	]);
	return { attention, forecast: { events, suspenses } };
}
