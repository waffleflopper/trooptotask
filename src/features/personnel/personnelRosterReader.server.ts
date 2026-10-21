import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScopeSet } from '$lib/access/memberAccessShape';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { PersonnelRosterReader } from './contracts';
import { PERSONNEL_FIELDS, toPersonnel } from './personnelPersistenceMapping.server';

export function createSupabasePersonnelRosterReader(
	client: SupabaseClient,
	orgId: string,
	scope?: ScopeSet
): PersonnelRosterReader {
	const groupIds = scope?.kind === 'groups' ? [...new Set(scope.groupIds.filter(Boolean))] : null;
	return {
		async list(options = {}) {
			if (groupIds?.length === 0) return [];
			const result = await selectAllSupabaseRows<Record<string, unknown>>(async (from, to) => {
				let query = client.from('personnel').select(PERSONNEL_FIELDS).eq('organization_id', orgId);
				if (groupIds) query = query.in('group_id', groupIds);
				const status = options.status ?? 'active';
				if (status === 'active') query = query.is('archived_at', null);
				if (status === 'archived') query = query.not('archived_at', 'is', null);
				if (options.order === 'archived-newest') query = query.order('archived_at', { ascending: false });
				else query = query.order('last_name', { ascending: true }).order('first_name', { ascending: true });
				const { data, error } = await query
					.order('id', { ascending: true })
					.range(from, to)
					.returns<Record<string, unknown>[]>();
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map(toPersonnel);
		},
		async countArchived() {
			if (groupIds?.length === 0) return 0;
			let query = client
				.from('personnel')
				.select('id', { count: 'exact' })
				.eq('organization_id', orgId)
				.not('archived_at', 'is', null);
			if (groupIds) query = query.in('group_id', groupIds);
			const { count, error } = await query.limit(0);
			if (error) throw new Error(error.message);
			return count ?? 0;
		},
		async findOldestArchivedAt() {
			if (groupIds?.length === 0) return null;
			let query = client
				.from('personnel')
				.select('archived_at')
				.eq('organization_id', orgId)
				.not('archived_at', 'is', null);
			if (groupIds) query = query.in('group_id', groupIds);
			const { data, error } = await query
				.order('archived_at', { ascending: true })
				.limit(1)
				.returns<Array<{ archived_at: string }>>();
			if (error) throw new Error(error.message);
			return data?.[0]?.archived_at ?? null;
		}
	};
}
