import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './+server';
import { createSupabaseReporterFeedbackReader } from '$features/feedback/index.server';

const { getAdminClient } = vi.hoisted(() => ({ getAdminClient: vi.fn() }));
vi.mock('$lib/server/supabase', () => ({ getAdminClient }));
vi.mock('$env/dynamic/private', () => ({ env: { GITHUB_FEEDBACK_TOKEN: 'synthetic-token' } }));
const ID = '50000000-0000-4000-8000-000000186911';
const OPERATOR = '10000000-0000-4000-8000-000000186913';
const REPORTER = '10000000-0000-4000-8000-000000186911';
const feedback = () => ({
	id: ID,
	user_id: REPORTER,
	user_email: 'reporter@example.test',
	organization_id: null,
	organization_name: 'Private Unit',
	category: 'bug',
	message: 'Calendar problem',
	page_url: '/org/private-unit/calendar',
	page_section: 'Calendar',
	status: 'new',
	created_at: '2026-10-25T00:00:00Z',
	github_issue_number: null as number | null,
	github_issue_url: null as string | null
});
const storedReply = {
	id: 'reply-1',
	feedback_id: ID,
	body: 'We are investigating',
	sent_by: OPERATOR,
	sent_at: '2026-10-25T01:00:00Z'
};
let row: ReturnType<typeof feedback> | null;
let replies: (typeof storedReply)[];
let operator: boolean;
let currentLevel: 'aal1' | 'aal2';
let failResource: string | null;
let closedAtReply: boolean;
let reads: string[];
let writes: Array<{ resource: string; body: Record<string, unknown> | Record<string, unknown>[] }>;
let githubFetch: ReturnType<typeof vi.fn<typeof fetch>>;

const provider = () =>
	createClient('http://127.0.0.1:9', 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const resource = new URL(request.url).pathname.replace('/rest/v1/', '');
				if (resource === failResource)
					return Response.json({ message: 'unavailable' }, { status: 503, headers: { 'Retry-After': '0' } });
				if (request.method === 'GET') {
					reads.push(resource);
					if (resource === 'platform_operators') return Response.json(operator ? { user_id: OPERATOR } : null);
					if (resource === 'beta_feedback') return Response.json(row);
					if (resource === 'feedback_staff_notes')
						return Response.json({
							feedback_id: ID,
							body: 'Private note',
							updated_by: OPERATOR,
							updated_at: '2026-10-25T00:00:00Z'
						});
					if (resource === 'feedback_replies') return Response.json(replies);
				}
				const body = await request.json();
				writes.push({ resource, body });
				if (resource === 'rpc/reply_to_feedback') {
					if (!row) return Response.json(null);
					if (closedAtReply) return Response.json({ status: 'closed' });
					row.status = body.p_close ? 'resolved' : 'reviewed';
					const reply = { ...storedReply, body: body.p_body };
					replies.push(reply);
					return Response.json(reply);
				}
				if (resource === 'rpc/save_feedback_staff_note') return Response.json(true);
				if (resource === 'rpc/save_feedback_github_issue') {
					if (row) {
						row.github_issue_number = body.p_issue_number;
						row.github_issue_url = body.p_issue_url;
					}
					return Response.json(true);
				}
				if (resource === 'notifications' || resource === 'audit_logs') return new Response(null, { status: 201 });
				throw new Error(`Unexpected provider ${resource}`);
			}
		}
	});

