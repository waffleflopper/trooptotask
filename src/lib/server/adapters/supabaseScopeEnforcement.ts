import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScopeSet } from '$lib/access/memberAccessShape';
import type { ScopeEnforcementPort } from '$lib/server/core/ports';
import { createSupabaseGroupResolver, enforceGroupAccess, enforceGroupAccessBatch } from '$lib/server/groupAccess';

export function createSupabaseScopeEnforcementAdapter(config: {
	supabase: SupabaseClient;
	orgId: string;
	scopeSet: ScopeSet;
}): ScopeEnforcementPort {
	return {
		async requireGroupAccess(personnelId: string): Promise<void> {
			const resolver = createSupabaseGroupResolver(config.supabase);
			await enforceGroupAccess(resolver, config.scopeSet, personnelId);
		},

		async requireGroupAccessBatch(personnelIds: string[]): Promise<void> {
			if (personnelIds.length === 0) return;

			const resolver = createSupabaseGroupResolver(config.supabase);
			await enforceGroupAccessBatch(resolver, config.scopeSet, personnelIds);
		},

		async requireGroupAccessByRecord(table: string, recordId: string, personnelIdColumn: string): Promise<void> {
			if (config.scopeSet.kind === 'organization') return;

			const { data: record } = await config.supabase
				.from(table)
				.select(personnelIdColumn)
				.eq('id', recordId)
				.eq('organization_id', config.orgId)
				.single();

			if (!record) return;

			const personnelId = (record as unknown as Record<string, unknown>)[personnelIdColumn] as string | null;
			if (!personnelId) return;

			const resolver = createSupabaseGroupResolver(config.supabase);
			await enforceGroupAccess(resolver, config.scopeSet, personnelId);
		}
	};
}
