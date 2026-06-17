import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { readReadOnlyModeState } from './readOnlyMode';

const { billingEnabledMock } = vi.hoisted(() => ({
	billingEnabledMock: vi.fn(() => true)
}));

vi.mock('$lib/config/billing', () => ({
	get isBillingEnabled() {
		return billingEnabledMock();
	}
}));

describe('Read-Only Mode', () => {
	it('uses Effective Plan Policy billing state as the write gate', async () => {
		const ctx = seededBillingContext();
		ctx.rawStore.seed('organization_billing_snapshots', [
			billingSnapshot({
				subscription_status: 'canceled',
				collection_status: 'canceled'
			})
		]);

		await expect(readReadOnlyModeState({ auth: ctx.auth, store: ctx.rawStore })).resolves.toEqual({
			isReadOnly: true,
			reason: 'billing_state',
			message: 'Organization billing is not currently active. Restore the subscription to regain paid write access.'
		});
	});

	it('includes active Personnel over-limit state in the write gate', async () => {
		const ctx = seededBillingContext();
		ctx.rawStore.seed('personnel', personnel(21));

		await expect(readReadOnlyModeState({ auth: ctx.auth, store: ctx.rawStore })).resolves.toEqual({
			isReadOnly: true,
			reason: 'personnel_limit',
			message: 'Organization is in read-only mode. Please subscribe or remove personnel.'
		});
	});

	it('does not enforce Read-Only Mode while billing is disabled', async () => {
		const ctx = seededBillingContext({ billingEnabled: false });
		ctx.rawStore.seed('organization_billing_snapshots', [
			billingSnapshot({
				subscription_status: 'canceled',
				collection_status: 'canceled'
			})
		]);
		ctx.rawStore.seed('personnel', personnel(21));

		await expect(readReadOnlyModeState({ auth: ctx.auth, store: ctx.rawStore })).resolves.toEqual({
			isReadOnly: false,
			reason: null,
			message: null
		});
	});

	it('preserves paid Unit compatibility when active Personnel exceeds the base Unit limit', async () => {
		const ctx = seededBillingContext();
		ctx.rawStore.seed('organization_billing_snapshots', [
			billingSnapshot({
				commercial_plan: 'unit'
			})
		]);
		ctx.rawStore.seed('personnel', personnel(501));

		await expect(readReadOnlyModeState({ auth: ctx.auth, store: ctx.rawStore })).resolves.toEqual({
			isReadOnly: false,
			reason: null,
			message: null
		});
	});

	it('preserves gifted Unit compatibility when active Personnel exceeds the base Unit limit', async () => {
		const ctx = seededBillingContext({
			organization: {
				gift_tier: 'unit',
				gift_expires_at: '2099-01-01T00:00:00.000Z'
			}
		});
		ctx.rawStore.seed('personnel', personnel(501));

		await expect(readReadOnlyModeState({ auth: ctx.auth, store: ctx.rawStore })).resolves.toEqual({
			isReadOnly: false,
			reason: null,
			message: null
		});
	});

	it('preserves legacy Unit compatibility when active Personnel exceeds the base Unit limit', async () => {
		const ctx = seededBillingContext();
		ctx.rawStore.seed('organization_billing_snapshots', [
			billingSnapshot({
				source: 'legacy_organization',
				commercial_plan: 'unit'
			})
		]);
		ctx.rawStore.seed('personnel', personnel(501));

		await expect(readReadOnlyModeState({ auth: ctx.auth, store: ctx.rawStore })).resolves.toEqual({
			isReadOnly: false,
			reason: null,
			message: null
		});
	});
});

function seededBillingContext(options: { billingEnabled?: boolean; organization?: Record<string, unknown> } = {}) {
	billingEnabledMock.mockReturnValue(options.billingEnabled ?? true);
	const ctx = createTestContext({ auth: { orgId: 'org-1' } });
	seedBillingOrganization(ctx, options.organization);
	return ctx;
}

function seedBillingOrganization(ctx: ReturnType<typeof createTestContext>, overrides: Record<string, unknown> = {}) {
	ctx.rawStore.seed('organizations', [
		{
			id: 'org-1',
			tier: 'free',
			stripe_customer_id: null,
			stripe_subscription_id: null,
			subscription_status: null,
			current_period_end: null,
			gift_tier: null,
			gift_expires_at: null,
			...overrides
		}
	]);
}

function billingSnapshot(overrides: Record<string, unknown> = {}) {
	return {
		id: 'snapshot-1',
		organization_id: 'org-1',
		source: 'stripe',
		commercial_plan: 'free',
		stripe_customer_id: 'cus_123',
		stripe_subscription_id: 'sub_123',
		stripe_product_id: 'prod_free',
		stripe_price_id: 'price_free',
		subscription_status: 'active',
		collection_status: 'current',
		current_period_start: null,
		current_period_end: null,
		cancel_at_period_end: false,
		canceled_at: null,
		cancellation_reason: null,
		cancellation_feedback: null,
		trial_end: null,
		sync_status: 'synced',
		last_stripe_event_id: null,
		last_stripe_event_type: null,
		last_stripe_event_created_at: null,
		last_processed_at: null,
		last_reconciled_at: null,
		reconciliation_result: null,
		drift_detected: false,
		...overrides
	};
}

function personnel(count: number) {
	return Array.from({ length: count }, (_, index) => ({
		id: `person-${index + 1}`,
		organization_id: 'org-1',
		archived_at: null
	}));
}
