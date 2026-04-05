import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import type { DutyEventPreview, ExistingDutyEventInput } from '$features/duty-roster/duty-roster.types';
import { previewExistingDutyEvent } from '$lib/server/core/useCases/dutyEventCrud';

export const _postConfig: RouteConfig<ExistingDutyEventInput, DutyEventPreview> = {
	permission: 'privileged',
	mutation: false,
	fn: (ctx, input) => previewExistingDutyEvent(ctx, input)
};

export const POST = handle<ExistingDutyEventInput, DutyEventPreview>({
	..._postConfig,
	parseInput: async (event) => {
		const body = (await event.request.json().catch(() => ({}))) as {
			slotOverrides?: ExistingDutyEventInput['slotOverrides'];
		};
		return {
			dutyEventId: event.params.eventId as string,
			slotOverrides: body.slotOverrides
		};
	}
});
