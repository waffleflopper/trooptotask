import { afterEach, describe, expect, it, vi } from 'vitest';
import { accountSetupLinkFixture, fixedAuthWorkflowTime } from './accountSetupFixtures.server';
import {
	accessRequestFixture,
	createAccessRequestSetupDeliveryFixture,
	createAccessRequestSetupDeliveryStore
} from './accessRequestSetupDeliveryFixture.server';

const { nowFn } = fixedAuthWorkflowTime(new Date('2026-05-18T12:00:00.000Z'));

function makeService(store: ReturnType<typeof createAccessRequestSetupDeliveryStore>) {
	const sendSetupEmail = vi.fn().mockResolvedValue(undefined);
	const service = createAccessRequestSetupDeliveryFixture(store, sendSetupEmail, {
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
			status: 'fresh-setup-sent'
		});
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
		const boundaryDelivery = createAccessRequestSetupDeliveryFixture(
			boundaryStore,
			vi.fn().mockResolvedValue(undefined),
			{ now: () => new Date('2026-04-01T00:00:00.000Z') }
		);

		expect(
			await boundaryDelivery.requestFreshSetupLink({
				email: 'test@example.com',
				origin: 'https://trooptotask.test'
			})
		).toMatchObject({ status: 'fresh-setup-sent' });

		const expiredStore = createAccessRequestSetupDeliveryStore([
			accessRequestFixture({
				createdAt: new Date('2026-01-01T00:00:00.000Z'),
				reviewedAt: new Date('2026-01-01T00:00:00.000Z')
			})
		]);
		const expiredSender = vi.fn().mockResolvedValue(undefined);
		const expiredDelivery = createAccessRequestSetupDeliveryFixture(expiredStore, expiredSender, {
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
		).toMatchObject({ status: 'fresh-setup-sent' });
		expect(sendSetupEmail).toHaveBeenCalledWith(expect.objectContaining({ email: 'test@example.com' }));
		expect(store.setupLinks.find((link) => link.id === 'other-link')).toEqual(otherLink);
		expect(store.outboxRecords.map((record) => record.accessRequestId)).toEqual(['request-1']);
		expect(store.insertedRequests).toEqual([]);
	});

	it('does not deliver or insert another request when renewal persistence fails', async () => {
		const store = createAccessRequestSetupDeliveryStore([accessRequestFixture()]);
		store.issueSetupLink = vi.fn().mockRejectedValue(new Error('synthetic write failure'));
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
		store.issueSetupLink = vi.fn().mockResolvedValue({ status: 'access-request-completed' });
		const { service, sendSetupEmail } = makeService(store);

		const result = await service.requestFreshSetupLink({
			email: 'test@example.com',
			origin: 'https://trooptotask.test'
		});

		expect(result).toEqual({ status: 'no-public-action' });
		expect(sendSetupEmail).not.toHaveBeenCalled();
		expect(store.setupLinks).toEqual([]);
	});

	it('renews the newest request whose grant is still live and never a withdrawn one', async () => {
		const store = createAccessRequestSetupDeliveryStore([
			accessRequestFixture({ id: 'platform-reviewed', createdAt: new Date('2026-05-01T12:00:00.000Z') }),
			accessRequestFixture({
				id: 'invitation-withdrawn',
				setupGrantLive: false,
				createdAt: new Date('2026-05-10T12:00:00.000Z')
			})
		]);
		const { service, sendSetupEmail } = makeService(store);

		expect(
			await service.requestFreshSetupLink({ email: 'test@example.com', origin: 'http://localhost:4173' })
		).toMatchObject({ status: 'fresh-setup-sent' });
		expect(store.setupLinks.map((link) => link.accessRequestId)).toEqual(['platform-reviewed']);
		expect(sendSetupEmail).toHaveBeenCalledOnce();
	});

	it('lets a person whose invitation was withdrawn apply for reviewed access', async () => {
		const store = createAccessRequestSetupDeliveryStore([accessRequestFixture({ setupGrantLive: false })]);
		const { service, sendSetupEmail } = makeService(store);

		expect(await service.submitAccessRequest(makeSubmission())).toEqual({ status: 'pending-created' });
		expect(store.insertedRequests.map((request) => request.email)).toEqual(['test@example.com']);
		expect(store.setupLinks).toEqual([]);
		expect(sendSetupEmail).not.toHaveBeenCalled();
	});

	it('keeps a rescinded or rejected request blocking reviewed resubmission', async () => {
		for (const request of [
			accessRequestFixture({ status: 'rescinded', setupGrantLive: false }),
			accessRequestFixture({ status: 'rejected', setupGrantLive: false })
		]) {
			const store = createAccessRequestSetupDeliveryStore([request]);
			const { service } = makeService(store);

			expect(await service.submitAccessRequest(makeSubmission())).toEqual({ status: 'no-public-action' });
			expect(store.insertedRequests).toEqual([]);
		}
	});

	it('keeps missing, completed, rejected, pending, and no-longer-renewable renewal states quiet', async () => {
		for (const requests of [
			[],
			[accessRequestFixture({ setupCompletedAt: new Date('2026-05-03T12:00:00.000Z') })],
			[accessRequestFixture({ status: 'rejected' })],
			[accessRequestFixture({ status: 'rescinded' })],
			[accessRequestFixture({ setupGrantLive: false })],
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

it.each(['audit', 'delivery-record'] as const)(
	'acknowledges a sent public renewal when its %s write fails afterward',
	async (failure) => {
		const store = createAccessRequestSetupDeliveryStore([accessRequestFixture()]);
		const sendSetupEmail = vi.fn().mockResolvedValue(undefined);
		if (failure === 'delivery-record')
			store.markSetupEmailDeliverySent = async () => {
				throw new Error('Database unavailable');
			};
		const service = createAccessRequestSetupDeliveryFixture(store, sendSetupEmail, {
			now: nowFn,
			audit:
				failure === 'audit'
					? async () => {
							throw new Error('Audit unavailable');
						}
					: async () => {}
		});
		await expect(service.submitAccessRequest(makeSubmission({ origin: 'http://localhost' }))).resolves.toEqual({
			status: 'fresh-setup-sent'
		});
		expect(sendSetupEmail).toHaveBeenCalled();
	}
);
