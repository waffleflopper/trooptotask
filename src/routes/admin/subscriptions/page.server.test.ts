import { isHttpError } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageData } from './$types';
import type { BillingSnapshot } from '$lib/types/subscription';

const { organizationLedgerMock, createOrganizationLedgerMock } = vi.hoisted(() => ({
	organizationLedgerMock: {
		listSubscriptions: vi.fn()
	},
	createOrganizationLedgerMock: vi.fn()
}));

vi.mock('$lib/server/adapters/adminAdapter', () => ({
	loadWithAdminContext: (config: { fn: (ctx: unknown, event: unknown) => unknown }) => (event: { __ctx: unknown }) =>
		config.fn(event.__ctx, event)
}));

vi.mock('$lib/server/adapters/supabasePlatformOrganizationLedger', () => ({
	createSupabasePlatformOrganizationLedger: createOrganizationLedgerMock
}));

import { _visibleBillingSnapshotForRole, load } from './+page.server';

function makeContext() {
	return {
		adminUser: { id: 'admin-1', role: 'super_admin' },
		adminClient: {},
		sessionClient: {},
		session: null,
		audit: vi.fn()
	};
}

async function expectSanitizedServerError(loadResult: unknown, message: string) {
	try {
		await loadResult;
		expect.unreachable('Expected load to throw');
	} catch (err) {
		expect(isHttpError(err)).toBe(true);
		expect(err).toMatchObject({
			status: 500,
			body: { message }
		});
		expect(err).not.toMatchObject({
			body: { message: expect.stringContaining('database offline') }
		});
	}
}

function snapshot(overrides: Partial<BillingSnapshot> = {}): BillingSnapshot {
	return {
		organizationId: 'org-1',
		source: 'stripe',
		commercialPlan: 'team',
		stripeCustomerId: 'cus_secret',
		stripeSubscriptionId: 'sub_secret',
		stripeProductId: 'prod_secret',
		stripePriceId: 'price_secret',
		subscriptionStatus: 'active',
		collectionStatus: null,
		currentPeriodStart: null,
		currentPeriodEnd: null,
		cancelAtPeriodEnd: false,
		canceledAt: null,
		cancellationReason: null,
		cancellationFeedback: null,
		trialEnd: null,
		syncStatus: 'synced',
		lastStripeEventId: 'evt_secret',
		lastStripeEventType: 'customer.subscription.updated',
		lastStripeEventCreatedAt: '2026-06-01T00:00:00.000Z',
		lastProcessedAt: '2026-06-01T00:01:00.000Z',
		lastReconciledAt: '2026-06-01T00:02:00.000Z',
		reconciliationResult: null,
		driftDetected: false,
		giftTier: null,
		giftExpiresAt: null,
		...overrides
	};
}

describe('admin subscriptions server diagnostics', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		createOrganizationLedgerMock.mockReturnValue(organizationLedgerMock);
		organizationLedgerMock.listSubscriptions.mockResolvedValue({
			subscriptions: [],
			pagination: {
				page: 1,
				pageSize: 25,
				totalCount: 0,
				totalPages: 1,
				q: ''
			},
			billingDiagnosticsError: false,
			planDiagnosticsError: false
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('uses the shared admin billing visibility helper', () => {
		expect(_visibleBillingSnapshotForRole('support', null)).toBeNull();
		expect(_visibleBillingSnapshotForRole('support', snapshot())).toMatchObject({
			stripeCustomerId: null,
			stripeSubscriptionId: null,
			stripeProductId: null,
			stripePriceId: null,
			lastStripeEventId: null,
			lastStripeEventType: null,
			lastStripeEventCreatedAt: null,
			lastProcessedAt: null
		});
	});

	it('passes page, page size, and organization-name search params into the Platform Organization Ledger', async () => {
		organizationLedgerMock.listSubscriptions.mockResolvedValueOnce({
			subscriptions: [{ id: 'org-1', name: 'Able Company' }],
			pagination: {
				page: 2,
				pageSize: 50,
				totalCount: 77,
				totalPages: 2,
				q: 'Able'
			},
			billingDiagnosticsError: false,
			planDiagnosticsError: false
		});

		const result = (await load({
			__ctx: makeContext(),
			url: new URL('http://localhost/admin/subscriptions?page=2&pageSize=50&q=Able')
		} as unknown as Parameters<typeof load>[0])) as PageData;

		expect(createOrganizationLedgerMock).toHaveBeenCalledWith(
			expect.objectContaining({ adminUser: { id: 'admin-1', role: 'super_admin' } })
		);
		expect(organizationLedgerMock.listSubscriptions).toHaveBeenCalledWith({
			page: '2',
			pageSize: '50',
			q: 'Able'
		});
		expect(result.pagination).toMatchObject({ page: 2, pageSize: 50, totalCount: 77, q: 'Able' });
	});

	it('throws a sanitized load error when the primary organization ledger cannot load', async () => {
		organizationLedgerMock.listSubscriptions.mockRejectedValueOnce(new Error('database offline'));

		await expectSanitizedServerError(
			load({
				__ctx: makeContext(),
				url: new URL('http://localhost/admin/subscriptions')
			} as unknown as Parameters<typeof load>[0]),
			'Unable to load platform subscriptions.'
		);
	});

	it('keeps billing and plan diagnostics as warning flags after the organization ledger loads', async () => {
		organizationLedgerMock.listSubscriptions.mockResolvedValueOnce({
			subscriptions: [
				{
					id: 'org-1',
					name: 'Able Company',
					billingSnapshot: null,
					planDiagnostics: null
				}
			],
			pagination: {
				page: 1,
				pageSize: 25,
				totalCount: 1,
				totalPages: 1,
				q: ''
			},
			billingDiagnosticsError: true,
			planDiagnosticsError: true
		});

		const result = (await load({
			__ctx: makeContext(),
			url: new URL('http://localhost/admin/subscriptions')
		} as unknown as Parameters<typeof load>[0])) as PageData;

		expect(result).toMatchObject({
			billingDiagnosticsError: true,
			planDiagnosticsError: true
		});
		expect(result.subscriptions).toHaveLength(1);
		expect(result.subscriptions[0]).toMatchObject({
			id: 'org-1',
			name: 'Able Company',
			billingSnapshot: null,
			planDiagnostics: null
		});
	});
});
