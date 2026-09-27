import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScopeSet } from '$lib/access/memberAccessShape';
import { isScopeSetMatchAllowed, matchScopeSet, scopeSetResourceForGroupId } from '$lib/access/scopeSetAccess';

function requireAllowedGroup(scopeSet: ScopeSet, groupId: string | null): void {
	if (!isScopeSetMatchAllowed(matchScopeSet(scopeSet, scopeSetResourceForGroupId(groupId)))) {
		throw error(403, 'You do not have access to personnel outside your group');
	}
}

export async function requirePersonnelGroupAccess(
	supabase: SupabaseClient,
	orgId: string,
	scopeSet: ScopeSet,
	personnelId: string
): Promise<void> {
	if (scopeSet.kind === 'organization') return;
	if (scopeSet.groupIds.length === 0) requireAllowedGroup(scopeSet, null);

	const { data } = await supabase
		.from('personnel')
		.select('group_id')
		.eq('id', personnelId)
		.eq('organization_id', orgId)
		.single();
	requireAllowedGroup(scopeSet, data?.group_id ?? null);
}

export async function requirePersonnelGroupAccessBatch(
	supabase: SupabaseClient,
	orgId: string,
	scopeSet: ScopeSet,
	personnelIds: string[]
): Promise<void> {
	if (scopeSet.kind === 'organization' || personnelIds.length === 0) return;
	if (scopeSet.groupIds.length === 0) requireAllowedGroup(scopeSet, null);

	const { data } = await supabase
		.from('personnel')
		.select('id, group_id')
		.eq('organization_id', orgId)
		.in('id', personnelIds);
	const groupIdsByPersonnelId = new Map(data?.map((row) => [row.id, row.group_id ?? null]));
	for (const id of personnelIds) {
		requireAllowedGroup(scopeSet, groupIdsByPersonnelId.get(id) ?? null);
	}
}
