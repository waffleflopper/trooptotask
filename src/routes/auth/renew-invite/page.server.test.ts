import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publicSetupDeliveryFixture } from '$lib/server/adapters/test-support/accountSetupDelivery.server';

const { requestFreshSetupLinkMock, checkRenewalRateLimitMock, auditLogMock, createDeliveryServiceMock } = vi.hoisted(
	() => ({
		requestFreshSetupLinkMock: vi.fn(),
		checkRenewalRateLimitMock: vi.fn(),
		auditLogMock: vi.fn(),
		createDeliveryServiceMock: vi.fn()
	})
);

vi.mock('$features/identity/index.server', async (importOriginal) => ({
	...(await importOriginal<typeof import('$features/identity/index.server')>()),
	createPublicAccessRequestSetupDeliveryService: createDeliveryServiceMock,
	ACCOUNT_SETUP_RENEWAL_RATE_LIMIT_MESSAGE:
		'Too many fresh-link requests. Please wait before trying again, or contact support if you still need access.',
	checkAccountSetupRenewalRateLimit: checkRenewalRateLimitMock
}));

vi.mock('$lib/audit/index.server', () => ({
	auditLog: auditLogMock
}));

import { actions, load } from './+page.server';

function makeActionEvent(input: { email?: string; ip?: string; origin?: string } = {}) {
	const formData = new FormData();
	formData.set('email', input.email ?? 'soldier@example.mil');

	return {
		getClientAddress: vi.fn(() => input.ip ?? '203.0.113.10'),
		request: {
			formData: vi.fn().mockResolvedValue(formData),
			headers: new Headers({ 'user-agent': 'vitest-agent' })
		},
		url: new URL(input.origin ?? 'https://trooptotask.test/auth/renew-invite')
	} as unknown as Parameters<(typeof actions)['default']>[0];
}

