import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import type { DutyEventApplyInput, DutyEventPreview } from '$features/duty-roster/duty-roster.types';
import { previewDutyEventFromTemplate } from '$lib/server/core/useCases/dutyEventCrud';

export const _postConfig: RouteConfig<DutyEventApplyInput, DutyEventPreview> = {
	permission: 'privileged',
	fn: (ctx, input) => previewDutyEventFromTemplate(ctx, input)
};

export const POST = handle(_postConfig);
