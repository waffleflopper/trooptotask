import type { SupabaseClient } from '$lib/server/database';
import type { Announcement } from '$features/notifications/contracts';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';

/** Platform owns active/unexpired content; Notifications owns account dismissal preferences. */
export async function listActiveAnnouncementContent(client: SupabaseClient): Promise<Announcement[]> {
	const now = new Date().toISOString();
	const result = await selectAllSupabaseRows<Announcement>(async (from, to) => {
		const { data, error } = await client
			.from('platform_announcements')
			.select('id, title, message, type')
			.eq('is_active', true)
			.or(`expires_at.is.null,expires_at.gt.${now}`)
			.order('id', { ascending: true })
			.range(from, to);
		return { data, error };
	});
	if (result.error) throw new Error('Failed to load platform announcements', { cause: result.error });
	return result.data ?? [];
}
