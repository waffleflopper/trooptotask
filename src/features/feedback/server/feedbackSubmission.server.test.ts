import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFeedbackSubmission } from './feedbackSubmission.server';
import { createInMemoryFeedbackStore } from './inMemoryFeedback.server';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ORG_ID = '33333333-3333-4333-8333-333333333333';

afterEach(() => vi.restoreAllMocks());

function makeSubmissionFeedback({
	insertError
}: {
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
		store
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
				pageSection: 'Dashboard'
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

	it('returns a submission failure when database persistence fails', async () => {
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
		'rejects invalid feedback before organization lookup or persistence: $expected',
		async ({ category, message, expected }) => {
			const store = createInMemoryFeedbackStore();
			const resolveOrganizationContext = vi.fn();
			const feedback = createFeedbackSubmission({ store, resolveOrganizationContext });

			await expect(feedback.submit({ userId: USER_ID, organizationId: ORG_ID, category, message })).resolves.toEqual({
				status: 'validation_error',
				message: expected
			});
			expect(resolveOrganizationContext).not.toHaveBeenCalled();
			expect(store.submittedFeedback).toEqual([]);
		}
	);

	it.each([undefined, null, '', '   '])(
		'rejects a missing or blank account email %j before organization lookup or persistence',
		async (userEmail) => {
			const store = createInMemoryFeedbackStore();
			const resolveOrganizationContext = vi.fn();
			const feedback = createFeedbackSubmission({ store, resolveOrganizationContext });

			await expect(
				feedback.submit({ userId: USER_ID, userEmail, organizationId: ORG_ID, message: 'Please help' })
			).resolves.toMatchObject({ status: 'validation_error' });
			expect(resolveOrganizationContext).not.toHaveBeenCalled();
			expect(store.submittedFeedback).toEqual([]);
		}
	);

	it('retains the default category and the existing five-thousand-character normalized message limit', async () => {
		const { feedback, store } = makeSubmissionFeedback();

		await expect(
			feedback.submit({ userId: USER_ID, userEmail: 'member@example.com', message: `  ${'x'.repeat(5001)}\n extra  ` })
		).resolves.toEqual({
			status: 'submitted',
			githubIssue: null
		});
		expect(store.submittedFeedback[0]).toMatchObject({
			userEmail: 'member@example.com',
			category: 'general',
			message: 'x'.repeat(5000)
		});
	});

	it('drops a foreign page path even when the requested Organization membership is valid', async () => {
		const { feedback, store } = makeSubmissionFeedback();

		await feedback.submit({
			userId: USER_ID,
			userEmail: 'member@example.com',
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

	it('reports unavailable Organization context before persistence', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const store = createInMemoryFeedbackStore({ resolveOrganizationError: new Error('lookup unavailable') });
		const feedback = createFeedbackSubmission({
			store,
			resolveOrganizationContext: (input) => store.resolveOrganizationContext(input)
		});

		await expect(
			feedback.submit({
				userId: USER_ID,
				userEmail: 'member@example.com',
				message: 'Please help',
				organizationId: ORG_ID
			})
		).resolves.toEqual({ status: 'submission_failed', message: 'Failed to submit feedback' });
		expect(store.submittedFeedback).toEqual([]);
	});

	it('stores feedback without making any GitHub request', async () => {
		const fetcher = vi.spyOn(globalThis, 'fetch');
		const { feedback, store } = makeSubmissionFeedback();
		await expect(
			feedback.submit({ userId: USER_ID, userEmail: 'member@example.com', message: 'Keep this feedback' })
		).resolves.toEqual({ status: 'submitted', githubIssue: null });
		expect(store.submittedFeedback[0]).toMatchObject({
			message: 'Keep this feedback'
		});
		expect(fetcher).not.toHaveBeenCalled();
	});
});
