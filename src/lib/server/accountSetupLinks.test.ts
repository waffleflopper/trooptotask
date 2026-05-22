import { describe, expect, it } from 'vitest';
import {
	createAccountSetupLinkService,
	type AccountSetupLinkAccessRequest,
	type AccountSetupLinkRecord,
	type AccountSetupLinkStore
} from './accountSetupLinks';

function makeStore(accessRequests: AccountSetupLinkAccessRequest[] = []): AccountSetupLinkStore & {
	links: AccountSetupLinkRecord[];
	deletedAccessRequestIds: string[];
	deletedUserAccountIds: string[];
	failInsertUnique?: boolean;
} {
	const requests = new Map(accessRequests.map((request) => [request.id, request]));
	const links: AccountSetupLinkRecord[] = [];
	const deletedAccessRequestIds: string[] = [];
	const deletedUserAccountIds: string[] = [];

	return {
		links,
		deletedAccessRequestIds,
		deletedUserAccountIds,
		async getAccessRequest(id) {
			return requests.get(id) ?? null;
		},
		async revokeUnusedLinksForAccessRequest(accessRequestId, revokedAt) {
			for (const link of links) {
				if (link.accessRequestId === accessRequestId && !link.claimedAt && !link.usedAt && !link.revokedAt) {
					link.revokedAt = revokedAt;
					link.revocationReason = 'replaced';
				}
			}
		},
		async insertSetupLink(input) {
			if (this.failInsertUnique) {
				throw {
					code: '23505',
					message: 'duplicate key value violates unique constraint "account_setup_links_one_active_per_request_idx"'
				};
			}
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
			const link = links.find((candidate) => candidate.id === id);
			if (!link || link.claimedAt || link.failedAt || link.usedAt || link.revokedAt || link.expiresAt <= claimedAt) {
				return null;
			}
			link.claimedAt = claimedAt;
			return link;
		},
		async markCompleted(id, completedAt) {
			const link = links.find((candidate) => candidate.id === id);
			if (!link || !link.claimedAt || link.failedAt || link.usedAt || link.revokedAt) {
				return null;
			}
			link.usedAt = completedAt;
			return link;
		},
		async markFailed(id, failedAt, failureReason) {
			const link = links.find((candidate) => candidate.id === id);
			if (!link || !link.claimedAt || link.failedAt || link.usedAt || link.revokedAt) {
				return null;
			}
			link.failedAt = failedAt;
			link.failureReason = failureReason;
			return link;
		},
		async listCleanupEligible(cutoff) {
			return links.filter((link) => {
				if (link.usedAt && link.usedAt <= cutoff) return true;
				if (link.revokedAt && link.revokedAt <= cutoff) return true;
				if (link.failedAt && link.failedAt <= cutoff) return true;
				return link.expiresAt <= cutoff;
			});
		},
		async revokeExpiredUnusedLinks(cutoff, revokedAt) {
			const revoked: AccountSetupLinkRecord[] = [];
			for (const link of links) {
				if (link.expiresAt <= cutoff && !link.claimedAt && !link.usedAt && !link.revokedAt) {
					link.revokedAt = revokedAt;
					link.revocationReason = 'cleanup';
					revoked.push(link);
				}
			}
			return revoked;
		},
		async countActiveLinks(referenceTime) {
			return links.filter(
				(link) => link.expiresAt > referenceTime && !link.claimedAt && !link.failedAt && !link.usedAt && !link.revokedAt
			).length;
		}
	};
}

const approvedRequest: AccountSetupLinkAccessRequest = {
	id: 'request-1',
	status: 'approved',
	setupCompletedAt: null
};

