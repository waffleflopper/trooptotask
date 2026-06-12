import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { batchDailyAssignments } from '$lib/server/core/useCases/dailyAssignmentsBatch';
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
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageAssignments,
	policyResource: { kind: 'unscoped' },
	input: batchInput,
	fn: async (ctx, input) => batchDailyAssignments(ctx, { records: input.records })
} satisfies RouteConfig<z.infer<typeof batchInput>, unknown>;

export const POST = handle(_postConfig);
