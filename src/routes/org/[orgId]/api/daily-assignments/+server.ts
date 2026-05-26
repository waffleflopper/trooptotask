import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { clearDailyAssignment, setDailyAssignment } from '$lib/server/core/useCases/dailyAssignments';

export const _postConfig = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageAssignments,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		if (input.assigneeId) {
			return setDailyAssignment(ctx, input);
		}

		await clearDailyAssignment(ctx, { date: input.date as string, assignmentTypeId: input.assignmentTypeId as string });
		return { success: true, removed: true };
	}
} satisfies RouteConfig<Record<string, unknown>, unknown>;

export const _deleteConfig = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageAssignments,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		await clearDailyAssignment(ctx, { date: input.date as string, assignmentTypeId: input.assignmentTypeId as string });
		return { success: true };
	}
} satisfies RouteConfig<Record<string, unknown>, unknown>;

export const POST = handle(_postConfig);
export const DELETE = handle(_deleteConfig);
