import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScopeSet } from '$lib/access/memberAccessShape';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';

export function createSupabasePersonnelCalendarScopeIds(client: SupabaseClient, orgId: string, scopeSet: ScopeSet) {
	return async (): Promise<string[]> => {
		if (scopeSet.kind === 'groups' && scopeSet.groupIds.length === 0) return [];
		const { data, error } = await selectAllSupabaseRows<{ id: string }>(async (from, to) => {
			let query = client.from('personnel').select('id').eq('organization_id', orgId);
			if (scopeSet.kind === 'groups') query = query.in('group_id', scopeSet.groupIds);
			return query.order('id', { ascending: true }).range(from, to);
		});
		if (error) throw new Error((error as { message: string }).message);
		return (data ?? []).map((row) => row.id);
	};
}
