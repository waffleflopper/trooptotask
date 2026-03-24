import type { RequestEvent } from '@sveltejs/kit';
import { handle } from '$lib/server/adapters/httpAdapter';

export const DELETE = handle<{ rosterId: string }, unknown>({
	permission: 'calendar',
	mutation: true,
	parseInput: (event: RequestEvent) => ({
		rosterId: event.params.rosterId as string
	}),
	fn: async (ctx, input) => {
		await ctx.store.delete('duty_roster_history', ctx.auth.orgId, input.rosterId);

		ctx.audit.log({
			action: 'duty_roster.deleted',
			resourceType: 'duty_roster',
			resourceId: input.rosterId
		});

		return { success: true };
	}
});
