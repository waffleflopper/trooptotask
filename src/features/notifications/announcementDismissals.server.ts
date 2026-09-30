import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import { fail } from '$lib/errors';
import { validateUUID } from '$lib/server/validation';

export interface AccountAnnouncementDismissals {
	listDismissedIds(): Promise<string[]>;
	dismiss(announcementId: string): Promise<void>;
}

/** Request-user provider access is bound to one admitted account across its Organizations. */
export function createSupabaseAccountAnnouncementDismissals(
	client: SupabaseClient,
	userId: string
): AccountAnnouncementDismissals {
	return {
		async listDismissedIds() {
			const result = await selectAllSupabaseRows<{ announcement_id: string }>(async (from, to) => {
				const { data, error } = await client
					.from('announcement_dismissals')
					.select('announcement_id')
					.eq('user_id', userId)
					.range(from, to);
				return { data, error };
			});
			if (result.error) throw new Error('Failed to load announcement dismissals', { cause: result.error });
			return (result.data ?? []).map(({ announcement_id }) => announcement_id);
		},
		async dismiss(announcementId) {
			const { error } = await client
				.from('announcement_dismissals')
				.upsert({ announcement_id: announcementId, user_id: userId });
			if (error) throw new Error('Failed to dismiss announcement', { cause: error });
		}
	};
}

/** Account admission and valid identity are independent of Organization membership or content visibility. */
export async function dismissAccountAnnouncement(
	ports: { userId: string; dismissals: AccountAnnouncementDismissals },
	announcementId: unknown
): Promise<void> {
	if (!ports.userId) fail(401, 'Not authenticated');
	if (typeof announcementId !== 'string' || !validateUUID(announcementId)) fail(400, 'Invalid announcement ID');
	await ports.dismissals.dismiss(announcementId);
}
