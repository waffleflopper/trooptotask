import { replaceDailyAssignmentSlotsBatch } from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestDailyAssignmentContext } from '$lib/server/adapters/requestContexts.server';
import { z } from 'zod';

const batchInput = z.object({
	records: z.array(
		z.object({
			date: z.string(),
			assignmentTypeId: z.string(),
			assigneeId: z.string()
		})
	)
});

export const _postConfig = {
	context: createRequestDailyAssignmentContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageAssignments,
	policyResource: { kind: 'unscoped' },
	input: batchInput,
	fn: async (ctx, input) => replaceDailyAssignmentSlotsBatch(ctx, { records: input.records })
} satisfies RouteConfig<z.infer<typeof batchInput>, unknown, ReturnType<typeof createRequestDailyAssignmentContext>>;

export const POST = handle(_postConfig);
