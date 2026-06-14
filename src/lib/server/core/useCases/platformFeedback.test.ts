import { describe, expect, it, vi } from 'vitest';
import { createInMemoryPlatformFeedbackStore } from '$lib/server/adapters/inMemoryPlatformFeedback';
import { createPlatformFeedback, type PlatformFeedbackMirror } from './platformFeedback';

const FIRST_ID = '11111111-1111-1111-1111-111111111111';
const SECOND_ID = '22222222-2222-2222-2222-222222222222';
const MISSING_ID = '33333333-3333-3333-3333-333333333333';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ORG_ID = '33333333-3333-4333-8333-333333333333';

function makeFeedback() {
	const store = createInMemoryPlatformFeedbackStore({
		items: [
			{
				id: FIRST_ID,
				userEmail: 'old@example.com',
				category: 'bug',
				message: 'Older feedback',
				createdAt: '2026-06-01T10:00:00.000Z',
				organizationName: 'Alpha',
				pageUrl: '/org/alpha/dashboard',
				status: 'new',
				adminNotes: null
			},
			{
				id: SECOND_ID,
				userEmail: 'new@example.com',
				category: 'feature',
				message: 'Newer feedback',
				createdAt: '2026-06-02T10:00:00.000Z',
				organizationName: null,
				pageUrl: null,
				status: 'reviewed',
				adminNotes: 'Needs product review'
			}
		]
	});

	return createPlatformFeedback({ store });
}

function makeSubmissionFeedback({
	mirror,
	insertError
}: {
	mirror?: PlatformFeedbackMirror;
	insertError?: Error;
} = {}) {
	const store = createInMemoryPlatformFeedbackStore({
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
	const feedback = createPlatformFeedback({
		store,
		organizationContextStore: store,
		submissionStore: store,
		mirror
	});

	return { feedback, store };
}

describe('PlatformFeedback', () => {
	it('lists feedback newest first through the public interface', async () => {
		const feedback = makeFeedback();

		const result = await feedback.list();

		expect(result.map((item) => item.id)).toEqual([SECOND_ID, FIRST_ID]);
		expect(result[0]).toMatchObject({
			userEmail: 'new@example.com',
			category: 'feature',
			status: 'reviewed',
			adminNotes: 'Needs product review'
		});
	});

	it('updates feedback status and admin notes', async () => {
		const feedback = makeFeedback();

		await expect(
			feedback.update({
				id: FIRST_ID,
				status: 'resolved',
				adminNotes: 'Handled by support'
			})
		).resolves.toEqual({ status: 'updated', id: FIRST_ID });

		await expect(feedback.list()).resolves.toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: FIRST_ID,
					status: 'resolved',
					adminNotes: 'Handled by support'
				})
			])
		);
	});

	it('allows feedback admin notes to be cleared through the public interface', async () => {
		const feedback = makeFeedback();

		await expect(feedback.update({ id: SECOND_ID, adminNotes: null })).resolves.toEqual({
			status: 'updated',
			id: SECOND_ID
		});

		await expect(feedback.list()).resolves.toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: SECOND_ID,
					status: 'reviewed',
					adminNotes: null
				})
			])
		);
	});

	it('returns not-found when feedback cannot be updated', async () => {
		const feedback = makeFeedback();

		await expect(feedback.update({ id: MISSING_ID, status: 'reviewed' })).resolves.toEqual({ status: 'not_found' });
	});

	it('returns an empty list when the store list fails', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const feedback = createPlatformFeedback({
			store: createInMemoryPlatformFeedbackStore({
				listError: new Error('list failed')
			})
		});

		await expect(feedback.list()).resolves.toEqual([]);
		expect(consoleError).toHaveBeenCalledWith('Failed to fetch feedback:', expect.any(Error));
		consoleError.mockRestore();
	});

	it('propagates store failures while updating feedback', async () => {
		const feedback = createPlatformFeedback({
			store: createInMemoryPlatformFeedbackStore({
				updateError: new Error('update failed')
			})
		});

		await expect(feedback.update({ id: FIRST_ID, status: 'reviewed' })).rejects.toThrow('update failed');
	});

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
});
