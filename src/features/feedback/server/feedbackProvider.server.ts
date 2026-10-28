import type { SupabaseClient } from '$lib/server/database';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { FeedbackItem, FeedbackUpdateInput } from '../contracts';
import type { FeedbackExportRow, FeedbackReviewStore, FeedbackSubmissionStore } from './feedbackPorts.server';

type FeedbackReviewRow = Pick<
	FeedbackExportRow,
	'id' | 'user_email' | 'category' | 'message' | 'created_at' | 'organization_name' | 'page_url' | 'status'
> & { feedback_staff_notes?: { body: string } | null };

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
		adminNotes: row.feedback_staff_notes?.body ?? null
	};
}

/** Constructed after Platform admission; no caller-supplied table/query interface leaves the owner. */
export function createSupabaseFeedbackReviewStore(client: SupabaseClient): FeedbackReviewStore {
	return {
		async listFeedback() {
			const { data, error } = await selectAllSupabaseRows<FeedbackReviewRow>(async (from, to) => {
				const response = await client
					.from('beta_feedback')
					.select(
						'id, user_email, category, message, created_at, organization_name, page_url, status, feedback_staff_notes(body)'
					)
					.order('created_at', { ascending: false })
					.order('id', { ascending: true })
					.range(from, to);
				if (!response.error && !Array.isArray(response.data)) throw new Error('Feedback list was unavailable');
				return { data: response.data as FeedbackReviewRow[] | null, error: response.error };
			});
			if (error) throw new Error('Failed to list feedback', { cause: error });
			return (data ?? []).map(mapFeedback);
		},
		async updateFeedback(input: FeedbackUpdateInput) {
			const update: { status?: FeedbackUpdateInput['status']; updated_at: string } = {
				updated_at: new Date().toISOString()
			};
			if (input.status !== undefined) update.status = input.status;
			const { data, error } = await client
				.from('beta_feedback')
				.update(update)
				.eq('id', input.id)
				.select('id')
				.maybeSingle<{ id: string }>();
			if (error) throw new Error('Failed to update feedback', { cause: error });
			if (data && input.adminNotes !== undefined) {
				const notes =
					input.adminNotes === null
						? await client.from('feedback_staff_notes').delete().eq('feedback_id', input.id)
						: await client.from('feedback_staff_notes').upsert({ feedback_id: input.id, body: input.adminNotes });
				if (notes.error) throw new Error('Failed to update staff notes', { cause: notes.error });
			}
			return data ? { id: data.id } : null;
		}
	};
}

/** Delivery binds a purpose-specific privileged client; access is lazy until an insert is needed. */
export function createSupabaseFeedbackSubmissionStore(getClient: () => SupabaseClient): FeedbackSubmissionStore {
	return {
		async insertFeedbackSubmission(input) {
			const { error } = await getClient()
				.from('beta_feedback')
				.insert({
					user_id: input.userId,
					user_email: input.userEmail as string,
					organization_id: input.organizationId,
					organization_name: input.organizationName,
					category: input.category,
					message: input.message,
					page_url: input.pageUrl,
					page_section: input.pageSection
				});
			if (error) throw new Error('Failed to insert feedback', { cause: error });
		}
	};
}

/** Platform's existing dashboard composes this count after its admin admission. */
export async function countPendingFeedback(client: SupabaseClient): Promise<number> {
	const { count, error } = await client
		.from('beta_feedback')
		.select('id', { count: 'exact', head: true })
		.eq('status', 'new');
	if (error) throw new Error('Failed to count pending feedback', { cause: error });
	if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)
		throw new Error('Pending Feedback count was unavailable');
	return count;
}

/** Already-authorized Organization exports keep the caller's request client and its row-level access. */
export async function listFeedbackExportRows(
	client: SupabaseClient,
	organizationId: string
): Promise<FeedbackExportRow[]> {
	const { data, error } = await selectAllSupabaseRows<FeedbackExportRow>(async (from, to) => {
		const response = await client
			.from('beta_feedback')
			.select(
				'id,user_id,user_email,organization_id,organization_name,category,message,page_url,status,created_at,updated_at,github_issue_number,github_issue_url,page_section'
			)
			.eq('organization_id', organizationId)
			.order('id', { ascending: true })
			.range(from, to);
		return { data: response.data as FeedbackExportRow[] | null, error: response.error };
	});
	if (error) throw new Error('Failed to export feedback', { cause: error });
	return (data ?? []).map((row) => ({ ...row, admin_notes: null }));
}
