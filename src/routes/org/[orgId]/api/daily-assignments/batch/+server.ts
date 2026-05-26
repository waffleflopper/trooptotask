import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { batchDailyAssignments } from '$lib/server/core/useCases/dailyAssignmentsBatch';

export const _postConfig = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageAssignments,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		return batchDailyAssignments(ctx, {
			records: input.records as Array<{ date: string; assignmentTypeId: string; assigneeId: string }>
		});
	}
} satisfies RouteConfig<Record<string, unknown>, unknown>;

export const POST = handle(_postConfig);
