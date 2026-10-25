import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { Notification } from './contracts';
import type { NotificationStore } from './contracts.server';

/** The supplied request-user client retains notification RLS, including concealed peer rows. */
export function createSupabaseNotificationStore(supabase: SupabaseClient): NotificationStore {
	return {
		async findNotification(orgId, id) {
			const { data, error } = await supabase
				.from('notifications')
				.select('id,user_id')
				.or(`organization_id.eq.${orgId},organization_id.is.null`)
				.eq('id', id)
				.single();
			if (error?.code === 'PGRST116') return null;
			if (error) throw new Error(error.message);
			return data as Pick<Notification, 'id' | 'user_id'> | null;
		},
		async listOwn(orgId, userId, limit = 20) {
			const { data, error } = await supabase
				.from('notifications')
				.select('*')
				.or(`organization_id.eq.${orgId},organization_id.is.null`)
				.eq('user_id', userId)
				.order('created_at', { ascending: false })
				.order('id', { ascending: false })
				.limit(limit);
			if (error) throw new Error(error.message);
			return (data ?? []) as Notification[];
		},
		async listOwnUnreadIds(orgId, userId) {
			const result = await selectAllSupabaseRows<{ id: string }>(async (from, to) => {
				const { data, error } = await supabase
					.from('notifications')
					.select('id')
					.or(`organization_id.eq.${orgId},organization_id.is.null`)
					.eq('user_id', userId)
					.eq('read', false)
					.order('id', { ascending: true })
					.range(from, to);
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map(({ id }) => id);
		},
		async markRead(orgId, id) {
			const { error } = await supabase
				.from('notifications')
				.update({ read: true })
				.or(`organization_id.eq.${orgId},organization_id.is.null`)
				.eq('id', id)
				.select('id')
				.single();
			if (error) throw new Error(error.message);
		},
		async deleteNotification(orgId, id) {
			const { error } = await supabase
				.from('notifications')
				.delete()
				.or(`organization_id.eq.${orgId},organization_id.is.null`)
				.eq('id', id);
			if (error) throw new Error(error.message);
		},
		async deleteOwn(orgId, userId) {
			const { error } = await supabase
				.from('notifications')
				.delete()
				.or(`organization_id.eq.${orgId},organization_id.is.null`)
				.eq('user_id', userId);
			if (error) throw new Error(error.message);
		},
		async countOwnUnread(orgId, userId) {
			const { count, error } = await supabase
				.from('notifications')
				.select('id', { count: 'exact', head: true })
				.or(`organization_id.eq.${orgId},organization_id.is.null`)
				.eq('user_id', userId)
				.eq('read', false);
			if (error) throw new Error(`Failed to load unread notification count: ${error.message}`);
			return count ?? 0;
		},
		async listOwnExportRows(orgId, userId) {
			const result = await selectAllSupabaseRows<Record<string, unknown>>(async (from, to) => {
				const { data, error } = await supabase
					.from('notifications')
					.select('*')
					.eq('organization_id', orgId)
					.eq('user_id', userId)
					.order('id', { ascending: true })
					.range(from, to);
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return result.data ?? [];
		}
	};
}
