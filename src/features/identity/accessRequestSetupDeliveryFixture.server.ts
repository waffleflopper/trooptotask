import type {
	AccessRequestSetupDeliveryStore,
	AccessRequestSetupRequest,
	CreatePendingAccessRequestInput
} from './accessRequestSetupDelivery.server';
import type { AccountSetupLinkRecord } from './accountSetupLinks.server';
import type { AuthEmailOutboxRecord } from './authEmailOutbox.server';
import { AUTH_WORKFLOW_CREATED_AT, AUTH_WORKFLOW_REVIEWED_AT } from '$lib/test-support/authWorkflowFixtures';
import { createAuthEmailOutboxStore, issueSetupLinkInMemory } from './accountSetupFixtures.server';

export function accessRequestFixture(overrides: Partial<AccessRequestSetupRequest> = {}): AccessRequestSetupRequest {
	return {
		id: 'request-1',
		email: 'test@example.com',
		status: 'approved',
		approvalBasis: 'platform_review',
		createdAt: AUTH_WORKFLOW_CREATED_AT,
		reviewedAt: AUTH_WORKFLOW_REVIEWED_AT,
		setupCompletedAt: null,
		setupGrantLive: true,
		...overrides
	};
}

export function createAccessRequestSetupDeliveryStore(requests: AccessRequestSetupRequest[] = []) {
	const setupLinks: AccountSetupLinkRecord[] = [];
	const outboxStore = createAuthEmailOutboxStore();
	const insertedRequests: CreatePendingAccessRequestInput[] = [];
	let linkId = 0;

	const store: AccessRequestSetupDeliveryStore & {
		insertedRequests: CreatePendingAccessRequestInput[];
		setupLinks: AccountSetupLinkRecord[];
		outboxRecords: AuthEmailOutboxRecord[];
	} = {
		...outboxStore,
		insertedRequests,
		setupLinks,
		outboxRecords: outboxStore.records,
		async listAccessRequestsByEmail(email) {
			return requests.filter((request) => request.email.toLowerCase() === email.toLowerCase());
		},
		async insertPendingAccessRequest(input) {
			insertedRequests.push(input);
		},
		async getAccessRequest(id) {
			const request = requests.find((item) => item.id === id);
			if (!request) return null;
			return {
				id: request.id,
				email: request.email,
				status: request.status,
				setupCompletedAt: request.setupCompletedAt,
				setupGrantLive: request.setupGrantLive
			};
		},
		async issueSetupLink(input) {
			const request = requests.find((item) => item.id === input.accessRequestId);
			return issueSetupLinkInMemory(request, setupLinks, input, `setup-link-${++linkId}`);
		},
		async findByTokenHash(tokenHash) {
			return setupLinks.find((link) => link.tokenHash === tokenHash) ?? null;
		},
		async getSetupLink(id) {
			return setupLinks.find((link) => link.id === id) ?? null;
		},
		async claimSetupLinkForSession(input) {
			const link = setupLinks.find((item) => item.id === input.setupLinkId);
			const request = requests.find((item) => item.id === input.accessRequestId);
			if (!link || link.accessRequestId !== input.accessRequestId || !request) return { status: 'missing' };
			// This fake prioritizes access-request outcomes for focused service tests; the database RPC owns exact status ordering.
			if (request.setupCompletedAt) return { status: 'access-request-completed' };
			if (request.status !== 'approved' || !request.setupGrantLive) return { status: 'access-request-not-approved' };
			if (link.usedAt) return { status: 'used' };
			if (link.failedAt) return { status: 'failed' };
			if (link.claimedAt) return { status: 'claimed' };
			if (link.revokedAt) return { status: link.revocationReason === 'replaced' ? 'replaced' : 'revoked' };
			if (link.expiresAt <= input.claimedAt) return { status: 'expired' };
			link.claimedAt = input.claimedAt;
			return { status: 'claim-started', accessRequestId: link.accessRequestId, link };
		},
		async markCompleted(id, completedAt) {
			const link = setupLinks.find((item) => item.id === id);
			if (!link || !link.claimedAt || link.failedAt || link.usedAt || link.revokedAt) return null;
			link.usedAt = completedAt;
			return link;
		},
		async markFailed(id, failedAt, failureReason) {
			const link = setupLinks.find((item) => item.id === id);
			if (!link || !link.claimedAt || link.failedAt || link.usedAt) return null;
			link.failedAt = failedAt;
			link.failureReason = failureReason;
			return link;
		},
		async countCleanupHistory() {
			return { staleRevokedCount: 0, completedSetupHistoryCount: 0, failedSetupHistoryCount: 0 };
		},
		async revokeExpiredUnusedLinks() {
			return 0;
		},
		async countActiveLinks() {
			return 0;
		}
	};

	return store;
}
