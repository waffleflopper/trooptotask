import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAccountSetupRouteFlow } from './accountSetupRouteFlow';
import type { AccountSetupCompletionStore } from './accountSetupCompletion';
import type { AccountSetupLinkRecord } from '$features/identity/index.server';
import type { AccountSetupSession } from './accountSetupSessions';

function makeSetupLink(overrides: Partial<AccountSetupLinkRecord> = {}): AccountSetupLinkRecord {
	return {
		id: 'link-1',
		accessRequestId: 'request-1',
		tokenHash: 'hash',
		expiresAt: new Date('2026-06-01T12:00:00.000Z'),
		createdAt: new Date('2026-05-18T12:00:00.000Z'),
		claimedAt: null,
		failedAt: null,
		failureReason: null,
		usedAt: null,
		revokedAt: null,
		revocationReason: null,
		...overrides
	};
}

function makeSetupSession(overrides: Partial<AccountSetupSession> = {}): AccountSetupSession {
	return {
		setupLinkId: 'link-1',
		accessRequestId: 'request-1',
		expiresAt: new Date('2026-05-18T12:10:00.000Z').getTime(),
		...overrides
	};
}

function makeFlow() {
	const store = {
		getAccessRequest: vi.fn(),
		getSetupLink: vi.fn()
	};
	const setupLinks = {
		validateToken: vi.fn()
	};
	const completion = {
		completeSetupSession: vi.fn()
	};
	const checkCompletionRateLimit = vi.fn().mockResolvedValue({ limited: false });
	const audit = vi.fn();

	return {
		flow: createAccountSetupRouteFlow({
			store: () => store as unknown as AccountSetupCompletionStore,
			setupLinks: () => setupLinks as never,
			completion: () => completion as never,
			checkCompletionRateLimit,
			audit,
			now: () => new Date('2026-05-18T12:00:00.000Z')
		}),
		store,
		setupLinks,
		completion,
		checkCompletionRateLimit,
		audit
	};
}

