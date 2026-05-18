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
			if (!link || link.usedAt || link.revokedAt) {
				return null;
			}
			link.usedAt = usedAt;
			return link;
		},
		async listCleanupEligible(cutoff) {
			return links.filter((link) => {
				if (link.usedAt && link.usedAt <= cutoff) return true;
				if (link.revokedAt && link.revokedAt <= cutoff) return true;
				return link.expiresAt <= cutoff;
			});
		},
		async revokeExpiredUnusedLinks(cutoff, revokedAt) {
			const revoked: AccountSetupLinkRecord[] = [];
			for (const link of links) {
				if (link.expiresAt <= cutoff && !link.usedAt && !link.revokedAt) {
					link.revokedAt = revokedAt;
					revoked.push(link);
				}
			}
			return revoked;
		},
		async countActiveLinks(referenceTime) {
			return links.filter((link) => link.expiresAt > referenceTime && !link.usedAt && !link.revokedAt).length;
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
		expect(store.links[1].revokedAt).toBeNull();
	});

	it('returns clear validation outcomes for valid, expired, revoked, used, and missing tokens', async () => {
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

		store.links[0].revokedAt = null;
		store.links[0].usedAt = new Date('2026-05-18T14:00:00.000Z');
		expect(await service.validateToken('valid-token')).toEqual({ status: 'used' });
	});

	it('consumes a valid token once and exposes cleanup eligibility without deleting User Accounts or Access Requests', async () => {
		const store = makeStore([approvedRequest]);
		const service = createAccountSetupLinkService(store, {
			now: () => new Date('2026-05-18T12:00:00.000Z'),
			generateToken: () => 'setup-token'
		});
		await service.createForAccessRequest('request-1');

		const consumed = await service.consumeToken('setup-token');
		const secondAttempt = await service.consumeToken('setup-token');

		expect(consumed).toMatchObject({ status: 'consumed', accessRequestId: 'request-1' });
		expect(secondAttempt).toEqual({ status: 'used' });
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
		expect(await service.validateToken('setup-token')).toEqual({ status: 'revoked' });
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
				usedAt: null,
				revokedAt: null
			},
			{
				id: 'already-revoked',
				accessRequestId: 'request-1',
				tokenHash: 'already-revoked-hash',
				expiresAt: new Date('2026-06-01T12:00:00.000Z'),
				createdAt: new Date('2026-05-18T12:00:00.000Z'),
				usedAt: null,
				revokedAt: new Date('2026-06-02T12:00:00.000Z')
			},
			{
				id: 'used-link',
				accessRequestId: 'request-completed',
				tokenHash: 'used-link-hash',
				expiresAt: new Date('2026-06-01T12:00:00.000Z'),
				createdAt: new Date('2026-05-18T12:00:00.000Z'),
				usedAt: new Date('2026-05-19T12:00:00.000Z'),
				revokedAt: null
			},
			{
				id: 'active-link',
				accessRequestId: 'request-1',
				tokenHash: 'active-link-hash',
				expiresAt: new Date('2026-06-20T12:00:00.000Z'),
				createdAt: new Date('2026-06-06T12:00:00.000Z'),
				usedAt: null,
				revokedAt: null
			}
		);

		const result = await service.cleanupStaleLinks({
			olderThan: new Date('2026-06-10T12:00:00.000Z')
		});

		expect(result).toEqual({
			revokedExpiredUnusedCount: 1,
			staleRevokedCount: 2,
			completedSetupHistoryCount: 1,
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
		expect(store.links.find((link) => link.id === 'active-link')?.revokedAt).toBeNull();
		expect(store.deletedAccessRequestIds).toEqual([]);
		expect(store.deletedUserAccountIds).toEqual([]);
		expect(store.links.map((link) => link.id)).toEqual([
			'expired-unused',
			'already-revoked',
			'used-link',
			'active-link'
		]);
	});
});
