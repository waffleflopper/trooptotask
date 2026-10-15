import { clearDailyAssignmentSlot, setDailyAssignmentSlot } from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestDailyAssignmentContext } from '$lib/server/adapters/requestContexts.server';

export const _postConfig = {
	context: createRequestDailyAssignmentContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageAssignments,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		if (input.assigneeId) {
			return setDailyAssignmentSlot(ctx, input);
		}

		await clearDailyAssignmentSlot(ctx, input);
		return { success: true, removed: true };
	}
} satisfies RouteConfig<Record<string, unknown>, unknown, ReturnType<typeof createRequestDailyAssignmentContext>>;

export const _deleteConfig = {
	context: createRequestDailyAssignmentContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageAssignments,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		await clearDailyAssignmentSlot(ctx, input);
		return { success: true };
	}
} satisfies RouteConfig<Record<string, unknown>, unknown, ReturnType<typeof createRequestDailyAssignmentContext>>;

export const POST = handle(_postConfig);
export const DELETE = handle(_deleteConfig);
