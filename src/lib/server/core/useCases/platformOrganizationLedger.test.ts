import { describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_PLATFORM_LEDGER_PAGE_SIZE,
	MAX_PLATFORM_LEDGER_PAGE_SIZE,
	createPlatformOrganizationLedger,
	normalizePlatformOrganizationLedgerQuery,
	type PlatformOrganizationLedgerBaseRow,
	type PlatformOrganizationLedgerStore
} from './platformOrganizationLedger';
import type { PlanAdminDiagnostics } from './planAdminDiagnostics';
import type { PlatformMetrics } from './platformMetrics';

function organization(overrides: Partial<PlatformOrganizationLedgerBaseRow> = {}): PlatformOrganizationLedgerBaseRow {
	return {
		id: 'org-1',
		name: 'Able Company',
		tier: 'team',
		gift_tier: null,
		gift_expires_at: null,
		suspended_at: null,
		created_at: '2026-06-01T00:00:00.000Z',
		...overrides
	};
}

function metrics(): PlatformMetrics {
	return {
		countMembershipsByOrganization: vi.fn(async () => new Map()),
		countActivePersonnelByOrganization: vi.fn(async () => new Map()),
		countActivePersonnelForOrganization: vi.fn(async () => 0),
		getOwnerMembershipsByOrganization: vi.fn(async () => new Map()),
		getOrganizationMetrics: vi.fn(async () => ({
			memberCounts: new Map(),
			activePersonnelCounts: new Map(),
			ownerMemberships: new Map()
		}))
	};
}

describe('normalizePlatformOrganizationLedgerQuery', () => {
	it('clamps invalid pages to page 1 with the default page size', () => {
		expect(normalizePlatformOrganizationLedgerQuery({ page: '0', pageSize: 'not-a-number' })).toEqual({
			page: 1,
			pageSize: DEFAULT_PLATFORM_LEDGER_PAGE_SIZE,
			q: '',
			tier: 'all',
			status: 'all',
			statusScope: 'organizations',
			from: 0,
			to: DEFAULT_PLATFORM_LEDGER_PAGE_SIZE - 1
		});
	});

	it('caps requested page sizes at the platform maximum', () => {
		expect(normalizePlatformOrganizationLedgerQuery({ page: '2', pageSize: '999' })).toEqual({
			page: 2,
			pageSize: MAX_PLATFORM_LEDGER_PAGE_SIZE,
			q: '',
			tier: 'all',
			status: 'all',
			statusScope: 'organizations',
			from: MAX_PLATFORM_LEDGER_PAGE_SIZE,
			to: MAX_PLATFORM_LEDGER_PAGE_SIZE * 2 - 1
		});
	});

	it('trims search query input before building the bounded range', () => {
		expect(normalizePlatformOrganizationLedgerQuery({ page: '3', pageSize: '25', q: '  able  ' })).toEqual({
			page: 3,
			pageSize: 25,
			q: 'able',
			tier: 'all',
			status: 'all',
			statusScope: 'organizations',
			from: 50,
			to: 74
		});
	});

	it('normalizes tier and status filters into the bounded query', () => {
		expect(
			normalizePlatformOrganizationLedgerQuery(
				{ tier: ' TEAM ', status: ' suspended ' },
				new Set(['active', 'suspended'])
			)
		).toMatchObject({
			tier: 'team',
			status: 'suspended'
		});
		expect(normalizePlatformOrganizationLedgerQuery({ tier: 'enterprise', status: 'gifted' })).toMatchObject({
			tier: 'all',
			status: 'all'
		});
	});
});

describe('createPlatformOrganizationLedger', () => {
	it('returns page metadata from the bounded organization page', async () => {
		const store: PlatformOrganizationLedgerStore = {
			listOrganizationsPage: vi.fn(async () => ({
				organizations: [organization({ id: 'org-1' }), organization({ id: 'org-2' })],
				totalCount: 12
			})),
			listBillingSnapshotsByOrganization: vi.fn(async () => new Map())
		};

		const ledger = createPlatformOrganizationLedger({
			store,
			metrics: metrics(),
			adminRole: 'super_admin'
		});

		const result = await ledger.listOrganizations({ page: 2, pageSize: 5, q: ' Able ' });

		expect(store.listOrganizationsPage).toHaveBeenCalledWith({
			page: 2,
			pageSize: 5,
			q: 'Able',
			tier: 'all',
			status: 'all',
			statusScope: 'organizations',
			from: 5,
			to: 9
		});
		expect(result.pagination).toEqual({
			page: 2,
			pageSize: 5,
			totalCount: 12,
			totalPages: 3,
			q: 'Able',
			tier: 'all',
			status: 'all'
		});
		expect(result.organizations).toHaveLength(2);
	});

	it('runs subscription diagnostics only for organizations on the returned page', async () => {
		const readPlanDiagnostics = vi.fn(
			async (): Promise<PlanAdminDiagnostics> => ({
				effectivePlan: {
					commercialPlan: 'team',
					tier: 'team',
					source: 'billing_snapshot',
					sourceLabel: 'Local billing snapshot',
					billingSource: 'stripe',
					giftTier: null,
					giftExpiresAt: null
				},
				grace: { mode: 'none', message: null },
				readOnly: { enabled: false, reasons: [] },
				usageRows: [],
				overLimitReasons: [],
				entitlements: []
			})
		);
		const store: PlatformOrganizationLedgerStore = {
			listOrganizationsPage: vi.fn(async () => ({
				organizations: [organization({ id: 'org-1' }), organization({ id: 'org-2' })],
				totalCount: 100
			})),
			listBillingSnapshotsByOrganization: vi.fn(async () => new Map())
		};

		const ledger = createPlatformOrganizationLedger({
			store,
			metrics: metrics(),
			adminRole: 'super_admin',
			readPlanDiagnostics
		});

		await ledger.listSubscriptions({ page: 1, pageSize: 2 });

		expect(store.listOrganizationsPage).toHaveBeenCalledWith(
			expect.objectContaining({
				statusScope: 'subscriptions'
			})
		);
		expect(readPlanDiagnostics).toHaveBeenCalledTimes(2);
		expect(readPlanDiagnostics).toHaveBeenCalledWith('org-1');
		expect(readPlanDiagnostics).toHaveBeenCalledWith('org-2');
		expect(readPlanDiagnostics).not.toHaveBeenCalledWith('org-99');
	});
});
