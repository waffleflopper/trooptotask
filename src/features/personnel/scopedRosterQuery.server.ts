import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScopeSet } from '$lib/access/memberAccessShape';

const PAGE_SIZE = 500;

/** Private provider query; callers must authorize their own roster purpose first. */
export async function queryScopedPersonnelRows(
	getAdminClient: () => SupabaseClient,
	orgId: string,
	scopeSet: ScopeSet,
	options: { select: string; status: 'active' | 'all'; ids?: string[] }
): Promise<Record<string, unknown>[]> {
	if (scopeSet.kind === 'groups' && scopeSet.groupIds.length === 0) return [];
	if (options.ids && options.ids.length === 0) return [];

	const client = getAdminClient();
	const rows: Record<string, unknown>[] = [];
	for (let offset = 0; ; offset += PAGE_SIZE) {
		let query = client.from('personnel').select(options.select).eq('organization_id', orgId);
		if (options.status === 'active') query = query.is('archived_at', null);
		if (scopeSet.kind === 'groups') query = query.in('group_id', scopeSet.groupIds);
		if (options.ids) query = query.in('id', options.ids);

		const { data, error } = await query
			.order('last_name', { ascending: true })
			.order('first_name', { ascending: true })
			.order('id', { ascending: true })
			.range(offset, offset + PAGE_SIZE - 1);
		if (error) throw new Error(error.message);
		const page = (data ?? []) as unknown as Record<string, unknown>[];
		rows.push(...page);
		if (page.length < PAGE_SIZE) break;
	}
	return rows;
}
