import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requestRecoveryMock, auditMock } = vi.hoisted(() => ({
	requestRecoveryMock: vi.fn(),
	auditMock: vi.fn()
}));

vi.mock('$lib/audit/index.server', () => ({ auditLog: auditMock }));

vi.mock('$features/identity/index.server', () => ({
	FORGOT_PASSWORD_RATE_LIMIT_MESSAGE: 'Too many password recovery requests. Please wait before trying again.',
	getAuthenticatedRedirectPath: vi.fn(() => '/dashboard'),
	requestPublicPasswordRecovery: requestRecoveryMock
}));

import { actions, load } from './+page.server';

type ForgotPasswordActionEvent = Parameters<(typeof actions)['default']>[0];

function makeActionEvent(email: string = 'soldier@example.mil') {
	return {
		request: new Request('http://localhost:4173/auth/forgot-password', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'user-agent': 'vitest-agent' },
			body: new URLSearchParams({ email })
		}),
		getClientAddress: vi.fn(() => '203.0.113.10'),
		url: new URL('http://localhost:4173/auth/forgot-password')
	} as unknown as ForgotPasswordActionEvent;
}

describe('/auth/forgot-password delivery', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('passes request context to Identity and returns the quiet accepted result', async () => {
		requestRecoveryMock.mockResolvedValue({ status: 'accepted', email: 'soldier@example.mil' });
		await expect(actions.default(makeActionEvent())).resolves.toEqual({ success: true, email: 'soldier@example.mil' });
		expect(requestRecoveryMock).toHaveBeenCalledWith(
			{
				email: 'soldier@example.mil',
				clientAddress: expect.any(Function),
				origin: 'http://localhost:4173',
				userAgent: 'vitest-agent'
			},
			{ audit: auditMock }
		);
	});

	it('maps an invalid email to the existing form failure', async () => {
		requestRecoveryMock.mockResolvedValue({ status: 'invalid-email', email: 'bad' });
		await expect(actions.default(makeActionEvent('bad'))).resolves.toEqual({
			status: 400,
			data: { error: 'Enter a valid email address', email: 'bad' }
		});
	});

	it('maps a durable limit to HTTP 429 without revealing an account result', async () => {
		requestRecoveryMock.mockResolvedValue({ status: 'rate-limited', email: 'soldier@example.mil' });
		await expect(actions.default(makeActionEvent())).resolves.toEqual({
			status: 429,
			data: {
				error: 'Too many password recovery requests. Please wait before trying again.',
				email: 'soldier@example.mil'
			}
		});
	});

	it('continues an authenticated session instead of showing the public request form', async () => {
		await expect(
			load({ locals: { session: { access_token: 'synthetic' }, authFlow: null, mfaPending: false } } as Parameters<
				typeof load
			>[0])
		).rejects.toMatchObject({ status: 303, location: '/dashboard' });
	});
});
