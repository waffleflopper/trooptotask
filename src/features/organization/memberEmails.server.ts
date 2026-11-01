import type { SupabaseClient } from '$lib/server/database';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';

type MemberEmailRow = { user_id: unknown; email: unknown };
type IdentityEmailRow = { user_id: unknown; normalized_email: unknown };

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
		const withoutEmail: string[] = [];
		for (const { user_id: userId, email } of result.data ?? []) {
			if (typeof userId !== 'string') continue;
			if (typeof email === 'string' && email.length > 0) emails.set(userId, email);
			else withoutEmail.push(userId);
		}
		if (withoutEmail.length === 0) return emails;
		// organization_memberships.email is nullable; the account identity still names a current member.
		const identities = await selectAllSupabaseRows<IdentityEmailRow>(async (from, to) => {
			const { data, error } = await client
				.from('user_email_identities')
				.select('user_id, normalized_email')
				.in('user_id', withoutEmail)
				.order('user_id', { ascending: true })
				.range(from, to)
				.returns<IdentityEmailRow[]>();
			return { data, error };
		});
		if (identities.error)
			throw new Error((identities.error as { message?: string }).message ?? 'Organization member emails read failed');
		for (const { user_id: userId, normalized_email: email } of identities.data ?? []) {
			if (typeof userId === 'string' && typeof email === 'string' && email.length > 0) emails.set(userId, email);
		}
		return emails;
	};
}
