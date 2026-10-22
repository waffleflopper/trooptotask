import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publicSetupDeliveryFixture } from '$lib/server/adapters/test-support/accountSetupDelivery.server';

const { auditLogMock, checkRateLimitMock, submitAccessRequestMock, createDeliveryServiceMock } = vi.hoisted(() => ({
	auditLogMock: vi.fn(),
	checkRateLimitMock: vi.fn(),
	submitAccessRequestMock: vi.fn(),
	createDeliveryServiceMock: vi.fn()
}));

vi.mock('$features/identity/index.server', async (importOriginal) => ({
	...(await importOriginal<typeof import('$features/identity/index.server')>()),
	ACCESS_REQUEST_RATE_LIMIT_MESSAGE: 'Too many access request attempts. Please wait before trying again.',
	checkAccessRequestSubmissionRateLimit: checkRateLimitMock,
	createPublicAccessRequestSetupDeliveryService: createDeliveryServiceMock
}));

vi.mock('$lib/audit/index.server', () => ({
	auditLog: auditLogMock
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
		createDeliveryServiceMock.mockReturnValue({ submitAccessRequest: submitAccessRequestMock });
	});
	afterEach(() => vi.unstubAllEnvs());

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

	it('does not expose whether an email has a nonrenewable reviewed request', async () => {
		submitAccessRequestMock.mockResolvedValueOnce({ status: 'no-public-action' });

		const response = await POST(makeEvent());

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ success: true });
	});

	it.each([
		[{ email: '' }, 'Email, first name, and last name are required'],
		[{ email: 'invalid' }, 'Invalid email format'],
		[{ heardAbout: 'unlisted' }, 'Select how you heard about TroopToTask']
	] as const)('rejects invalid public input before limiting or writing', async (input, message) => {
		await expect(POST(makeEvent(makeRequest(input)))).rejects.toMatchObject({
			status: 400,
			body: { message }
		});
		expect(checkRateLimitMock).not.toHaveBeenCalled();
		expect(submitAccessRequestMock).not.toHaveBeenCalled();
	});

	it.each([
		['malformed JSON', '{bad', 'Invalid JSON in request body'],
		[
			'a non-text email',
			JSON.stringify({ email: 5, firstName: 'Ada', lastName: 'Lovelace' }),
			'Email, first name, and last name are required'
		]
	])('rejects %s with 400 before limiting or writing', async (_case, body, message) => {
		const request = new Request('https://trooptotask.test/api/access-requests', { method: 'POST', body });

		await expect(POST(makeEvent(request))).rejects.toMatchObject({ status: 400, body: { message } });
		expect(checkRateLimitMock).not.toHaveBeenCalled();
		expect(submitAccessRequestMock).not.toHaveBeenCalled();
	});

	it.each(['sent', 'failed'] as const)(
		'resends and audits replaced links when email delivery is %s',
		async (delivery) => {
			vi.stubEnv('APP_PUBLIC_ORIGIN', 'https://trooptotask.test');
			const fixture = publicSetupDeliveryFixture('soldier@example.mil', delivery);
			createDeliveryServiceMock.mockImplementationOnce(fixture.createService);

			const response = await POST(makeEvent());

			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toEqual({ success: true });
			expect(fixture.sendSetupDelivery).toHaveBeenCalledWith({
				accessRequestId: 'request-1',
				setupLinkId: 'setup-link-1',
				email: 'soldier@example.mil',
				setupUrl: 'https://trooptotask.test/auth/setup-account?token=synthetic-setup-token',
				expiresAt: new Date('2026-06-01T12:00:00.000Z')
			});
			expect(fixture.store.insertPendingAccessRequest).not.toHaveBeenCalled();
			expect(auditLogMock).toHaveBeenCalledWith(
				{
					action:
						delivery === 'sent'
							? 'access_request.account_setup_link_resent'
							: 'access_request.account_setup_link_delivery_failed',
					resourceType: 'access_request',
					resourceId: 'request-1',
					details: {
						email: 'soldier@example.mil',
						setupLinkId: 'setup-link-1',
						outboxId: 'outbox-1',
						...(delivery === 'sent' ? { expiresAt: '2026-06-01T12:00:00.000Z' } : {})
					},
					severity: delivery === 'sent' ? 'info' : 'warning'
				},
				{ userId: null, ip: '203.0.113.10', userAgent: 'Vitest' }
			);
			expect(JSON.stringify(auditLogMock.mock.calls)).not.toContain('token=');
			expect(auditLogMock).toHaveBeenCalledWith(
				{
					action: 'account_setup.link_revoked',
					resourceType: 'account_setup_link',
					resourceId: 'previous-link',
					details: {
						accessRequestId: 'request-1',
						replacementSetupLinkId: 'setup-link-1',
						stateTransition: 'pending.replaced'
					}
				},
				{
					userId: null,
					ip: '203.0.113.10',
					userAgent: 'Vitest'
				}
			);
		}
	);

	it('returns a generic server error when the outbox cannot persist a resubmission', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN', 'https://trooptotask.test');
		const fixture = publicSetupDeliveryFixture('soldier@example.mil');
		fixture.sendSetupDelivery.mockRejectedValueOnce(new Error('outbox unavailable'));
		createDeliveryServiceMock.mockImplementationOnce(fixture.createService);

		await expect(POST(makeEvent())).rejects.toMatchObject({
			status: 500,
			body: { message: 'Failed to submit request' }
		});
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
