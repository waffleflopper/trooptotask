import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';

export function isGroupAccessAllowed(scopedGroupId: string | null, personnelGroupId: string | null): boolean {
	if (scopedGroupId === null) return true;
	if (personnelGroupId === null) return true;
	return scopedGroupId === personnelGroupId;
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
	scopedGroupId: string | null,
	personnelId: string
): Promise<void> {
	if (scopedGroupId === null) return;

	const personnelGroupId = await resolver.getGroupId(personnelId);

	if (!isGroupAccessAllowed(scopedGroupId, personnelGroupId)) {
		throw error(403, 'You do not have access to personnel outside your group');
	}
}

export async function enforceGroupAccessBatch(
	resolver: PersonnelGroupResolver,
	scopedGroupId: string | null,
	personnelIds: string[]
): Promise<void> {
	if (scopedGroupId === null) return;

	const groupMap = await resolver.getGroupIds(personnelIds);

	for (const id of personnelIds) {
		const personnelGroupId = groupMap.get(id) ?? null;
		if (!isGroupAccessAllowed(scopedGroupId, personnelGroupId)) {
			throw error(403, 'You do not have access to personnel outside your group');
		}
	}
}
