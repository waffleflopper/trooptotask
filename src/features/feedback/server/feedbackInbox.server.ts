import type { SupabaseClient } from '@supabase/supabase-js';
import type { FeedbackCategory } from '../contracts';

const INBOX_COLUMNS =
	'id, user_email, category, message, page_url, page_section, organization_name, status, created_at, updated_at';

export interface FeedbackInboxRow {
	id: string;
	user_email: string;
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
	function page(result: { data: unknown; error: unknown; count: number | null }): FeedbackInboxPage {
		if (result.error || !Array.isArray(result.data) || typeof result.count !== 'number')
			throw new Error('Unable to read feedback');
		return { rows: result.data as FeedbackInboxRow[], count: result.count };
	}

	return {
		async readOpen({ limit }) {
			return page(
				await client
					.from('beta_feedback')
					.select(INBOX_COLUMNS, { count: 'exact' })
					.in('status', ['new', 'reviewed'])
					.order('created_at', { ascending: false })
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
				.maybeSingle<FeedbackInboxRow>();
			if (error) throw new Error('Unable to read feedback');
			return data;
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
