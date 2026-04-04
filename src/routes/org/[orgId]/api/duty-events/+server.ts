import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import type { DutyEvent, DutyEventApplyInput } from '$features/duty-roster/duty-roster.types';
import { applyDutyEventFromTemplate } from '$lib/server/core/useCases/dutyEventCrud';

export const _postConfig: RouteConfig<DutyEventApplyInput, DutyEvent> = {
	permission: 'privileged',
	mutation: true,
	fn: (ctx, input) => applyDutyEventFromTemplate(ctx, input)
};

export const POST = handle(_postConfig);