describe('Account Setup Links', () => {
	it('stores only a token hash while returning the raw token once for delivery', async () => {
		const store = makeStore([approvedRequest]);
		const service = createAccountSetupLinkService(store, {
			now: () => new Date('2026-05-18T12:00:00.000Z'),
			generateToken: () => 'raw-token-for-email'
		});

		const result = await service.createForAccessRequest('request-1');

		expect(result).toMatchObject({
			status: 'created',
			rawToken: 'raw-token-for-email',
			setupPath: '/auth/setup-account?token=raw-token-for-email'
		});
		expect(store.links).toHaveLength(1);
		expect(store.links[0].tokenHash).not.toBe('raw-token-for-email');
		expect(store.links[0].expiresAt).toEqual(new Date('2026-06-01T12:00:00.000Z'));
	});

	it('revokes older unused links when a fresh link is created for the same approved Access Request', async () => {
		const store = makeStore([approvedRequest]);
		const service = createAccountSetupLinkService(store, {
			now: () => new Date('2026-05-18T12:00:00.000Z'),
			generateToken: () => 'first-token'
		});

		await service.createForAccessRequest('request-1');
		const replacementService = createAccountSetupLinkService(store, {
			now: () => new Date('2026-05-19T12:00:00.000Z'),
			generateToken: () => 'second-token'
		});

		await replacementService.createForAccessRequest('request-1');

		expect(store.links).toHaveLength(2);
		expect(store.links[0].revokedAt).toEqual(new Date('2026-05-19T12:00:00.000Z'));
		expect(store.links[0].revocationReason).toBe('replaced');
		expect(store.links[1].revokedAt).toBeNull();
	});

	it('returns a supportable concurrent-create state when another request wins active-link creation', async () => {
		const store = makeStore([approvedRequest]);
		store.failInsertUnique = true;
		const service = createAccountSetupLinkService(store, {
			now: () => new Date('2026-05-18T12:00:00.000Z'),
			generateToken: () => 'setup-token'
		});

		await expect(service.createForAccessRequest('request-1')).resolves.toEqual({ status: 'concurrent-create' });
		expect(store.links).toEqual([]);
	});

	it('does not revoke claimed in-flight links when creating a fresh link', async () => {
		const store = makeStore([approvedRequest]);
		const service = createAccountSetupLinkService(store, {
			now: () => new Date('2026-05-18T12:00:00.000Z'),
			generateToken: () => 'first-token'
		});

		const first = await service.createForAccessRequest('request-1');
		if (first.status !== 'created') throw new Error('expected setup link');
		await service.claimToken('first-token');

		const replacementService = createAccountSetupLinkService(store, {
			now: () => new Date('2026-05-19T12:00:00.000Z'),
			generateToken: () => 'second-token'
		});

		await replacementService.createForAccessRequest('request-1');

		expect(store.links[0].claimedAt).toBeInstanceOf(Date);
		expect(store.links[0].revokedAt).toBeNull();
		expect(store.links[1].revokedAt).toBeNull();
	});

	it('returns clear validation outcomes for valid, expired, revoked, replaced, claimed, failed, completed, and missing tokens', async () => {
		const store = makeStore([approvedRequest]);
		const service = createAccountSetupLinkService(store, {
			now: () => new Date('2026-05-18T12:00:00.000Z'),
			generateToken: () => 'valid-token'
		});
		await service.createForAccessRequest('request-1');

		expect(await service.validateToken('valid-token')).toMatchObject({ status: 'valid', accessRequestId: 'request-1' });
		expect(await service.validateToken('missing-token')).toEqual({ status: 'missing' });

		store.links[0].expiresAt = new Date('2026-05-17T12:00:00.000Z');
		expect(await service.validateToken('valid-token')).toEqual({ status: 'expired' });

		store.links[0].expiresAt = new Date('2026-05-30T12:00:00.000Z');
		store.links[0].revokedAt = new Date('2026-05-18T13:00:00.000Z');
		expect(await service.validateToken('valid-token')).toEqual({ status: 'revoked' });

		store.links[0].revocationReason = 'replaced';
		expect(await service.validateToken('valid-token')).toEqual({ status: 'replaced' });

		store.links[0].revokedAt = null;
		store.links[0].revocationReason = null;
		store.links[0].claimedAt = new Date('2026-05-18T13:30:00.000Z');
		expect(await service.validateToken('valid-token')).toEqual({ status: 'claimed' });

		store.links[0].failedAt = new Date('2026-05-18T13:45:00.000Z');
		store.links[0].failureReason = 'account-create-failed';
		expect(await service.validateToken('valid-token')).toEqual({ status: 'failed' });

		store.links[0].failedAt = null;
		store.links[0].failureReason = null;
		store.links[0].usedAt = new Date('2026-05-18T14:00:00.000Z');
		expect(await service.validateToken('valid-token')).toEqual({ status: 'completed' });
	});

	it('does not validate or claim setup links when the Access Request is no longer approved', async () => {
		const store = makeStore([{ ...approvedRequest, status: 'rejected' }]);
		const service = createAccountSetupLinkService(store, {
			now: () => new Date('2026-05-18T12:00:00.000Z')
		});
		store.links.push({
			id: 'link-1',
			accessRequestId: 'request-1',
			tokenHash: '8997ec9a3da1e44792b936f9baffd674262900d5af8bfdeab23512d11766de09',
			expiresAt: new Date('2026-06-01T12:00:00.000Z'),
			createdAt: new Date('2026-05-18T12:00:00.000Z'),
			claimedAt: null,
			failedAt: null,
			failureReason: null,
			usedAt: null,
			revokedAt: null,
			revocationReason: null
		});

		expect(await service.validateToken('setup-token')).toEqual({ status: 'access-request-not-approved' });
		expect(await service.claimToken('setup-token')).toEqual({ status: 'access-request-not-approved' });
		expect(store.links[0].claimedAt).toBeNull();
	});

	it('claims and completes a valid token once and exposes cleanup eligibility without deleting User Accounts or Access Requests', async () => {
		const store = makeStore([approvedRequest]);
		const service = createAccountSetupLinkService(store, {
			now: () => new Date('2026-05-18T12:00:00.000Z'),
			generateToken: () => 'setup-token'
		});
		await service.createForAccessRequest('request-1');

		const claimed = await service.claimToken('setup-token');
		const secondAttempt = await service.claimToken('setup-token');
		const completed =
			claimed.status === 'claim-started' ? await service.markClaimCompleted(claimed.link.id) : { status: 'unexpected' };

		expect(claimed).toMatchObject({ status: 'claim-started', accessRequestId: 'request-1' });
		expect(secondAttempt).toEqual({ status: 'claimed' });
		expect(completed).toMatchObject({ status: 'completed', accessRequestId: 'request-1' });
		expect(store.links[0].claimedAt).toEqual(new Date('2026-05-18T12:00:00.000Z'));
		expect(store.links[0].usedAt).toEqual(new Date('2026-05-18T12:00:00.000Z'));

		const cleanupEligible = await service.listCleanupEligibleLinks({
			olderThan: new Date('2026-05-19T12:00:00.000Z')
		});
		expect(cleanupEligible.map((link) => link.id)).toEqual(['link-1']);
	});

	it('supports explicit revocation for an approved Access Request without exposing token details', async () => {
		const store = makeStore([approvedRequest]);
		const service = createAccountSetupLinkService(store, {
			now: () => new Date('2026-05-18T12:00:00.000Z'),
			generateToken: () => 'setup-token'
		});
		await service.createForAccessRequest('request-1');

		await service.revokeUnusedForAccessRequest('request-1');

		expect(store.links[0]).toMatchObject({
			accessRequestId: 'request-1',
			revokedAt: new Date('2026-05-18T12:00:00.000Z')
		});
		expect(await service.validateToken('setup-token')).toEqual({ status: 'replaced' });
	});

	it('revokes expired unused links during cleanup without deleting Access Requests or User Accounts', async () => {
		const completedRequest: AccountSetupLinkAccessRequest = {
			id: 'request-completed',
			status: 'approved',
			setupCompletedAt: '2026-05-18T12:00:00.000Z'
		};
		const store = makeStore([approvedRequest, completedRequest]);
		const service = createAccountSetupLinkService(store, {
			now: () => new Date('2026-06-10T12:00:00.000Z')
		});
		store.links.push(
			{
				id: 'expired-unused',
				accessRequestId: 'request-1',
				tokenHash: 'expired-unused-hash',
				expiresAt: new Date('2026-06-01T12:00:00.000Z'),
				createdAt: new Date('2026-05-18T12:00:00.000Z'),
				claimedAt: null,
				failedAt: null,
				failureReason: null,
				usedAt: null,
				revokedAt: null,
				revocationReason: null
			},
			{
				id: 'already-revoked',
				accessRequestId: 'request-1',
				tokenHash: 'already-revoked-hash',
				expiresAt: new Date('2026-06-01T12:00:00.000Z'),
				createdAt: new Date('2026-05-18T12:00:00.000Z'),
				claimedAt: null,
				failedAt: null,
				failureReason: null,
				usedAt: null,
				revokedAt: new Date('2026-06-02T12:00:00.000Z'),
				revocationReason: 'cleanup'
			},
			{
				id: 'used-link',
				accessRequestId: 'request-completed',
				tokenHash: 'used-link-hash',
				expiresAt: new Date('2026-06-01T12:00:00.000Z'),
				createdAt: new Date('2026-05-18T12:00:00.000Z'),
				claimedAt: new Date('2026-05-19T11:59:00.000Z'),
				failedAt: null,
				failureReason: null,
				usedAt: new Date('2026-05-19T12:00:00.000Z'),
				revokedAt: null,
				revocationReason: null
			},
			{
				id: 'failed-link',
				accessRequestId: 'request-1',
				tokenHash: 'failed-link-hash',
				expiresAt: new Date('2026-06-20T12:00:00.000Z'),
				createdAt: new Date('2026-05-18T12:00:00.000Z'),
				claimedAt: new Date('2026-05-19T11:59:00.000Z'),
				failedAt: new Date('2026-05-19T12:00:00.000Z'),
				failureReason: 'account-create-failed',
				usedAt: null,
				revokedAt: null,
				revocationReason: null
			},
			{
				id: 'active-link',
				accessRequestId: 'request-1',
				tokenHash: 'active-link-hash',
				expiresAt: new Date('2026-06-20T12:00:00.000Z'),
				createdAt: new Date('2026-06-06T12:00:00.000Z'),
				claimedAt: null,
				failedAt: null,
				failureReason: null,
				usedAt: null,
				revokedAt: null,
				revocationReason: null
			}
		);

		const result = await service.cleanupStaleLinks({
			olderThan: new Date('2026-06-10T12:00:00.000Z')
		});

		expect(result).toEqual({
			revokedExpiredUnusedCount: 1,
			staleRevokedCount: 2,
			completedSetupHistoryCount: 1,
			failedSetupHistoryCount: 1,
			activeLinkCount: 1,
			deletedAccessRequestCount: 0,
			deletedUserAccountCount: 0
		});
		expect(store.links.find((link) => link.id === 'expired-unused')?.revokedAt).toEqual(
			new Date('2026-06-10T12:00:00.000Z')
		);
		expect(store.links.find((link) => link.id === 'already-revoked')?.revokedAt).toEqual(
			new Date('2026-06-02T12:00:00.000Z')
		);
		expect(store.links.find((link) => link.id === 'used-link')?.usedAt).toEqual(new Date('2026-05-19T12:00:00.000Z'));
		expect(store.links.find((link) => link.id === 'failed-link')?.failedAt).toEqual(
			new Date('2026-05-19T12:00:00.000Z')
		);
		expect(store.links.find((link) => link.id === 'active-link')?.revokedAt).toBeNull();
		expect(store.deletedAccessRequestIds).toEqual([]);
		expect(store.deletedUserAccountIds).toEqual([]);
		expect(store.links.map((link) => link.id)).toEqual([
			'expired-unused',
			'already-revoked',
			'used-link',
			'failed-link',
			'active-link'
		]);
	});
});
