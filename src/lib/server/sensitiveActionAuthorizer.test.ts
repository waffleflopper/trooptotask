import type { Session } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
	assignSensitiveActionFailureDetails,
	checkSensitiveAction,
	createSensitiveActionAuthorizer,
	createSupabaseSensitiveActionAuthorizer,
	sensitiveActionDecisionAuditDetails,
	sensitiveActionDenialMessage,
	sensitiveActionStepUpPath,
	throwSensitiveActionFailure
} from './sensitiveActionAuthorizer';

const now = new Date('2026-05-22T12:00:00.000Z');

describe('checkSensitiveAction', () => {
	it('does not clamp a future timestamp into a recent session', () => {
		const decision = checkSensitiveAction({
			action: 'organization.deleteOrganization',
			now,
			actor: {
				userId: 'owner-1',
				isSuspended: false,
				currentAssuranceLevel: 'aal1',
				nextAssuranceLevel: 'aal1',
				sessionStartedAt: '2026-05-22T12:00:01Z'
			}
		});
		expect(decision).toMatchObject({ allowed: false, reason: 'denied.staleSession', requiresStepUp: true });
	});
	it('allows a sensitive action from a recent session without MFA assurance', () => {
		const decision = checkSensitiveAction({
			action: 'platform.accessRequest.approve',
			now,
			actor: {
				userId: 'admin-1',
				sessionStartedAt: '2026-05-22T11:50:00.000Z',
				currentAssuranceLevel: 'aal1',
				nextAssuranceLevel: 'aal1',
				isSuspended: false
			},
			target: { type: 'access_request', id: 'request-1' }
		});

		expect(decision).toMatchObject({
			allowed: true,
			reason: 'allowed.recentSession',
			requiresStepUp: false,
			sessionAgeMs: 10 * 60 * 1000
		});
	});

	it('allows a sensitive action when the session has MFA assurance', () => {
		const decision = checkSensitiveAction({
			action: 'platform.accessRequest.resendSetup',
			now,
			actor: {
				userId: 'admin-1',
				sessionStartedAt: '2026-05-22T10:00:00.000Z',
				currentAssuranceLevel: 'aal2',
				nextAssuranceLevel: 'aal2',
				isSuspended: false
			}
		});

		expect(decision).toMatchObject({
			allowed: true,
			reason: 'allowed.mfaAssurance',
			requiresStepUp: false
		});
	});

	it('denies stale sessions that do not have MFA assurance', () => {
		const decision = checkSensitiveAction({
			action: 'platform.accessRequest.approve',
			now,
			actor: {
				userId: 'admin-1',
				sessionStartedAt: '2026-05-22T11:00:00.000Z',
				currentAssuranceLevel: 'aal1',
				nextAssuranceLevel: 'aal2',
				isSuspended: false
			}
		});

		expect(decision).toMatchObject({
			allowed: false,
			reason: 'denied.staleSession',
			requiresStepUp: true
		});
		expect(sensitiveActionDenialMessage(decision)).toContain('confirm your identity');
		expect(sensitiveActionStepUpPath(decision)).toBe('/auth/mfa-verify');
	});

	it('denies suspended users even when the session is fresh', () => {
		const decision = checkSensitiveAction({
			action: 'platform.accessRequest.approve',
			now,
			actor: {
				userId: 'admin-1',
				sessionStartedAt: '2026-05-22T11:59:00.000Z',
				currentAssuranceLevel: 'aal2',
				nextAssuranceLevel: 'aal2',
				isSuspended: true
			}
		});

		expect(decision).toMatchObject({
			allowed: false,
			reason: 'denied.suspendedUser',
			requiresStepUp: false
		});
		expect(sensitiveActionDenialMessage(decision)).toContain('suspended');
	});

	it('fails closed when suspended-user state cannot be confirmed', () => {
		const decision = checkSensitiveAction({
			action: 'platform.accessRequest.approve',
			now,
			actor: {
				userId: 'admin-1',
				sessionStartedAt: '2026-05-22T11:59:00.000Z',
				currentAssuranceLevel: 'aal2',
				nextAssuranceLevel: 'aal2',
				suspensionStatusAvailable: false
			}
		});

		expect(decision).toMatchObject({
			allowed: false,
			reason: 'denied.suspensionStatusUnavailable',
			requiresStepUp: false
		});
	});

	it('fails closed when a caller omits suspended-user facts', () => {
		const decision = checkSensitiveAction({
			action: 'platform.accessRequest.approve',
			now,
			actor: {
				userId: 'admin-1',
				sessionStartedAt: '2026-05-22T11:59:00.000Z',
				currentAssuranceLevel: 'aal2',
				nextAssuranceLevel: 'aal2'
			}
		});

		expect(decision).toMatchObject({
			allowed: false,
			reason: 'denied.suspensionStatusUnavailable',
			requiresStepUp: false
		});
	});

	it('returns structured audit details without secrets', () => {
		const decision = checkSensitiveAction({
			action: 'platform.accessRequest.approve',
			now,
			actor: {
				userId: 'admin-1',
				sessionStartedAt: '2026-05-22T11:00:00.000Z',
				currentAssuranceLevel: 'aal1',
				nextAssuranceLevel: 'aal2',
				isSuspended: false
			},
			target: { type: 'access_request', id: 'request-1' }
		});

		expect(sensitiveActionDecisionAuditDetails(decision)).toEqual({
			action: 'platform.accessRequest.approve',
			actorUserId: 'admin-1',
			target: { type: 'access_request', id: 'request-1' },
			reason: 'denied.staleSession',
			currentAssuranceLevel: 'aal1',
			nextAssuranceLevel: 'aal2',
			sessionAgeMs: 60 * 60 * 1000,
			recentSessionWindowMs: 15 * 60 * 1000,
			requiresStepUp: true
		});
	});

	it('throws structured step-up failure details for form and JSON callers', () => {
		const decision = checkSensitiveAction({
			action: 'organization.transferOwnership',
			now,
			actor: {
				userId: 'owner-1',
				sessionStartedAt: '2026-05-22T11:00:00.000Z',
				currentAssuranceLevel: 'aal1',
				nextAssuranceLevel: 'aal2',
				isSuspended: false
			},
			target: { type: 'organization', id: 'org-1' }
		});

		expect(() => throwSensitiveActionFailure(decision)).toThrow(
			expect.objectContaining({
				message: 'Please confirm your identity before continuing. Sign in again or complete MFA, then try again.',
				status: 403,
				reason: 'denied.staleSession',
				requiresStepUp: true,
				stepUpPath: '/auth/mfa-verify'
			})
		);
	});

	it('assigns sensitive-action failure details onto an existing error', () => {
		const decision = checkSensitiveAction({
			action: 'organization.transferOwnership',
			now,
			actor: {
				userId: 'owner-1',
				sessionStartedAt: '2026-05-22T11:00:00.000Z',
				currentAssuranceLevel: 'aal1',
				nextAssuranceLevel: 'aal1',
				isSuspended: false
			}
		});

		const error = assignSensitiveActionFailureDetails(new Error('Denied'), decision);

		expect(error).toMatchObject({
			message: 'Denied',
			status: 403,
			reason: 'denied.staleSession',
			requiresStepUp: true,
			stepUpPath: '/auth/login'
		});
	});
});

