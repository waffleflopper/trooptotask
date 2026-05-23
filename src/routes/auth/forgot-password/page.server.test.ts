import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { auditLogMock, checkForgotPasswordRateLimitMock } = vi.hoisted(() => ({
	auditLogMock: vi.fn(),
	checkForgotPasswordRateLimitMock: vi.fn()
}));

vi.mock('$lib/server/auditLog', () => ({
	auditLog: auditLogMock
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

function makeActionEvent(input: {
	email?: string;
	origin?: string;
	ip?: string;
	resetPasswordForEmail?: ReturnType<typeof vi.fn>;
}) {
	const origin = input.origin ?? 'http://localhost:4173';
	const resetPasswordForEmail = input.resetPasswordForEmail ?? vi.fn().mockResolvedValue({ error: null });

	return {
		request: new Request(`${origin}/auth/forgot-password`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'user-agent': 'vitest-agent'
			},
			body: new URLSearchParams({ email: input.email ?? 'soldier@example.mil' })
		}),
		locals: {
			supabase: {
				auth: {
					resetPasswordForEmail
				}
			}
		},
		getClientAddress: vi.fn(() => input.ip ?? '203.0.113.10'),
		url: new URL(`${origin}/auth/forgot-password`)
	} as unknown as ForgotPasswordActionEvent;
}

describe('POST /auth/forgot-password', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		checkForgotPasswordRateLimitMock.mockResolvedValue({
			limited: false,
			namespace: 'forgot-password',
			dimensions: ['email', 'ip'],
			limitedDimensions: [],
			windowMs: 60 * 60 * 1000,
			maxRequests: 3
		});
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('sends recovery emails through the app-owned confirmation route', async () => {
		const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });

		const result = await actions.default(makeActionEvent({ resetPasswordForEmail }));

		expect(result).toEqual({ success: true, email: 'soldier@example.mil' });
		expect(checkForgotPasswordRateLimitMock).toHaveBeenCalledWith({
			email: 'soldier@example.mil',
			ip: '203.0.113.10'
		});
		expect(resetPasswordForEmail).toHaveBeenCalledWith('soldier@example.mil', {
			redirectTo: 'http://localhost:4173/auth/confirm?type=recovery&next=%2Fauth%2Freset-password'
		});
	});

	it('uses the configured public app origin for recovery redirects instead of the inbound host', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN', 'https://trooptotask.org');
		const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });

		await actions.default(makeActionEvent({ origin: 'https://evil.example', resetPasswordForEmail }));

		expect(resetPasswordForEmail).toHaveBeenCalledWith('soldier@example.mil', {
			redirectTo: 'https://trooptotask.org/auth/confirm?type=recovery&next=%2Fauth%2Freset-password'
		});
	});

	it('rejects invalid email before rate limiting or provider calls', async () => {
		const resetPasswordForEmail = vi.fn();

		const result = await actions.default(makeActionEvent({ email: 'not-an-email', resetPasswordForEmail }));

		expect(result).toEqual({ status: 400, data: { error: 'Enter a valid email address', email: 'not-an-email' } });
		expect(checkForgotPasswordRateLimitMock).not.toHaveBeenCalled();
		expect(resetPasswordForEmail).not.toHaveBeenCalled();
	});

	it('rate-limits forgot-password requests before provider calls', async () => {
		const resetPasswordForEmail = vi.fn();
		checkForgotPasswordRateLimitMock.mockResolvedValueOnce({
			limited: true,
			namespace: 'forgot-password',
			dimensions: ['email', 'ip'],
			limitedDimensions: ['email'],
			windowMs: 60 * 60 * 1000,
			maxRequests: 3,
			retryAfterMs: 120_000
		});

		const result = await actions.default(makeActionEvent({ resetPasswordForEmail }));

		expect(result).toEqual({
			status: 429,
			data: {
				error: 'Too many password recovery requests. Please wait before trying again.',
				email: 'soldier@example.mil'
			}
		});
		expect(resetPasswordForEmail).not.toHaveBeenCalled();
		expect(auditLogMock).toHaveBeenCalledWith(
			{
				action: 'auth.forgot_password_rate_limited',
				resourceType: 'user',
				severity: 'warning',
				details: {
					namespace: 'forgot-password',
					dimensions: ['email', 'ip'],
					limitedDimensions: ['email'],
					windowMs: 60 * 60 * 1000,
					maxRequests: 3,
					retryAfterMs: 120_000
				}
			},
			{
				userId: null,
				userEmail: 'soldier@example.mil',
				ip: '203.0.113.10',
				userAgent: 'vitest-agent'
			}
		);
		expect(auditLogMock.mock.calls[0][0].details).not.toHaveProperty('email');
	});

	it('returns generic copy when the provider rejects the recovery email request', async () => {
		const resetPasswordForEmail = vi.fn().mockResolvedValue({
			error: { message: 'provider internals' }
		});

		const result = await actions.default(makeActionEvent({ resetPasswordForEmail }));

		expect(result).toEqual({
			status: 400,
			data: {
				error: 'We could not send a recovery email. Please try again later.',
				email: 'soldier@example.mil'
			}
		});
		expect(JSON.stringify(result)).not.toContain('provider internals');
	});
});
