import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { FeedbackItem, FeedbackUpdateInput } from '../contracts';
import type { FeedbackExportRow, FeedbackReviewStore, FeedbackSubmissionStore } from './feedbackPorts.server';

type FeedbackReviewRow = Pick<
	FeedbackExportRow,
	| 'id'
	| 'user_email'
	| 'category'
	| 'message'
	| 'created_at'
	| 'organization_name'
	| 'page_url'
	| 'status'
	| 'admin_notes'
>;

function mapFeedback(row: FeedbackReviewRow): FeedbackItem {
	return {
		id: row.id,
		userEmail: row.user_email,
		category: row.category,
		message: row.message,
		createdAt: row.created_at,
		organizationName: row.organization_name,
		pageUrl: row.page_url,
		status: row.status,
		adminNotes: row.admin_notes
	};
}

/** Constructed after Platform admission; no caller-supplied table/query interface leaves the owner. */
export function createSupabaseFeedbackReviewStore(client: SupabaseClient): FeedbackReviewStore {
	return {
		async listFeedback() {
			const { data, error } = await selectAllSupabaseRows<FeedbackReviewRow>(async (from, to) => {
				const response = await client
					.from('beta_feedback')
					.select('*')
					.order('created_at', { ascending: false })
					.range(from, to);
				return { data: response.data as FeedbackReviewRow[] | null, error: response.error };
			});
			if (error) throw new Error('Failed to list feedback', { cause: error });
			return (data ?? []).map(mapFeedback);
		},
		async updateFeedback(input: FeedbackUpdateInput) {
			const update: { status?: FeedbackUpdateInput['status']; admin_notes?: string | null } = {};
			if (input.status !== undefined) update.status = input.status;
			if (input.adminNotes !== undefined) update.admin_notes = input.adminNotes;
			const { data, error } = await client
				.from('beta_feedback')
				.update(update)
				.eq('id', input.id)
				.select('id')
				.maybeSingle<{ id: string }>();
			if (error) throw new Error('Failed to update feedback', { cause: error });
			return data ? { id: data.id } : null;
		}
	};
}

/** Delivery binds a purpose-specific privileged client; access is lazy until an insert is needed. */
export function createSupabaseFeedbackSubmissionStore(getClient: () => SupabaseClient): FeedbackSubmissionStore {
	return {
		async insertFeedbackSubmission(input) {
			const { error } = await getClient().from('beta_feedback').insert({
				user_id: input.userId,
				user_email: input.userEmail,
				organization_id: input.organizationId,
				organization_name: input.organizationName,
				category: input.category,
				message: input.message,
				page_url: input.pageUrl,
				page_section: input.pageSection,
				github_issue_number: input.githubIssueNumber,
				github_issue_url: input.githubIssueUrl
			});
			if (error) throw new Error('Failed to insert feedback', { cause: error });
		}
	};
}

/** Platform's existing dashboard composes this count after its admin admission. */
export async function countPendingFeedback(client: SupabaseClient): Promise<number | null> {
	const { count, error } = await client
		.from('beta_feedback')
		.select('*', { count: 'exact', head: true })
		.eq('status', 'new');
	if (error) throw new Error('Failed to count pending feedback', { cause: error });
	return count ?? null;
}

/** Already-authorized Organization exports keep the caller's request client and its row-level access. */
export async function listFeedbackExportRows(
	client: SupabaseClient,
	organizationId: string
): Promise<FeedbackExportRow[]> {
	const { data, error } = await selectAllSupabaseRows<FeedbackExportRow>(async (from, to) => {
		const response = await client
			.from('beta_feedback')
			.select('*')
			.eq('organization_id', organizationId)
			.range(from, to);
		return { data: response.data as FeedbackExportRow[] | null, error: response.error };
	});
	if (error) throw new Error('Failed to export feedback', { cause: error });
	return data ?? [];
}
