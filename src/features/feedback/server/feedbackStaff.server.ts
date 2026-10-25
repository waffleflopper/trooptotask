import { z } from 'zod';
import type {
	FeedbackIssue,
	FeedbackReply,
	FeedbackStaffCommand,
	FeedbackStaffDetail,
	FeedbackStaffResult
} from '../contracts';
import { FEEDBACK_CATEGORY_LABELS, type FeedbackGitHubClient } from './githubFeedbackIssues.server';

export const feedbackStaffCommandSchema = z.discriminatedUnion('kind', [
	z.strictObject({ kind: z.literal('reply'), body: z.string().trim().min(1).max(5000) }),
	z.strictObject({ kind: z.literal('replyAndClose'), body: z.string().trim().min(1).max(5000) }),
	z.strictObject({ kind: z.literal('saveNote'), body: z.string().trim().max(5000) }),
	z.strictObject({
		kind: z.literal('makeGitHubIssue'),
		title: z.string().trim().min(1).max(256),
		description: z.string().trim().min(1).max(20000),
		includeOrganization: z.boolean()
	})
]);

export interface FeedbackStaffStore {
	detail(id: string): Promise<FeedbackStaffDetail | null>;
	reply(input: { feedbackId: string; body: string; close: boolean }): Promise<FeedbackReply | null>;
	saveNote(input: { feedbackId: string; body: string }): Promise<boolean>;
	saveIssue(input: { feedbackId: string; issue: FeedbackIssue }): Promise<void>;
}

export interface FeedbackStaffDependencies {
	store: FeedbackStaffStore;
	github: FeedbackGitHubClient;
	notifyReporter(input: { userId: string; feedbackId: string }): Promise<void>;
	audit(
		event: {
			action: string;
			resourceType: 'feedback';
			resourceId: string;
			details: { targetName: string; replyId?: string; issueNumber?: number };
		},
		options: { required: true }
	): Promise<void>;
}

export function reporterFeedbackHref(feedbackId: string): string {
	return `/feedback/${encodeURIComponent(feedbackId)}`;
}

export function createFeedbackStaffCommands(deps: FeedbackStaffDependencies) {
	return {
		async execute(feedbackId: string, command: FeedbackStaffCommand): Promise<FeedbackStaffResult> {
			const detail = await deps.store.detail(feedbackId);
			if (!detail) return { status: 'notFound' };
			const audit = (action: string, extra: { replyId?: string; issueNumber?: number } = {}) =>
				deps.audit(
					{
						action,
						resourceType: 'feedback',
						resourceId: feedbackId,
						details: { targetName: detail.message.split('\n')[0].slice(0, 120), ...extra }
					},
					{ required: true }
				);

			switch (command.kind) {
				case 'reply':
				case 'replyAndClose': {
					const close = command.kind === 'replyAndClose';
					const reply = await deps.store.reply({ feedbackId, body: command.body, close });
					if (!reply) return { status: 'notFound' };
					await audit(close ? 'feedback.replied_and_closed' : 'feedback.replied', { replyId: reply.id });
					await deps.notifyReporter({ userId: detail.userId, feedbackId });
					return { status: 'replied', reply, feedbackStatus: close ? 'resolved' : 'reviewed' };
				}
				case 'saveNote':
					if (!(await deps.store.saveNote({ feedbackId, body: command.body }))) return { status: 'notFound' };
					await audit('feedback.staff_note_saved');
					return { status: 'noteSaved' };
				case 'makeGitHubIssue': {
					if (detail.issue) return { status: 'issueExists', issue: detail.issue };
					const organization =
						command.includeOrganization && detail.organizationName
							? `\n\nOrganization: ${detail.organizationName}`
							: '';
					const result = await deps.github.createIssue({
						title: command.title,
						description: command.description + organization,
						labels: [...FEEDBACK_CATEGORY_LABELS[detail.category]]
					});
					if (result.status === 'error') return { status: 'githubError', message: result.message };
					try {
						await deps.store.saveIssue({ feedbackId, issue: result.issue });
					} catch {
						return {
							status: 'issuePersistenceError',
							issue: result.issue,
							message:
								'GitHub created the issue, but its link could not be saved. Use this issue instead of creating another.'
						};
					}
					await audit('feedback.github_issue_created', { issueNumber: result.issue.issueNumber });
					return { status: 'issueCreated', issue: result.issue };
				}
			}
		}
	};
}
