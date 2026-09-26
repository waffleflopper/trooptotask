import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountSetupLinkAccessRequest, AccountSetupLinkRecord } from './accountSetupLinks.server';
import {
	AccountSetupPasswordRejectedError,
	createAccountSetupCompletionService,
	type AccountSetupAuthAdapter,
	type AccountSetupCompletionStore
} from './accountSetupCompletion.server';
import { createAccountSetupLinkService } from './accountSetupLinks.server';
import { createSupabaseAccountSetupAuthAdapter } from './accountSetupCompletionSupabase.server';
import { createAccountSetupRouteFlow } from './accountSetupRouteFlow.server';
import { PASSWORD_PROVIDER_REJECTION_MESSAGE } from './passwordPolicy';

function makeStore(accessRequest: AccountSetupLinkAccessRequest): AccountSetupCompletionStore & {
	links: AccountSetupLinkRecord[];
	completions: Array<{ accessRequestId: string; userId: string }>;
	profiles: Array<{ userId: string; firstName: string; lastName: string }>;
	failCompletion?: boolean;
	failProfile?: boolean;
	failMarkCompleted?: boolean;
	failMarkFailed?: boolean;
	revokeBeforeMarkUsed?: boolean;
	onClaim?: () => void;
} {
	const links: AccountSetupLinkRecord[] = [];
	const completions: Array<{ accessRequestId: string; userId: string }> = [];
	const profiles: Array<{ userId: string; firstName: string; lastName: string }> = [];

	return {
		links,
		completions,
		profiles,
		async getAccessRequest(id) {
			return id === accessRequest.id ? accessRequest : null;
		},
		async revokeUnusedLinksForAccessRequest(accessRequestId, revokedAt) {
			const revoked: AccountSetupLinkRecord[] = [];
			for (const link of links) {
				if (link.accessRequestId === accessRequestId && !link.usedAt && !link.revokedAt) {
					link.revokedAt = revokedAt;
					link.revocationReason = 'replaced';
					revoked.push(link);
				}
			}
			return revoked;
		},
		async insertSetupLink(input) {
			const link: AccountSetupLinkRecord = {
				id: `link-${links.length + 1}`,
				accessRequestId: input.accessRequestId,
				tokenHash: input.tokenHash,
				expiresAt: input.expiresAt,
				createdAt: input.createdAt,
				claimedAt: null,
				failedAt: null,
				failureReason: null,
				usedAt: null,
				revokedAt: null,
				revocationReason: null
			};
			links.push(link);
			return link;
		},
		async findByTokenHash(tokenHash) {
			return links.find((link) => link.tokenHash === tokenHash) ?? null;
		},
		async getSetupLink(id) {
			return links.find((link) => link.id === id) ?? null;
		},
		async claimSetupLinkForSession(input) {
			const link = links.find((candidate) => candidate.id === input.setupLinkId);
			if (!link || link.accessRequestId !== input.accessRequestId) {
				return { status: 'missing' };
			}
			// This fake prioritizes access-request outcomes for focused service tests; the database RPC owns exact status ordering.
			if (accessRequest.setupCompletedAt) return { status: 'access-request-completed' };
			if (accessRequest.status !== 'approved') return { status: 'access-request-not-approved' };
			if (link.usedAt) return { status: 'used' };
			if (link.failedAt) return { status: 'failed' };
			if (link.claimedAt) return { status: 'claimed' };
			if (link.revokedAt) return { status: link.revocationReason === 'replaced' ? 'replaced' : 'revoked' };
			if (link.expiresAt <= input.claimedAt) return { status: 'expired' };
			link.claimedAt = input.claimedAt;
			this.onClaim?.();
			return { status: 'claim-started', accessRequestId: link.accessRequestId, link };
		},
		async markCompleted(id, completedAt) {
			if (this.failMarkCompleted) {
				throw new Error('link completion write failed');
			}
			const link = links.find((candidate) => candidate.id === id);
			if (this.revokeBeforeMarkUsed && link && !link.usedAt && !link.revokedAt) {
				link.revokedAt = completedAt;
				link.revocationReason = 'manual';
			}
			if (!link || !link.claimedAt || link.failedAt || link.usedAt || link.revokedAt) return null;
			link.usedAt = completedAt;
			return link;
		},
		async markFailed(id, failedAt, failureReason) {
			if (this.failMarkFailed) {
				throw new Error('failed-state write failed');
			}
			const link = links.find((candidate) => candidate.id === id);
			if (!link || !link.claimedAt || link.failedAt || link.usedAt || link.revokedAt) return null;
			link.failedAt = failedAt;
			link.failureReason = failureReason;
			return link;
		},
		async listCleanupEligible() {
			return [];
		},
		async revokeExpiredUnusedLinks() {
			return [];
		},
		async countActiveLinks() {
			return 0;
		},
		async markAccessRequestSetupCompleted(accessRequestId, userId) {
			if (this.failCompletion) {
				throw new Error('completion write failed');
			}
			completions.push({ accessRequestId, userId });
		},
		async upsertUserProfile(input) {
			if (this.failProfile) {
				throw new Error('profile write failed');
			}
			profiles.push(input);
		}
	};
}

