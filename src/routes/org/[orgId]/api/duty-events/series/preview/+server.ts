import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import type { DutyEventSeriesInput, DutyEventSeriesPreview } from '$features/duty-roster/duty-roster.types';
import { previewDutyEventSeriesFromTemplate } from '$lib/server/core/useCases/dutyEventCrud';
import { dutyEventSeriesInputSchema } from '../../schemas';

export const _postConfig: RouteConfig<DutyEventSeriesInput, DutyEventSeriesPreview> = {
	permission: 'calendar',
	input: dutyEventSeriesInputSchema,
	fn: (ctx, input) => previewDutyEventSeriesFromTemplate(ctx, input)
};

export const POST = handle(_postConfig);
