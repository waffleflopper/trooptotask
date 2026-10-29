import type { SupabaseClient } from '$lib/server/database';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { SelfPinPersistence } from './contracts';
export function createSupabaseSelfPinPersistence(
	client: SupabaseClient,
	orgId: string,
	userId: string
): SelfPinPersistence {
	return {
		async listGroupIds() {
			const result = await selectAllSupabaseRows<{ group_id: string }>(async (from, to) => {
				const { data, error } = await client
					.from('user_pinned_groups')
					.select('group_id')
					.eq('organization_id', orgId)
					.eq('user_id', userId)
					.order('sort_order', { ascending: true })
					.order('id', { ascending: true })
					.range(from, to)
					.returns<{ group_id: string }[]>();
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map((row) => row.group_id);
		},
		async insert(input) {
			const { data, error } = await client
				.from('user_pinned_groups')
				.insert({
					organization_id: orgId,
					user_id: userId,
					group_id: input.groupId,
					sort_order: input.sortOrder ?? 0
				})
				.select('id, group_id, sort_order')
				.single<{ id: string; group_id: string; sort_order: number }>();
			if (error) throw new Error(error.message);
			return { id: data.id, groupId: data.group_id, sortOrder: data.sort_order };
		},
		async remove(groupId) {
			const { error } = await client
				.from('user_pinned_groups')
				.delete()
				.eq('organization_id', orgId)
				.eq('user_id', userId)
				.eq('group_id', groupId);
			if (error) throw new Error(error.message);
		}
	};
}