describe('/auth/renew-invite actions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		checkRenewalRateLimitMock.mockReturnValue({ limited: false });
		requestFreshSetupLinkMock.mockResolvedValue({ status: 'no-public-action' });
		createDeliveryServiceMock.mockReturnValue({ requestFreshSetupLink: requestFreshSetupLinkMock });
	});
	afterEach(() => vi.unstubAllEnvs());

	it.each(['', 'not-an-email'])('rejects invalid renewal input before issuance: %s', async (email) => {
		expect(await actions.default(makeActionEvent({ email }))).toMatchObject({ status: 400 });
		expect(checkRenewalRateLimitMock).not.toHaveBeenCalled();
		expect(requestFreshSetupLinkMock).not.toHaveBeenCalled();
	});

	it('returns the same success response for quiet no-op and delivered renewal outcomes', async () => {
		const quietResult = await actions.default(makeActionEvent({ email: 'missing@example.mil' }));

		requestFreshSetupLinkMock.mockResolvedValueOnce({
			status: 'fresh-setup-sent',
			accessRequestId: 'request-1',
			setupLinkId: 'setup-link-2',
			revokedLinkIds: ['setup-link-1']
		});
		const deliveredResult = await actions.default(makeActionEvent({ email: 'approved@example.mil' }));

		expect(quietResult).toEqual({ success: true, email: 'missing@example.mil' });
		expect(deliveredResult).toEqual({ success: true, email: 'approved@example.mil' });
		expect(requestFreshSetupLinkMock).toHaveBeenCalledWith({
			email: 'missing@example.mil',
			origin: 'https://trooptotask.test'
		});
	});

	it.each(['sent', 'failed'] as const)(
		'renews and audits replaced links when email delivery is %s',
		async (delivery) => {
			vi.stubEnv('APP_PUBLIC_ORIGIN', 'https://trooptotask.test');
			const fixture = publicSetupDeliveryFixture('approved@example.mil', delivery);
			createDeliveryServiceMock.mockImplementationOnce(fixture.createService);

			const result = await actions.default(
				makeActionEvent({ email: 'approved@example.mil', origin: 'https://untrusted.example/auth/renew-invite' })
			);

			expect(result).toEqual({ success: true, email: 'approved@example.mil' });
			expect(fixture.sendSetupDelivery).toHaveBeenCalledWith({
				accessRequestId: 'request-1',
				setupLinkId: 'setup-link-1',
				email: 'approved@example.mil',
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
						email: 'approved@example.mil',
						setupLinkId: 'setup-link-1',
						outboxId: 'outbox-1',
						...(delivery === 'sent' ? { expiresAt: '2026-06-01T12:00:00.000Z' } : {})
					},
					severity: delivery === 'sent' ? 'info' : 'warning'
				},
				{ userId: null, ip: '203.0.113.10', userAgent: 'vitest-agent' }
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
					userAgent: 'vitest-agent'
				}
			);
		}
	);

	it('returns a retry error when the outbox cannot persist a renewal', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN', 'https://trooptotask.test');
		const fixture = publicSetupDeliveryFixture('approved@example.mil');
		fixture.sendSetupDelivery.mockRejectedValueOnce(new Error('outbox unavailable'));
		createDeliveryServiceMock.mockImplementationOnce(fixture.createService);

		expect(await actions.default(makeActionEvent({ email: 'approved@example.mil' }))).toMatchObject({ status: 500 });
	});

	it('returns generic recovery copy when fresh-link renewal is rate-limited', async () => {
		checkRenewalRateLimitMock.mockReturnValueOnce({
			limited: true,
			retryAfterMs: 60_000,
			namespace: 'account-setup-renewal',
			dimensions: ['email', 'ip'],
			limitedDimensions: ['email'],
			windowMs: 3_600_000,
			maxRequests: 3
		});

		const result = await actions.default(makeActionEvent({ email: 'soldier@example.mil' }));

		expect(result).toMatchObject({
			status: 429,
			data: {
				error:
					'Too many fresh-link requests. Please wait before trying again, or contact support if you still need access.',
				email: 'soldier@example.mil'
			}
		});
		expect(checkRenewalRateLimitMock).toHaveBeenCalledWith({
			email: 'soldier@example.mil',
			ip: '203.0.113.10'
		});
		expect(requestFreshSetupLinkMock).not.toHaveBeenCalled();
		expect(auditLogMock).toHaveBeenCalledWith(
			{
				action: 'account_setup.renewal_rate_limited',
				resourceType: 'access_request',
				severity: 'warning',
				details: expect.objectContaining({
					namespace: 'account-setup-renewal',
					limitedDimensions: ['email'],
					retryAfterMs: 60_000
				})
			},
			{
				userId: null,
				ip: '203.0.113.10',
				userAgent: 'vitest-agent'
			}
		);
		expect(JSON.stringify(auditLogMock.mock.calls)).not.toContain('/auth/setup-account?token=');
	});

	it('returns generic retry copy when setup delivery fails unexpectedly', async () => {
		requestFreshSetupLinkMock.mockRejectedValueOnce(new Error('delivery unavailable'));

		const result = await actions.default(makeActionEvent({ email: 'approved@example.mil' }));

		expect(result).toMatchObject({
			status: 500,
			data: {
				error: 'We could not send a fresh Account Setup Link right now. Please try again in a few minutes.',
				email: 'approved@example.mil'
			}
		});
	});
});

describe('/auth/renew-invite entry', () => {
	it.each([
		{ authFlow: null, mfaPending: false, location: '/dashboard' },
		{ authFlow: null, mfaPending: true, location: '/auth/mfa-verify' },
		{ authFlow: 'invite', mfaPending: true, location: '/auth/accept-invite' },
		{ authFlow: 'recovery', mfaPending: true, location: '/auth/reset-password' }
	] as const)('continues authenticated requests at $location', async ({ location, ...flow }) => {
		await expect(
			load({ locals: { session: { user: { id: 'user-1' } }, ...flow } } as Parameters<typeof load>[0])
		).rejects.toMatchObject({ status: 303, location });
	});
});
