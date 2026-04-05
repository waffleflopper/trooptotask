import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import type { DutyEvent, ExistingDutyEventUpdateInput } from '$features/duty-roster/duty-roster.types';
import { updateExistingDutyEvent } from '$lib/server/core/useCases/dutyEventCrud';

export const _putConfig: RouteConfig<ExistingDutyEventUpdateInput, DutyEvent> = {
	permission: 'privileged',
	mutation: true,
	fn: (ctx, input) => updateExistingDutyEvent(ctx, input)
};

export const PUT = handle<ExistingDutyEventUpdateInput, DutyEvent>({
	..._putConfig,
	parseInput: async (event) => {
		const body = (await event.request.json().catch(() => ({}))) as {
			slotOverrides?: ExistingDutyEventUpdateInput['slotOverrides'];
			collisionReviewConfirmed?: boolean;
		};
		return {
			dutyEventId: event.params.eventId as string,
			slotOverrides: body.slotOverrides,
			collisionReviewConfirmed: body.collisionReviewConfirmed
		};
	}
});
