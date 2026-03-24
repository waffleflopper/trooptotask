import { handle } from '$lib/server/adapters/httpAdapter';
import { RosterHistoryEntity } from '$lib/server/entities/rosterHistory';

export const GET = handle<void, unknown>({
	permission: 'calendar',
	fn: async (ctx) => {
		const rows = await ctx.store.findMany<Record<string, unknown>>('duty_roster_history', ctx.auth.orgId, undefined, {
			orderBy: [{ column: 'created_at', ascending: false }]
		});
		return RosterHistoryEntity.fromDbArray(rows);
	}
});

export const POST = handle<Record<string, unknown>, unknown>({
	permission: 'calendar',
	mutation: true,
	fn: async (ctx, input) => {
		const insertData = {
			...RosterHistoryEntity.toDbInsert(input, ctx.auth.orgId),
			created_by_user_id: ctx.auth.userId ?? null
		};

		const row = await ctx.store.insert<Record<string, unknown>>('duty_roster_history', ctx.auth.orgId, insertData);
		return RosterHistoryEntity.fromDb(row);
	},
	audit: {
		action: 'duty_roster.created',
		resourceType: 'duty_roster',
		resourceId: (result) => (result as Record<string, unknown>).id as string
	}
});
