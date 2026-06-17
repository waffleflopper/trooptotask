import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auditLogMock, billingEnabledMock, checkSignupRateLimitMock } = vi.hoisted(() => ({
	auditLogMock: vi.fn(),
	billingEnabledMock: vi.fn(() => true),
	checkSignupRateLimitMock: vi.fn()
}));

vi.mock('$lib/config/billing', () => ({
	get isBillingEnabled() {
		return billingEnabledMock();
	}
}));

vi.mock('$lib/server/auditLog', () => ({
	auditLog: auditLogMock
}));

vi.mock('$lib/server/signupRateLimit', () => ({
	SIGNUP_RATE_LIMIT_MESSAGE: 'Too many account creation attempts. Please wait before trying again.',
	checkSignupRateLimit: checkSignupRateLimitMock
}));

import { actions, load } from './+page.server';

type SignupActionEvent = Parameters<(typeof actions)['default']>[0];

function makeActionEvent(input: {
	email?: string;
	password?: string;
	confirmPassword?: string;
	origin?: string;
	ip?: string;
	signUp?: ReturnType<typeof vi.fn>;
	session?: unknown;
}) {
	const origin = input.origin ?? 'http://localhost:4173';
	const signUp = input.signUp ?? vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
	const body = new URLSearchParams({
		email: input.email ?? 'Soldier@Example.mil',
		password: input.password ?? 'ValidPassword123',
		confirmPassword: input.confirmPassword ?? input.password ?? 'ValidPassword123'
	});

	return {
		request: new Request(`${origin}/auth/sign-up`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'user-agent': 'vitest-agent'
			},
			body
		}),
		locals: {
			session: input.session ?? null,
			authFlow: null,
			mfaPending: false,
			supabase: {
				auth: {
					signUp
				}
			}
		},
		getClientAddress: vi.fn(() => input.ip ?? '203.0.113.10'),
		url: new URL(`${origin}/auth/sign-up`)
	} as unknown as SignupActionEvent;
}

describe('GET /auth/sign-up', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		billingEnabledMock.mockReturnValue(true);
	});

	it('redirects to reviewed access when billing is disabled', async () => {
		billingEnabledMock.mockReturnValue(false);

		await expect(
			load({
				locals: {
					session: null,
					authFlow: null,
					mfaPending: false
				}
			} as unknown as Parameters<typeof load>[0])
		).rejects.toMatchObject({
			status: 303,
			location: '/auth/request-access'
		});
	});

	it('redirects authenticated users to their authenticated landing page', async () => {
		await expect(
			load({
				locals: {
					session: { user: { id: 'user-1' } },
					authFlow: null,
					mfaPending: false
				}
			} as unknown as Parameters<typeof load>[0])
		).rejects.toMatchObject({
			status: 303,
			location: '/dashboard'
		});
	});

	it('renders when billing is enabled and no session exists', async () => {
		await expect(
			load({
				locals: {
					session: null,
					authFlow: null,
					mfaPending: false
				}
			} as unknown as Parameters<typeof load>[0])
		).resolves.toEqual({});
	});
});

