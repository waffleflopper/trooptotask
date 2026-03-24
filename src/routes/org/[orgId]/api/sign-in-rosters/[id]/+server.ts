import type { RequestEvent } from '@sveltejs/kit';
import { handle } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { getApiContext } from '$lib/server/supabase';

export const DELETE = handle<Record<string, unknown>, unknown>({
	permission: 'personnel',
	mutation: true,
	parseInput: (event: RequestEvent) => {
		const { supabase } = getApiContext(event.locals, event.cookies, event.params.orgId as string);
		return { _supabase: supabase, rosterId: event.params.id as string };
	},
	fn: async (ctx, input) => {
		const rosterId = input.rosterId as string;

		const roster = await ctx.store.findOne<{ signed_file_path: string | null; title: string }>(
			'sign_in_rosters',
			ctx.auth.orgId,
			{ id: rosterId }
		);

		if (!roster) fail(404, 'Roster not found');

		// Delete signed file from storage if exists
		if (roster.signed_file_path) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const supabase = input._supabase as any;
			await supabase.storage.from('counseling-files').remove([roster.signed_file_path]);
		}

		await ctx.store.delete('sign_in_rosters', ctx.auth.orgId, rosterId);

		ctx.audit.log({
			action: 'sign_in_roster.deleted',
			resourceType: 'sign_in_roster',
			resourceId: rosterId,
			details: { title: roster.title }
		});

		return { success: true };
	}
});
