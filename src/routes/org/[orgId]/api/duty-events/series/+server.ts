import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import type { DutyEventSeriesApplyResult, DutyEventSeriesInput } from '$features/duty-roster/duty-roster.types';
import {
	applyDutyEventSeriesFromTemplate,
	previewDutyEventSeriesFromTemplate
} from '$lib/server/core/useCases/dutyEventCrud';
import { dutyEventSeriesInputSchema } from '../schemas';

export const _postConfig: RouteConfig<DutyEventSeriesInput, DutyEventSeriesApplyResult> = {
	permission: 'calendar',
	mutation: true,
	input: dutyEventSeriesInputSchema,
	fn: async (ctx, input) => {
		if (!input.collisionReviewConfirmed) {
			const preview = await previewDutyEventSeriesFromTemplate(ctx, input);
			if (preview.events.some((event) => event.collisionSummary.hasConflicts)) {
				fail(400, 'Collision review is required before applying this duty series.');
			}
		}

		return applyDutyEventSeriesFromTemplate(ctx, input);
	}
};

export const POST = handle(_postConfig);
