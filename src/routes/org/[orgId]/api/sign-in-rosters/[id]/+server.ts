import type { RequestEvent } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { handle } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';

export const DELETE = handle<Record<string, unknown>, unknown>({
	permission: 'personnel',
	mutation: true,
	parseInput: (event: RequestEvent) => ({
		rosterId: event.params.id as string,
		// Direct Supabase access needed for storage operations — no StoragePort exists yet
		_supabaseStorage: event.locals.supabase as SupabaseClient
	}),
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
			const supabase = input._supabaseStorage as SupabaseClient;
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
