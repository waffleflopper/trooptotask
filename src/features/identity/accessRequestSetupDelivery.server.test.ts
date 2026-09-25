import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createAccessRequestSetupDeliveryService,
	type AccessRequestSetupDeliveryStore
} from './accessRequestSetupDelivery.server';
import { accountSetupLinkFixture, fixedAuthWorkflowTime } from '$lib/test-support/authWorkflowFixtures';
import {
	accessRequestFixture,
	createAccessRequestSetupDeliveryStore
} from './accessRequestSetupDeliveryFixture.server';

const { nowFn } = fixedAuthWorkflowTime(new Date('2026-05-18T12:00:00.000Z'));

function makeService(store: AccessRequestSetupDeliveryStore) {
	const sendSetupEmail = vi.fn().mockResolvedValue(undefined);
	const service = createAccessRequestSetupDeliveryService(store, sendSetupEmail, {
		now: nowFn
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
		const store = createAccessRequestSetupDeliveryStore();
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
		const store = createAccessRequestSetupDeliveryStore([accessRequestFixture({ status: 'pending' })]);
		const { service, sendSetupEmail } = makeService(store);

		const result = await service.submitAccessRequest(makeSubmission());

		expect(result).toEqual({ status: 'already-pending' });
		expect(store.insertedRequests).toEqual([]);
		expect(sendSetupEmail).not.toHaveBeenCalled();
	});

	it('sends a fresh Account Setup Link for an approved incomplete duplicate', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN_ALLOWLIST', 'https://trooptotask.test');
		const store = createAccessRequestSetupDeliveryStore([accessRequestFixture()]);
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

		expect(result).toMatchObject({
			status: 'fresh-setup-sent',
			accessRequestId: 'request-1',
			setupLinkId: 'setup-link-1'
		});
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
		const store = createAccessRequestSetupDeliveryStore([accessRequestFixture()]);
		const { service, sendSetupEmail } = makeService(store);

		const result = await service.requestFreshSetupLink({
			email: 'test@example.com',
			origin: 'https://evil.example'
		});

		expect(result).toMatchObject({
			status: 'fresh-setup-sent',
			accessRequestId: 'request-1',
			setupLinkId: 'setup-link-1'
		});
		expect(sendSetupEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				setupUrl: expect.stringMatching(/^https:\/\/trooptotask\.org\/auth\/setup-account\?token=/)
			})
		);
	});

	it('does not create a request or setup link for completed, rejected, or stale duplicates', async () => {
		for (const request of [
			accessRequestFixture({ setupCompletedAt: new Date('2026-05-03T12:00:00.000Z') }),
			accessRequestFixture({ status: 'rejected' }),
			accessRequestFixture({
				createdAt: new Date('2026-01-01T12:00:00.000Z'),
				reviewedAt: new Date('2026-01-02T12:00:00.000Z')
			})
		]) {
			const store = createAccessRequestSetupDeliveryStore([request]);
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
		const store = createAccessRequestSetupDeliveryStore([accessRequestFixture()]);
		const { service, sendSetupEmail } = makeService(store);

		const result = await service.requestFreshSetupLink({
			email: 'test@example.com',
			origin: 'https://trooptotask.test'
		});

		expect(result).toMatchObject({
			status: 'fresh-setup-sent',
			accessRequestId: 'request-1',
			setupLinkId: 'setup-link-1'
		});
		expect(store.revokedAccessRequestIds).toEqual(['request-1']);
		expect(sendSetupEmail).toHaveBeenCalledOnce();
	});

	it('allows renewal at exactly 90 days and denies it after the window closes', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN_ALLOWLIST', 'https://trooptotask.test');

		const boundaryStore = createAccessRequestSetupDeliveryStore([
			accessRequestFixture({
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
		).toMatchObject({ status: 'fresh-setup-sent', accessRequestId: 'request-1', setupLinkId: 'setup-link-1' });

		const expiredStore = createAccessRequestSetupDeliveryStore([
			accessRequestFixture({
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
		const store = createAccessRequestSetupDeliveryStore([accessRequestFixture()]);
		store.setupLinks.push(
			accountSetupLinkFixture({
				id: 'setup-link-previous',
				accessRequestId: 'request-1',
				tokenHash: 'previous-token-hash',
				createdAt: new Date('2026-05-17T12:00:00.000Z'),
				expiresAt: new Date('2026-05-31T12:00:00.000Z')
			})
		);
		const { service, sendSetupEmail } = makeService(store);
		sendSetupEmail.mockRejectedValueOnce(new Error('mail provider unavailable'));

		const result = await service.requestFreshSetupLink({
			email: 'test@example.com',
			origin: 'https://trooptotask.test'
		});

		expect(result).toEqual({
			status: 'fresh-setup-delivery-failed',
			accessRequestId: 'request-1',
			setupLinkId: 'setup-link-1',
			revokedLinkIds: ['setup-link-previous']
		});
		expect(store.setupLinks).toHaveLength(2);
		expect(store.setupLinks.find((link) => link.id === 'setup-link-previous')?.revokedAt).toEqual(
			new Date('2026-05-18T12:00:00.000Z')
		);
		expect(store.setupLinks.find((link) => link.id === 'setup-link-1')?.revokedAt).toBeNull();
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

	it('renews only the normalized email identity while preserving another approved request', async () => {
		const store = createAccessRequestSetupDeliveryStore([
			accessRequestFixture(),
			accessRequestFixture({ id: 'other-request', email: 'other@example.test' })
		]);
		store.setupLinks.push(accountSetupLinkFixture({ id: 'other-link', accessRequestId: 'other-request' }));
		const otherLink = structuredClone(store.setupLinks[0]);
		const { service, sendSetupEmail } = makeService(store);
		expect(
			await service.requestFreshSetupLink({ email: '  TEST@Example.com  ', origin: 'http://localhost:4173' })
		).toMatchObject({ status: 'fresh-setup-sent', accessRequestId: 'request-1' });
		expect(sendSetupEmail).toHaveBeenCalledWith(expect.objectContaining({ email: 'test@example.com' }));
		expect(store.setupLinks.find((link) => link.id === 'other-link')).toEqual(otherLink);
		expect(store.outboxRecords.map((record) => record.accessRequestId)).toEqual(['request-1']);
		expect(store.insertedRequests).toEqual([]);
	});

	it('does not deliver or insert another request when renewal persistence fails', async () => {
		const store = createAccessRequestSetupDeliveryStore([accessRequestFixture()]);
		store.insertSetupLink = vi.fn().mockRejectedValue(new Error('synthetic write failure'));
		const { service, sendSetupEmail } = makeService(store);
		await expect(
			service.requestFreshSetupLink({ email: 'test@example.com', origin: 'http://localhost:4173' })
		).rejects.toThrow('synthetic write failure');
		expect(sendSetupEmail).not.toHaveBeenCalled();
		expect(store.outboxRecords).toEqual([]);
		expect(store.insertedRequests).toEqual([]);
	});

	it('treats concurrent completion during renewal as a quiet no-op', async () => {
		const store = createAccessRequestSetupDeliveryStore([accessRequestFixture()]);
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
			[accessRequestFixture({ setupCompletedAt: new Date('2026-05-03T12:00:00.000Z') })],
			[accessRequestFixture({ status: 'rejected' })],
			[accessRequestFixture({ status: 'pending' })],
			[
				accessRequestFixture({
					createdAt: new Date('2026-01-01T12:00:00.000Z'),
					reviewedAt: new Date('2026-01-02T12:00:00.000Z')
				})
			]
		]) {
			const store = createAccessRequestSetupDeliveryStore(requests);
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
