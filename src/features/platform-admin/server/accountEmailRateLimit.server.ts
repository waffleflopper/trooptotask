import type { SupabaseClient } from '$lib/server/database';
import { checkDurableRateLimit, createSupabaseDurableRateLimitStore } from '$lib/access/index.server';

/** Limit repeated admin-generated OTP replacements and outbound email per target user and action. */
export async function checkAdminAuthEmailRateLimit(
	supabase: SupabaseClient,
	userId: string,
	type: 'recovery'
): Promise<boolean> {
	const decision = await checkDurableRateLimit({
		namespace: 'admin-auth-email',
		dimensions: [{ name: 'target', value: `${type}:${userId}` }],
		windowMs: 60 * 60 * 1000,
		maxRequests: 3,
		store: createSupabaseDurableRateLimitStore(supabase)
	});
	return decision.limited;
}
