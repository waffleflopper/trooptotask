import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auditLogMock, checkForgotPasswordRateLimitMock, sendPublicRecoveryEmailMock } = vi.hoisted(() => ({
	auditLogMock: vi.fn(),
	checkForgotPasswordRateLimitMock: vi.fn(),
	sendPublicRecoveryEmailMock: vi.fn()
}));

vi.mock('$lib/server/auditLog', () => ({ auditLog: auditLogMock }));
vi.mock('$features/identity/index.server', () => ({
	getAuthenticatedRedirectPath: vi.fn(),
	sendPublicRecoveryEmail: sendPublicRecoveryEmailMock
}));
vi.mock('$lib/server/forgotPasswordRateLimit', () => ({
	FORGOT_PASSWORD_RATE_LIMIT_MESSAGE: 'Too many password recovery requests. Please wait before trying again.',
	checkForgotPasswordRateLimit: checkForgotPasswordRateLimitMock,
	forgotPasswordRateLimitAuditDetails: vi.fn((decision) => ({
		namespace: decision.namespace,
		dimensions: decision.dimensions,
		limitedDimensions: decision.limitedDimensions,
		windowMs: decision.windowMs,
		maxRequests: decision.maxRequests,
		...(decision.retryAfterMs ? { retryAfterMs: decision.retryAfterMs } : {})
	}))
}));

import { actions } from './+page.server';

type ForgotPasswordActionEvent = Parameters<(typeof actions)['default']>[0];

function makeActionEvent(input: { email?: string; origin?: string; ip?: string } = {}) {
	const origin = input.origin ?? 'http://localhost:4173';
	return {
		request: new Request(`${origin}/auth/forgot-password`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'user-agent': 'vitest-agent' },
			body: new URLSearchParams({ email: input.email ?? 'soldier@example.mil' })
		}),
		getClientAddress: vi.fn(() => input.ip ?? '203.0.113.10'),
		url: new URL(`${origin}/auth/forgot-password`)
	} as unknown as ForgotPasswordActionEvent;
}

describe('POST /auth/forgot-password', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sendPublicRecoveryEmailMock.mockResolvedValue('sent');
		checkForgotPasswordRateLimitMock.mockResolvedValue({
			limited: false,
			namespace: 'forgot-password',
			dimensions: ['email', 'ip'],
			limitedDimensions: [],
			windowMs: 60 * 60 * 1000,
			maxRequests: 3
		});
	});

	it('requests an app-delivered recovery link after durable rate limiting', async () => {
		const result = await actions.default(makeActionEvent());
		expect(result).toEqual({ success: true, email: 'soldier@example.mil' });
		expect(checkForgotPasswordRateLimitMock).toHaveBeenCalledWith({ email: 'soldier@example.mil', ip: '203.0.113.10' });
		expect(sendPublicRecoveryEmailMock).toHaveBeenCalledWith(
			'soldier@example.mil',
			'http://localhost:4173/auth/confirm?type=recovery&next=%2Fauth%2Freset-password'
		);
	});

	it('uses the configured public app origin instead of the inbound host', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN', 'https://trooptotask.org');
		try {
			await actions.default(makeActionEvent({ origin: 'https://evil.example' }));
			expect(sendPublicRecoveryEmailMock.mock.calls[0][1]).toBe(
				'https://trooptotask.org/auth/confirm?type=recovery&next=%2Fauth%2Freset-password'
			);
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it('rejects invalid email before rate limiting or delivery', async () => {
		const result = await actions.default(makeActionEvent({ email: 'not-an-email' }));
		expect(result).toEqual({ status: 400, data: { error: 'Enter a valid email address', email: 'not-an-email' } });
		expect(checkForgotPasswordRateLimitMock).not.toHaveBeenCalled();
		expect(sendPublicRecoveryEmailMock).not.toHaveBeenCalled();
	});

	it('rate-limits before generating a provider link', async () => {
		checkForgotPasswordRateLimitMock.mockResolvedValueOnce({
			limited: true,
			namespace: 'forgot-password',
			dimensions: ['email', 'ip'],
			limitedDimensions: ['email'],
			windowMs: 60 * 60 * 1000,
			maxRequests: 3,
			retryAfterMs: 120_000
		});
		const result = await actions.default(makeActionEvent());
		expect(result).toEqual({
			status: 429,
			data: {
				error: 'Too many password recovery requests. Please wait before trying again.',
				email: 'soldier@example.mil'
			}
		});
		expect(sendPublicRecoveryEmailMock).not.toHaveBeenCalled();
		expect(auditLogMock.mock.calls[0][0].details).not.toHaveProperty('email');
	});

	it('gives the same response when an account does not exist', async () => {
		sendPublicRecoveryEmailMock.mockResolvedValue('user_not_found');
		await expect(actions.default(makeActionEvent())).resolves.toEqual({ success: true, email: 'soldier@example.mil' });
	});

	it('keeps the public result the same when link generation or delivery fails', async () => {
		sendPublicRecoveryEmailMock.mockResolvedValue('failed');
		const result = await actions.default(makeActionEvent());
		expect(result).toEqual({ success: true, email: 'soldier@example.mil' });
	});
});