describe('createSensitiveActionAuthorizer', () => {
	it('loads actor facts and evaluates the requested action', async () => {
		const loadActorFacts = vi.fn().mockResolvedValue({
			userId: 'admin-1',
			sessionStartedAt: '2026-05-22T11:59:00.000Z',
			currentAssuranceLevel: 'aal1',
			nextAssuranceLevel: 'aal1',
			isSuspended: false
		});
		const authorizer = createSensitiveActionAuthorizer({
			loadActorFacts,
			now: () => now
		});

		await expect(
			authorizer.authorize({
				action: 'platform.accessRequest.approve',
				actorUserId: 'admin-1',
				target: { type: 'access_request', id: 'request-1' }
			})
		).resolves.toMatchObject({ allowed: true, reason: 'allowed.recentSession' });
		expect(loadActorFacts).toHaveBeenCalledWith('admin-1');
	});
});

describe('createSupabaseSensitiveActionAuthorizer', () => {
	describe.each(['recent session', 'MFA assurance'])('suspension admission with %s', (grant) => {
		function makeAuthorizer(rpc: ReturnType<typeof vi.fn>) {
			return createSupabaseSensitiveActionAuthorizer({
				authenticatedUserId: 'admin-1',
				supabase: {
					auth: {
						mfa: {
							getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
								data: {
									currentLevel: grant === 'MFA assurance' ? 'aal2' : 'aal1',
									nextLevel: grant === 'MFA assurance' ? 'aal2' : 'aal1',
									currentAuthenticationMethods: [{ method: 'password', timestamp: 1779451140 }]
								},
								error: null
							})
						}
					},
					rpc
				} as never,
				session: {
					access_token: 'verified-request-token',
					expires_at: 1779454800,
					user: {
						id: 'admin-1',
						last_sign_in_at: grant === 'MFA assurance' ? '2026-05-22T10:00:00Z' : '2026-05-22T11:59:00Z'
					}
				} as never,
				now: () => now
			});
		}

		const request = { action: 'platform.accessRequest.approve' as const, actorUserId: 'admin-1' };

		it.each([
			['missing response', undefined],
			['null response', null],
			['empty response', {}],
			['missing status', { data: false }],
			['missing data', { error: null }],
			['null data', { data: null, error: null }],
			['numeric data', { data: 0, error: null }],
			['empty text', { data: '', error: null }],
			['boolean text', { data: 'false', error: null }],
			['row object', { data: { is_suspended: false }, error: null }],
			['row array', { data: [false], error: null }],
			['error with allowed data', { data: false, error: { message: 'private provider failure' } }],
			['error with suspended data', { data: true, error: { message: 'private provider failure' } }]
		])('denies unavailable suspension for %s', async (_label, response) => {
			const authorizer = makeAuthorizer(vi.fn().mockResolvedValue(response));
			const decision = await authorizer.authorize(request);
			expect(decision).toMatchObject({
				allowed: false,
				reason: 'denied.suspensionStatusUnavailable',
				requiresStepUp: false
			});
			expect(sensitiveActionStepUpPath(decision)).toBeNull();
			expect(JSON.stringify(decision)).not.toContain('private provider failure');
		});

		it('returns unavailable denial when the suspension provider throws', async () => {
			const authorizer = makeAuthorizer(vi.fn().mockRejectedValue(new Error('private provider failure')));
			await expect(authorizer.authorize(request)).resolves.toMatchObject({
				allowed: false,
				reason: 'denied.suspensionStatusUnavailable',
				requiresStepUp: false
			});
		});

		it('rechecks suspension on retry and never reuses a previous allow', async () => {
			const rpc = vi
				.fn()
				.mockResolvedValueOnce({ data: null, error: null })
				.mockResolvedValueOnce({ data: false, error: null })
				.mockResolvedValueOnce({ data: true, error: null })
				.mockResolvedValueOnce({ data: false, error: null });
			const authorizer = makeAuthorizer(rpc);
			await expect(authorizer.authorize(request)).resolves.toMatchObject({
				allowed: false,
				reason: 'denied.suspensionStatusUnavailable'
			});
			await expect(authorizer.authorize(request)).resolves.toMatchObject({ allowed: true });
			await expect(authorizer.authorize(request)).resolves.toMatchObject({
				allowed: false,
				reason: 'denied.suspendedUser',
				requiresStepUp: false
			});
			await expect(authorizer.authorize(request)).resolves.toMatchObject({ allowed: true });
			expect(rpc).toHaveBeenCalledWith('is_user_suspended', { check_user_id: 'admin-1' });
		});
	});

	it('reads Supabase MFA assurance and suspension state for the actor', async () => {
		const supabase = {
			auth: {
				mfa: {
					getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
						data: { currentLevel: 'aal2', nextLevel: 'aal2' },
						error: null
					})
				}
			},
			rpc: vi.fn().mockResolvedValue({ data: false, error: null })
		};
		const authorizer = createSupabaseSensitiveActionAuthorizer({
			authenticatedUserId: 'admin-1',
			supabase: supabase as never,
			session: {
				access_token: 'verified-request-token',
				expires_at: 1779454800,
				user: { id: 'admin-1', last_sign_in_at: '2026-05-22T10:00:00.000Z' }
			} as never,
			now: () => now
		});

		await expect(
			authorizer.authorize({
				action: 'platform.accessRequest.resendSetup',
				actorUserId: 'admin-1'
			})
		).resolves.toMatchObject({ allowed: true, reason: 'allowed.mfaAssurance' });
		expect(supabase.rpc).toHaveBeenCalledWith('is_user_suspended', { check_user_id: 'admin-1' });
	});
});

