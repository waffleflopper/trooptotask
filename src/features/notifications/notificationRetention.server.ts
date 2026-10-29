import type { SupabaseClient } from '$lib/server/database';

export async function cleanupReadNotifications(client: SupabaseClient, now = new Date()): Promise<number> {
	const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
	const { count, error } = await client
		.from('notifications')
		.delete({ count: 'exact' })
		.eq('read', true)
		.lt('created_at', cutoff);
	if (error) throw new Error('Notification retention failed', { cause: error });
	return count ?? 0;
}
