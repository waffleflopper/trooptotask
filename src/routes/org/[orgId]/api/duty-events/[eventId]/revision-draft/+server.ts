import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import type {
	AdvancedDutyRevisionDraftRecord,
	AdvancedDutyRevisionDraftSession,
	ExistingDutyEventInput
} from '$features/duty-roster/duty-roster.types';
import {
	discardAdvancedDutyRevisionDraftForEvent,
	startAdvancedDutyRevisionDraftForEvent,
	updateAdvancedDutyRevisionDraftForEvent
} from '$lib/server/core/useCases/dutyEventCrud';
import { dutyEventIdInputSchema, existingDutyEventInputSchema } from '../../schemas';

export const _postConfig: RouteConfig<{ dutyEventId: string }, AdvancedDutyRevisionDraftSession> = {
	permission: 'calendar',
	mutation: true,
	deferPolicyToUseCase: true,
	input: dutyEventIdInputSchema,
	fn: (ctx, input) => startAdvancedDutyRevisionDraftForEvent(ctx, input)
};

export const POST = handle<{ dutyEventId: string }, AdvancedDutyRevisionDraftSession>({
	..._postConfig,
	parseInput: async (event) => ({
		dutyEventId: event.params.eventId as string
	})
});

export const _putConfig: RouteConfig<ExistingDutyEventInput, AdvancedDutyRevisionDraftSession> = {
	permission: 'calendar',
	mutation: true,
	deferPolicyToUseCase: true,
	input: existingDutyEventInputSchema,
	fn: (ctx, input) => updateAdvancedDutyRevisionDraftForEvent(ctx, input)
};

export const PUT = handle<ExistingDutyEventInput, AdvancedDutyRevisionDraftSession>({
	..._putConfig,
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

export const _deleteConfig: RouteConfig<{ dutyEventId: string }, AdvancedDutyRevisionDraftRecord> = {
	permission: 'calendar',
	mutation: true,
	deferPolicyToUseCase: true,
	input: dutyEventIdInputSchema,
	fn: (ctx, input) => discardAdvancedDutyRevisionDraftForEvent(ctx, input)
};

export const DELETE = handle<{ dutyEventId: string }, AdvancedDutyRevisionDraftRecord>({
	..._deleteConfig,
	parseInput: async (event) => ({
		dutyEventId: event.params.eventId as string
	})
});
