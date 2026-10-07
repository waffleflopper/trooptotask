import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScopeSet } from '$lib/access/memberAccessShape';
import { requirePersonnelGroupAccess, requirePersonnelGroupAccessBatch } from './personnelGroupAccess.server';

export function createSupabaseScopeEnforcementAdapter(config: {
	supabase: SupabaseClient;
	orgId: string;
	scopeSet: ScopeSet;
}) {
	return {
		async requireGroupAccess(personnelId: string): Promise<void> {
			await requirePersonnelGroupAccess(config.supabase, config.orgId, config.scopeSet, personnelId);
		},

		async requireGroupAccessBatch(personnelIds: string[]): Promise<void> {
			if (personnelIds.length === 0) return;

			await requirePersonnelGroupAccessBatch(config.supabase, config.orgId, config.scopeSet, personnelIds);
		}
	};
}
