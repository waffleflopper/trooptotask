import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScopeSet } from '$lib/access/memberAccessShape';
import { isScopeSetMatchAllowed, matchScopeSet, scopeSetResourceForGroupId } from '$lib/access/scopeSetAccess';

export function isGroupAccessAllowed(scopeSet: ScopeSet, personnelGroupId: string | null): boolean {
	return isScopeSetMatchAllowed(matchScopeSet(scopeSet, scopeSetResourceForGroupId(personnelGroupId)));
}

export interface PersonnelGroupResolver {
	getGroupId(personnelId: string): Promise<string | null>;
	getGroupIds(personnelIds: string[]): Promise<Map<string, string | null>>;
}

export function createSupabaseGroupResolver(supabase: SupabaseClient): PersonnelGroupResolver {
	return {
		async getGroupId(personnelId: string): Promise<string | null> {
			const { data } = await supabase.from('personnel').select('group_id').eq('id', personnelId).single();
			return data?.group_id ?? null;
		},
		async getGroupIds(personnelIds: string[]): Promise<Map<string, string | null>> {
			const result = new Map<string, string | null>();
			const { data } = await supabase.from('personnel').select('id, group_id').in('id', personnelIds);
			if (data) {
				for (const row of data) {
					result.set(row.id, row.group_id ?? null);
				}
			}
			return result;
		}
	};
}

export async function enforceGroupAccess(
	resolver: PersonnelGroupResolver,
	scopeSet: ScopeSet,
	personnelId: string
): Promise<void> {
	if (scopeSet.kind === 'organization') return;

	const personnelGroupId = await resolver.getGroupId(personnelId);

	if (!isGroupAccessAllowed(scopeSet, personnelGroupId)) {
		throw error(403, 'You do not have access to personnel outside your group');
	}
}

export async function enforceGroupAccessBatch(
	resolver: PersonnelGroupResolver,
	scopeSet: ScopeSet,
	personnelIds: string[]
): Promise<void> {
	if (scopeSet.kind === 'organization') return;

	const groupMap = await resolver.getGroupIds(personnelIds);

	for (const id of personnelIds) {
		const personnelGroupId = groupMap.get(id) ?? null;
		if (!isGroupAccessAllowed(scopeSet, personnelGroupId)) {
			throw error(403, 'You do not have access to personnel outside your group');
		}
	}
}
