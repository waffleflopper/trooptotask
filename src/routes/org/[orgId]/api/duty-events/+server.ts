import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import type { DutyEvent, DutyEventApplyInput } from '$features/duty-roster/duty-roster.types';
import { applyDutyEventFromTemplate, previewDutyEventFromTemplate } from '$lib/server/core/useCases/dutyEventCrud';

export const _postConfig: RouteConfig<DutyEventApplyInput, DutyEvent> = {
	permission: 'calendar',
	mutation: true,
	fn: async (ctx, input) => {
		if (!input.collisionReviewConfirmed) {
			const preview = await previewDutyEventFromTemplate(ctx, input);
			if (preview.collisionSummary.hasConflicts) {
				fail(400, 'Collision review is required before applying this duty event.');
			}
		}

		return applyDutyEventFromTemplate(ctx, input);
	}
};

export const POST = handle(_postConfig);
