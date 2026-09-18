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
			action: 'billing.checkout',
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
				supabase: {
					auth: {
						mfa: {
							getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
								data: {
									currentLevel: grant === 'MFA assurance' ? 'aal2' : 'aal1',
									nextLevel: grant === 'MFA assurance' ? 'aal2' : 'aal1'
								},
								error: null
							})
						}
					},
					rpc
				} as never,
				session: {
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
			supabase: supabase as never,
			session: {
				user: { last_sign_in_at: '2026-05-22T10:00:00.000Z' }
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