function makeAuth(overrides: Partial<AccountSetupAuthAdapter> = {}): AccountSetupAuthAdapter {
	return {
		createOrActivateConfirmedUser: vi.fn().mockResolvedValue({ userId: 'user-123' }),
		signInWithPassword: vi.fn().mockResolvedValue(undefined),
		...overrides
	};
}

async function addSetupToken(store: AccountSetupCompletionStore, rawToken = 'setup-token') {
	const setupLinks = createAccountSetupLinkService(store, {
		now: () => new Date('2026-05-18T12:00:00.000Z'),
		generateToken: () => rawToken
	});
	await setupLinks.createForAccessRequest('request-1');
}

const approvedRequest: AccountSetupLinkAccessRequest = {
	id: 'request-1',
	email: 'Person@Example.com',
	name: 'Person Example',
	firstName: 'Person',
	lastName: 'Example',
	status: 'approved',
	setupCompletedAt: null
};

describe('Account Setup completion', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-05-18T12:00:00.000Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('creates a confirmed User Account, consumes the setup link, marks completion, and signs in', async () => {
		const store = makeStore(approvedRequest);
		await addSetupToken(store);
		const auth = makeAuth();
		const service = createAccountSetupCompletionService(store, auth);

		const result = await service.completeSetupSession({
			setupLinkId: 'link-1',
			accessRequestId: 'request-1',
			password: 'ValidPassword123!'
		});

		expect(result).toEqual({ status: 'completed', accessRequestId: 'request-1', userId: 'user-123' });
		expect(auth.createOrActivateConfirmedUser).toHaveBeenCalledWith({
			email: 'person@example.com',
			password: 'ValidPassword123!'
		});
		expect(auth.signInWithPassword).toHaveBeenCalledWith({
			email: 'person@example.com',
			password: 'ValidPassword123!'
		});
		expect(store.profiles).toEqual([{ userId: 'user-123', firstName: 'Person', lastName: 'Example' }]);
		expect(store.links[0].usedAt).toBeInstanceOf(Date);
		expect(store.completions).toEqual([{ accessRequestId: 'request-1', userId: 'user-123' }]);
	});

	it('allows only one in-flight completion of the same setup link and rejects replay', async () => {
		const store = makeStore({ ...approvedRequest });
		await addSetupToken(store);
		const started = Promise.withResolvers<void>();
		const release = Promise.withResolvers<{ userId: string }>();
		const auth = makeAuth({
			createOrActivateConfirmedUser: vi.fn(() => {
				started.resolve();
				return release.promise;
			})
		});
		const service = createAccountSetupCompletionService(store, auth);
		const input = { setupLinkId: 'link-1', accessRequestId: 'request-1', password: 'WinnerPassword123!' };
		const winner = service.completeSetupSession(input);
		await started.promise;
		try {
			expect(await service.completeSetupSession({ ...input, password: 'LosingPassword123!' })).toEqual({
				status: 'claimed'
			});
			expect(store.completions).toEqual([]);
			expect(auth.signInWithPassword).not.toHaveBeenCalled();
		} finally {
			release.resolve({ userId: 'user-123' });
		}
		expect(await winner).toEqual({ status: 'completed', accessRequestId: 'request-1', userId: 'user-123' });
		expect(await service.completeSetupSession(input)).toEqual({ status: 'used' });
		expect(auth.createOrActivateConfirmedUser).toHaveBeenCalledExactlyOnceWith({
			email: 'person@example.com',
			password: 'WinnerPassword123!'
		});
		expect(auth.signInWithPassword).toHaveBeenCalledExactlyOnceWith({
			email: 'person@example.com',
			password: 'WinnerPassword123!'
		});
		expect(store.completions).toEqual([{ accessRequestId: 'request-1', userId: 'user-123' }]);
	});

	it('invalidates an exchanged setup session when a fresh link replaces its credential', async () => {
		const store = makeStore({ ...approvedRequest });
		await addSetupToken(store, 'older-token');
		await addSetupToken(store, 'newer-token');
		const auth = makeAuth();
		const service = createAccountSetupCompletionService(store, auth);
		expect(
			await service.completeSetupSession({
				setupLinkId: 'link-1',
				accessRequestId: 'request-1',
				password: 'OlderPassword123!'
			})
		).toEqual({ status: 'replaced' });
		expect(auth.createOrActivateConfirmedUser).not.toHaveBeenCalled();
		expect(
			await service.completeSetupSession({
				setupLinkId: 'link-2',
				accessRequestId: 'request-1',
				password: 'NewerPassword123!'
			})
		).toMatchObject({ status: 'completed', userId: 'user-123' });
		expect(store.links[0].usedAt).toBeNull();
		expect(store.links[1].usedAt).toEqual(new Date('2026-05-18T12:00:00.000Z'));
		expect(auth.createOrActivateConfirmedUser).toHaveBeenCalledExactlyOnceWith({
			email: 'person@example.com',
			password: 'NewerPassword123!'
		});
	});

	it('rejects the setup session at the exact fourteen-day link expiry without account effects', async () => {
		const store = makeStore({ ...approvedRequest });
		await addSetupToken(store);
		vi.setSystemTime(new Date('2026-06-01T12:00:00.000Z'));
		const auth = makeAuth();
		expect(
			await createAccountSetupCompletionService(store, auth).completeSetupSession({
				setupLinkId: 'link-1',
				accessRequestId: 'request-1',
				password: 'ValidPassword123!'
			})
		).toEqual({ status: 'expired' });
		expect(auth.createOrActivateConfirmedUser).not.toHaveBeenCalled();
		expect(auth.signInWithPassword).not.toHaveBeenCalled();
		expect(store.profiles).toEqual([]);
		expect(store.completions).toEqual([]);
		expect(store.links[0].claimedAt).toBeNull();
	});

	it('falls back to a legacy full-name split for older Access Requests without structured names', async () => {
		const store = makeStore({
			...approvedRequest,
			name: 'Legacy Requester',
			firstName: null,
			lastName: null
		});
		await addSetupToken(store);
		const service = createAccountSetupCompletionService(store, makeAuth());

		await service.completeSetupSession({
			setupLinkId: 'link-1',
			accessRequestId: 'request-1',
			password: 'ValidPassword123!'
		});

		expect(store.profiles).toEqual([{ userId: 'user-123', firstName: 'Legacy', lastName: 'Requester' }]);
	});

	it('does not sign in when a setup link is revoked after completion is recorded', async () => {
		const store = makeStore(approvedRequest);
		store.revokeBeforeMarkUsed = true;
		await addSetupToken(store);
		const auth = makeAuth();
		const service = createAccountSetupCompletionService(store, auth);

		const result = await service.completeSetupSession({
			setupLinkId: 'link-1',
			accessRequestId: 'request-1',
			password: 'ValidPassword123!'
		});

		expect(result).toEqual({
			status: 'setup-finalization-failed',
			message:
				'Account setup could not finish after the password step. Contact platform support before using another setup link.'
		});
		expect(auth.signInWithPassword).not.toHaveBeenCalled();
		expect(store.completions).toEqual([{ accessRequestId: 'request-1', userId: 'user-123' }]);
	});

	it('returns missing-link state without creating a User Account', async () => {
		const store = makeStore(approvedRequest);
		const auth = makeAuth();
		const service = createAccountSetupCompletionService(store, auth);

		await expect(
			service.completeSetupSession({
				setupLinkId: 'missing-link',
				accessRequestId: 'request-1',
				password: 'ValidPassword123!'
			})
		).resolves.toEqual({
			status: 'missing'
		});
		expect(auth.createOrActivateConfirmedUser).not.toHaveBeenCalled();
	});

	it('does not create another setup path for completed Access Requests', async () => {
		const request = { ...approvedRequest };
		const store = makeStore(request);
		await addSetupToken(store);
		request.setupCompletedAt = '2026-05-18T13:00:00.000Z';
		const auth = makeAuth();
		const service = createAccountSetupCompletionService(store, auth);

		await expect(
			service.completeSetupSession({
				setupLinkId: 'link-1',
				accessRequestId: 'request-1',
				password: 'ValidPassword123!'
			})
		).resolves.toEqual({
			status: 'access-request-completed'
		});
		expect(auth.createOrActivateConfirmedUser).not.toHaveBeenCalled();
	});

	it.each(['Supabase unavailable', 'Password should be at least 12 characters'])(
		'holds the setup claim when the provider outcome is unknown: %s',
		async (providerMessage) => {
			const store = makeStore(approvedRequest);
			await addSetupToken(store);
			const auth = makeAuth({
				createOrActivateConfirmedUser: vi.fn().mockRejectedValue(new Error(providerMessage))
			});
			const service = createAccountSetupCompletionService(store, auth);

			const result = await service.completeSetupSession({
				setupLinkId: 'link-1',
				accessRequestId: 'request-1',
				password: 'ValidPassword123!'
			});

			expect(result).toEqual({ status: 'setup-support-required' });
			expect(store.links[0].claimedAt).toBeInstanceOf(Date);
			expect(store.links[0].failedAt).toBeNull();
			expect(store.links[0].failureReason).toBeNull();
			expect(store.links[0].usedAt).toBeNull();
		}
	);

	it('explains a provider password rejection and completes a fresh setup with a different password', async () => {
		const store = makeStore(approvedRequest);
		await addSetupToken(store);
		const createUser = vi
			.fn()
			.mockResolvedValueOnce({
				data: { user: null },
				error: {
					code: 'weak_password',
					message: 'Password has appeared in a data breach.',
					status: 422
				}
			})
			.mockResolvedValueOnce({ data: { user: { id: 'user-123' } }, error: null });
		const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
		const auth = createSupabaseAccountSetupAuthAdapter(
			{
				auth: { admin: { createUser } },
				from: () => ({ upsert: async () => ({ error: null }) })
			} as never,
			{ auth: { signInWithPassword } } as never
		);
		const service = createAccountSetupCompletionService(store, auth);
		const flow = createAccountSetupRouteFlow({
			store: () => store,
			setupLinks: () => createAccountSetupLinkService(store),
			completion: () => service,
			checkCompletionRateLimit: vi.fn().mockResolvedValue({ limited: false }),
			audit: vi.fn()
		});
		const input = {
			setupSession: { setupLinkId: 'link-1', accessRequestId: 'request-1', expiresAt: Date.now() + 600000 },
			password: 'SyntheticPassword123!',
			confirmPassword: 'SyntheticPassword123!',
			clientIp: '192.0.2.1',
			userAgent: 'test'
		};

		expect(await flow.completeSetup(input)).toMatchObject({
			type: 'failure',
			status: 400,
			error: expect.stringContaining(PASSWORD_PROVIDER_REJECTION_MESSAGE)
		});
		expect(store.completions).toEqual([]);
		expect(signInWithPassword).not.toHaveBeenCalled();
		expect(store.links[0].failedAt).toBeInstanceOf(Date);
		expect(await flow.completeSetup(input)).toMatchObject({ type: 'failure' });
		expect(createUser).toHaveBeenCalledTimes(1);

		await addSetupToken(store, 'fresh-setup-token');
		expect(
			await flow.completeSetup({
				...input,
				setupSession: { ...input.setupSession, setupLinkId: 'link-2' },
				password: 'DifferentSynthetic456!',
				confirmPassword: 'DifferentSynthetic456!'
			})
		).toEqual({ type: 'redirect', path: '/dashboard', clearSession: true });
		expect(store.completions).toEqual([{ accessRequestId: 'request-1', userId: 'user-123' }]);
		expect(store.links[1].usedAt).toBeInstanceOf(Date);
		expect(signInWithPassword).toHaveBeenCalledWith({
			email: 'person@example.com',
			password: 'DifferentSynthetic456!'
		});
	});

	it('marks the claimed setup link failed when approval is withdrawn after claim starts', async () => {
		const request = { ...approvedRequest };
		const store = makeStore(request);
		store.onClaim = () => {
			request.status = 'rejected';
		};
		await addSetupToken(store);
		const auth = makeAuth();
		const service = createAccountSetupCompletionService(store, auth);

		const result = await service.completeSetupSession({
			setupLinkId: 'link-1',
			accessRequestId: 'request-1',
			password: 'ValidPassword123!'
		});

		expect(result).toEqual({ status: 'access-request-not-approved' });
		expect(store.links[0].claimedAt).toBeInstanceOf(Date);
		expect(store.links[0].failedAt).toBeInstanceOf(Date);
		expect(store.links[0].failureReason).toBe('access-request-not-approved');
		expect(auth.createOrActivateConfirmedUser).not.toHaveBeenCalled();
		expect(store.completions).toEqual([]);
	});

	it('keeps the claim held when the Access Request cannot be read after claiming', async () => {
		const store = makeStore(approvedRequest);
		await addSetupToken(store);
		store.getAccessRequest = vi.fn().mockRejectedValue(new Error('Access Request read unavailable'));
		const auth = makeAuth();
		const service = createAccountSetupCompletionService(store, auth);

		await expect(
			service.completeSetupSession({
				setupLinkId: 'link-1',
				accessRequestId: 'request-1',
				password: 'ValidPassword123!'
			})
		).resolves.toEqual({ status: 'setup-support-required' });
		expect(store.links[0].claimedAt).toBeInstanceOf(Date);
		expect(store.links[0].failedAt).toBeNull();
		expect(auth.createOrActivateConfirmedUser).not.toHaveBeenCalled();
	});

	it('keeps a rejected-password claim held when release persistence fails', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const store = makeStore(approvedRequest);
		store.failMarkFailed = true;
		await addSetupToken(store);
		const auth = makeAuth({
			createOrActivateConfirmedUser: vi.fn().mockRejectedValue(new AccountSetupPasswordRejectedError())
		});
		const service = createAccountSetupCompletionService(store, auth);

		const result = await service.completeSetupSession({
			setupLinkId: 'link-1',
			accessRequestId: 'request-1',
			password: 'ValidPassword123!'
		});

		expect(result).toEqual({ status: 'setup-support-required' });
		expect(store.links[0].claimedAt).toBeInstanceOf(Date);
		expect(store.links[0].failedAt).toBeNull();
		expect(store.links[0].usedAt).toBeNull();
		expect(consoleError).toHaveBeenCalledWith(
			'Failed to mark Account Setup Link failure state:',
			expect.objectContaining({ setupLinkId: 'link-1', failureReason: 'account-create-failed' })
		);
		consoleError.mockRestore();
	});

	it('keeps the claim held when profile setup fails after Auth', async () => {
		const store = makeStore(approvedRequest);
		store.failProfile = true;
		await addSetupToken(store);
		const auth = makeAuth();
		const service = createAccountSetupCompletionService(store, auth);

		const result = await service.completeSetupSession({
			setupLinkId: 'link-1',
			accessRequestId: 'request-1',
			password: 'ValidPassword123!'
		});

		expect(result).toEqual({
			status: 'setup-finalization-failed',
			message:
				'Account setup could not finish after the password step. Contact platform support before using another setup link.'
		});
		expect(auth.signInWithPassword).not.toHaveBeenCalled();
		expect(store.links[0].claimedAt).toBeInstanceOf(Date);
		expect(store.links[0].failedAt).toBeNull();
		expect(store.links[0].failureReason).toBeNull();
		expect(store.links[0].usedAt).toBeNull();
		expect(store.completions).toEqual([]);
	});

	it('keeps the claim held when completion tracking fails after Auth', async () => {
		const store = makeStore(approvedRequest);
		store.failCompletion = true;
		await addSetupToken(store);
		const auth = makeAuth();
		const service = createAccountSetupCompletionService(store, auth);

		const result = await service.completeSetupSession({
			setupLinkId: 'link-1',
			accessRequestId: 'request-1',
			password: 'ValidPassword123!'
		});

		expect(result).toEqual({
			status: 'setup-finalization-failed',
			message:
				'Account setup could not finish after the password step. Contact platform support before using another setup link.'
		});
		expect(auth.signInWithPassword).not.toHaveBeenCalled();
		expect(store.links[0].claimedAt).toBeInstanceOf(Date);
		expect(store.links[0].failedAt).toBeNull();
		expect(store.links[0].failureReason).toBeNull();
		expect(store.links[0].usedAt).toBeNull();
	});

	it('keeps the claim held when link completion cannot be recorded', async () => {
		const store = makeStore(approvedRequest);
		store.failMarkCompleted = true;
		await addSetupToken(store);
		const auth = makeAuth();
		const service = createAccountSetupCompletionService(store, auth);

		const result = await service.completeSetupSession({
			setupLinkId: 'link-1',
			accessRequestId: 'request-1',
			password: 'ValidPassword123!'
		});

		expect(result).toEqual({
			status: 'setup-finalization-failed',
			message:
				'Account setup could not finish after the password step. Contact platform support before using another setup link.'
		});
		expect(auth.signInWithPassword).not.toHaveBeenCalled();
		expect(store.links[0].claimedAt).toBeInstanceOf(Date);
		expect(store.links[0].failedAt).toBeNull();
		expect(store.links[0].failureReason).toBeNull();
		expect(store.links[0].usedAt).toBeNull();
		expect(store.completions).toEqual([{ accessRequestId: 'request-1', userId: 'user-123' }]);
	});

	it('leaves completed setup durable when automatic sign-in fails and returns manual sign-in guidance', async () => {
		const store = makeStore(approvedRequest);
		await addSetupToken(store);
		const auth = makeAuth({
			signInWithPassword: vi.fn().mockRejectedValue(new Error('Invalid login credentials'))
		});
		const service = createAccountSetupCompletionService(store, auth);

		const result = await service.completeSetupSession({
			setupLinkId: 'link-1',
			accessRequestId: 'request-1',
			password: 'ValidPassword123!'
		});

		expect(result).toEqual({
			status: 'sign-in-failed',
			message: 'Invalid login credentials'
		});
		expect(store.links[0].usedAt).toBeInstanceOf(Date);
		expect(store.links[0].failedAt).toBeNull();
		expect(store.completions).toEqual([{ accessRequestId: 'request-1', userId: 'user-123' }]);
	});

	it('prevents a second completion attempt from mutating the User Account after the token is claimed', async () => {
		const store = makeStore(approvedRequest);
		await addSetupToken(store);
		const firstAuth = makeAuth();
		const secondAuth = makeAuth();
		const firstService = createAccountSetupCompletionService(store, firstAuth);
		const secondService = createAccountSetupCompletionService(store, secondAuth);

		const first = await firstService.completeSetupSession({
			setupLinkId: 'link-1',
			accessRequestId: 'request-1',
			password: 'ValidPassword123!'
		});
		const second = await secondService.completeSetupSession({
			setupLinkId: 'link-1',
			accessRequestId: 'request-1',
			password: 'DifferentPassword123!'
		});

		expect(first).toEqual({ status: 'completed', accessRequestId: 'request-1', userId: 'user-123' });
		expect(second).toEqual({ status: 'used' });
		expect(firstAuth.createOrActivateConfirmedUser).toHaveBeenCalledTimes(1);
		expect(secondAuth.createOrActivateConfirmedUser).not.toHaveBeenCalled();
		expect(store.completions).toEqual([{ accessRequestId: 'request-1', userId: 'user-123' }]);
	});

	describe('completeSetupSession', () => {
		it('claims a pending setup link by session scope and completes setup', async () => {
			const store = makeStore(approvedRequest);
			await addSetupToken(store);
			const auth = makeAuth();
			const service = createAccountSetupCompletionService(store, auth);

			const result = await service.completeSetupSession({
				setupLinkId: 'link-1',
				accessRequestId: 'request-1',
				password: 'ValidPassword123!'
			});

			expect(result).toEqual({ status: 'completed', accessRequestId: 'request-1', userId: 'user-123' });
			expect(auth.createOrActivateConfirmedUser).toHaveBeenCalledWith({
				email: 'person@example.com',
				password: 'ValidPassword123!'
			});
			expect(store.links[0].claimedAt).toBeInstanceOf(Date);
			expect(store.links[0].usedAt).toBeInstanceOf(Date);
			expect(store.completions).toEqual([{ accessRequestId: 'request-1', userId: 'user-123' }]);
		});

		it('uses the database-owned session claim before mutating the User Account', async () => {
			const store = makeStore(approvedRequest);
			await addSetupToken(store);
			const claimSpy = vi.spyOn(store, 'claimSetupLinkForSession');
			const auth = makeAuth();
			const service = createAccountSetupCompletionService(store, auth);

			const result = await service.completeSetupSession({
				setupLinkId: 'link-1',
				accessRequestId: 'request-1',
				password: 'ValidPassword123!'
			});

			expect(result.status).toBe('completed');
			expect(claimSpy).toHaveBeenCalledWith({
				setupLinkId: 'link-1',
				accessRequestId: 'request-1',
				claimedAt: expect.any(Date)
			});
		});

		it('does not mutate auth when the scoped setup link is already claimed', async () => {
			const store = makeStore(approvedRequest);
			await addSetupToken(store);
			store.links[0].claimedAt = new Date('2026-05-18T12:01:00.000Z');
			const auth = makeAuth();
			const service = createAccountSetupCompletionService(store, auth);

			const result = await service.completeSetupSession({
				setupLinkId: 'link-1',
				accessRequestId: 'request-1',
				password: 'ValidPassword123!'
			});

			expect(result).toEqual({ status: 'claimed' });
			expect(auth.createOrActivateConfirmedUser).not.toHaveBeenCalled();
			expect(store.completions).toEqual([]);
		});

		it('does not mutate auth when another link holds the email claim', async () => {
			const store = makeStore(approvedRequest);
			await addSetupToken(store);
			const claim = vi.spyOn(store, 'claimSetupLinkForSession').mockResolvedValue({ status: 'claim-in-progress' });
			const auth = makeAuth();
			const service = createAccountSetupCompletionService(store, auth);

			const result = await service.completeSetupSession({
				setupLinkId: 'link-1',
				accessRequestId: 'request-1',
				password: 'ValidPassword123!'
			});

			expect(result).toEqual({ status: 'claim-in-progress' });
			expect(claim).toHaveBeenCalledOnce();
			expect(auth.createOrActivateConfirmedUser).not.toHaveBeenCalled();
			expect(store.links[0].claimedAt).toBeNull();
		});

		it('reports expiration when the scoped setup link expires before submit', async () => {
			const store = makeStore(approvedRequest);
			await addSetupToken(store);
			store.links[0].expiresAt = new Date('2000-01-01T00:00:00.000Z');
			const auth = makeAuth();
			const service = createAccountSetupCompletionService(store, auth);

			const result = await service.completeSetupSession({
				setupLinkId: 'link-1',
				accessRequestId: 'request-1',
				password: 'ValidPassword123!'
			});

			expect(result).toEqual({ status: 'expired' });
			expect(auth.createOrActivateConfirmedUser).not.toHaveBeenCalled();
		});

		it('does not claim or mutate auth when the session Access Request is no longer approved', async () => {
			const request = { ...approvedRequest };
			const store = makeStore(request);
			await addSetupToken(store);
			request.status = 'rejected';
			const auth = makeAuth();
			const service = createAccountSetupCompletionService(store, auth);

			const result = await service.completeSetupSession({
				setupLinkId: 'link-1',
				accessRequestId: 'request-1',
				password: 'ValidPassword123!'
			});

			expect(result).toEqual({ status: 'access-request-not-approved' });
			expect(store.links[0].claimedAt).toBeNull();
			expect(auth.createOrActivateConfirmedUser).not.toHaveBeenCalled();
			expect(store.completions).toEqual([]);
		});

		it('does not claim or mutate auth when the session Access Request completed before submit', async () => {
			const request = { ...approvedRequest };
			const store = makeStore(request);
			await addSetupToken(store);
			request.setupCompletedAt = '2026-05-18T12:01:00.000Z';
			const auth = makeAuth();
			const service = createAccountSetupCompletionService(store, auth);

			const result = await service.completeSetupSession({
				setupLinkId: 'link-1',
				accessRequestId: 'request-1',
				password: 'ValidPassword123!'
			});

			expect(result).toEqual({ status: 'access-request-completed' });
			expect(store.links[0].claimedAt).toBeNull();
			expect(auth.createOrActivateConfirmedUser).not.toHaveBeenCalled();
		});

		it('returns fallback link states when the session claim cannot start', async () => {
			const store = makeStore(approvedRequest);
			await addSetupToken(store);
			const auth = makeAuth();
			const service = createAccountSetupCompletionService(store, auth);

			store.links[0].revokedAt = new Date('2026-05-18T12:01:00.000Z');
			store.links[0].revocationReason = 'replaced';

			const result = await service.completeSetupSession({
				setupLinkId: 'link-1',
				accessRequestId: 'request-1',
				password: 'ValidPassword123!'
			});

			expect(result).toEqual({ status: 'replaced' });
			expect(auth.createOrActivateConfirmedUser).not.toHaveBeenCalled();
		});

		it('fails a claimed link whose session access request scope does not match', async () => {
			const store = makeStore(approvedRequest);
			await addSetupToken(store);
			const auth = makeAuth();
			const service = createAccountSetupCompletionService(store, auth);

			const result = await service.completeSetupSession({
				setupLinkId: 'link-1',
				accessRequestId: 'other-request',
				password: 'ValidPassword123!'
			});

			expect(result).toEqual({ status: 'missing' });
			expect(auth.createOrActivateConfirmedUser).not.toHaveBeenCalled();
			expect(store.links[0].claimedAt).toBeNull();
			expect(store.links[0].failedAt).toBeNull();
			expect(store.links[0].failureReason).toBeNull();
		});
	});
});
