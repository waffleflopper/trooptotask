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
	revokeBeforeMarkUsed?: boolean;
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
				usedAt: null,
				revokedAt: null
			};
			links.push(link);
			return link;
		},
		async findByTokenHash(tokenHash) {
			return links.find((link) => link.tokenHash === tokenHash) ?? null;
		},
		async markUsed(id, usedAt) {
			const link = links.find((candidate) => candidate.id === id);
			if (this.revokeBeforeMarkUsed && link && !link.usedAt && !link.revokedAt) {
				link.revokedAt = usedAt;
			}
			if (!link || link.usedAt || link.revokedAt) return null;
			link.usedAt = usedAt;
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

	it('still signs in when a setup link is revoked after completion is recorded', async () => {
		const store = makeStore(approvedRequest);
		store.revokeBeforeMarkUsed = true;
		await addSetupToken(store);
		const auth = makeAuth();
		const service = createAccountSetupCompletionService(store, auth);

		const result = await service.complete({ rawToken: 'setup-token', password: 'ValidPassword123!' });

		expect(result).toEqual({ status: 'completed', accessRequestId: 'request-1', userId: 'user-123' });
		expect(auth.signInWithPassword).toHaveBeenCalledWith({
			email: 'person@example.com',
			password: 'ValidPassword123!'
		});
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

	it('does not consume the setup link when Supabase account creation fails', async () => {
		const store = makeStore(approvedRequest);
		await addSetupToken(store);
		const auth = makeAuth({
			createOrActivateConfirmedUser: vi.fn().mockRejectedValue(new Error('Supabase unavailable'))
		});
		const service = createAccountSetupCompletionService(store, auth);

		const result = await service.complete({ rawToken: 'setup-token', password: 'ValidPassword123!' });

		expect(result).toEqual({ status: 'account-create-failed', message: 'Supabase unavailable' });
		expect(store.links[0].usedAt).toBeNull();
	});

	it('does not consume the setup link when completion tracking fails', async () => {
		const store = makeStore(approvedRequest);
		store.failCompletion = true;
		await addSetupToken(store);
		const service = createAccountSetupCompletionService(store, makeAuth());

		await expect(service.complete({ rawToken: 'setup-token', password: 'ValidPassword123!' })).rejects.toThrow(
			'completion write failed'
		);
		expect(store.links[0].usedAt).toBeNull();
	});
});
