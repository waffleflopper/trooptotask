import { fetchCalendarRangeData } from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestCalendarRangeContext } from '$lib/server/adapters/requestContexts.server';
import { parseDate } from '$lib/utils/dates';
import { dateOnlySchema } from '$lib/utils/inputSchemas';
import { z } from 'zod';

const MAX_CALENDAR_RANGE_DAYS = 366;

function toUtcDay(value: string): number {
	const date = parseDate(value);
	return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

const calendarRangeInput = z
	.object({
		rangeStart: dateOnlySchema,
		rangeEnd: dateOnlySchema
	})
	.refine(({ rangeStart, rangeEnd }) => rangeStart <= rangeEnd, {
		message: 'rangeStart must not exceed rangeEnd'
	})
	.refine(
		({ rangeStart, rangeEnd }) => {
			const spanDays = Math.floor((toUtcDay(rangeEnd) - toUtcDay(rangeStart)) / 86_400_000) + 1;
			return spanDays <= MAX_CALENDAR_RANGE_DAYS;
		},
		{
			message: `Calendar range cannot exceed ${MAX_CALENDAR_RANGE_DAYS} days`
		}
	);

export const _getConfig: RouteConfig<
	z.infer<typeof calendarRangeInput>,
	Awaited<ReturnType<typeof fetchCalendarRangeData>>,
	ReturnType<typeof createRequestCalendarRangeContext>
> = {
	context: createRequestCalendarRangeContext,
	policyAction: POLICY_ACTION_CATALOG.calendar.viewAvailability,
	policyResource: { kind: 'unscoped' },
	input: calendarRangeInput,
	parseInput: (event) => ({
		rangeStart: event.url.searchParams.get('rangeStart') ?? '',
		rangeEnd: event.url.searchParams.get('rangeEnd') ?? ''
	}),
	fn: async (ctx, input) => fetchCalendarRangeData(ctx, input)
};

export const GET = handle(_getConfig);
