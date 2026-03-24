import type { RequestEvent } from '@sveltejs/kit';
import { handle } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';

export const DELETE = handle<{ rosterId: string }, unknown>({
	permission: 'personnel',
	mutation: true,
	parseInput: (event: RequestEvent) => ({
		rosterId: event.params.id as string
	}),
	fn: async (ctx, input) => {
		const roster = await ctx.store.findOne<{ signed_file_path: string | null; title: string }>(
			'sign_in_rosters',
			ctx.auth.orgId,
			{ id: input.rosterId }
		);

		if (!roster) fail(404, 'Roster not found');

		if (roster.signed_file_path) {
			await ctx.storage.remove('counseling-files', [roster.signed_file_path]);
		}

		await ctx.store.delete('sign_in_rosters', ctx.auth.orgId, input.rosterId);

		ctx.audit.log({
			action: 'sign_in_roster.deleted',
			resourceType: 'sign_in_roster',
			resourceId: input.rosterId,
			details: { title: roster.title }
		});

		return { success: true };
	}
});
