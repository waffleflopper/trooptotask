import { createClient } from '@supabase/supabase-js';
import type { ReporterFeedback } from '$features/feedback/contracts';

export function feedbackReporterTestProvider(userId: string, feedback: Array<ReporterFeedback & { userId: string }>) {
	const state = { feedback: structuredClone(feedback), failReads: false, failReplies: false };
	const client = createClient('http://127.0.0.1:9', 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				if ((request.method === 'GET' && state.failReads) || (request.method === 'POST' && state.failReplies)) {
					return Response.json({ message: 'Synthetic provider failure' }, { status: 400 });
				}
				if (url.pathname === '/rest/v1/rpc/reply_to_own_feedback') {
					const body = await request.json();
					const row = state.feedback.find((row) => row.id === body.p_feedback_id && row.userId === userId);
					if (!row) return Response.json(null);
					if (row.status === 'resolved') return Response.json({ status: 'closed' });
					const reply = {
						id: 'reply-1',
						feedbackId: row.id,
						author: 'reporter' as const,
						body: body.p_body,
						sentBy: userId,
						sentAt: '2026-10-25T12:00:00Z'
					};
					row.status = 'new';
					row.replies.push(reply);
					return Response.json({
						id: reply.id,
						feedback_id: row.id,
						author: reply.author,
						body: reply.body,
						sent_by: reply.sentBy,
						sent_at: reply.sentAt
					});
				}
				const rows = state.feedback.filter((row) => {
					const owner = url.searchParams.get('user_id');
					const id = url.searchParams.get('id');
					return row.userId === userId && (!owner || owner === `eq.${row.userId}`) && (!id || id === `eq.${row.id}`);
				});
				if (url.pathname === '/rest/v1/beta_feedback') {
					if (url.searchParams.get('select')?.includes('feedback_replies(count)')) {
						return Response.json(
							rows
								.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
								.slice(0, Number(url.searchParams.get('limit') ?? 1000))
								.map((row) => ({
									id: row.id,
									category: row.category,
									message: row.message,
									status: row.status,
									created_at: row.createdAt,
									feedback_replies: [{ count: row.replies.length }]
								}))
						);
					}
					const row = rows[0];
					return Response.json(
						row
							? {
									id: row.id,
									user_id: row.userId,
									user_email: 'reporter@example.test',
									organization_id: null,
									organization_name: null,
									category: row.category,
									message: row.message,
									page_url: row.pageUrl,
									page_section: null,
									status: row.status,
									created_at: row.createdAt,
									github_issue_number: null,
									github_issue_url: null
								}
							: null
					);
				}
				if (url.pathname === '/rest/v1/feedback_replies') {
					const thread = rows.find((row) => url.searchParams.get('feedback_id') === `eq.${row.id}`);
					return Response.json(
						thread?.replies.map((reply) => ({
							id: reply.id,
							feedback_id: reply.feedbackId,
							author: reply.author,
							body: reply.body,
							sent_by: reply.sentBy,
							sent_at: reply.sentAt
						})) ?? []
					);
				}
				throw new Error(`Unexpected feedback request ${url.pathname}`);
			}
		}
	});
	return { client, state };
}