describe('createAccountSetupRouteFlow', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('exchanges an approved raw token for a setup-session redirect effect', async () => {
		const { flow, setupLinks, store } = makeFlow();
		setupLinks.validateToken.mockResolvedValueOnce({
			status: 'valid',
			accessRequestId: 'request-1',
			link: makeSetupLink()
		});
		store.getAccessRequest.mockResolvedValueOnce({
			id: 'request-1',
			email: 'soldier@example.mil',
			status: 'approved',
			setupCompletedAt: null
		});

		const result = await flow.resolveLoad({
			session: null,
			authFlow: null,
			mfaPending: false,
			rawToken: 'raw-token',
			setupSession: null
		});

		expect(result).toEqual({
			state: 'redirect-setup',
			path: '/auth/setup-account',
			session: {
				setupLinkId: 'link-1',
				accessRequestId: 'request-1',
				expiresAt: new Date('2026-05-18T12:10:00.000Z').getTime()
			}
		});
		expect(setupLinks.validateToken).toHaveBeenCalledWith('raw-token');
	});

	it('redirects authenticated users without resolving setup providers', async () => {
		const store = vi.fn();
		const setupLinks = vi.fn();
		const completion = vi.fn();
		const flow = createAccountSetupRouteFlow({
			store,
			setupLinks,
			completion
		});

		const result = await flow.resolveLoad({
			session: { user: { id: 'user-1' } } as never,
			authFlow: null,
			mfaPending: false,
			rawToken: 'raw-token',
			setupSession: null
		});

		expect(result).toEqual({
			state: 'redirect-authenticated',
			path: '/dashboard'
		});
		expect(store).not.toHaveBeenCalled();
		expect(setupLinks).not.toHaveBeenCalled();
		expect(completion).not.toHaveBeenCalled();
	});

	it('returns a clear-session effect when a tokenless setup session points at a replaced link', async () => {
		const { flow, store } = makeFlow();
		store.getAccessRequest.mockResolvedValueOnce({
			id: 'request-1',
			email: 'soldier@example.mil',
			status: 'approved',
			setupCompletedAt: null
		});
		store.getSetupLink.mockResolvedValueOnce(
			makeSetupLink({
				revokedAt: new Date('2026-05-18T12:01:00.000Z'),
				revocationReason: 'replaced'
			})
		);

		const result = await flow.resolveLoad({
			session: null,
			authFlow: null,
			mfaPending: false,
			rawToken: '',
			setupSession: makeSetupSession()
		});

		expect(result).toEqual({
			state: 'replaced',
			message: 'This Account Setup Link was replaced. Check your inbox for the newest setup email.',
			clearSession: true
		});
	});

	it('audits post-claim sign-in failures and returns the manual sign-in recovery effect', async () => {
		const { flow, store, completion, audit } = makeFlow();
		store.getAccessRequest.mockResolvedValueOnce({
			id: 'request-1',
			email: 'soldier@example.mil',
			status: 'approved',
			setupCompletedAt: null
		});
		completion.completeSetupSession.mockResolvedValueOnce({
			status: 'sign-in-failed',
			message: 'Invalid login credentials'
		});

		const result = await flow.completeSetup({
			setupSession: makeSetupSession(),
			password: 'ValidPassword123!',
			confirmPassword: 'ValidPassword123!',
			clientIp: '203.0.113.10',
			userAgent: 'vitest-agent'
		});

		expect(result).toEqual({
			type: 'failure',
			status: 500,
			error: 'Your account was created successfully, but automatic sign-in could not finish. Please sign in manually.',
			clearSession: true
		});
		expect(audit).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'account_setup.claimed',
				resourceId: 'link-1'
			}),
			expect.objectContaining({
				ip: '203.0.113.10',
				userAgent: 'vitest-agent'
			})
		);
		expect(audit).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'account_setup.failed',
				resourceId: 'link-1',
				details: expect.objectContaining({
					failureCategory: 'sign-in-failed'
				})
			}),
			expect.objectContaining({
				ip: '203.0.113.10',
				userAgent: 'vitest-agent'
			})
		);
	});

	it('rate-limits before account mutation and audits safe limiter metadata', async () => {
		const { flow, store, completion, checkCompletionRateLimit, audit } = makeFlow();
		store.getAccessRequest.mockResolvedValueOnce({
			id: 'request-1',
			email: 'soldier@example.mil',
			status: 'approved',
			setupCompletedAt: null
		});
		checkCompletionRateLimit.mockResolvedValueOnce({
			limited: true,
			retryAfterMs: 60_000,
			namespace: 'account-setup-completion',
			dimensions: ['link', 'request', 'email', 'ip'],
			limitedDimensions: ['link'],
			windowMs: 900_000,
			maxRequests: 5
		});

		const result = await flow.completeSetup({
			setupSession: makeSetupSession(),
			password: 'ValidPassword123!',
			confirmPassword: 'ValidPassword123!',
			clientIp: '203.0.113.10',
			userAgent: 'vitest-agent'
		});

		expect(result).toEqual({
			type: 'failure',
			status: 429,
			error:
				'Too many setup attempts. Please wait before trying again, or request a fresh setup link if this one no longer works.'
		});
		expect(completion.completeSetupSession).not.toHaveBeenCalled();
		expect(audit).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'account_setup.completion_rate_limited',
				resourceId: 'link-1',
				details: {
					accessRequestId: 'request-1',
					rateLimit: expect.objectContaining({
						namespace: 'account-setup-completion',
						limitedDimensions: ['link'],
						retryAfterMs: 60_000
					})
				}
			}),
			expect.objectContaining({
				ip: '203.0.113.10',
				userAgent: 'vitest-agent'
			})
		);
		expect(JSON.stringify(audit.mock.calls)).not.toContain('ValidPassword123!');
	});
});
