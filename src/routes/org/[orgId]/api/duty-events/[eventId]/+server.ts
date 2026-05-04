import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import type {
	DutyEvent,
	DutyEventRunDeleteResult,
	ExistingDutyEventUpdateInput
} from '$features/duty-roster/duty-roster.types';
import { deleteDutyEventById, updateExistingDutyEvent } from '$lib/server/core/useCases/dutyEventCrud';
import { dutyEventIdInputSchema, existingDutyEventUpdateInputSchema } from '../schemas';

export const _putConfig: RouteConfig<ExistingDutyEventUpdateInput, DutyEvent> = {
	permission: 'calendar',
	mutation: true,
	deferPolicyToUseCase: true,
	input: existingDutyEventUpdateInputSchema,
	fn: async (ctx, input) => {
		return updateExistingDutyEvent(ctx, input);
	}
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

export const _deleteConfig: RouteConfig<{ dutyEventId: string }, DutyEventRunDeleteResult> = {
	permission: 'calendar',
	mutation: true,
	deferPolicyToUseCase: true,
	input: dutyEventIdInputSchema,
	fn: (ctx, input) => deleteDutyEventById(ctx, input)
};

export const DELETE = handle<{ dutyEventId: string }, DutyEventRunDeleteResult>({
	..._deleteConfig,
	parseInput: async (event) => ({
		dutyEventId: event.params.eventId as string
	})
});
