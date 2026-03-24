import { handle } from '$lib/server/adapters/httpAdapter';
import { batchDailyAssignments } from '$lib/server/core/useCases/dailyAssignmentsBatch';

export const POST = handle<Record<string, unknown>, unknown>({
	permission: 'calendar',
	mutation: true,
	fn: async (ctx, input) => {
		return batchDailyAssignments(ctx, {
			records: input.records as Array<{ date: string; assignmentTypeId: string; assigneeId: string }>
		});
	}
});
