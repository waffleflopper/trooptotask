import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
	complete,
	completeSetupSession,
	validateToken,
	getAccessRequest,
	getSetupLink,
	checkCompletionRateLimit,
	setupStore
} = vi.hoisted(() => {
	const setupStore = {
		getAccessRequest: vi.fn(),
		findByTokenHash: vi.fn(),
		getSetupLink: vi.fn()
	};
	return {
		complete: vi.fn(),
		completeSetupSession: vi.fn(),
		validateToken: vi.fn(),
		getAccessRequest: setupStore.getAccessRequest,
		getSetupLink: setupStore.getSetupLink,
		checkCompletionRateLimit: vi.fn(),
		setupStore
	};
});

vi.mock('$lib/server/supabase', () => ({
	getAdminClient: vi.fn().mockReturnValue({ admin: true }),
	getSupabaseClient: vi.fn().mockReturnValue({ session: true })
}));

vi.mock('$lib/server/accountSetupLinks', () => ({
	createAccountSetupLinkService: vi.fn(() => ({ validateToken }))
}));

vi.mock('$lib/server/accountSetupCompletion', () => ({
	createAccountSetupCompletionService: vi.fn(() => ({ complete, completeSetupSession }))
}));

vi.mock('$lib/server/accountSetupCompletionSupabase', () => ({
	createSupabaseAccountSetupCompletionStore: vi.fn(() => setupStore),
	createSupabaseAccountSetupAuthAdapter: vi.fn(() => ({}))
}));

vi.mock('$lib/server/accountSetupRateLimit', () => ({
	ACCOUNT_SETUP_ATTEMPT_RATE_LIMIT_MESSAGE:
		'Too many setup attempts. Please wait before trying again, or request a fresh setup link if this one no longer works.',
	checkAccountSetupCompletionRateLimit: checkCompletionRateLimit
}));

import { actions, load } from './+page.server';
import {
	ACCOUNT_SETUP_SESSION_COOKIE,
	setAccountSetupSessionCookie,
	createAccountSetupSession
} from '$lib/server/accountSetupSessions';

function makeRequest(input: { password?: string; confirmPassword?: string }) {
	const formData = new FormData();
	formData.set('password', input.password ?? 'ValidPassword123!');
	formData.set('confirmPassword', input.confirmPassword ?? input.password ?? 'ValidPassword123!');
	return { formData: vi.fn().mockResolvedValue(formData) };
}

function makeCookies(initial: Record<string, string> = {}) {
	const values = new Map(Object.entries(initial));
	return {
		get: vi.fn((name: string) => values.get(name)),
		set: vi.fn((name: string, value: string) => values.set(name, value)),
		delete: vi.fn((name: string) => values.delete(name)),
		values
	};
}

function makeSetupSessionCookie(input: { setupLinkId?: string; accessRequestId?: string } = {}) {
	const cookies = makeCookies();
	setAccountSetupSessionCookie(
		cookies,
		createAccountSetupSession({
			setupLinkId: input.setupLinkId ?? 'link-1',
			accessRequestId: input.accessRequestId ?? 'request-1',
			now: new Date()
		})
	);
	return cookies.values.get(ACCOUNT_SETUP_SESSION_COOKIE) ?? '';
}

function makeSetupLink(overrides: Record<string, unknown> = {}) {
	return {
		id: 'link-1',
		accessRequestId: 'request-1',
		tokenHash: 'hash',
		expiresAt: new Date('2026-06-01T12:00:00.000Z'),
		createdAt: new Date('2026-05-22T12:00:00.000Z'),
		claimedAt: null,
		failedAt: null,
		failureReason: null,
		usedAt: null,
		revokedAt: null,
		revocationReason: null,
		...overrides
	};
}

