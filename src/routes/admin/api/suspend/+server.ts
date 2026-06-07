import type { RequestHandler } from './$types';
import { adminHandle } from '$lib/server/adapters/adminAdapter';
import { createSupabasePlatformAdministration } from '$lib/server/adapters/supabasePlatformAdministration';

export const POST: RequestHandler = adminHandle({
	requiredRole: 'super_admin',
	fn: async (ctx, body) => {
		return createSupabasePlatformAdministration(ctx).updateSuspension(
			body as { type: string; targetId: string; action: string; reason?: string }
		);
	}
});
