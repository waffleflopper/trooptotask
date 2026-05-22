import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createAccessRequestSetupDeliveryService,
	type AccessRequestSetupDeliveryStore,
	type AccessRequestSetupRequest,
	type CreatePendingAccessRequestInput
} from './accessRequestSetupDelivery';
import type { AccountSetupLinkRecord, CreateAccountSetupLinkInput } from './accountSetupLinks';
import type { AuthEmailOutboxRecord } from './authEmailOutbox';

const NOW = new Date('2026-05-18T12:00:00.000Z');

function makeRequest(overrides: Partial<AccessRequestSetupRequest> = {}): AccessRequestSetupRequest {
	return {
		id: 'request-1',
		email: 'test@example.com',
		status: 'approved',
		createdAt: new Date('2026-05-01T12:00:00.000Z'),
		reviewedAt: new Date('2026-05-02T12:00:00.000Z'),
		setupCompletedAt: null,
		...overrides
	};
}

function makeStore(requests: AccessRequestSetupRequest[] = []) {
	const setupLinks: AccountSetupLinkRecord[] = [];
	const outboxRecords: AuthEmailOutboxRecord[] = [];
	const insertedRequests: CreatePendingAccessRequestInput[] = [];
	const revokedAccessRequestIds: string[] = [];
	let linkId = 0;

	const store: AccessRequestSetupDeliveryStore & {
		insertedRequests: CreatePendingAccessRequestInput[];
		revokedAccessRequestIds: string[];
		setupLinks: AccountSetupLinkRecord[];
		outboxRecords: AuthEmailOutboxRecord[];
	} = {
		insertedRequests,
		revokedAccessRequestIds,
		setupLinks,
		outboxRecords,

		async listAccessRequestsByEmail(email) {
			return requests.filter((request) => request.email.toLowerCase() === email.toLowerCase());
		},

		async insertPendingAccessRequest(input) {
			insertedRequests.push(input);
		},

		async insertSetupEmailDelivery(input) {
			const record: AuthEmailOutboxRecord = {
				id: `outbox-${outboxRecords.length + 1}`,
				accessRequestId: input.accessRequestId,
				setupLinkId: input.setupLinkId,
				recipient: input.recipient,
				purpose: 'account_setup',
				status: 'pending',
				attemptCount: 0,
				lastError: null,
				createdAt: input.createdAt,
				updatedAt: input.createdAt,
				sentAt: null
			};
			outboxRecords.push(record);
			return record;
		},

		async markSetupEmailDeliverySent(id, sentAt) {
			const record = outboxRecords.find((item) => item.id === id);
			if (!record) throw new Error('missing outbox');
			record.status = 'sent';
			record.attemptCount = 1;
			record.lastError = null;
			record.updatedAt = sentAt;
			record.sentAt = sentAt;
			return record;
		},

		async markSetupEmailDeliveryFailed(id, failedAt, lastError) {
			const record = outboxRecords.find((item) => item.id === id);
			if (!record) throw new Error('missing outbox');
			record.status = 'failed';
			record.attemptCount = 1;
			record.lastError = lastError;
			record.updatedAt = failedAt;
			record.sentAt = null;
			return record;
		},

		async getAccessRequest(id) {
			const request = requests.find((item) => item.id === id);
			if (!request) return null;
			return {
				id: request.id,
				email: request.email,
				status: request.status,
				setupCompletedAt: request.setupCompletedAt
			};
		},

		async revokeUnusedLinksForAccessRequest(accessRequestId) {
			revokedAccessRequestIds.push(accessRequestId);
		},

		async insertSetupLink(input: CreateAccountSetupLinkInput) {
			const record: AccountSetupLinkRecord = {
				id: `setup-link-${++linkId}`,
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
			setupLinks.push(record);
			return record;
		},

		async findByTokenHash(tokenHash) {
			return setupLinks.find((link) => link.tokenHash === tokenHash) ?? null;
		},

		async getSetupLink(id) {
			return setupLinks.find((link) => link.id === id) ?? null;
		},

		async claimPendingLink(id, claimedAt) {
			const link = setupLinks.find((item) => item.id === id);
			if (!link || link.claimedAt || link.failedAt || link.usedAt || link.revokedAt || link.expiresAt <= claimedAt) {
				return null;
			}
			link.claimedAt = claimedAt;
			return link;
		},

		async markCompleted(id, completedAt) {
			const link = setupLinks.find((item) => item.id === id);
			if (!link || !link.claimedAt || link.failedAt || link.usedAt || link.revokedAt) return null;
			link.usedAt = completedAt;
			return link;
		},

		async markFailed(id, failedAt, failureReason) {
			const link = setupLinks.find((item) => item.id === id);
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
		}
	};

	return store;
}

function makeService(store: AccessRequestSetupDeliveryStore) {
	const sendSetupEmail = vi.fn().mockResolvedValue(undefined);
	const service = createAccessRequestSetupDeliveryService(store, sendSetupEmail, {
		now: () => NOW
	});
	return { service, sendSetupEmail };
}

function makeSubmission(
	overrides: Partial<Parameters<ReturnType<typeof makeService>['service']['submitAccessRequest']>[0]> = {}
) {
	return {
		email: 'test@example.com',
		firstName: 'Test',
		lastName: 'Requester',
		reason: null,
		heardAbout: 'search_engine',
		heardAboutDetails: null,
		origin: 'https://trooptotask.test',
		...overrides
	};
}

describe('access request setup delivery', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('creates a pending Access Request for a new email', async () => {
		const store = makeStore();
		const { service, sendSetupEmail } = makeService(store);

		const result = await service.submitAccessRequest({
			email: 'New.User@Example.com',
			firstName: 'New',
			lastName: 'User',
			reason: 'Testing beta',
			heardAbout: 'search_engine',
			heardAboutDetails: null,
			origin: 'https://trooptotask.test'
		});

		expect(result).toEqual({ status: 'pending-created' });
		expect(store.insertedRequests).toEqual([
			{
				email: 'new.user@example.com',
				firstName: 'New',
				lastName: 'User',
				reason: 'Testing beta',
				heardAbout: 'search_engine',
				heardAboutDetails: null
			}
		]);
		expect(sendSetupEmail).not.toHaveBeenCalled();
	});

	it('acknowledges duplicate pending requests without creating another request', async () => {
		const store = makeStore([makeRequest({ status: 'pending' })]);
		const { service, sendSetupEmail } = makeService(store);

		const result = await service.submitAccessRequest(makeSubmission());

		expect(result).toEqual({ status: 'already-pending' });
		expect(store.insertedRequests).toEqual([]);
		expect(sendSetupEmail).not.toHaveBeenCalled();
	});

	it('sends a fresh Account Setup Link for an approved incomplete duplicate', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN_ALLOWLIST', 'https://trooptotask.test');
		const store = makeStore([makeRequest()]);
		const { service, sendSetupEmail } = makeService(store);

		const result = await service.submitAccessRequest({
			email: 'Test@Example.com',
			firstName: 'Approved',
			lastName: 'User',
			reason: null,
			heardAbout: 'search_engine',
			heardAboutDetails: null,
			origin: 'https://trooptotask.test'
		});

		expect(result).toEqual({ status: 'fresh-setup-sent', accessRequestId: 'request-1' });
		expect(store.insertedRequests).toEqual([]);
		expect(store.revokedAccessRequestIds).toEqual(['request-1']);
		expect(sendSetupEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				email: 'test@example.com',
				setupUrl: expect.stringMatching(/^https:\/\/trooptotask\.test\/auth\/setup-account\?token=/),
				expiresAt: new Date('2026-06-01T12:00:00.000Z')
			})
		);
		expect(store.outboxRecords).toEqual([
			expect.objectContaining({
				accessRequestId: 'request-1',
				setupLinkId: 'setup-link-1',
				recipient: 'test@example.com',
				purpose: 'account_setup',
				status: 'sent',
				attemptCount: 1
			})
		]);
		expect(JSON.stringify(store.outboxRecords)).not.toContain('token=');
	});

	it('uses the configured public app origin for renewed setup URLs instead of the inbound host', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN', 'https://trooptotask.org');
		const store = makeStore([makeRequest()]);
		const { service, sendSetupEmail } = makeService(store);

		const result = await service.requestFreshSetupLink({
			email: 'test@example.com',
			origin: 'https://evil.example'
		});

		expect(result).toEqual({ status: 'fresh-setup-sent', accessRequestId: 'request-1' });
		expect(sendSetupEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				setupUrl: expect.stringMatching(/^https:\/\/trooptotask\.org\/auth\/setup-account\?token=/)
			})
		);
	});

	it('does not create a request or setup link for completed, rejected, or stale duplicates', async () => {
		for (const request of [
			makeRequest({ setupCompletedAt: new Date('2026-05-03T12:00:00.000Z') }),
			makeRequest({ status: 'rejected' }),
			makeRequest({
				createdAt: new Date('2026-01-01T12:00:00.000Z'),
				reviewedAt: new Date('2026-01-02T12:00:00.000Z')
			})
		]) {
			const store = makeStore([request]);
			const { service, sendSetupEmail } = makeService(store);

			const result = await service.submitAccessRequest({
				email: request.email,
				firstName: 'Duplicate',
				lastName: 'User',
				reason: null,
				heardAbout: 'search_engine',
				heardAboutDetails: null,
				origin: 'https://trooptotask.test'
			});

			expect(result).toEqual({ status: 'no-public-action' });
			expect(store.insertedRequests).toEqual([]);
			expect(store.setupLinks).toEqual([]);
			expect(sendSetupEmail).not.toHaveBeenCalled();
		}
	});

	it('renews only approved incomplete requests inside the 90-day window', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN_ALLOWLIST', 'https://trooptotask.test');
		const store = makeStore([makeRequest()]);
		const { service, sendSetupEmail } = makeService(store);

		const result = await service.requestFreshSetupLink({
			email: 'test@example.com',
			origin: 'https://trooptotask.test'
		});

		expect(result).toEqual({ status: 'fresh-setup-sent', accessRequestId: 'request-1' });
		expect(store.revokedAccessRequestIds).toEqual(['request-1']);
		expect(sendSetupEmail).toHaveBeenCalledOnce();
	});

	it('allows renewal at exactly 90 days and denies it after the window closes', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN_ALLOWLIST', 'https://trooptotask.test');

		const boundaryStore = makeStore([
			makeRequest({
				createdAt: new Date('2026-01-01T00:00:00.000Z'),
				reviewedAt: new Date('2026-01-01T00:00:00.000Z')
			})
		]);
		const boundaryDelivery = createAccessRequestSetupDeliveryService(
			boundaryStore,
			vi.fn().mockResolvedValue(undefined),
			{ now: () => new Date('2026-04-01T00:00:00.000Z') }
		);

		expect(
			await boundaryDelivery.requestFreshSetupLink({
				email: 'test@example.com',
				origin: 'https://trooptotask.test'
			})
		).toEqual({ status: 'fresh-setup-sent', accessRequestId: 'request-1' });

		const expiredStore = makeStore([
			makeRequest({
				createdAt: new Date('2026-01-01T00:00:00.000Z'),
				reviewedAt: new Date('2026-01-01T00:00:00.000Z')
			})
		]);
		const expiredSender = vi.fn().mockResolvedValue(undefined);
		const expiredDelivery = createAccessRequestSetupDeliveryService(expiredStore, expiredSender, {
			now: () => new Date('2026-04-01T00:00:01.000Z')
		});

		expect(
			await expiredDelivery.requestFreshSetupLink({
				email: 'test@example.com',
				origin: 'https://trooptotask.test'
			})
		).toEqual({ status: 'no-public-action' });
		expect(expiredSender).not.toHaveBeenCalled();
	});

	it('records failed public setup delivery without storing the raw token or corrupting the setup link', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN_ALLOWLIST', 'https://trooptotask.test');
		const store = makeStore([makeRequest()]);
		const { service, sendSetupEmail } = makeService(store);
		sendSetupEmail.mockRejectedValueOnce(new Error('mail provider unavailable'));

		const result = await service.requestFreshSetupLink({
			email: 'test@example.com',
			origin: 'https://trooptotask.test'
		});

		expect(result).toEqual({ status: 'no-public-action' });
		expect(store.setupLinks).toHaveLength(1);
		expect(store.setupLinks[0].revokedAt).toBeNull();
		expect(store.outboxRecords).toEqual([
			expect.objectContaining({
				accessRequestId: 'request-1',
				setupLinkId: 'setup-link-1',
				status: 'failed',
				attemptCount: 1,
				lastError: 'mail provider unavailable'
			})
		]);
		expect(JSON.stringify(store.outboxRecords)).not.toContain('token=');
	});

	it('treats concurrent completion during renewal as a quiet no-op', async () => {
		const store = makeStore([makeRequest()]);
		store.getAccessRequest = vi.fn().mockResolvedValue({
			id: 'request-1',
			email: 'test@example.com',
			status: 'approved',
			setupCompletedAt: new Date('2026-05-18T12:01:00.000Z')
		});
		const { service, sendSetupEmail } = makeService(store);

		const result = await service.requestFreshSetupLink({
			email: 'test@example.com',
			origin: 'https://trooptotask.test'
		});

		expect(result).toEqual({ status: 'no-public-action' });
		expect(sendSetupEmail).not.toHaveBeenCalled();
		expect(store.setupLinks).toEqual([]);
	});

	it('keeps missing, completed, rejected, pending, and no-longer-renewable renewal states quiet', async () => {
		for (const requests of [
			[],
			[makeRequest({ setupCompletedAt: new Date('2026-05-03T12:00:00.000Z') })],
			[makeRequest({ status: 'rejected' })],
			[makeRequest({ status: 'pending' })],
			[
				makeRequest({
					createdAt: new Date('2026-01-01T12:00:00.000Z'),
					reviewedAt: new Date('2026-01-02T12:00:00.000Z')
				})
			]
		]) {
			const store = makeStore(requests);
			const { service, sendSetupEmail } = makeService(store);

			const result = await service.requestFreshSetupLink({
				email: 'test@example.com',
				origin: 'https://trooptotask.test'
			});

			expect(result).toEqual({ status: 'no-public-action' });
			expect(sendSetupEmail).not.toHaveBeenCalled();
			expect(store.setupLinks).toEqual([]);
		}
	});
});
