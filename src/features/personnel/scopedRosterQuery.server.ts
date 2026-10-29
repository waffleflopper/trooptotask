import type { SupabaseClient } from '$lib/server/database';
import type { GroupCoverage } from '$lib/access/memberAccessShape';
import type { PersonnelWriteSubject } from './contracts';

const PAGE_SIZE = 500;

/** Private provider query; callers must authorize their own roster purpose first. */
export async function queryScopedPersonnelRows(
	getAdminClient: () => SupabaseClient,
	orgId: string,
	scopeSet: GroupCoverage,
	options: { select: string; status: 'active' | 'archived' | 'all'; ids?: string[] }
): Promise<Record<string, unknown>[]> {
	if (scopeSet.kind === 'groups' && scopeSet.groupIds.length === 0) return [];
	if (options.ids && options.ids.length === 0) return [];

	const client = getAdminClient();
	const rows: Record<string, unknown>[] = [];
	for (let offset = 0; ; offset += PAGE_SIZE) {
		let query = client.from('personnel').select(options.select).eq('organization_id', orgId);
		if (options.status === 'active') query = query.is('archived_at', null);
		if (options.status === 'archived') query = query.not('archived_at', 'is', null);
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

/** Maps a row selected with `group_id, rank, last_name`. */
export function toPersonnelWriteSubject(row: Record<string, unknown>): PersonnelWriteSubject {
	return {
		groupId: (row.group_id as string | null) ?? null,
		rank: (row.rank as string | null) ?? '',
		lastName: (row.last_name as string | null) ?? ''
	};
}
