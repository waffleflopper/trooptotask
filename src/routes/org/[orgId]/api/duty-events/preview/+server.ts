import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import type { DutyEventApplyInput, DutyEventPreview } from '$features/duty-roster/duty-roster.types';
import { previewDutyEventFromTemplate } from '$lib/server/core/useCases/dutyEventCrud';
import { dutyEventApplyInputSchema } from '../schemas';

export const _postConfig: RouteConfig<DutyEventApplyInput, DutyEventPreview> = {
	permission: 'calendar',
	input: dutyEventApplyInputSchema,
	fn: (ctx, input) => previewDutyEventFromTemplate(ctx, input)
};

export const POST = handle(_postConfig);
