import type { SupabaseClient } from '$lib/server/database';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { SelfPinPersistence } from './contracts';
export function createSupabaseSelfPinPersistence(
	client: SupabaseClient,
	orgId: string,
	userId: string
): SelfPinPersistence {
	return {
		async listNames() {
			const result = await selectAllSupabaseRows<{ group_name: string }>(async (from, to) => {
				const { data, error } = await client
					.from('user_pinned_groups')
					.select('group_name')
					.eq('organization_id', orgId)
					.eq('user_id', userId)
					.order('sort_order', { ascending: true })
					.order('id', { ascending: true })
					.range(from, to)
					.returns<{ group_name: string }[]>();
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map((row) => row.group_name);
		},
		async insert(input) {
			const { data, error } = await client
				.from('user_pinned_groups')
				.insert({
					organization_id: orgId,
					user_id: userId,
					group_name: input.groupName,
					sort_order: input.sortOrder ?? 0
				})
				.select('*')
				.single<{ id: string; group_name: string; sort_order: number }>();
			if (error) throw new Error(error.message);
			return { id: data.id, groupName: data.group_name, sortOrder: data.sort_order };
		},
		async removeName(groupName) {
			const { error } = await client
				.from('user_pinned_groups')
				.delete()
				.eq('organization_id', orgId)
				.eq('user_id', userId)
				.eq('group_name', groupName);
			if (error) throw new Error(error.message);
		},
		async replaceNames(names) {
			const { error } = await client
				.from('user_pinned_groups')
				.delete()
				.eq('organization_id', orgId)
				.eq('user_id', userId);
			if (error) throw new Error(error.message);
			if (names.length === 0) return;
			const inserted = await client.from('user_pinned_groups').insert(
				names.map((groupName, sortOrder) => ({
					organization_id: orgId,
					user_id: userId,
					group_name: groupName,
					sort_order: sortOrder
				}))
			);
			if (inserted.error) throw new Error(inserted.error.message);
		}
	};
}
