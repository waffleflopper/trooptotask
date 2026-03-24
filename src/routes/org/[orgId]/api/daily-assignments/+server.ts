import { handle } from '$lib/server/adapters/httpAdapter';
import { createDailyAssignment, clearDailyAssignment } from '$lib/server/core/useCases/dailyAssignments';

export const POST = handle<Record<string, unknown>, unknown>({
	permission: 'calendar',
	mutation: true,
	fn: async (ctx, input) => {
		await clearDailyAssignment(ctx, { date: input.date as string, assignmentTypeId: input.assignmentTypeId as string });

		if (input.assigneeId) {
			return createDailyAssignment(ctx, input);
		}

		return { success: true, removed: true };
	}
});

export const DELETE = handle<Record<string, unknown>, unknown>({
	permission: 'calendar',
	mutation: true,
	fn: async (ctx, input) => {
		await clearDailyAssignment(ctx, { date: input.date as string, assignmentTypeId: input.assignmentTypeId as string });
		return { success: true };
	}
});
