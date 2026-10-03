import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { adminHandle } from '$lib/server/adapters/adminAdapter';
import { createSupabasePlatformAdministration } from '$lib/server/adapters/supabasePlatformAdministration';

export const POST: RequestHandler = adminHandle({
	requiredRole: 'super_admin',
	fn: async (ctx, body) => {
		try {
			return await createSupabasePlatformAdministration(ctx).updateSuspension(body);
		} catch (cause) {
			if (cause instanceof Error && 'status' in cause && cause.status === 400) error(400, cause.message);
			throw cause;
		}
	}
});
