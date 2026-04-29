import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import type { DutyEventSeriesApplyResult, DutyEventSeriesInput } from '$features/duty-roster/duty-roster.types';
import { applyDutyEventSeriesFromTemplate } from '$lib/server/core/useCases/dutyEventCrud';
import { dutyEventSeriesSnapshotApplyInputSchema } from '../schemas';

export const _postConfig: RouteConfig<DutyEventSeriesInput, DutyEventSeriesApplyResult> = {
	permission: 'calendar',
	mutation: true,
	input: dutyEventSeriesSnapshotApplyInputSchema,
	fn: (ctx, input) => applyDutyEventSeriesFromTemplate(ctx, input)
};

export const POST = handle(_postConfig);
