import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAccountSetupRouteFlow } from './accountSetupRouteFlow.server';
import type { AccountSetupCompletionStore } from './accountSetupCompletion.server';
import type { AccountSetupLinkRecord } from './accountSetupLinks.server';
import type { AccountSetupSession } from './accountSetupSessions.server';

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
			completion,
			audit: vi.fn()
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

	it('returns support guidance when another link already holds the email claim', async () => {
		const { flow, store, completion, audit } = makeFlow();
		store.getAccessRequest.mockResolvedValueOnce({
			id: 'request-1',
			email: 'soldier@example.mil',
			status: 'approved',
			setupCompletedAt: null
		});
		completion.completeSetupSession.mockResolvedValueOnce({ status: 'claim-in-progress' });

		const result = await flow.completeSetup({
			setupSession: makeSetupSession(),
			password: 'ValidPassword123!',
			confirmPassword: 'ValidPassword123!',
			clientIp: '203.0.113.10',
			userAgent: 'vitest-agent'
		});

		expect(result).toEqual({
			type: 'failure',
			status: 409,
			error:
				'Another account setup attempt is still in progress. If it does not finish, contact platform support before trying another link. Give support request ID request-1.',
			clearSession: true,
			supportRequired: true
		});
		expect(audit).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'account_setup.failed',
				details: expect.objectContaining({ failureCategory: 'claim-in-progress' })
			}),
			expect.anything()
		);
		expect(JSON.stringify(audit.mock.calls)).not.toContain('ValidPassword123!');
	});

	it.each([
		['setup-support-required', 'account-create-uncertain'],
		['setup-finalization-failed', 'setup-finalization-failed']
	] as const)('holds %s attempts behind support guidance and an audit reference', async (status, category) => {
		const { flow, store, completion, audit } = makeFlow();
		store.getAccessRequest.mockResolvedValueOnce({
			id: 'request-1',
			email: 'soldier@example.mil',
			status: 'approved',
			setupCompletedAt: null
		});
		completion.completeSetupSession.mockResolvedValueOnce({ status });

		const result = await flow.completeSetup({
			setupSession: makeSetupSession(),
			password: 'ValidPassword123!',
			confirmPassword: 'ValidPassword123!',
			clientIp: '203.0.113.10',
			userAgent: 'vitest-agent'
		});

		expect(result).toMatchObject({
			type: 'failure',
			status: 500,
			clearSession: true,
			supportRequired: true,
			error: expect.stringContaining('request ID request-1')
		});
		expect(audit).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'account_setup.failed',
				resourceId: 'link-1',
				details: expect.objectContaining({ accessRequestId: 'request-1', failureCategory: category })
			}),
			expect.anything()
		);
		expect(JSON.stringify(audit.mock.calls)).not.toContain('ValidPassword123!');
	});
	it.each([
		['expired', 'This Account Setup Link has expired. Request a fresh setup link and use the newest email.'],
		['replaced', 'This Account Setup Link was replaced. Check your inbox for the newest setup email.'],
		[
			'claimed',
			'This Account Setup Link is already being used. If setup does not finish, contact platform support before trying another link.'
		]
	] as const)('maps %s raw-token states to recovery without reading a request', async (status, message) => {
		const { flow, setupLinks, store } = makeFlow();
		setupLinks.validateToken.mockResolvedValueOnce({ status });
		await expect(
			flow.resolveLoad({
				session: null,
				authFlow: null,
				mfaPending: false,
				rawToken: 'raw-token',
				setupSession: null
			})
		).resolves.toEqual({ state: status, message, clearSession: true });
		expect(store.getAccessRequest).not.toHaveBeenCalled();
	});

	it('rejects a no-longer-approved tokenless setup session before reading its link', async () => {
		const { flow, store } = makeFlow();
		store.getAccessRequest.mockResolvedValueOnce({
			id: 'request-1',
			email: 'soldier@example.mil',
			status: 'rejected',
			setupCompletedAt: null
		});
		await expect(
			flow.resolveLoad({
				session: null,
				authFlow: null,
				mfaPending: false,
				rawToken: '',
				setupSession: makeSetupSession()
			})
		).resolves.toEqual({
			state: 'access-request-not-approved',
			message: 'This Account Setup Link is no longer approved. Request access again or contact support.',
			clearSession: true
		});
		expect(store.getSetupLink).not.toHaveBeenCalled();
	});

	it('rejects missing sessions and weak or mismatched passwords before account mutation', async () => {
		const { flow, completion, checkCompletionRateLimit } = makeFlow();
		const input = {
			setupSession: makeSetupSession(),
			password: 'ValidPassword123!',
			confirmPassword: 'ValidPassword123!',
			clientIp: '203.0.113.10',
			userAgent: 'vitest-agent'
		};
		await expect(flow.completeSetup({ ...input, setupSession: null })).resolves.toMatchObject({
			type: 'failure',
			status: 400,
			clearSession: true
		});
		await expect(flow.completeSetup({ ...input, password: 'short', confirmPassword: 'short' })).resolves.toMatchObject({
			type: 'failure',
			status: 400,
			error: 'Password must be at least 12 characters'
		});
		await expect(flow.completeSetup({ ...input, confirmPassword: 'DifferentPassword123!' })).resolves.toEqual({
			type: 'failure',
			status: 400,
			error: 'Passwords do not match'
		});
		expect(checkCompletionRateLimit).not.toHaveBeenCalled();
		expect(completion.completeSetupSession).not.toHaveBeenCalled();
	});

	it('audits completed setup and never exposes password or raw token in audit details', async () => {
		const { flow, store, completion, audit } = makeFlow();
		store.getAccessRequest.mockResolvedValueOnce({
			id: 'request-1',
			email: 'soldier@example.mil',
			status: 'approved',
			setupCompletedAt: null
		});
		completion.completeSetupSession.mockResolvedValueOnce({
			status: 'completed',
			accessRequestId: 'request-1',
			userId: 'user-123'
		});
		const result = await flow.completeSetup({
			setupSession: makeSetupSession(),
			password: 'ValidPassword123!',
			confirmPassword: 'ValidPassword123!',
			clientIp: '203.0.113.10',
			userAgent: 'vitest-agent'
		});
		expect(result).toEqual({ type: 'redirect', path: '/dashboard', clearSession: true });
		expect(completion.completeSetupSession).toHaveBeenCalledWith({
			setupLinkId: 'link-1',
			accessRequestId: 'request-1',
			password: 'ValidPassword123!'
		});
		expect(audit).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'account_setup.claimed' }),
			expect.any(Object)
		);
		expect(audit).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'account_setup.completed',
				details: { accessRequestId: 'request-1', userId: 'user-123', outcome: 'completed' }
			}),
			expect.any(Object)
		);
		expect(JSON.stringify(audit.mock.calls)).not.toContain('ValidPassword123!');
	});

	it.each([
		['replaced', 'This Account Setup Link was replaced. Check your inbox for the newest setup email.'],
		[
			'access-request-not-approved',
			'This Account Setup Link is no longer approved. Request access again or contact support.'
		],
		['used', 'This setup link has already been used. Sign in or reset your password if you need access.']
	] as const)('reports pre-claim %s without claiming audit', async (status, error) => {
		const { flow, store, completion, audit } = makeFlow();
		store.getAccessRequest.mockResolvedValueOnce({ id: 'request-1', email: 'soldier@example.mil' });
		completion.completeSetupSession.mockResolvedValueOnce({ status });
		await expect(
			flow.completeSetup({
				setupSession: makeSetupSession(),
				password: 'ValidPassword123!',
				confirmPassword: 'ValidPassword123!',
				clientIp: '203.0.113.10',
				userAgent: 'vitest-agent'
			})
		).resolves.toEqual({ type: 'failure', status: 400, error, clearSession: true });
		expect(audit).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'account_setup.failed',
				details: expect.objectContaining({ failureCategory: status })
			}),
			expect.any(Object)
		);
		expect(audit.mock.calls.some(([event]) => event.action === 'account_setup.claimed')).toBe(false);
	});
	it('treats an already completed Access Request as used before reading its setup link', async () => {
		const { flow, store } = makeFlow();
		store.getAccessRequest.mockResolvedValueOnce({
			id: 'request-1',
			email: 'soldier@example.mil',
			status: 'approved',
			setupCompletedAt: '2026-05-18T12:01:00.000Z'
		});
		await expect(
			flow.resolveLoad({
				session: null,
				authFlow: null,
				mfaPending: false,
				rawToken: '',
				setupSession: makeSetupSession()
			})
		).resolves.toEqual({
			state: 'used',
			message: 'This setup link has already been used. Sign in or reset your password if you need access.',
			clearSession: true
		});
		expect(store.getSetupLink).not.toHaveBeenCalled();
	});

	it('rejects a signed session whose setup link belongs to another Access Request', async () => {
		const { flow, store } = makeFlow();
		store.getAccessRequest.mockResolvedValueOnce({
			id: 'request-1',
			email: 'soldier@example.mil',
			status: 'approved',
			setupCompletedAt: null
		});
		store.getSetupLink.mockResolvedValueOnce(makeSetupLink({ accessRequestId: 'other-request' }));
		await expect(
			flow.resolveLoad({
				session: null,
				authFlow: null,
				mfaPending: false,
				rawToken: '',
				setupSession: makeSetupSession()
			})
		).resolves.toEqual({
			state: 'missing',
			message: 'This Account Setup Link is invalid. Request a fresh setup link and try again.',
			clearSession: true
		});
	});
});
