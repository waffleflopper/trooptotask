import { z } from 'zod';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fetchCalendarRangeData } from '$lib/server/core/useCases/calendarQuery';
import { formatDate, parseDate } from '$lib/utils/dates';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CALENDAR_RANGE_DAYS = 366;

function isValidDateOnly(value: string): boolean {
	return ISO_DATE_PATTERN.test(value) && formatDate(parseDate(value)) === value;
}

function toUtcDay(value: string): number {
	const date = parseDate(value);
	return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

const calendarRangeInput = z
	.object({
		rangeStart: z
			.string()
			.regex(ISO_DATE_PATTERN, 'Dates must use YYYY-MM-DD format')
			.refine(isValidDateOnly, 'Invalid calendar date'),
		rangeEnd: z
			.string()
			.regex(ISO_DATE_PATTERN, 'Dates must use YYYY-MM-DD format')
			.refine(isValidDateOnly, 'Invalid calendar date')
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

export const _getConfig: RouteConfig<z.infer<typeof calendarRangeInput>> = {
	permission: 'calendar',
	input: calendarRangeInput,
	parseInput: (event) => ({
		rangeStart: event.url.searchParams.get('rangeStart') ?? '',
		rangeEnd: event.url.searchParams.get('rangeEnd') ?? ''
	}),
	fn: async (ctx, input) => fetchCalendarRangeData(ctx, input)
};

export const GET = handle(_getConfig);
