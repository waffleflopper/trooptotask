import { describe, expect, it, vi } from 'vitest';
import type { FeedbackReply, FeedbackStaffCommand, FeedbackStaffDetail } from '../contracts';
import {
	createFeedbackStaffCommands,
	feedbackStaffCommandSchema,
	type FeedbackStaffDependencies
} from './feedbackStaff.server';

const ID = '11111111-1111-4111-8111-111111111111';
const reply: FeedbackReply = {
	id: 'reply-1',
	feedbackId: ID,
	body: 'Fixed in the next release',
	sentBy: 'operator',
	sentAt: '2026-10-25T01:00:00Z'
};
const issue = { issueNumber: 42, issueUrl: 'https://github.com/waffleflopper/trooptotask/issues/42' };
const detail: FeedbackStaffDetail = {
	id: ID,
	userId: 'reporter',
	userEmail: 'private@example.test',
	organizationId: null,
	organizationName: 'Private Organization',
	category: 'bug',
	message: 'Calendar selection disappeared',
	pageUrl: '/org/private/calendar',
	pageSection: 'Calendar',
	status: 'new',
	createdAt: '2026-10-25T00:00:00Z',
	replies: [],
	staffNotes: [],
	issue: null,
	issuePrefill: {
		title: 'Calendar problem',
		description: 'Calendar selection disappeared',
		labels: ['bug', 'user-feedback'],
		includeOrganization: false
	}
};
const issueCommand: FeedbackStaffCommand = {
	kind: 'makeGitHubIssue',
	title: 'Calendar problem',
	description: 'Calendar selection disappeared',
	includeOrganization: false
};

function setup() {
	const state = { detail: structuredClone(detail), notifications: [] as unknown[], audits: [] as unknown[] };
	const deps = {
		store: {
			detail: vi.fn<FeedbackStaffDependencies['store']['detail']>(async () => state.detail),
			reply: vi.fn<FeedbackStaffDependencies['store']['reply']>(async ({ close }) => {
				state.detail.status = close ? 'resolved' : 'reviewed';
				state.detail.replies.push(reply);
				state.notifications.push({ userId: 'reporter', feedbackId: ID });
				return { status: 'replied', reply };
			}),
			saveNote: vi.fn(async () => true),
			saveIssue: vi.fn(async ({ issue: saved }: { issue: typeof issue }) => {
				state.detail.issue = saved;
			})
		},
		github: {
			createIssue: vi.fn<FeedbackStaffDependencies['github']['createIssue']>(async () => ({ status: 'created', issue }))
		},
		audit: vi.fn<FeedbackStaffDependencies['audit']>(async (entry, options) => {
			state.audits.push({ entry, options });
		})
	};
	return { state, deps, commands: createFeedbackStaffCommands(deps) };
}

