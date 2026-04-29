import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import type { DutyEvent, DutyEventApplyInput } from '$features/duty-roster/duty-roster.types';
import { applyDutyEventFromTemplate } from '$lib/server/core/useCases/dutyEventCrud';
import { dutyEventSnapshotApplyInputSchema } from './schemas';

export const _postConfig: RouteConfig<DutyEventApplyInput, DutyEvent> = {
	permission: 'calendar',
	mutation: true,
	input: dutyEventSnapshotApplyInputSchema,
	fn: (ctx, input) => applyDutyEventFromTemplate(ctx, input)
};

export const POST = handle(_postConfig);
