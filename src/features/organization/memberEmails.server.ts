import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';

type MemberEmailRow = { user_id: unknown; email: unknown };

export function createSupabaseOrganizationMemberEmailsReader(
	client: SupabaseClient,
	orgId: string
): (userIds: string[]) => Promise<Map<string, string>> {
	return async (userIds) => {
		if (userIds.length === 0) return new Map();
		const result = await selectAllSupabaseRows<MemberEmailRow>(async (from, to) => {
			const { data, error } = await client
				.from('organization_memberships')
				.select('user_id, email')
				.eq('organization_id', orgId)
				.in('user_id', userIds)
				.order('id', { ascending: true })
				.range(from, to)
				.returns<MemberEmailRow[]>();
			return { data, error };
		});
		if (result.error)
			throw new Error((result.error as { message?: string }).message ?? 'Organization member emails read failed');
		const emails = new Map<string, string>();
		for (const { user_id: userId, email } of result.data ?? []) {
			if (typeof userId === 'string' && typeof email === 'string' && email.length > 0) emails.set(userId, email);
		}
		return emails;
	};
}