describe('Feedback staff commands', () => {
	it.each(['reply', 'replyAndClose'] as const)(
		'%s persists a reply, notifies its reporter and audits before success',
		async (kind) => {
			const { state, deps, commands } = setup();
			await expect(commands.execute(ID, { kind, body: reply.body })).resolves.toEqual({
				status: 'replied',
				reply,
				feedbackStatus: kind === 'reply' ? 'reviewed' : 'resolved'
			});
			expect(state.detail.replies).toEqual([reply]);
			expect(state.detail.status).toBe(kind === 'reply' ? 'reviewed' : 'resolved');
			expect(state.notifications).toEqual([{ userId: 'reporter', feedbackId: ID }]);
			expect(deps.audit).toHaveBeenCalledWith(
				expect.objectContaining({
					action: kind === 'reply' ? 'feedback.replied' : 'feedback.replied_and_closed',
					resourceId: ID,
					details: { targetName: 'Calendar selection disappeared', replyId: 'reply-1' }
				}),
				{ required: true }
			);
		}
	);

	it.each<FeedbackStaffCommand>([
		{ kind: 'reply', body: 'Reply' },
		{ kind: 'replyAndClose', body: 'Reply' },
		{ kind: 'saveNote', body: 'Private note' },
		issueCommand
	])('awaits the required audit for $kind and reports its failure', async (command) => {
		const { commands, deps } = setup();
		let rejectAudit: (error: Error) => void = () => {};
		const pendingAudit = new Promise<void>((_resolve, reject) => {
			rejectAudit = reject;
		});
		deps.audit.mockReturnValue(pendingAudit);
		let settled = false;
		const pending = commands.execute(ID, command).finally(() => {
			settled = true;
		});
		await vi.waitFor(() => expect(deps.audit).toHaveBeenCalled());
		expect(settled).toBe(false);
		rejectAudit(new Error('audit unavailable'));
		await expect(pending).rejects.toThrow('audit unavailable');
	});

	it('the reporter notification already exists when the required audit fails', async () => {
		const { state, deps, commands } = setup();
		deps.audit.mockRejectedValue(new Error('audit unavailable'));
		await expect(commands.execute(ID, { kind: 'reply', body: reply.body })).rejects.toThrow('audit unavailable');
		expect(state.detail.replies).toEqual([reply]);
		expect(state.notifications).toEqual([{ userId: 'reporter', feedbackId: ID }]);
	});

	it.each(['reply', 'replyAndClose'] as const)('rejects a stale %s using the locked store result', async (kind) => {
		const { deps, state, commands } = setup();
		deps.store.reply.mockResolvedValue({ status: 'closed' });
		await expect(commands.execute(ID, { kind, body: 'A stale reply' })).resolves.toEqual({
			status: 'closed',
			message: 'This feedback was closed. Reload to see it.'
		});
		expect(state.detail.replies).toEqual([]);
		expect(state.notifications).toEqual([]);
		expect(deps.audit).not.toHaveBeenCalled();
	});

	it('saves a private note and audits it without notifying the reporter', async () => {
		const { deps, state, commands } = setup();
		await expect(commands.execute(ID, { kind: 'saveNote', body: 'Internal context' })).resolves.toEqual({
			status: 'noteSaved'
		});
		expect(deps.store.saveNote).toHaveBeenCalledWith({ feedbackId: ID, body: 'Internal context' });
		expect(deps.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'feedback.staff_note_saved' }), {
			required: true
		});
		expect(state.notifications).toEqual([]);
	});

	it.each([false, true])(
		'creates an issue with includeOrganization=%s and fixed category labels',
		async (includeOrganization) => {
			const { deps, state, commands } = setup();
			await expect(commands.execute(ID, { ...issueCommand, includeOrganization })).resolves.toEqual({
				status: 'issueCreated',
				issue
			});
			expect(deps.github.createIssue).toHaveBeenCalledWith({
				title: 'Calendar problem',
				description: `Calendar selection disappeared${includeOrganization ? '\n\nOrganization: Private Organization' : ''}`,
				labels: ['bug', 'user-feedback']
			});
			expect(state.detail.issue).toEqual(issue);
			expect(deps.audit).toHaveBeenCalledWith(
				expect.objectContaining({
					action: 'feedback.github_issue_created',
					details: { targetName: 'Calendar selection disappeared', issueNumber: 42 }
				}),
				{ required: true }
			);
		}
	);

	it('leaves every feedback field unchanged when GitHub fails', async () => {
		const { deps, state, commands } = setup();
		const before = structuredClone(state.detail);
		deps.github.createIssue.mockResolvedValue({ status: 'error', message: 'GitHub rejected the issue' });
		await expect(commands.execute(ID, issueCommand)).resolves.toEqual({
			status: 'githubError',
			message: 'GitHub rejected the issue'
		});
		expect(state.detail).toEqual(before);
		expect(deps.store.saveIssue).not.toHaveBeenCalled();
		expect(deps.audit).not.toHaveBeenCalled();
	});

	it('does not create another issue when one is already linked', async () => {
		const { deps, state, commands } = setup();
		state.detail.issue = issue;
		await expect(commands.execute(ID, issueCommand)).resolves.toEqual({ status: 'issueExists', issue });
		expect(deps.github.createIssue).not.toHaveBeenCalled();
	});

	it('preserves the external issue link for recovery when persistence fails', async () => {
		const { deps, commands } = setup();
		deps.store.saveIssue.mockRejectedValue(new Error('link unavailable'));
		await expect(commands.execute(ID, issueCommand)).resolves.toMatchObject({ status: 'issuePersistenceError', issue });
		expect(deps.audit).not.toHaveBeenCalled();
	});

	it.each<FeedbackStaffCommand>([{ kind: 'reply', body: 'Reply' }, { kind: 'saveNote', body: 'Note' }, issueCommand])(
		'reports missing feedback without side effects for $kind',
		async (command) => {
			const { commands, deps } = setup();
			deps.store.detail.mockResolvedValue(null);
			await expect(commands.execute(ID, command)).resolves.toEqual({ status: 'notFound' });
			expect(deps.store.reply).not.toHaveBeenCalled();
			expect(deps.store.saveNote).not.toHaveBeenCalled();
			expect(deps.github.createIssue).not.toHaveBeenCalled();
			expect(deps.audit).not.toHaveBeenCalled();
		}
	);

	it('reports a failed note write without auditing success', async () => {
		const { commands, deps } = setup();
		deps.store.saveNote.mockRejectedValue(new Error('note unavailable'));
		await expect(commands.execute(ID, { kind: 'saveNote', body: 'Note' })).rejects.toThrow('note unavailable');
		expect(deps.audit).not.toHaveBeenCalled();
	});

	it('rejects empty replies and client actor fields at the input boundary', () => {
		expect(feedbackStaffCommandSchema.safeParse({ kind: 'reply', body: '  ' }).success).toBe(false);
		expect(feedbackStaffCommandSchema.safeParse({ kind: 'reply', body: 'Hello', sentBy: 'someone-else' }).success).toBe(
			false
		);
		expect(feedbackStaffCommandSchema.safeParse({ ...issueCommand, updatedBy: 'someone-else' }).success).toBe(false);
	});
});
