import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FeedbackMirror } from './feedbackPorts.server';
import { createFeedbackSubmission } from './feedbackSubmission.server';
import { createInMemoryFeedbackStore } from './inMemoryFeedback.test-support';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ORG_ID = '33333333-3333-4333-8333-333333333333';

afterEach(() => vi.restoreAllMocks());

function makeSubmissionFeedback({
	mirror,
	insertError
}: {
	mirror?: FeedbackMirror;
	insertError?: Error;
} = {}) {
	const store = createInMemoryFeedbackStore({
		insertError,
		organizationContexts: [
			{
				userId: USER_ID,
				organizationId: ORG_ID,
				organizationName: 'Alpha Company',
				organizationUrlSlug: 'alpha-company'
			}
		]
	});
	const feedback = createFeedbackSubmission({
		resolveOrganizationContext: (input) => store.resolveOrganizationContext(input),
		store,
		mirror
	});

	return { feedback, store };
}

describe('Feedback submission', () => {
	it('inserts null organization fields when no organization id is supplied', async () => {
		const { feedback, store } = makeSubmissionFeedback();

		await expect(
			feedback.submit({
				userId: USER_ID,
				userEmail: 'member@example.com',
				category: 'general',
				message: '  This workflow needs a little polish.  ',
				pageUrl: '/feedback'
			})
		).resolves.toEqual({ status: 'submitted', githubIssue: null });

		expect(store.submittedFeedback).toEqual([
			expect.objectContaining({
				userId: USER_ID,
				userEmail: 'member@example.com',
				organizationId: null,
				organizationName: null,
				category: 'general',
				message: 'This workflow needs a little polish.',
				pageUrl: '/feedback',
				pageSection: 'Dashboard',
				githubIssueNumber: null,
				githubIssueUrl: null
			})
		]);
	});

	it('submits non-organization feedback without an organization context dependency', async () => {
		const store = createInMemoryFeedbackStore();
		const feedback = createFeedbackSubmission({ store });

		await expect(
			feedback.submit({
				userId: USER_ID,
				userEmail: 'member@example.com',
				category: 'general',
				message: 'This is not tied to an organization.',
				pageUrl: '/feedback'
			})
		).resolves.toEqual({ status: 'submitted', githubIssue: null });

		expect(store.submittedFeedback).toEqual([
			expect.objectContaining({
				userId: USER_ID,
				organizationId: null,
				organizationName: null,
				pageUrl: '/feedback'
			})
		]);
	});

	it('requires an organization context dependency only when an organization id is supplied', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const store = createInMemoryFeedbackStore();
		const feedback = createFeedbackSubmission({ store });

		await expect(
			feedback.submit({
				userId: USER_ID,
				userEmail: 'member@example.com',
				category: 'general',
				message: 'This should resolve membership first.',
				organizationId: ORG_ID,
				pageUrl: `/org/${ORG_ID}`
			})
		).resolves.toEqual({ status: 'submission_failed', message: 'Failed to submit feedback' });

		expect(store.submittedFeedback).toEqual([]);
		expect(consoleError).toHaveBeenCalledWith('Feedback organization context dependency is not configured');
		consoleError.mockRestore();
	});

	it('derives organization name from membership and ignores spoofed organization names', async () => {
		const { feedback, store } = makeSubmissionFeedback();
		const input = {
			userId: USER_ID,
			userEmail: 'member@example.com',
			category: 'feature',
			message: 'Add a training matrix shortcut.',
			organizationId: ORG_ID,
			organizationName: 'Spoofed Organization',
			pageUrl: 'https://malicious.example/org/alpha-company/training?tab=matrix'
		};

		const result = await feedback.submit(input);

		expect(result).toEqual({ status: 'submitted', githubIssue: null });
		expect(store.submittedFeedback).toEqual([
			expect.objectContaining({
				organizationId: ORG_ID,
				organizationName: 'Alpha Company',
				pageUrl: '/org/alpha-company/training?tab=matrix',
				pageSection: 'Training'
			})
		]);
		expect(JSON.stringify(store.submittedFeedback[0])).not.toContain('Spoofed Organization');
	});

	it('rejects invalid organization ids before persistence', async () => {
		const { feedback, store } = makeSubmissionFeedback();

		await expect(
			feedback.submit({
				userId: USER_ID,
				userEmail: 'member@example.com',
				category: 'general',
				message: 'Please help.',
				organizationId: 'not-a-uuid'
			})
		).resolves.toEqual({ status: 'validation_error', message: 'Invalid organization ID' });
		expect(store.submittedFeedback).toEqual([]);
	});

	it('returns access denied when the user cannot submit for the requested organization', async () => {
		const { feedback, store } = makeSubmissionFeedback();

		await expect(
			feedback.submit({
				userId: USER_ID,
				userEmail: 'member@example.com',
				category: 'general',
				message: 'Please help.',
				organizationId: OTHER_ORG_ID,
				pageUrl: `/org/${OTHER_ORG_ID}/calendar`
			})
		).resolves.toEqual({ status: 'organization_access_denied', message: 'Organization access denied' });
		expect(store.submittedFeedback).toEqual([]);
	});

	it('returns the GitHub mirror URL and stores the mirrored issue fields', async () => {
		const mirror = {
			mirror: vi.fn().mockResolvedValue({
				issueNumber: 42,
				issueUrl: 'https://github.com/waffleflopper/trooptotask/issues/42'
			})
		};
		const { feedback, store } = makeSubmissionFeedback({ mirror });

		await expect(
			feedback.submit({
				userId: USER_ID,
				userEmail: 'member@example.com',
				category: 'bug',
				message: 'Dashboard cards flicker.',
				organizationId: ORG_ID,
				pageUrl: `/org/${ORG_ID}`
			})
		).resolves.toEqual({
			status: 'submitted',
			githubIssue: 'https://github.com/waffleflopper/trooptotask/issues/42'
		});

		expect(mirror.mirror).toHaveBeenCalledWith(
			expect.objectContaining({
				category: 'bug',
				message: 'Dashboard cards flicker.',
				pageUrl: `/org/${ORG_ID}`,
				pageSection: 'Dashboard',
				organizationName: 'Alpha Company',
				userEmail: 'member@example.com'
			})
		);
		expect(store.submittedFeedback).toEqual([
			expect.objectContaining({
				githubIssueNumber: 42,
				githubIssueUrl: 'https://github.com/waffleflopper/trooptotask/issues/42'
			})
		]);
	});

	it('still succeeds when database persistence fails after the mirror succeeds', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const mirror = {
			mirror: vi.fn().mockResolvedValue({
				issueNumber: 43,
				issueUrl: 'https://github.com/waffleflopper/trooptotask/issues/43'
			})
		};
		const { feedback } = makeSubmissionFeedback({ mirror, insertError: new Error('insert failed') });

		await expect(
			feedback.submit({
				userId: USER_ID,
				userEmail: 'member@example.com',
				category: 'general',
				message: 'Keep the GitHub mirror result.',
				pageUrl: '/feedback'
			})
		).resolves.toEqual({
			status: 'submitted',
			githubIssue: 'https://github.com/waffleflopper/trooptotask/issues/43'
		});
		expect(consoleError).toHaveBeenCalledWith('Failed to insert feedback:', expect.any(Error));
		consoleError.mockRestore();
	});

	it('returns a submission failure when database persistence fails without a mirror result', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { feedback } = makeSubmissionFeedback({ insertError: new Error('insert failed') });

		await expect(
			feedback.submit({
				userId: USER_ID,
				userEmail: 'member@example.com',
				category: 'general',
				message: 'Persist this locally.',
				pageUrl: '/feedback'
			})
		).resolves.toEqual({ status: 'submission_failed', message: 'Failed to submit feedback' });
		expect(consoleError).toHaveBeenCalledWith('Failed to insert feedback:', expect.any(Error));
		consoleError.mockRestore();
	});

	it.each([
		{ category: 'general', message: ' \n ', expected: 'Message is required' },
		{ category: 'unsupported', message: 'Please help', expected: 'Invalid category' }
	])(
		'rejects invalid feedback before organization lookup, mirroring or persistence: $expected',
		async ({ category, message, expected }) => {
			const store = createInMemoryFeedbackStore();
			const resolveOrganizationContext = vi.fn();
			const mirror = { mirror: vi.fn() };
			const feedback = createFeedbackSubmission({ store, resolveOrganizationContext, mirror });

			await expect(feedback.submit({ userId: USER_ID, organizationId: ORG_ID, category, message })).resolves.toEqual({
				status: 'validation_error',
				message: expected
			});
			expect(resolveOrganizationContext).not.toHaveBeenCalled();
			expect(mirror.mirror).not.toHaveBeenCalled();
			expect(store.submittedFeedback).toEqual([]);
		}
	);

	it('retains nullable email, default category and the existing five-thousand-character normalized message limit', async () => {
		const { feedback, store } = makeSubmissionFeedback();

		await expect(feedback.submit({ userId: USER_ID, message: `  ${'x'.repeat(5001)}\n extra  ` })).resolves.toEqual({
			status: 'submitted',
			githubIssue: null
		});
		expect(store.submittedFeedback[0]).toMatchObject({
			userEmail: null,
			category: 'general',
			message: 'x'.repeat(5000)
		});
	});

	it('drops a foreign page path even when the requested Organization membership is valid', async () => {
		const { feedback, store } = makeSubmissionFeedback();

		await feedback.submit({
			userId: USER_ID,
			message: 'Please help',
			organizationId: ORG_ID,
			pageUrl: `/org/${OTHER_ORG_ID}/personnel`
		});

		expect(store.submittedFeedback[0]).toMatchObject({
			organizationId: ORG_ID,
			organizationName: 'Alpha Company',
			pageUrl: null,
			pageSection: null
		});
	});

	it('reports unavailable Organization context before any external mirror or insert', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const store = createInMemoryFeedbackStore({ resolveOrganizationError: new Error('lookup unavailable') });
		const mirror = { mirror: vi.fn() };
		const feedback = createFeedbackSubmission({
			store,
			resolveOrganizationContext: (input) => store.resolveOrganizationContext(input),
			mirror
		});

		await expect(feedback.submit({ userId: USER_ID, message: 'Please help', organizationId: ORG_ID })).resolves.toEqual(
			{ status: 'submission_failed', message: 'Failed to submit feedback' }
		);
		expect(store.submittedFeedback).toEqual([]);
		expect(mirror.mirror).not.toHaveBeenCalled();
	});

	it('keeps database submission available when the external mirror throws', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { feedback, store } = makeSubmissionFeedback({
			mirror: {
				async mirror() {
					throw new Error('mirror unavailable');
				}
			}
		});

		await expect(feedback.submit({ userId: USER_ID, message: 'Keep this feedback' })).resolves.toEqual({
			status: 'submitted',
			githubIssue: null
		});
		expect(store.submittedFeedback).toEqual([
			expect.objectContaining({ message: 'Keep this feedback', githubIssueNumber: null, githubIssueUrl: null })
		]);
		expect(logged).toHaveBeenCalledWith(expect.any(String), expect.any(Error));
	});

	it('finishes the mirror before inserting its identifiers into the saved feedback', async () => {
		let finishMirror!: (result: { issueNumber: number; issueUrl: string }) => void;
		const mirrorResult = new Promise<{ issueNumber: number; issueUrl: string }>((resolve) => {
			finishMirror = resolve;
		});
		const { feedback, store } = makeSubmissionFeedback({ mirror: { mirror: () => mirrorResult } });

		const pending = feedback.submit({ userId: USER_ID, message: 'Preserve the mirror ordering' });
		expect(store.submittedFeedback).toEqual([]);
		finishMirror({ issueNumber: 44, issueUrl: 'https://github.com/example/repository/issues/44' });

		await expect(pending).resolves.toEqual({
			status: 'submitted',
			githubIssue: 'https://github.com/example/repository/issues/44'
		});
		expect(store.submittedFeedback[0]).toMatchObject({
			githubIssueNumber: 44,
			githubIssueUrl: 'https://github.com/example/repository/issues/44'
		});
	});
});
