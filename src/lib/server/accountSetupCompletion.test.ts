import { describe, expect, it, vi } from 'vitest';
import type { AccountSetupLinkAccessRequest, AccountSetupLinkRecord } from './accountSetupLinks';
import {
	createAccountSetupCompletionService,
	type AccountSetupAuthAdapter,
	type AccountSetupCompletionStore
} from './accountSetupCompletion';
import { createAccountSetupLinkService } from './accountSetupLinks';

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
			for (const link of links) {
				if (link.accessRequestId === accessRequestId && !link.usedAt && !link.revokedAt) {
					link.revokedAt = revokedAt;
					link.revocationReason = 'replaced';
				}
			}
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
		async claimPendingLink(id, claimedAt) {
			this.onClaim?.();
			const link = links.find((candidate) => candidate.id === id);
			if (!link || link.claimedAt || link.failedAt || link.usedAt || link.revokedAt || link.expiresAt <= claimedAt) {
				return null;
			}
			link.claimedAt = claimedAt;
			return link;
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
	it('creates a confirmed User Account, consumes the setup link, marks completion, and signs in', async () => {
		const store = makeStore(approvedRequest);
		await addSetupToken(store);
		const auth = makeAuth();
		const service = createAccountSetupCompletionService(store, auth);

		const result = await service.complete({ rawToken: 'setup-token', password: 'ValidPassword123!' });

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

	it('falls back to a legacy full-name split for older Access Requests without structured names', async () => {
		const store = makeStore({
			...approvedRequest,
			name: 'Legacy Requester',
			firstName: null,
			lastName: null
		});
		await addSetupToken(store);
		const service = createAccountSetupCompletionService(store, makeAuth());

		await service.complete({ rawToken: 'setup-token', password: 'ValidPassword123!' });

		expect(store.profiles).toEqual([{ userId: 'user-123', firstName: 'Legacy', lastName: 'Requester' }]);
	});

	it('does not sign in when a setup link is revoked after completion is recorded', async () => {
		const store = makeStore(approvedRequest);
		store.revokeBeforeMarkUsed = true;
		await addSetupToken(store);
		const auth = makeAuth();
		const service = createAccountSetupCompletionService(store, auth);

		const result = await service.complete({ rawToken: 'setup-token', password: 'ValidPassword123!' });

		expect(result).toEqual({
			status: 'setup-finalization-failed',
			message:
				'Account setup could not finish after this link was claimed. Request a fresh setup link or ask an admin to resend setup.'
		});
		expect(auth.signInWithPassword).not.toHaveBeenCalled();
		expect(store.completions).toEqual([{ accessRequestId: 'request-1', userId: 'user-123' }]);
	});

	it('returns token-state outcomes without creating a User Account', async () => {
		const store = makeStore(approvedRequest);
		const auth = makeAuth();
		const service = createAccountSetupCompletionService(store, auth);

		await expect(service.complete({ rawToken: 'missing-token', password: 'ValidPassword123!' })).resolves.toEqual({
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

		await expect(service.complete({ rawToken: 'setup-token', password: 'ValidPassword123!' })).resolves.toEqual({
			status: 'access-request-completed'
		});
		expect(auth.createOrActivateConfirmedUser).not.toHaveBeenCalled();
	});

	it('claims the setup link before Supabase account creation and leaves the token unavailable when creation fails', async () => {
		const store = makeStore(approvedRequest);
		await addSetupToken(store);
		const auth = makeAuth({
			createOrActivateConfirmedUser: vi.fn().mockRejectedValue(new Error('Supabase unavailable'))
		});
		const service = createAccountSetupCompletionService(store, auth);

		const result = await service.complete({ rawToken: 'setup-token', password: 'ValidPassword123!' });

		expect(result).toEqual({ status: 'account-create-failed', message: 'Supabase unavailable' });
		expect(store.links[0].claimedAt).toBeInstanceOf(Date);
		expect(store.links[0].failedAt).toBeInstanceOf(Date);
		expect(store.links[0].failureReason).toBe('account-create-failed');
		expect(store.links[0].usedAt).toBeNull();
	});

	it('preserves the original account creation failure response when failure-state tracking also fails', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const store = makeStore(approvedRequest);
		store.failMarkFailed = true;
		await addSetupToken(store);
		const auth = makeAuth({
			createOrActivateConfirmedUser: vi.fn().mockRejectedValue(new Error('Supabase unavailable'))
		});
		const service = createAccountSetupCompletionService(store, auth);

		const result = await service.complete({ rawToken: 'setup-token', password: 'ValidPassword123!' });

		expect(result).toEqual({ status: 'account-create-failed', message: 'Supabase unavailable' });
		expect(store.links[0].claimedAt).toBeInstanceOf(Date);
		expect(store.links[0].failedAt).toBeNull();
		expect(store.links[0].usedAt).toBeNull();
		expect(consoleError).toHaveBeenCalledWith(
			'Failed to mark Account Setup Link failure state:',
			expect.objectContaining({ setupLinkId: 'link-1', failureReason: 'account-create-failed' })
		);
		consoleError.mockRestore();
	});

	it('marks the claimed setup link failed and returns recovery when profile setup fails', async () => {
		const store = makeStore(approvedRequest);
		store.failProfile = true;
		await addSetupToken(store);
		const auth = makeAuth();
		const service = createAccountSetupCompletionService(store, auth);

		const result = await service.complete({ rawToken: 'setup-token', password: 'ValidPassword123!' });

		expect(result).toEqual({
			status: 'setup-finalization-failed',
			message:
				'Account setup could not finish after this link was claimed. Request a fresh setup link or ask an admin to resend setup.'
		});
		expect(auth.signInWithPassword).not.toHaveBeenCalled();
		expect(store.links[0].claimedAt).toBeInstanceOf(Date);
		expect(store.links[0].failedAt).toBeInstanceOf(Date);
		expect(store.links[0].failureReason).toBe('completion-tracking-failed');
		expect(store.links[0].usedAt).toBeNull();
		expect(store.completions).toEqual([]);
	});

	it('marks the claimed setup link failed and returns recovery when completion tracking fails', async () => {
		const store = makeStore(approvedRequest);
		store.failCompletion = true;
		await addSetupToken(store);
		const auth = makeAuth();
		const service = createAccountSetupCompletionService(store, auth);

		const result = await service.complete({ rawToken: 'setup-token', password: 'ValidPassword123!' });

		expect(result).toEqual({
			status: 'setup-finalization-failed',
			message:
				'Account setup could not finish after this link was claimed. Request a fresh setup link or ask an admin to resend setup.'
		});
		expect(auth.signInWithPassword).not.toHaveBeenCalled();
		expect(store.links[0].claimedAt).toBeInstanceOf(Date);
		expect(store.links[0].failedAt).toBeInstanceOf(Date);
		expect(store.links[0].failureReason).toBe('completion-tracking-failed');
		expect(store.links[0].usedAt).toBeNull();
	});

	it('marks the claimed setup link failed and returns recovery when link completion cannot be recorded', async () => {
		const store = makeStore(approvedRequest);
		store.failMarkCompleted = true;
		await addSetupToken(store);
		const auth = makeAuth();
		const service = createAccountSetupCompletionService(store, auth);

		const result = await service.complete({ rawToken: 'setup-token', password: 'ValidPassword123!' });

		expect(result).toEqual({
			status: 'setup-finalization-failed',
			message:
				'Account setup could not finish after this link was claimed. Request a fresh setup link or ask an admin to resend setup.'
		});
		expect(auth.signInWithPassword).not.toHaveBeenCalled();
		expect(store.links[0].claimedAt).toBeInstanceOf(Date);
		expect(store.links[0].failedAt).toBeInstanceOf(Date);
		expect(store.links[0].failureReason).toBe('completion-tracking-failed');
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

		const result = await service.complete({ rawToken: 'setup-token', password: 'ValidPassword123!' });

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

		const first = await firstService.complete({ rawToken: 'setup-token', password: 'ValidPassword123!' });
		const second = await secondService.complete({ rawToken: 'setup-token', password: 'DifferentPassword123!' });

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

			expect(result).toEqual({ status: 'access-request-missing' });
			expect(auth.createOrActivateConfirmedUser).not.toHaveBeenCalled();
			expect(store.links[0].claimedAt).toBeInstanceOf(Date);
			expect(store.links[0].failedAt).toBeInstanceOf(Date);
			expect(store.links[0].failureReason).toBe('access-request-missing');
		});
	});
});
