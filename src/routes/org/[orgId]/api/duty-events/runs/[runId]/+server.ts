import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import type { DutyEventRunDeleteResult } from '$features/duty-roster/duty-roster.types';
import { deleteDutyEventRun } from '$lib/server/core/useCases/dutyEventCrud';

export const _deleteConfig: RouteConfig<{ runId: string }, DutyEventRunDeleteResult> = {
	permission: 'calendar',
	mutation: true,
	fn: (ctx, input) => deleteDutyEventRun(ctx, input)
};

export const DELETE = handle<{ runId: string }, DutyEventRunDeleteResult>({
	..._deleteConfig,
	parseInput: async (event) => ({
		runId: event.params.runId as string
	})
});
