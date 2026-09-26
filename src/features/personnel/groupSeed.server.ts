import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_GROUPS = [
	{ name: 'Leadership', sortOrder: 0 },
	{ name: 'Alpha', sortOrder: 1 },
	{ name: 'Bravo', sortOrder: 2 }
];

/** The post-RPC Group default write uses the admitted provisioning request client. */
export async function seedDefaultGroups(supabase: SupabaseClient, organizationId: string): Promise<string | null> {
	const { error } = await supabase.from('groups').insert(
		DEFAULT_GROUPS.map((group) => ({
			organization_id: organizationId,
			name: group.name,
			sort_order: group.sortOrder
		}))
	);
	return error?.message ?? null;
}