function makeLoadEvent(input: { token?: string; session?: unknown; cookies?: ReturnType<typeof makeCookies> } = {}) {
	const url = new URL('http://localhost/auth/setup-account');
	if (input.token) {
		url.searchParams.set('token', input.token);
	}
	return {
		cookies: input.cookies ?? makeCookies(),
		locals: {
			session: input.session ?? null,
			authFlow: null,
			mfaPending: false
		},
		url
	} as unknown as Parameters<typeof load>[0];
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubEnv('ACCOUNT_SETUP_SESSION_SECRET', 'test-account-setup-session-secret');
	checkCompletionRateLimit.mockReturnValue({ limited: false });
});

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('/auth/setup-account load', () => {
	it('returns expired setup-session recovery copy when no token or session is present', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toEqual({
			state: 'missing',
			message: 'This setup session has expired. Open the newest setup email or request a fresh setup link.'
		});
		expect(validateToken).not.toHaveBeenCalled();
	});

	it('maps invalid token states to recovery copy', async () => {
		validateToken.mockResolvedValueOnce({ status: 'expired' });

		const result = await load(makeLoadEvent({ token: 'expired-token' }));

		expect(result).toEqual({
			state: 'expired',
			message: 'This Account Setup Link has expired. Request a fresh setup link and use the newest email.'
		});
		expect(validateToken).toHaveBeenCalledWith('expired-token');
	});

	it('exchanges a valid raw token for an HTTP-only setup session and redirects to a tokenless URL', async () => {
		const cookies = makeCookies();
		validateToken.mockResolvedValueOnce({
			status: 'valid',
			accessRequestId: 'request-1',
			link: makeSetupLink()
		});
		getAccessRequest.mockResolvedValueOnce({
			id: 'request-1',
			email: 'soldier@example.mil',
			status: 'approved',
			setupCompletedAt: null
		});

		await expect(load(makeLoadEvent({ token: 'valid-token', cookies }))).rejects.toMatchObject({
			status: 303,
			location: '/auth/setup-account'
		});

		expect(cookies.set).toHaveBeenCalledWith(
			ACCOUNT_SETUP_SESSION_COOKIE,
			expect.any(String),
			expect.objectContaining({
				httpOnly: true,
				maxAge: 600,
				path: '/auth/setup-account',
				sameSite: 'lax'
			})
		);
	});

	it('returns valid state and email from a tokenless setup-session load without page token data', async () => {
		const cookies = makeCookies({
			[ACCOUNT_SETUP_SESSION_COOKIE]: makeSetupSessionCookie()
		});
		getAccessRequest.mockResolvedValueOnce({
			id: 'request-1',
			email: 'soldier@example.mil',
			status: 'approved',
			setupCompletedAt: null
		});
		getSetupLink.mockResolvedValueOnce(makeSetupLink());

		const result = await load(makeLoadEvent({ cookies }));

		expect(result).toEqual({
			state: 'valid',
			email: 'soldier@example.mil'
		});
		expect(result).not.toHaveProperty('token');
		expect(validateToken).not.toHaveBeenCalled();
	});

	it('maps completed Access Requests to used-link copy', async () => {
		validateToken.mockResolvedValueOnce({
			status: 'valid',
			accessRequestId: 'request-1',
			link: makeSetupLink()
		});
		getAccessRequest.mockResolvedValueOnce({
			id: 'request-1',
			email: 'soldier@example.mil',
			status: 'approved',
			setupCompletedAt: '2026-05-18T12:00:00.000Z'
		});

		const result = await load(makeLoadEvent({ token: 'used-token' }));

		expect(result).toEqual({
			state: 'used',
			message: 'This setup link has already been used. Sign in or reset your password if you need access.'
		});
	});

	it('refuses a valid token when the Access Request is no longer approved', async () => {
		const cookies = makeCookies();
		validateToken.mockResolvedValueOnce({
			status: 'valid',
			accessRequestId: 'request-1',
			link: makeSetupLink()
		});
		getAccessRequest.mockResolvedValueOnce({
			id: 'request-1',
			email: 'soldier@example.mil',
			status: 'rejected',
			setupCompletedAt: null
		});

		const result = await load(makeLoadEvent({ token: 'valid-token', cookies }));

		expect(result).toEqual({
			state: 'access-request-not-approved',
			message: 'This Account Setup Link is no longer approved. Request access again or contact support.'
		});
		expect(cookies.delete).toHaveBeenCalledWith(ACCOUNT_SETUP_SESSION_COOKIE, {
			path: '/auth/setup-account'
		});
	});

	it('maps replaced tokenless setup-session links to recovery copy and clears the session', async () => {
		const cookies = makeCookies({
			[ACCOUNT_SETUP_SESSION_COOKIE]: makeSetupSessionCookie()
		});
		getAccessRequest.mockResolvedValueOnce({
			id: 'request-1',
			email: 'soldier@example.mil',
			status: 'approved',
			setupCompletedAt: null
		});
		getSetupLink.mockResolvedValueOnce(
			makeSetupLink({
				revokedAt: new Date('2026-05-23T12:00:00.000Z'),
				revocationReason: 'replaced'
			})
		);

		const result = await load(makeLoadEvent({ cookies }));

		expect(result).toEqual({
			state: 'replaced',
			message: 'This Account Setup Link was replaced. Check your inbox for the newest setup email.'
		});
		expect(cookies.delete).toHaveBeenCalledWith(ACCOUNT_SETUP_SESSION_COOKIE, {
			path: '/auth/setup-account'
		});
	});

	it('refuses a tokenless setup session when the Access Request is no longer approved', async () => {
		const cookies = makeCookies({
			[ACCOUNT_SETUP_SESSION_COOKIE]: makeSetupSessionCookie()
		});
		getAccessRequest.mockResolvedValueOnce({
			id: 'request-1',
			email: 'soldier@example.mil',
			status: 'rejected',
			setupCompletedAt: null
		});

		const result = await load(makeLoadEvent({ cookies }));

		expect(result).toEqual({
			state: 'access-request-not-approved',
			message: 'This Account Setup Link is no longer approved. Request access again or contact support.'
		});
		expect(getSetupLink).not.toHaveBeenCalled();
		expect(cookies.delete).toHaveBeenCalledWith(ACCOUNT_SETUP_SESSION_COOKIE, {
			path: '/auth/setup-account'
		});
	});

	it('redirects authenticated users before token validation', async () => {
		await expect(
			load(makeLoadEvent({ token: 'valid-token', session: { user: { id: 'user-1' } } }))
		).rejects.toMatchObject({
			status: 303,
			location: '/dashboard'
		});
		expect(validateToken).not.toHaveBeenCalled();
	});
});