describe('POST /auth/sign-up', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		billingEnabledMock.mockReturnValue(true);
		checkSignupRateLimitMock.mockResolvedValue({
			limited: false,
			namespace: 'signup',
			dimensions: ['email', 'ip'],
			limitedDimensions: [],
			windowMs: 60 * 60 * 1000,
			maxRequests: 5
		});
	});

	it('redirects to reviewed access when billing is disabled before rate limiting or provider calls', async () => {
		billingEnabledMock.mockReturnValue(false);
		const signUp = vi.fn();

		await expect(actions.default(makeActionEvent({ signUp }))).rejects.toMatchObject({
			status: 303,
			location: '/auth/request-access'
		});

		expect(checkSignupRateLimitMock).not.toHaveBeenCalled();
		expect(signUp).not.toHaveBeenCalled();
	});

	it('requests a signup confirmation email through the app-owned confirm route', async () => {
		const signUp = vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

		const result = await actions.default(makeActionEvent({ signUp }));

		expect(result).toEqual({
			success: true,
			email: 'soldier@example.mil',
			message: 'If this email can create a TroopToTask account, we sent a confirmation link.'
		});
		expect(checkSignupRateLimitMock).toHaveBeenCalledWith({
			email: 'soldier@example.mil',
			ip: '203.0.113.10'
		});
		expect(signUp).toHaveBeenCalledWith({
			email: 'soldier@example.mil',
			password: 'ValidPassword123',
			options: {
				emailRedirectTo: 'http://localhost:4173/auth/confirm?type=email&next=%2Forg%2Fnew'
			}
		});
	});

	it('rejects invalid email before rate limiting or provider calls', async () => {
		const signUp = vi.fn();

		const result = await actions.default(makeActionEvent({ email: 'not-an-email', signUp }));

		expect(result).toEqual({ status: 400, data: { error: 'Enter a valid email address', email: 'not-an-email' } });
		expect(checkSignupRateLimitMock).not.toHaveBeenCalled();
		expect(signUp).not.toHaveBeenCalled();
	});

	it('rejects weak passwords before rate limiting or provider calls', async () => {
		const signUp = vi.fn();

		const result = await actions.default(
			makeActionEvent({
				password: 'short',
				confirmPassword: 'short',
				signUp
			})
		);

		expect(result).toEqual({
			status: 400,
			data: { error: 'Password must be at least 12 characters', email: 'soldier@example.mil' }
		});
		expect(checkSignupRateLimitMock).not.toHaveBeenCalled();
		expect(signUp).not.toHaveBeenCalled();
	});

	it('rejects mismatched passwords before rate limiting or provider calls', async () => {
		const signUp = vi.fn();

		const result = await actions.default(
			makeActionEvent({
				password: 'ValidPassword123',
				confirmPassword: 'DifferentPassword123',
				signUp
			})
		);

		expect(result).toEqual({
			status: 400,
			data: { error: 'Passwords must match', email: 'soldier@example.mil' }
		});
		expect(checkSignupRateLimitMock).not.toHaveBeenCalled();
		expect(signUp).not.toHaveBeenCalled();
	});

	it('rate-limits signup attempts before provider calls with audit-safe details', async () => {
		const signUp = vi.fn();
		checkSignupRateLimitMock.mockResolvedValueOnce({
			limited: true,
			namespace: 'signup',
			dimensions: ['email', 'ip'],
			limitedDimensions: ['email'],
			windowMs: 60 * 60 * 1000,
			maxRequests: 5,
			retryAfterMs: 120_000
		});

		const result = await actions.default(makeActionEvent({ signUp }));

		expect(result).toEqual({
			status: 429,
			data: {
				error: 'Too many account creation attempts. Please wait before trying again.',
				email: 'soldier@example.mil'
			}
		});
		expect(signUp).not.toHaveBeenCalled();
		expect(auditLogMock).toHaveBeenCalledWith(
			{
				action: 'auth.signup_rate_limited',
				resourceType: 'user',
				severity: 'warning',
				details: {
					namespace: 'signup',
					dimensions: ['email', 'ip'],
					limitedDimensions: ['email'],
					windowMs: 60 * 60 * 1000,
					maxRequests: 5,
					retryAfterMs: 120_000
				}
			},
			{
				userId: null,
				ip: '203.0.113.10',
				userAgent: 'vitest-agent'
			}
		);
		expect(JSON.stringify(auditLogMock.mock.calls[0][0].details)).not.toContain('soldier@example.mil');
		expect(JSON.stringify(auditLogMock.mock.calls[0][0].details)).not.toContain('203.0.113.10');
	});

	it('returns duplicate-safe success copy when the provider reports an existing account', async () => {
		const signUp = vi.fn().mockResolvedValue({
			data: null,
			error: { code: 'user_already_exists', message: 'User already registered' }
		});

		const result = await actions.default(makeActionEvent({ signUp }));

		expect(result).toEqual({
			success: true,
			email: 'soldier@example.mil',
			message: 'If this email can create a TroopToTask account, we sent a confirmation link.'
		});
		expect(JSON.stringify(result)).not.toContain('already registered');
	});

	it('returns generic provider failure copy without leaking provider internals', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const signUp = vi.fn().mockResolvedValue({
			data: null,
			error: { message: 'SMTP provider failed with internal details' }
		});

		const result = await actions.default(makeActionEvent({ signUp }));

		expect(result).toEqual({
			status: 400,
			data: {
				error: 'We could not start account creation. Please try again later.',
				email: 'soldier@example.mil'
			}
		});
		expect(JSON.stringify(result)).not.toContain('SMTP provider failed');

		consoleError.mockRestore();
	});
});
