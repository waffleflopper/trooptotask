import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { FeedbackReply, FeedbackStaffNote, ReporterFeedback, ReporterFeedbackSummary } from '../contracts';
import type { FeedbackStaffStore } from './feedbackStaff.server';
import { buildFeedbackIssuePrefill } from './githubFeedbackIssues.server';

const feedbackRow = z.object({
	id: z.string(),
	user_id: z.string(),
	user_email: z.string(),
	organization_id: z.string().nullable(),
	organization_name: z.string().nullable(),
	category: z.enum(['bug', 'feature', 'general']),
	message: z.string(),
	page_url: z.string().nullable(),
	page_section: z.string().nullable(),
	status: z.enum(['new', 'reviewed', 'resolved']),
	created_at: z.string(),
	github_issue_number: z.number().int().nullable(),
	github_issue_url: z.string().nullable()
});
const replyRow = z.object({
	id: z.string(),
	feedback_id: z.string(),
	body: z.string(),
	sent_by: z.string(),
	sent_at: z.string()
});
const noteRow = z.object({
	feedback_id: z.string(),
	body: z.string(),
	updated_by: z.string().nullable(),
	updated_at: z.string()
});
const FEEDBACK_COLUMNS =
	'id,user_id,user_email,organization_id,organization_name,category,message,page_url,page_section,status,created_at,github_issue_number,github_issue_url';
const REPLY_COLUMNS = 'id,feedback_id,body,sent_by,sent_at';
const NOTE_COLUMNS = 'feedback_id,body,updated_by,updated_at';
const mapReply = (row: z.infer<typeof replyRow>): FeedbackReply => ({
	id: row.id,
	feedbackId: row.feedback_id,
	body: row.body,
	sentBy: row.sent_by,
	sentAt: row.sent_at
});

async function readFeedback(client: SupabaseClient, id: string) {
	const { data, error } = await client.from('beta_feedback').select(FEEDBACK_COLUMNS).eq('id', id).maybeSingle();
	if (error) throw new Error('Unable to load feedback', { cause: error });
	return data === null ? null : feedbackRow.parse(data);
}

async function readReplies(client: SupabaseClient, id: string): Promise<FeedbackReply[]> {
	const { data, error } = await selectAllSupabaseRows<z.infer<typeof replyRow>>(async (from, to) => {
		const result = await client
			.from('feedback_replies')
			.select(REPLY_COLUMNS)
			.eq('feedback_id', id)
			.order('sent_at', { ascending: true })
			.order('id', { ascending: true })
			.range(from, to);
		return { data: result.error ? null : z.array(replyRow).parse(result.data), error: result.error };
	});
	if (error) throw new Error('Unable to load feedback replies', { cause: error });
	return (data ?? []).map(mapReply);
}

function reporterFeedback(row: z.infer<typeof feedbackRow>, replies: FeedbackReply[]): ReporterFeedback {
	return {
		id: row.id,
		category: row.category,
		message: row.message,
		pageUrl: row.page_url,
		status: row.status,
		createdAt: row.created_at,
		replies
	};
}

const summaryRow = z.object({
	id: z.string(),
	category: z.enum(['bug', 'feature', 'general']),
	message: z.string(),
	status: z.enum(['new', 'reviewed', 'resolved']),
	created_at: z.string(),
	feedback_replies: z.array(z.object({ count: z.number() }))
});
export const REPORTER_FEEDBACK_LIST_LIMIT = 50;

/** Bind the ordinary request client so feedback and reply RLS remain in force. */
export function createSupabaseReporterFeedbackReader(client: SupabaseClient) {
	return {
		async detail(id: string): Promise<ReporterFeedback | null> {
			const row = await readFeedback(client, id);
			if (!row) return null;
			return reporterFeedback(row, await readReplies(client, id));
		},
		/** The newest of one account's own feedback; an operator's client would otherwise read everyone's. */
		async list(userId: string): Promise<ReporterFeedbackSummary[]> {
			const { data, error } = await client
				.from('beta_feedback')
				.select('id,category,message,status,created_at,feedback_replies(count)')
				.eq('user_id', userId)
				.order('created_at', { ascending: false })
				.order('id', { ascending: false })
				.limit(REPORTER_FEEDBACK_LIST_LIMIT);
			if (error) throw new Error('Unable to load feedback', { cause: error });
			return z
				.array(summaryRow)
				.parse(data)
				.map((row) => ({
					id: row.id,
					category: row.category,
					message: row.message,
					status: row.status,
					createdAt: row.created_at,
					replyCount: row.feedback_replies[0]?.count ?? 0
				}));
		}
	};
}

/** The request client supplies auth.uid() to staff RPCs; no actor is accepted as input. */
export function createSupabaseFeedbackStaffStore(client: SupabaseClient): FeedbackStaffStore {
	return {
		async detail(id) {
			const row = await readFeedback(client, id);
			if (!row) return null;
			const [replies, notes] = await Promise.all([
				readReplies(client, id),
				client.from('feedback_staff_notes').select(NOTE_COLUMNS).eq('feedback_id', id).maybeSingle()
			]);
			if (notes.error) throw new Error('Unable to load staff notes', { cause: notes.error });
			const note = notes.data === null ? null : noteRow.parse(notes.data);
			const staffNotes: FeedbackStaffNote[] = note
				? [{ feedbackId: note.feedback_id, body: note.body, updatedBy: note.updated_by, updatedAt: note.updated_at }]
				: [];
			return {
				...reporterFeedback(row, replies),
				userId: row.user_id,
				userEmail: row.user_email,
				organizationId: row.organization_id,
				organizationName: row.organization_name,
				pageSection: row.page_section,
				staffNotes,
				issue:
					row.github_issue_number !== null && row.github_issue_url !== null
						? { issueNumber: row.github_issue_number, issueUrl: row.github_issue_url }
						: null,
				issuePrefill: buildFeedbackIssuePrefill({
					category: row.category,
					message: row.message,
					pageSection: row.page_section,
					organizationName: row.organization_name
				})
			};
		},
		async reply(input) {
			const { data, error } = await client.rpc('reply_to_feedback', {
				p_feedback_id: input.feedbackId,
				p_body: input.body,
				p_close: input.close
			});
			if (error) throw new Error('Unable to save feedback reply', { cause: error });
			return data === null ? null : mapReply(replyRow.parse(data));
		},
		async saveNote(input) {
			const { data, error } = await client.rpc('save_feedback_staff_note', {
				p_feedback_id: input.feedbackId,
				p_body: input.body
			});
			if (error) throw new Error('Unable to save staff note', { cause: error });
			return z.boolean().parse(data);
		},
		async saveIssue(input) {
			const { data, error } = await client.rpc('save_feedback_github_issue', {
				p_feedback_id: input.feedbackId,
				p_issue_number: input.issue.issueNumber,
				p_issue_url: input.issue.issueUrl
			});
			if (error || data !== true)
				throw new Error(
					'The GitHub issue was created, but its link could not be saved. Check GitHub before trying again.',
					{ cause: error }
				);
		}
	};
}
