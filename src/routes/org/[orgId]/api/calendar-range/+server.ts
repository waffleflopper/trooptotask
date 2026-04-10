import { z } from 'zod';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fetchCalendarRangeData } from '$lib/server/core/useCases/calendarQuery';

const calendarRangeInput = z.object({
	rangeStart: z.string().min(1),
	rangeEnd: z.string().min(1)
});

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