describe('/auth/setup-account actions', () => {
	function makeActionEvent(
		input: { cookies?: ReturnType<typeof makeCookies>; request?: ReturnType<typeof makeRequest> } = {}
	) {
		return {
			cookies:
				input.cookies ??
				makeCookies({
					[ACCOUNT_SETUP_SESSION_COOKIE]: makeSetupSessionCookie()
				}),
			getClientAddress: vi.fn(() => '203.0.113.10'),
			request: input.request ?? makeRequest({}),
			locals: { supabase: {} }
		} as unknown as Parameters<(typeof actions)['default']>[0];
	}

	it('rejects expired or missing setup sessions before password handling', async () => {
		const result = await actions.default(
			makeActionEvent({
				cookies: makeCookies(),
				request: makeRequest({})
			})
		);

		expect(result).toMatchObject({
			status: 400,
			data: {
				error: 'This setup session has expired. Open the newest setup email or request a fresh setup link.'
			}
		});
		expect(completeSetupSession).not.toHaveBeenCalled();
	});

	it('validates password confirmation before creating a User Account', async () => {
		const result = await actions.default(
			makeActionEvent({
				request: makeRequest({ password: 'ValidPassword123!', confirmPassword: 'DifferentPassword123!' })
			})
		);

		expect(result).toMatchObject({
			status: 400,
			data: { error: 'Passwords do not match' }
		});
		expect(completeSetupSession).not.toHaveBeenCalled();
	});

	it('validates weak setup passwords before claiming the setup session', async () => {
		const result = await actions.default(
			makeActionEvent({
				request: makeRequest({ password: 'short', confirmPassword: 'short' })
			})
		);

		expect(result).toMatchObject({
			status: 400,
			data: { error: 'Password must be at least 12 characters' }
		});
		expect(checkCompletionRateLimit).not.toHaveBeenCalled();
		expect(completeSetupSession).not.toHaveBeenCalled();
	});

	it('maps invalid setup-session link states to user-facing recovery copy', async () => {
		completeSetupSession.mockResolvedValueOnce({ status: 'revoked' });

		const result = await actions.default(makeActionEvent());

		expect(result).toMatchObject({
			status: 400,
			data: {
				error: 'This Account Setup Link was replaced. Check your inbox for the newest setup email.'
			}
		});
	});

	it('maps no-longer-approved setup-session completion to support copy', async () => {
		completeSetupSession.mockResolvedValueOnce({ status: 'access-request-not-approved' });

		const result = await actions.default(makeActionEvent());

		expect(result).toMatchObject({
			status: 400,
			data: {
				error: 'This Account Setup Link is no longer approved. Request access again or contact support.'
			}
		});
	});

	it('does not treat an already-completed link response as a successful setup redirect', async () => {
		completeSetupSession.mockResolvedValueOnce({ status: 'completed' });

		const result = await actions.default(makeActionEvent());

		expect(result).toMatchObject({
			status: 400,
			data: {
				error: 'This setup link has already been used. Sign in or reset your password if you need access.'
			}
		});
	});

	it('returns provider-edge failures without accepting an Organization Invitation', async () => {
		completeSetupSession.mockResolvedValueOnce({ status: 'account-create-failed', message: 'Supabase unavailable' });

		const result = await actions.default(makeActionEvent());

		expect(result).toMatchObject({
			status: 500,
			data: {
				error:
					'We could not finish account setup after claiming this link. Request a fresh setup link or ask an admin to resend setup.'
			}
		});
		expect(completeSetupSession).toHaveBeenCalledWith({
			setupLinkId: 'link-1',
			accessRequestId: 'request-1',
			password: 'ValidPassword123!'
		});
	});

	it('returns clear policy copy when Supabase rejects the setup password after app validation', async () => {
		completeSetupSession.mockResolvedValueOnce({
			status: 'account-create-failed',
			message: 'Password should be at least 12 characters'
		});

		const result = await actions.default(makeActionEvent());

		expect(result).toMatchObject({
			status: 400,
			data: {
				error:
					'That password was rejected by account security rules. Use at least 12 characters with uppercase, lowercase, and a number. Request a fresh setup link, then try again.'
			}
		});
	});

	it('rate-limits setup completion attempts by setup session and email before account mutation', async () => {
		getAccessRequest.mockResolvedValueOnce({
			id: 'request-1',
			email: 'soldier@example.mil',
			status: 'approved',
			setupCompletedAt: null
		});
		checkCompletionRateLimit.mockReturnValueOnce({ limited: true, retryAfterMs: 60_000 });

		const result = await actions.default(makeActionEvent());

		expect(result).toMatchObject({
			status: 429,
			data: {
				error:
					'Too many setup attempts. Please wait before trying again, or request a fresh setup link if this one no longer works.'
			}
		});
		expect(checkCompletionRateLimit).toHaveBeenCalledWith({
			setupLinkId: 'link-1',
			accessRequestId: 'request-1',
			email: 'soldier@example.mil',
			ip: '203.0.113.10'
		});
		expect(completeSetupSession).not.toHaveBeenCalled();
	});

	it('rate-limits setup completion attempts when request email lookup is unavailable', async () => {
		getAccessRequest.mockResolvedValueOnce(null);
		checkCompletionRateLimit.mockReturnValueOnce({ limited: true, retryAfterMs: 60_000 });

		const result = await actions.default(makeActionEvent());

		expect(result).toMatchObject({
			status: 429,
			data: {
				error:
					'Too many setup attempts. Please wait before trying again, or request a fresh setup link if this one no longer works.'
			}
		});
		expect(checkCompletionRateLimit).toHaveBeenCalledWith({
			setupLinkId: 'link-1',
			accessRequestId: 'request-1',
			email: null,
			ip: '203.0.113.10'
		});
		expect(completeSetupSession).not.toHaveBeenCalled();
	});

	it('returns recovery copy when setup finalization fails after claim', async () => {
		completeSetupSession.mockResolvedValueOnce({
			status: 'setup-finalization-failed',
			message:
				'Account setup could not finish after this link was claimed. Request a fresh setup link or ask an admin to resend setup.'
		});

		const result = await actions.default(makeActionEvent());

		expect(result).toMatchObject({
			status: 500,
			data: {
				error:
					'We could not finish account setup after claiming this link. Request a fresh setup link or ask an admin to resend setup.'
			}
		});
	});

	it('returns manual sign-in guidance when setup succeeds but automatic sign-in fails', async () => {
		completeSetupSession.mockResolvedValueOnce({
			status: 'sign-in-failed',
			message: 'Invalid login credentials'
		});

		const result = await actions.default(makeActionEvent());

		expect(result).toMatchObject({
			status: 500,
			data: {
				error: 'Your account was created successfully, but automatic sign-in could not finish. Please sign in manually.'
			}
		});
	});
});

describe('/auth/setup-account page markup', () => {
	it('does not render a hidden raw-token form field', () => {
		const source = readFileSync(join(process.cwd(), 'src/routes/auth/setup-account/+page.svelte'), 'utf8');

		expect(source).not.toContain('name="token"');
		expect(source).not.toContain('data.token');
	});
});