describe('verified sensitive-action session admission', () => {
	const session = () =>
		({
			access_token: 'verified-request-token',
			expires_at: 1779454800,
			user: { id: 'owner-1', last_sign_in_at: '2026-05-22T11:59:00Z' }
		}) as Session;
	const request = { action: 'organization.deleteOrganization' as const, actorUserId: 'owner-1' };
	function fixture(
		overrides: { session?: Session | null; authenticatedUserId?: string | null; result?: unknown } = {}
	) {
		const getAssurance = vi.fn().mockResolvedValue(
			'result' in overrides
				? overrides.result
				: {
						data: {
							currentLevel: 'aal1',
							nextLevel: 'aal1',
							currentAuthenticationMethods: [{ method: 'password', timestamp: 1779451140 }]
						},
						error: null
					}
		);
		const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
		let clock = now;
		const authorizer = createSupabaseSensitiveActionAuthorizer({
			supabase: { auth: { mfa: { getAuthenticatorAssuranceLevel: getAssurance } }, rpc } as never,
			session: 'session' in overrides ? overrides.session! : session(),
			authenticatedUserId: 'authenticatedUserId' in overrides ? overrides.authenticatedUserId! : 'owner-1',
			now: () => clock
		});
		return {
			authorizer,
			getAssurance,
			rpc,
			setTime: (value: Date) => {
				clock = value;
			}
		};
	}
	it.each([
		['missing session', null],
		['different session actor', { ...session(), user: { ...session().user, id: 'other-actor' } }],
		['missing expiry', { ...session(), expires_at: undefined }],
		['expired at boundary', { ...session(), expires_at: 1779451200 }],
		['invalid expiry', { ...session(), expires_at: NaN }],
		['missing token', { ...session(), access_token: '' }]
	])('denies %s before provider access', async (_label, value) => {
		const h = fixture({ session: value as Session | null });
		await expect(h.authorizer.authorize(request)).resolves.toMatchObject({
			allowed: false,
			reason: 'denied.unauthenticated'
		});
		expect(h.getAssurance).not.toHaveBeenCalled();
		expect(h.rpc).not.toHaveBeenCalled();
	});
	it.each([null, 'different-verified-user'])(
		'requires the verified request identity %s',
		async (authenticatedUserId) => {
			const h = fixture({ authenticatedUserId });
			await expect(h.authorizer.authorize(request)).resolves.toMatchObject({
				allowed: false,
				reason: 'denied.unauthenticated'
			});
			expect(h.getAssurance).not.toHaveBeenCalled();
		}
	);
	it('does not lend a verified session to another requested actor', async () => {
		const h = fixture();
		await expect(h.authorizer.authorize({ ...request, actorUserId: 'other-actor' })).resolves.toMatchObject({
			allowed: false,
			reason: 'denied.unauthenticated'
		});
		expect(h.rpc).not.toHaveBeenCalled();
	});
	it.each([
		['missing result', undefined],
		['null result', null],
		['missing status', { data: { currentLevel: 'aal2', nextLevel: 'aal2' } }],
		[
			'provider error with data',
			{ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: { message: 'private failure' } }
		],
		['missing data', { data: null, error: null }],
		['missing current', { data: { nextLevel: 'aal2' }, error: null }],
		['missing next', { data: { currentLevel: 'aal2' }, error: null }],
		['unknown level', { data: { currentLevel: 'aal3', nextLevel: 'aal2' }, error: null }]
	])('denies %s even with recent account sign-in', async (_label, result) => {
		const h = fixture({ result });
		const decision = await h.authorizer.authorize(request);
		expect(decision).toMatchObject({ allowed: false, reason: 'denied.assuranceUnavailable', requiresStepUp: false });
		expect(sensitiveActionStepUpPath(decision)).toBeNull();
		expect(JSON.stringify(decision)).not.toContain('private failure');
	});
	it('denies thrown assurance lookup and retries without caching the failure', async () => {
		const h = fixture();
		h.getAssurance.mockRejectedValueOnce(new Error('private failure'));
		await expect(h.authorizer.authorize(request)).resolves.toMatchObject({
			allowed: false,
			reason: 'denied.assuranceUnavailable'
		});
		await expect(h.authorizer.authorize(request)).resolves.toMatchObject({ allowed: true });
		expect(h.getAssurance).toHaveBeenLastCalledWith('verified-request-token');
	});
	it.each([
		['exact 15-minute boundary', 1779450300, true],
		['one second too old', 1779450299, false],
		['future authentication', 1779451201, false],
		['missing authentication', null, false]
	])('uses token authentication time: %s', async (_label, timestamp, allowed) => {
		const h = fixture({
			result: {
				data: {
					currentLevel: 'aal1',
					nextLevel: 'aal1',
					currentAuthenticationMethods: timestamp === null ? [] : [{ method: 'password', timestamp }]
				},
				error: null
			}
		});
		await expect(h.authorizer.authorize(request)).resolves.toMatchObject({ allowed });
	});
	it.each([
		undefined,
		null,
		{},
		[null],
		[{ method: 'password', timestamp: '1779451140' }],
		[{ method: '', timestamp: 1779451140 }],
		[{ method: 'password', timestamp: 1779451140.5 }]
	])(
		'never substitutes account sign-in time for malformed token authentication methods %j',
		async (currentAuthenticationMethods) => {
			const h = fixture({
				result: { data: { currentLevel: 'aal1', nextLevel: 'aal1', currentAuthenticationMethods }, error: null }
			});
			await expect(h.authorizer.authorize(request)).resolves.toMatchObject({
				allowed: false,
				reason: 'denied.staleSession'
			});
		}
	);
	it('requires MFA completion even when the current password authentication is recent', async () => {
		const h = fixture({
			result: {
				data: {
					currentLevel: 'aal1',
					nextLevel: 'aal2',
					currentAuthenticationMethods: [{ method: 'password', timestamp: 1779451140 }]
				},
				error: null
			}
		});
		const decision = await h.authorizer.authorize(request);
		expect(decision).toMatchObject({ allowed: false, requiresStepUp: true });
		expect(sensitiveActionStepUpPath(decision)).toBe('/auth/mfa-verify');
	});
	it('allows current MFA for a stale but unexpired session and denies its later expiry', async () => {
		const h = fixture({
			result: { data: { currentLevel: 'aal2', nextLevel: 'aal2', currentAuthenticationMethods: [] }, error: null }
		});
		await expect(h.authorizer.authorize(request)).resolves.toMatchObject({
			allowed: true,
			reason: 'allowed.mfaAssurance'
		});
		h.setTime(new Date('2026-05-22T13:00:00Z'));
		await expect(h.authorizer.authorize(request)).resolves.toMatchObject({
			allowed: false,
			reason: 'denied.unauthenticated'
		});
	});
	it('denies a session that expires while provider facts are loading', async () => {
		const h = fixture();
		h.rpc.mockImplementation(async () => {
			h.setTime(new Date('2026-05-22T13:00:00Z'));
			return { data: false, error: null };
		});
		await expect(h.authorizer.authorize(request)).resolves.toMatchObject({
			allowed: false,
			reason: 'denied.unauthenticated'
		});
	});
});
