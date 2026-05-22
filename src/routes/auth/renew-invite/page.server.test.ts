import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAdminClientMock, requestFreshSetupLinkMock, checkRenewalRateLimitMock } = vi.hoisted(() => ({
	getAdminClientMock: vi.fn(),
	requestFreshSetupLinkMock: vi.fn(),
	checkRenewalRateLimitMock: vi.fn()
}));

vi.mock('$lib/server/supabase', () => ({
	getAdminClient: getAdminClientMock
}));

vi.mock('$lib/server/accessRequestSetupDelivery', () => ({
	createSupabaseAccessRequestSetupDeliveryService: vi.fn(() => ({
		requestFreshSetupLink: requestFreshSetupLinkMock
	}))
}));

vi.mock('$lib/server/accountSetupRateLimit', () => ({
	ACCOUNT_SETUP_RENEWAL_RATE_LIMIT_MESSAGE:
		'Too many fresh-link requests. Please wait before trying again, or contact support if you still need access.',
	checkAccountSetupRenewalRateLimit: checkRenewalRateLimitMock
}));

import { actions } from './+page.server';

function makeActionEvent(input: { email?: string; ip?: string; origin?: string } = {}) {
	const formData = new FormData();
	formData.set('email', input.email ?? 'soldier@example.mil');

	return {
		getClientAddress: vi.fn(() => input.ip ?? '203.0.113.10'),
		request: {
			formData: vi.fn().mockResolvedValue(formData)
		},
		url: new URL(input.origin ?? 'https://trooptotask.test/auth/renew-invite')
	} as unknown as Parameters<(typeof actions)['default']>[0];
}

describe('/auth/renew-invite actions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getAdminClientMock.mockReturnValue({ admin: true });
		checkRenewalRateLimitMock.mockReturnValue({ limited: false });
		requestFreshSetupLinkMock.mockResolvedValue({ status: 'no-public-action' });
	});

	it('returns the same success response for quiet no-op and delivered renewal outcomes', async () => {
		const quietResult = await actions.default(makeActionEvent({ email: 'missing@example.mil' }));

		requestFreshSetupLinkMock.mockResolvedValueOnce({
			status: 'fresh-setup-sent',
			accessRequestId: 'request-1'
		});
		const deliveredResult = await actions.default(makeActionEvent({ email: 'approved@example.mil' }));

		expect(quietResult).toEqual({ success: true, email: 'missing@example.mil' });
		expect(deliveredResult).toEqual({ success: true, email: 'approved@example.mil' });
		expect(requestFreshSetupLinkMock).toHaveBeenCalledWith({
			email: 'missing@example.mil',
			origin: 'https://trooptotask.test'
		});
	});

	it('returns generic recovery copy when fresh-link renewal is rate-limited', async () => {
		checkRenewalRateLimitMock.mockReturnValueOnce({ limited: true, retryAfterMs: 60_000 });

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
