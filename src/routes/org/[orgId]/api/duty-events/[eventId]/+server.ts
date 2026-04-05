import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import type {
	DutyEvent,
	DutyEventRunDeleteResult,
	ExistingDutyEventUpdateInput
} from '$features/duty-roster/duty-roster.types';
import {
	deleteDutyEventById,
	previewExistingDutyEvent,
	updateExistingDutyEvent
} from '$lib/server/core/useCases/dutyEventCrud';

export const _putConfig: RouteConfig<ExistingDutyEventUpdateInput, DutyEvent> = {
	permission: 'privileged',
	mutation: true,
	fn: async (ctx, input) => {
		if (!input.collisionReviewConfirmed) {
			const preview = await previewExistingDutyEvent(ctx, input);
			if (preview.collisionSummary.hasConflicts) {
				fail(400, 'Collision review is required before saving this duty event.');
			}
		}

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
	permission: 'privileged',
	mutation: true,
	fn: (ctx, input) => deleteDutyEventById(ctx, input)
};

export const DELETE = handle<{ dutyEventId: string }, DutyEventRunDeleteResult>({
	..._deleteConfig,
	parseInput: async (event) => ({
		dutyEventId: event.params.eventId as string
	})
});
