import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auditLogMock, checkRateLimitMock, submitAccessRequestMock } = vi.hoisted(() => ({
	auditLogMock: vi.fn(),
	checkRateLimitMock: vi.fn(),
	submitAccessRequestMock: vi.fn()
}));

vi.mock('$lib/server/accessRequestRateLimit', () => ({
	ACCESS_REQUEST_RATE_LIMIT_MESSAGE: 'Too many access request attempts. Please wait before trying again.',
	checkAccessRequestSubmissionRateLimit: checkRateLimitMock
}));

vi.mock('$lib/server/auditLog', () => ({
	auditLog: auditLogMock
}));

vi.mock('$lib/server/accessRequestSetupDelivery', () => ({
	createPublicAccessRequestSetupDeliveryService: vi.fn(() => ({
		submitAccessRequest: submitAccessRequestMock
	}))
}));

import { POST } from './+server';

function makeRequest(input: Partial<Record<string, string>> = {}) {
	return new Request('https://trooptotask.test/api/access-requests', {
		method: 'POST',
		headers: {
			'user-agent': 'Vitest'
		},
		body: JSON.stringify({
			email: 'Soldier@Example.mil',
			firstName: 'Ada',
			lastName: 'Lovelace',
			reason: 'I need a planning tool',
			heardAbout: 'social_media',
			heardAboutDetails: 'post',
			...input
		})
	});
}

function makeEvent(request: Request = makeRequest()) {
	return {
		request,
		getClientAddress: vi.fn(() => '203.0.113.10')
	} as unknown as Parameters<typeof POST>[0];
}

describe('POST /api/access-requests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		checkRateLimitMock.mockResolvedValue({
			limited: false,
			namespace: 'access-request-submission',
			dimensions: ['email', 'ip'],
			limitedDimensions: [],
			windowMs: 60 * 60 * 1000,
			maxRequests: 5
		});
		submitAccessRequestMock.mockResolvedValue({ status: 'pending-created' });
	});

	it('checks durable email and IP limits before submitting the access request', async () => {
		const response = await POST(makeEvent());

		await expect(response.json()).resolves.toEqual({ success: true });
		expect(checkRateLimitMock).toHaveBeenCalledWith({
			email: 'Soldier@Example.mil',
			ip: '203.0.113.10'
		});
		expect(submitAccessRequestMock).toHaveBeenCalledWith({
			email: 'Soldier@Example.mil',
			firstName: 'Ada',
			lastName: 'Lovelace',
			reason: 'I need a planning tool',
			heardAbout: 'social_media',
			heardAboutDetails: 'post',
			origin: 'https://trooptotask.test'
		});
	});

	it('returns the same success response for duplicate pending requests', async () => {
		submitAccessRequestMock.mockResolvedValueOnce({ status: 'already-pending' });

		const response = await POST(makeEvent());

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ success: true });
		expect(checkRateLimitMock).toHaveBeenCalled();
	});

	it('audits setup link revocations when a duplicate approved request gets a fresh setup link', async () => {
		submitAccessRequestMock.mockResolvedValueOnce({
			status: 'fresh-setup-sent',
			accessRequestId: 'request-1',
			setupLinkId: 'setup-link-2',
			revokedLinkIds: ['setup-link-1']
		});

		const response = await POST(makeEvent());

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ success: true });
		expect(auditLogMock).toHaveBeenCalledWith(
			{
				action: 'account_setup.link_revoked',
				resourceType: 'account_setup_link',
				resourceId: 'setup-link-1',
				details: {
					accessRequestId: 'request-1',
					replacementSetupLinkId: 'setup-link-2',
					stateTransition: 'pending.replaced'
				}
			},
			{
				userId: null,
				ip: '203.0.113.10',
				userAgent: 'Vitest'
			}
		);
	});

	it('audits setup link revocations even when duplicate approved setup delivery fails', async () => {
		submitAccessRequestMock.mockResolvedValueOnce({
			status: 'fresh-setup-delivery-failed',
			accessRequestId: 'request-1',
			setupLinkId: 'setup-link-2',
			revokedLinkIds: ['setup-link-1']
		});

		const response = await POST(makeEvent());

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ success: true });
		expect(auditLogMock).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'account_setup.link_revoked',
				resourceType: 'account_setup_link',
				resourceId: 'setup-link-1',
				details: expect.objectContaining({
					accessRequestId: 'request-1',
					replacementSetupLinkId: 'setup-link-2',
					stateTransition: 'pending.replaced'
				})
			}),
			expect.objectContaining({
				userId: null,
				ip: '203.0.113.10',
				userAgent: 'Vitest'
			})
		);
	});

	it('returns generic retry guidance and skips submission when the durable limiter denies', async () => {
		checkRateLimitMock.mockResolvedValueOnce({
			limited: true,
			namespace: 'access-request-submission',
			dimensions: ['email', 'ip'],
			limitedDimensions: ['email'],
			windowMs: 60 * 60 * 1000,
			maxRequests: 5,
			retryAfterMs: 60_000
		});

		const response = await POST(makeEvent());

		await expect(response.json()).resolves.toEqual({
			error: 'Too many access request attempts. Please wait before trying again.',
			retryAfterSeconds: 60
		});
		expect(response.status).toBe(429);
		expect(response.headers.get('Retry-After')).toBe('60');
		expect(submitAccessRequestMock).not.toHaveBeenCalled();
	});

	it('records audit-safe denial metadata without raw email or request details', async () => {
		checkRateLimitMock.mockResolvedValueOnce({
			limited: true,
			namespace: 'access-request-submission',
			dimensions: ['email', 'ip'],
			limitedDimensions: ['ip'],
			windowMs: 60 * 60 * 1000,
			maxRequests: 5,
			retryAfterMs: 90_000
		});

		await POST(makeEvent());

		expect(auditLogMock).toHaveBeenCalledWith(
			{
				action: 'security.rate_limit_exceeded',
				resourceType: 'access_request',
				severity: 'warning',
				details: {
					namespace: 'access-request-submission',
					dimensions: ['email', 'ip'],
					limitedDimensions: ['ip'],
					windowMs: 60 * 60 * 1000,
					maxRequests: 5,
					retryAfterMs: 90_000
				}
			},
			{
				userId: null,
				ip: '203.0.113.10',
				userAgent: 'Vitest'
			}
		);
		expect(JSON.stringify(auditLogMock.mock.calls[0])).not.toContain('Soldier@Example.mil');
		expect(JSON.stringify(auditLogMock.mock.calls[0])).not.toContain('I need a planning tool');
	});

	it('treats non-HTTP service failures with status-like fields as generic server errors', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		submitAccessRequestMock.mockRejectedValueOnce({
			status: 409,
			message: 'provider-specific service failure'
		});

		await expect(POST(makeEvent())).rejects.toMatchObject({
			status: 500,
			body: {
				message: 'Failed to submit request'
			}
		});
		expect(consoleError).toHaveBeenCalledWith(
			'Failed to submit access request:',
			expect.objectContaining({ status: 409 })
		);

		consoleError.mockRestore();
	});
});
