import { describe, expect, it, vi } from 'vitest';
import {
	createSupabasePlatformOrganizationDetailStore,
	mapAdminOrganizationBillingSnapshot,
	type AdminOrganizationBillingSnapshotRow
} from './supabasePlatformOrganizationDetail';

type QueryStub = {
	select: ReturnType<typeof vi.fn>;
	eq: ReturnType<typeof vi.fn>;
	maybeSingle: ReturnType<typeof vi.fn>;
};

function createQueryStub(response: unknown): QueryStub {
	const query = {
		select: vi.fn(),
		eq: vi.fn(),
		maybeSingle: vi.fn(async () => response)
	};
	query.select.mockReturnValue(query);
	query.eq.mockReturnValue(query);
	return query;
}

function billingSnapshotRow(
	overrides: Partial<AdminOrganizationBillingSnapshotRow> = {}
): AdminOrganizationBillingSnapshotRow {
	return {
		organization_id: '11111111-1111-4111-8111-111111111111',
		source: 'stripe',
		commercial_plan: 'team',
		stripe_customer_id: 'cus_123',
		stripe_subscription_id: 'sub_123',
		stripe_product_id: 'prod_123',
		stripe_price_id: 'price_123',
		subscription_status: 'active',
		collection_status: null,
		current_period_start: '2026-06-01T00:00:00.000Z',
		current_period_end: '2026-07-01T00:00:00.000Z',
		cancel_at_period_end: false,
		canceled_at: null,
		cancellation_reason: null,
		cancellation_feedback: null,
		trial_end: null,
		sync_status: 'synced',
		last_stripe_event_id: 'evt_123',
		last_stripe_event_type: 'customer.subscription.updated',
		last_stripe_event_created_at: '2026-06-01T00:01:00.000Z',
		last_processed_at: '2026-06-01T00:02:00.000Z',
		last_reconciled_at: '2026-06-01T00:03:00.000Z',
		reconciliation_result: 'matched',
		drift_detected: false,
		...overrides
	};
}

describe('createSupabasePlatformOrganizationDetailStore', () => {
	it('reads the expected organization detail columns by id', async () => {
		const organizationQuery = createQueryStub({
			data: {
				id: '11111111-1111-4111-8111-111111111111',
				name: 'Able Company',
				tier: 'team',
				gift_tier: null,
				gift_expires_at: null,
				suspended_at: null,
				created_at: '2026-06-01T00:00:00.000Z'
			},
			error: null
		});
		const from = vi.fn(() => organizationQuery);

		const result = await createSupabasePlatformOrganizationDetailStore({ from } as never).getOrganizationById(
			'11111111-1111-4111-8111-111111111111'
		);

		expect(from).toHaveBeenCalledWith('organizations');
		expect(organizationQuery.select).toHaveBeenCalledWith(
			'id, name, tier, gift_tier, gift_expires_at, suspended_at, created_at'
		);
		expect(organizationQuery.eq).toHaveBeenCalledWith('id', '11111111-1111-4111-8111-111111111111');
		expect(organizationQuery.maybeSingle).toHaveBeenCalledOnce();
		expect(result).toMatchObject({ id: '11111111-1111-4111-8111-111111111111', name: 'Able Company' });
	});

	it('reads the expected billing snapshot columns by organization id', async () => {
		const billingQuery = createQueryStub({
			data: billingSnapshotRow(),
			error: null
		});
		const from = vi.fn(() => billingQuery);

		const result = await createSupabasePlatformOrganizationDetailStore({
			from
		} as never).getBillingSnapshotByOrganization('11111111-1111-4111-8111-111111111111');

		expect(from).toHaveBeenCalledWith('organization_billing_snapshots');
		expect(billingQuery.select).toHaveBeenCalledWith(
			'organization_id, source, commercial_plan, stripe_customer_id, stripe_subscription_id, stripe_product_id, stripe_price_id, subscription_status, collection_status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, cancellation_reason, cancellation_feedback, trial_end, sync_status, last_stripe_event_id, last_stripe_event_type, last_stripe_event_created_at, last_processed_at, last_reconciled_at, reconciliation_result, drift_detected'
		);
		expect(billingQuery.eq).toHaveBeenCalledWith('organization_id', '11111111-1111-4111-8111-111111111111');
		expect(result).toMatchObject({
			organizationId: '11111111-1111-4111-8111-111111111111',
			stripeCustomerId: 'cus_123'
		});
	});

	it('maps billing cancellation and drift fields from the provider row', () => {
		const snapshot = mapAdminOrganizationBillingSnapshot(
			billingSnapshotRow({
				subscription_status: 'canceled',
				cancel_at_period_end: true,
				canceled_at: '2026-06-15T00:00:00.000Z',
				cancellation_reason: 'customer request',
				cancellation_feedback: 'unused',
				drift_detected: true
			})
		);

		expect(snapshot).toMatchObject({
			subscriptionStatus: 'canceled',
			cancelAtPeriodEnd: true,
			canceledAt: '2026-06-15T00:00:00.000Z',
			cancellationReason: 'customer request',
			cancellationFeedback: 'unused',
			driftDetected: true,
			giftTier: null,
			giftExpiresAt: null
		});
	});

	it('does not silently convert provider errors into null organization details', async () => {
		const providerError = { message: 'database offline', code: 'XX000' };
		const organizationQuery = createQueryStub({
			data: null,
			error: providerError
		});
		const from = vi.fn(() => organizationQuery);

		await expect(
			createSupabasePlatformOrganizationDetailStore({ from } as never).getOrganizationById(
				'11111111-1111-4111-8111-111111111111'
			)
		).rejects.toBe(providerError);
	});

	it('does not silently convert billing snapshot provider errors into null snapshots', async () => {
		const providerError = { message: 'database offline', code: 'XX000' };
		const billingQuery = createQueryStub({
			data: null,
			error: providerError
		});
		const from = vi.fn(() => billingQuery);

		await expect(
			createSupabasePlatformOrganizationDetailStore({ from } as never).getBillingSnapshotByOrganization(
				'11111111-1111-4111-8111-111111111111'
			)
		).rejects.toBe(providerError);
	});
});
