import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import type { AdvancedDutyRevisionReapplyResult } from '$features/duty-roster/duty-roster.types';
import { reapplyAdvancedDutyRevisionDraftForEvent } from '$lib/server/core/useCases/dutyEventCrud';
import { advancedDutyRevisionReapplyInputSchema } from '../../../schemas';

type ReapplyInput = {
	dutyEventId: string;
	reason: string;
	reviewableConflictsConfirmed?: boolean;
};

export const _postConfig: RouteConfig<ReapplyInput, AdvancedDutyRevisionReapplyResult> = {
	permission: 'calendar',
	mutation: true,
	deferPolicyToUseCase: true,
	input: advancedDutyRevisionReapplyInputSchema,
	fn: (ctx, input) => reapplyAdvancedDutyRevisionDraftForEvent(ctx, input)
};

export const POST = handle<ReapplyInput, AdvancedDutyRevisionReapplyResult>({
	..._postConfig,
	parseInput: async (event) => {
		const body = (await event.request.json().catch(() => ({}))) as {
			reason?: string;
			reviewableConflictsConfirmed?: boolean;
		};
		return {
			dutyEventId: event.params.eventId as string,
			reason: body.reason ?? '',
			reviewableConflictsConfirmed: body.reviewableConflictsConfirmed
		};
	}
});
