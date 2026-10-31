import { beforeEach, describe, expect, it, vi } from 'vitest';

const { feedbackMock, createFeedbackMock } = vi.hoisted(() => {
	const feedback = {
		submit: vi.fn()
	};

	return {
		feedbackMock: feedback,
		createFeedbackMock: vi.fn(() => feedback)
	};
});

vi.mock('$lib/server/adapters/httpAdapter', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/adapters/httpAdapter')>()),
	createRequestFeedbackSubmission: createFeedbackMock
}));

import { createFeedbackSubmission, type FeedbackSubmissionRecord } from '$features/feedback/index.server';
import { POST } from './+server';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';

function makeRequest(body: Record<string, unknown> = {}) {
	return new Request('https://trooptotask.test/api/feedback', {
		method: 'POST',
		body: JSON.stringify({
			category: 'general',
			message: 'This workflow needs a little polish.',
			...body
		})
	});
}

function makeEvent({
	body,
	user = { id: USER_ID, email: 'member@example.com' },
	actor = user ? { userId: USER_ID } : null
}: {
	body?: Record<string, unknown>;
	user?: { id: string; email?: string } | null;
	actor?: { userId: string } | null;
} = {}) {
	return {
		request: makeRequest(body),
		locals: {
			user,
			actor
		}
	} as unknown as Parameters<typeof POST>[0];
}

describe('POST /api/feedback', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		feedbackMock.submit.mockResolvedValue({ status: 'submitted', githubIssue: null });
	});

	it('rejects unauthenticated requests before service construction', async () => {
		await expect(POST(makeEvent({ user: null }))).rejects.toMatchObject({
			status: 401,
			body: {
				message: 'Authentication required'
			}
		});
		expect(createFeedbackMock).not.toHaveBeenCalled();
	});

	it('rejects a provider user without an admitted actor before service construction', async () => {
		await expect(POST(makeEvent({ actor: null }))).rejects.toMatchObject({ status: 401 });
		expect(createFeedbackMock).not.toHaveBeenCalled();
		expect(feedbackMock.submit).not.toHaveBeenCalled();
	});

	it('binds a forged body to the admitted account and preserves the public response shape', async () => {
		feedbackMock.submit.mockResolvedValueOnce({
			status: 'submitted',
			githubIssue: null
		});

		const response = await POST(
			makeEvent({
				body: {
					category: 'bug',
					message: 'The dashboard is flickering.',
					pageUrl: `/org/${ORG_ID}/dashboard`,
					organizationId: ORG_ID,
					organizationName: 'Spoofed Organization',
					userId: 'forged-account',
					userEmail: 'forged@example.test'
				}
			})
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			success: true,
			githubIssue: null
		});
		expect(feedbackMock.submit).toHaveBeenCalledWith({
			userId: USER_ID,
			userEmail: 'member@example.com',
			category: 'bug',
			message: 'The dashboard is flickering.',
			pageUrl: `/org/${ORG_ID}/dashboard`,
			organizationId: ORG_ID
		});
	});

	it.each([undefined, '', '   '])(
		'answers 400 for an account email of %j without an Organization lookup or a write',
		async (email) => {
			const written: FeedbackSubmissionRecord[] = [];
			const resolveOrganizationContext = vi.fn();
			const submission = createFeedbackSubmission({
				store: { insertFeedbackSubmission: async (record) => void written.push(record) },
				resolveOrganizationContext
			});
			feedbackMock.submit.mockImplementationOnce(submission.submit);

			await expect(
				POST(makeEvent({ user: { id: USER_ID, email }, body: { organizationId: ORG_ID } }))
			).rejects.toMatchObject({ status: 400 });
			expect(resolveOrganizationContext).not.toHaveBeenCalled();
			expect(written).toEqual([]);
		}
	);

	it('rejects a malformed JSON body with 400 before submitting', async () => {
		const event = makeEvent();
		Object.assign(event, {
			request: new Request('https://trooptotask.test/api/feedback', { method: 'POST', body: '{bad' })
		});

		await expect(POST(event)).rejects.toMatchObject({ status: 400, body: { message: 'Invalid JSON in request body' } });
		expect(feedbackMock.submit).not.toHaveBeenCalled();
	});

	it('maps validation failures to the existing bad-request shape', async () => {
		feedbackMock.submit.mockResolvedValueOnce({
			status: 'validation_error',
			message: 'Message is required'
		});

		await expect(POST(makeEvent({ body: { message: '' } }))).rejects.toMatchObject({
			status: 400,
			body: {
				message: 'Message is required'
			}
		});
	});

	it('maps organization access denials to the existing forbidden shape', async () => {
		feedbackMock.submit.mockResolvedValueOnce({
			status: 'organization_access_denied',
			message: 'Organization access denied'
		});

		await expect(POST(makeEvent({ body: { organizationId: ORG_ID } }))).rejects.toMatchObject({
			status: 403,
			body: {
				message: 'Organization access denied'
			}
		});
	});

	it('maps submission failures to the existing generic failure shape', async () => {
		feedbackMock.submit.mockResolvedValueOnce({
			status: 'submission_failed',
			message: 'Failed to submit feedback'
		});

		await expect(POST(makeEvent())).rejects.toMatchObject({
			status: 500,
			body: {
				message: 'Failed to submit feedback'
			}
		});
	});
});
