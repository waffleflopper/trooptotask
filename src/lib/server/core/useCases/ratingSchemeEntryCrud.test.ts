import { describe, it, expect } from 'vitest';
import {
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestReadOnlyGuard,
	createTestSubscriptionPort,
	createTestNotificationPort
} from '$lib/server/adapters/inMemory';
import type { UseCaseContext } from '$lib/server/core/ports';
import { createRatingSchemeEntryUseCases } from './ratingSchemeEntryCrud';

type TestContext = Omit<UseCaseContext, 'store'> & {
	store: ReturnType<typeof createInMemoryDataStore>;
	auditPort: ReturnType<typeof createTestAuditPort>;
	subscription: ReturnType<typeof createTestSubscriptionPort>;
};

function buildContext(overrides?: {
	auth?: Parameters<typeof createTestAuthContext>[0];
	readOnly?: boolean;
}): TestContext {
	const store = createInMemoryDataStore();
	const auth = createTestAuthContext(overrides?.auth);
	const auditPort = createTestAuditPort();
	const readOnlyGuard = createTestReadOnlyGuard(overrides?.readOnly ?? false);

	const subscription = createTestSubscriptionPort();
	return {
		store,
		rawStore: store,
		auth,
		audit: auditPort,
		readOnlyGuard,
		subscription,
		auditPort,
		notifications: createTestNotificationPort()
	};
}

const validInput = {
	ratedPersonId: 'person-1',
	evalType: 'OER',
	ratingPeriodStart: '2026-01-01',
	ratingPeriodEnd: '2026-06-30',
	status: 'draft'
};

describe('Rating scheme entry — create', () => {
	it('creates an entry, persists it, and audits', async () => {
		const ctx = buildContext();
		const { create } = createRatingSchemeEntryUseCases();

		const result = (await create(ctx, { ...validInput })) as Record<string, unknown>;

		expect(result).toMatchObject({
			ratedPersonId: 'person-1',
			evalType: 'OER',
			status: 'draft'
		});

		const stored = await ctx.store.findMany('rating_scheme_entries', 'test-org');
		expect(stored).toHaveLength(1);

		expect(ctx.auditPort.events).toHaveLength(1);
		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'rating_scheme.created',
			resourceType: 'rating_scheme'
		});
	});

	it('coerces empty strings to null on create', async () => {
		const ctx = buildContext();
		const { create } = createRatingSchemeEntryUseCases();

		await create(ctx, { ...validInput, raterName: '', seniorRaterName: '' });

		const stored = (await ctx.store.findMany('rating_scheme_entries', 'test-org')) as Record<string, unknown>[];
		expect(stored[0].rater_name).toBeNull();
		expect(stored[0].senior_rater_name).toBeNull();
	});

	it('rejects create when read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		const { create } = createRatingSchemeEntryUseCases();

		await expect(create(ctx, { ...validInput })).rejects.toMatchObject({ status: 403 });
	});
});

describe('Rating scheme entry — update', () => {
	it('updates an entry and audits', async () => {
		const ctx = buildContext();
		const { update } = createRatingSchemeEntryUseCases();

		ctx.store.seed('rating_scheme_entries', [
			{
				id: 'rs-1',
				rated_person_id: 'person-1',
				eval_type: 'OER',
				rating_period_start: '2026-01-01',
				rating_period_end: '2026-06-30',
				status: 'draft',
				organization_id: 'test-org'
			}
		]);

		const result = (await update(ctx, { id: 'rs-1', status: 'complete' })) as Record<string, unknown>;
		expect(result.status).toBe('complete');

		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'rating_scheme.updated',
			resourceId: 'rs-1'
		});
	});

	it('coerces empty strings to null on update', async () => {
		const ctx = buildContext();
		const { update } = createRatingSchemeEntryUseCases();

		ctx.store.seed('rating_scheme_entries', [
			{
				id: 'rs-1',
				rated_person_id: 'person-1',
				eval_type: 'OER',
				rating_period_start: '2026-01-01',
				rating_period_end: '2026-06-30',
				status: 'draft',
				rater_name: 'Old Rater',
				organization_id: 'test-org'
			}
		]);

		await update(ctx, { id: 'rs-1', raterName: '' });

		const stored = (await ctx.store.findOne('rating_scheme_entries', 'test-org', { id: 'rs-1' })) as Record<
			string,
			unknown
		>;
		expect(stored.rater_name).toBeNull();
	});
});

describe('Rating scheme entry — delete', () => {
	it('deletes entry, audits, and notifies admins', async () => {
		const ctx = buildContext();
		const { remove } = createRatingSchemeEntryUseCases();

		ctx.store.seed('rating_scheme_entries', [
			{
				id: 'rs-1',
				rated_person_id: 'person-1',
				eval_type: 'OER',
				status: 'draft',
				organization_id: 'test-org'
			}
		]);
		ctx.store.seed('organization_memberships', [{ user_id: 'admin-2', organization_id: 'test-org', role: 'admin' }]);

		await remove(ctx, 'rs-1');

		const stored = await ctx.store.findOne('rating_scheme_entries', 'test-org', { id: 'rs-1' });
		expect(stored).toBeNull();

		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'rating_scheme.deleted',
			resourceId: 'rs-1'
		});

		const notifications = await ctx.store.findMany('notifications', 'test-org');
		expect(notifications).toHaveLength(1);
	});

	it('returns requiresApproval for non-privileged, non-full-editor users', async () => {
		const ctx = buildContext({
			auth: { isPrivileged: false, isFullEditor: false, role: 'member' }
		});
		const { remove } = createRatingSchemeEntryUseCases();

		ctx.store.seed('rating_scheme_entries', [
			{
				id: 'rs-1',
				rated_person_id: 'person-1',
				eval_type: 'OER',
				status: 'draft',
				organization_id: 'test-org'
			}
		]);

		const result = await remove(ctx, 'rs-1');
		expect(result).toMatchObject({ requiresApproval: true });

		// Entry should NOT be deleted
		const stored = await ctx.store.findOne('rating_scheme_entries', 'test-org', { id: 'rs-1' });
		expect(stored).not.toBeNull();
	});

	it('rejects delete when read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		const { remove } = createRatingSchemeEntryUseCases();

		await expect(remove(ctx, 'rs-1')).rejects.toMatchObject({ status: 403 });
	});
});
