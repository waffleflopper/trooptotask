import type { SupabaseClient } from '$lib/server/database';

/** Reads current account suspension; `null` means the status could not be verified. */
export async function readAccountSuspension(
	{ supabase }: { supabase: SupabaseClient },
	userId: string
): Promise<boolean | null> {
	const result = await Promise.resolve(supabase.rpc('is_user_suspended', { check_user_id: userId })).catch(() => null);
	if (result?.error !== null || typeof result?.data !== 'boolean') return null;
	return result.data;
}
