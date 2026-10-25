import type { SupabaseClient } from '@supabase/supabase-js';
import type { AccessRequestStatus } from './contracts';

const INBOX_COLUMNS = 'id, name, email, reason, heard_about, heard_about_details, status, created_at, reviewed_at';

export interface AccessRequestInboxRow {
	id: string;
	name: string;
	email: string;
	reason: string | null;
	heard_about: string | null;
	heard_about_details: string | null;
	status: AccessRequestStatus;
	created_at: string;
	reviewed_at: string | null;
}

export interface AccessRequestInboxPage {
	rows: AccessRequestInboxRow[];
	count: number;
}

export interface IdentityAccessRequestInboxReader {
	readOpen(input: { limit: number }): Promise<AccessRequestInboxPage>;
	/** Requests an operator approved or rejected since `since`. Invitation auto-approvals were never in the queue. */
	readClosed(input: { since: Date; limit: number }): Promise<AccessRequestInboxPage>;
	get(id: string): Promise<AccessRequestInboxRow | null>;
	accountExists(email: string): Promise<boolean>;
}

/** Bounded reads for the platform Inbox; the page and its count come from one statement. */
export function createIdentityAccessRequestInboxReader(client: SupabaseClient): IdentityAccessRequestInboxReader {
	function page(result: { data: unknown; error: unknown; count: number | null }): AccessRequestInboxPage {
		if (result.error || !Array.isArray(result.data) || typeof result.count !== 'number')
			throw new Error('Unable to read Access Requests');
		return { rows: result.data as AccessRequestInboxRow[], count: result.count };
	}

	return {
		async readOpen({ limit }) {
			return page(
				await client
					.from('access_requests')
					.select(INBOX_COLUMNS, { count: 'exact' })
					.eq('status', 'pending')
					.order('created_at', { ascending: false })
					.order('id', { ascending: false })
					.limit(limit)
			);
		},
		async readClosed({ since, limit }) {
			return page(
				await client
					.from('access_requests')
					.select(INBOX_COLUMNS, { count: 'exact' })
					.in('status', ['approved', 'rejected'])
					.or('approval_basis.is.null,approval_basis.neq.organization_invitation')
					.gte('reviewed_at', since.toISOString())
					.order('reviewed_at', { ascending: false })
					.order('id', { ascending: false })
					.limit(limit)
			);
		},
		async get(id) {
			const { data, error } = await client
				.from('access_requests')
				.select(INBOX_COLUMNS)
				.eq('id', id)
				.maybeSingle<AccessRequestInboxRow>();
			if (error) throw new Error('Unable to read Access Request');
			return data;
		},
		async accountExists(email) {
			const { data, error } = await client.rpc('search_users_by_email', { search_query: email, max_results: 20 });
			if (error || !Array.isArray(data)) throw new Error('Unable to search platform accounts');
			const wanted = email.trim().toLowerCase();
			return data.some((row: { email: string | null }) => row.email?.trim().toLowerCase() === wanted);
		}
	};
}
