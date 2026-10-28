import type { SupabaseClient } from '$lib/server/database';
import type { FeedbackCategory } from '../contracts';

const INBOX_COLUMNS =
	'id, user_id, user_email, category, message, page_url, page_section, organization_name, status, created_at, updated_at';

export interface FeedbackInboxRow {
	id: string;
	user_id: string;
	user_email: string;
	/** The submitter's profile name, absent when they never set one or it could not be read. */
	submitter_name: string | null;
	category: FeedbackCategory;
	message: string;
	page_url: string | null;
	page_section: string | null;
	organization_name: string | null;
	status: 'new' | 'reviewed' | 'resolved';
	created_at: string;
	updated_at: string;
}

export interface FeedbackInboxPage {
	rows: FeedbackInboxRow[];
	count: number;
}

export interface FeedbackInboxReader {
	readOpen(input: { limit: number }): Promise<FeedbackInboxPage>;
	readClosed(input: { since: Date; limit: number }): Promise<FeedbackInboxPage>;
	get(id: string): Promise<FeedbackInboxRow | null>;
	/** Closes an open item. Returns false when it is missing or already resolved. */
	close(id: string): Promise<boolean>;
}

/** Bounded Inbox reads and the close command; constructed after Platform admission. */
export function createSupabaseFeedbackInboxReader(client: SupabaseClient): FeedbackInboxReader {
	type StoredRow = Omit<FeedbackInboxRow, 'submitter_name'>;

	/** One read names every submitter on the page. A failed read leaves names off; it never hides the feedback. */
	async function withSubmitterNames(rows: StoredRow[]): Promise<FeedbackInboxRow[]> {
		const ids = [...new Set(rows.map((row) => row.user_id))];
		const names = new Map<string, string>();
		if (ids.length > 0) {
			const { data, error } = await client
				.from('user_profiles')
				.select('user_id, first_name, last_name')
				.in('user_id', ids);
			if (error) console.error('[feedback-inbox] submitter names unavailable', error);
			for (const profile of (data ?? []) as {
				user_id: string;
				first_name: string | null;
				last_name: string | null;
			}[]) {
				const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
				if (name) names.set(profile.user_id, name);
			}
		}
		return rows.map((row) => ({ ...row, submitter_name: names.get(row.user_id) ?? null }));
	}

	async function page(result: { data: unknown; error: unknown; count: number | null }): Promise<FeedbackInboxPage> {
		if (result.error || !Array.isArray(result.data) || typeof result.count !== 'number')
			throw new Error('Unable to read feedback');
		return { rows: await withSubmitterNames(result.data as StoredRow[]), count: result.count };
	}

	return {
		async readOpen({ limit }) {
			return page(
				await client
					.from('beta_feedback')
					.select(INBOX_COLUMNS, { count: 'exact' })
					.in('status', ['new', 'reviewed'])
					.order('updated_at', { ascending: false })
					.order('id', { ascending: false })
					.limit(limit)
			);
		},
		async readClosed({ since, limit }) {
			return page(
				await client
					.from('beta_feedback')
					.select(INBOX_COLUMNS, { count: 'exact' })
					.eq('status', 'resolved')
					.gte('updated_at', since.toISOString())
					.order('updated_at', { ascending: false })
					.order('id', { ascending: false })
					.limit(limit)
			);
		},
		async get(id) {
			const { data, error } = await client
				.from('beta_feedback')
				.select(INBOX_COLUMNS)
				.eq('id', id)
				.maybeSingle<StoredRow>();
			if (error) throw new Error('Unable to read feedback');
			return data ? (await withSubmitterNames([data]))[0] : null;
		},
		async close(id) {
			const { data, error } = await client
				.from('beta_feedback')
				.update({ status: 'resolved' })
				.eq('id', id)
				.neq('status', 'resolved')
				.select('id')
				.maybeSingle<{ id: string }>();
			if (error) throw new Error('Unable to close feedback');
			return data !== null;
		}
	};
}
