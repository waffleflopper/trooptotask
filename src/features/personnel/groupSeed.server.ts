import type { SupabaseClient } from '@supabase/supabase-js';

/** The post-RPC Group default write uses the admitted provisioning request client. */
export async function seedDefaultGroups(
	supabase: SupabaseClient,
	organizationId: string,
	groups: ReadonlyArray<{ name: string; sortOrder: number }>
): Promise<string | null> {
	const { error } = await supabase.from('groups').insert(
		groups.map((group) => ({
			organization_id: organizationId,
			name: group.name,
			sort_order: group.sortOrder
		}))
	);
	return error?.message ?? null;
}
