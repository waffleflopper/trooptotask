import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import type { DutyEventRunDeleteResult } from '$features/duty-roster/duty-roster.types';
import { deleteLegacyDutyEventGroup } from '$lib/server/core/useCases/dutyEventCrud';
import { legacyDutyEventDeleteInputSchema } from '../../schemas';

export const _postConfig: RouteConfig<{ eventIds: string[] }, DutyEventRunDeleteResult> = {
	permission: 'calendar',
	mutation: true,
	input: legacyDutyEventDeleteInputSchema,
	fn: (ctx, input) => deleteLegacyDutyEventGroup(ctx, input)
};

export const POST = handle(_postConfig);
