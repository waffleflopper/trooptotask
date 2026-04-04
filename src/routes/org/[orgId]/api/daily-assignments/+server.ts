import { handle } from '$lib/server/adapters/httpAdapter';
import { clearDailyAssignment, setDailyAssignment } from '$lib/server/core/useCases/dailyAssignments';

export const POST = handle<Record<string, unknown>, unknown>({
	permission: 'calendar',
	mutation: true,
	fn: async (ctx, input) => {
		if (input.assigneeId) {
			return setDailyAssignment(ctx, input);
		}

		await clearDailyAssignment(ctx, { date: input.date as string, assignmentTypeId: input.assignmentTypeId as string });
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