function event(command?: unknown, id = ID, authenticated = true) {
	const supabase = provider();
	vi.spyOn(supabase.auth.mfa, 'getAuthenticatorAssuranceLevel').mockResolvedValue({
		data: { currentLevel, nextLevel: 'aal2', currentAuthenticationMethods: [] },
		error: null
	});
	const url = new URL(`http://app.example.test/admin/api/feedback/${id}`);
	return {
		locals: {
			supabase,
			actor: authenticated ? { userId: OPERATOR } : null,
			user: authenticated ? { id: OPERATOR, email: 'operator@example.test' } : null
		},
		url,
		params: { feedbackId: id },
		request: new Request(
			url,
			command === undefined
				? undefined
				: { method: 'POST', body: JSON.stringify(command), headers: { 'Content-Type': 'application/json' } }
		),
		getClientAddress: () => '127.0.0.1'
	} as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
	operator = true;
	currentLevel = 'aal2';
	row = feedback();
	replies = [];
	reads = [];
	writes = [];
	failResource = null;
	closedAtReply = false;
	getAdminClient.mockReturnValue(provider());
	githubFetch = vi.fn<typeof fetch>(async () =>
		Response.json({ number: 42, html_url: 'https://github.com/waffleflopper/trooptotask/issues/42' }, { status: 201 })
	);
	vi.stubGlobal('fetch', githubFetch);
	vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('feedback staff API and delivery', () => {
	it('loads replies, staff notes, issue link and a private-by-default prefill', async () => {
		replies = [storedReply];
		const response = await GET(event());
		const result = await response.json();
		expect(result).toMatchObject({
			status: 'ok',
			detail: {
				id: ID,
				userId: REPORTER,
				replies: [{ id: 'reply-1', body: 'We are investigating', sentBy: OPERATOR }],
				staffNotes: [{ body: 'Private note' }],
				issue: null,
				issuePrefill: { includeOrganization: false, labels: ['bug', 'user-feedback'] }
			}
		});
		expect(JSON.stringify(result.detail.issuePrefill)).not.toContain('Private Unit');
		expect(JSON.stringify(result.detail.issuePrefill)).not.toContain('reporter@example.test');
		expect(response.headers.get('cache-control')).toBe('private, no-store');
	});

	it('the reporter reader returns its thread without ever querying staff notes', async () => {
		replies = [storedReply];
		const result = await createSupabaseReporterFeedbackReader(provider()).detail(ID);
		expect(result).toEqual({
			id: ID,
			category: 'bug',
			message: 'Calendar problem',
			pageUrl: '/org/private-unit/calendar',
			status: 'new',
			createdAt: '2026-10-25T00:00:00Z',
			replies: [
				{ id: 'reply-1', feedbackId: ID, body: storedReply.body, sentBy: OPERATOR, sentAt: storedReply.sent_at }
			]
		});
		expect(reads).not.toContain('feedback_staff_notes');
	});

	it.each(['reply', 'replyAndClose'] as const)(
		'%s stores the reply through the session and audits the trusted actor',
		async (kind) => {
			const response = await POST(event({ kind, body: '  We are investigating  ' }));
			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				status: 'replied',
				feedbackStatus: kind === 'reply' ? 'reviewed' : 'resolved'
			});
			expect(writes).toContainEqual({
				resource: 'rpc/reply_to_feedback',
				body: { p_feedback_id: ID, p_body: 'We are investigating', p_close: kind === 'replyAndClose' }
			});
			expect(writes.find(({ resource }) => resource === 'audit_logs')?.body).toMatchObject({
				user_id: OPERATOR,
				action: kind === 'reply' ? 'feedback.replied' : 'feedback.replied_and_closed',
				details: { actorEmail: 'operator@example.test', targetName: 'Calendar problem' }
			});
		}
	);

	it.each(['reply', 'replyAndClose'] as const)(
		'returns a conflict when feedback closes after the detail read for %s',
		async (kind) => {
			closedAtReply = true;
			const response = await POST(event({ kind, body: 'A stale reply' }));
			expect(response.status).toBe(409);
			expect(await response.json()).toEqual({
				status: 'closed',
				message: 'This feedback was closed. Reload to see it.'
			});
			expect(replies).toEqual([]);
			expect(writes.some(({ resource }) => resource === 'audit_logs' || resource === 'notifications')).toBe(false);
		}
	);

	it('saves a staff note through the admitted session and audits it', async () => {
		const response = await POST(event({ kind: 'saveNote', body: 'Internal context' }));
		expect(await response.json()).toEqual({ status: 'noteSaved' });
		expect(writes).toContainEqual({
			resource: 'rpc/save_feedback_staff_note',
			body: { p_feedback_id: ID, p_body: 'Internal context' }
		});
		expect(writes.find(({ resource }) => resource === 'audit_logs')?.body).toMatchObject({
			user_id: OPERATOR,
			action: 'feedback.staff_note_saved'
		});
	});

	it('creates a GitHub issue, stores its link and audits the admitted operator', async () => {
		const response = await POST(
			event({
				kind: 'makeGitHubIssue',
				title: 'Calendar bug',
				description: 'Selection disappears',
				includeOrganization: true
			})
		);
		expect(await response.json()).toEqual({
			status: 'issueCreated',
			issue: { issueNumber: 42, issueUrl: 'https://github.com/waffleflopper/trooptotask/issues/42' }
		});
		expect(JSON.parse(String(githubFetch.mock.calls[0][1]?.body))).toEqual({
			title: 'Calendar bug',
			body: 'Selection disappears\n\nOrganization: Private Unit',
			labels: ['bug', 'user-feedback']
		});
		expect(row?.github_issue_number).toBe(42);
		expect(writes.find(({ resource }) => resource === 'audit_logs')?.body).toMatchObject({
			user_id: OPERATOR,
			action: 'feedback.github_issue_created'
		});
	});

	it('returns the created issue link when saving that link fails, so recovery cannot lose it', async () => {
		failResource = 'rpc/save_feedback_github_issue';
		const response = await POST(
			event({ kind: 'makeGitHubIssue', title: 'Bug', description: 'Details', includeOrganization: false })
		);
		expect(response.status).toBe(500);
		expect(await response.json()).toMatchObject({
			status: 'issuePersistenceError',
			issue: { issueNumber: 42, issueUrl: 'https://github.com/waffleflopper/trooptotask/issues/42' }
		});
		expect(row?.github_issue_number).toBeNull();
	});

	it('returns GitHub errors without writing any feedback or audit state', async () => {
		githubFetch.mockResolvedValue(new Response('rejected', { status: 422 }));
		const original = structuredClone(row);
		const response = await POST(
			event({ kind: 'makeGitHubIssue', title: 'Bug', description: 'Details', includeOrganization: false })
		);
		expect(response.status).toBe(502);
		expect(await response.json()).toMatchObject({ status: 'githubError', message: expect.any(String) });
		expect(row).toEqual(original);
		expect(writes).toEqual([]);
	});

	it.each(['audit_logs', 'rpc/reply_to_feedback'])('reports required %s failures', async (resource) => {
		failResource = resource;
		await expect(POST(event({ kind: 'reply', body: 'A reply' }))).rejects.toMatchObject({ status: 500 });
	});

	it('reports saved-but-unaudited feedback and keeps the saved reply available for reload', async () => {
		failResource = 'audit_logs';
		await expect(POST(event({ kind: 'reply', body: 'Saved reply' }))).rejects.toMatchObject({
			status: 500,
			body: { message: 'Unable to complete the feedback command. Reload the feedback before trying again.' }
		});
		const reloaded = await (await GET(event())).json();
		expect(reloaded).toMatchObject({
			status: 'ok',
			detail: { status: 'reviewed', replies: [{ body: 'Saved reply' }] }
		});
	});

	it('reports missing feedback and a failed detail read distinctly', async () => {
		row = null;
		expect(await (await GET(event())).json()).toEqual({ status: 'notFound' });
		failResource = 'feedback_replies';
		row = feedback();
		await expect(GET(event())).rejects.toMatchObject({ status: 500 });
	});

	it.each(['nonOperator', 'aal1', 'anonymous'] as const)(
		'denies %s before parsing input or reading feedback',
		async (identity) => {
			operator = identity !== 'nonOperator';
			currentLevel = identity === 'aal1' ? 'aal1' : 'aal2';
			for (const handler of [GET, POST])
				await expect(
					handler(event({ kind: 'reply', sentBy: 'forged' }, 'invalid-id', identity !== 'anonymous'))
				).rejects.toMatchObject({ status: 403 });
			expect(reads.filter((resource) => resource !== 'platform_operators')).toEqual([]);
			expect(writes).toEqual([]);
			expect(githubFetch).not.toHaveBeenCalled();
		}
	);

	it.each([
		{ kind: 'reply', body: '' },
		{ kind: 'reply', body: 'Hello', sentBy: 'forged' },
		{ kind: 'saveNote', body: 'Note', updatedBy: 'forged' }
	])('rejects invalid command %j', async (command) => {
		await expect(POST(event(command))).rejects.toMatchObject({ status: 400 });
		expect(writes).toEqual([]);
	});
});
