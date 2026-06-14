import { beforeEach, describe, expect, it, vi } from 'vitest';

const { readEffectivePlanPolicyMock, readOrganizationPlanUsageMock, buildPlanAdminDiagnosticsMock } = vi.hoisted(
	() => ({
		readEffectivePlanPolicyMock: vi.fn(),
		readOrganizationPlanUsageMock: vi.fn(),
		buildPlanAdminDiagnosticsMock: vi.fn()
	})
);

vi.mock('$lib/server/core/useCases/planPolicy', () => ({
	readEffectivePlanPolicy: readEffectivePlanPolicyMock
}));

vi.mock('$lib/server/core/useCases/organizationPlanUsage', () => ({
	readOrganizationPlanUsage: readOrganizationPlanUsageMock
}));

vi.mock('$lib/server/core/useCases/planAdminDiagnostics', () => ({
	buildPlanAdminDiagnostics: buildPlanAdminDiagnosticsMock
}));

import {
	createSupabasePlatformOrganizationLedger,
	createSupabasePlatformOrganizationLedgerStore
} from './supabasePlatformOrganizationLedger';

type QueryStub = {
	select: ReturnType<typeof vi.fn>;
	order: ReturnType<typeof vi.fn>;
	eq: ReturnType<typeof vi.fn>;
	ilike: ReturnType<typeof vi.fn>;
	in: ReturnType<typeof vi.fn>;
	is: ReturnType<typeof vi.fn>;
	not: ReturnType<typeof vi.fn>;
	or: ReturnType<typeof vi.fn>;
	range: ReturnType<typeof vi.fn>;
};

function createQueryStub(response: unknown): QueryStub {
	const query = {
		select: vi.fn(),
		order: vi.fn(),
		eq: vi.fn(),
		ilike: vi.fn(),
		in: vi.fn(),
		is: vi.fn(),
		not: vi.fn(),
		or: vi.fn(),
		range: vi.fn(async () => response)
	};
	query.select.mockReturnValue(query);
	query.order.mockReturnValue(query);
	query.eq.mockReturnValue(query);
	query.ilike.mockReturnValue(query);
	query.in.mockReturnValue(query);
	query.is.mockReturnValue(query);
	query.not.mockReturnValue(query);
	query.or.mockReturnValue(query);
	return query;
}

function organization(id: string) {
	return {
		id,
		name: `${id} Company`,
		tier: 'team',
		gift_tier: null,
		gift_expires_at: null,
		suspended_at: null,
		created_at: '2026-06-01T00:00:00.000Z'
	};
}

function diagnostics() {
	return {
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
	};
}

describe('createSupabasePlatformOrganizationLedgerStore', () => {
	it('reads organizations through a bounded count query range', async () => {
		const organizationsQuery = createQueryStub({
			data: [organization('org-26')],
			count: 101,
			error: null
		});
		const from = vi.fn(() => organizationsQuery);
		const store = createSupabasePlatformOrganizationLedgerStore({ from } as never);

		const result = await store.listOrganizationsPage({
			page: 2,
			pageSize: 25,
			q: '',
			tier: 'all',
			status: 'all',
			statusScope: 'organizations',
			from: 25,
			to: 49
		});

		expect(from).toHaveBeenCalledWith('organizations');
		expect(organizationsQuery.select).toHaveBeenCalledWith(
			'id, name, tier, gift_tier, gift_expires_at, suspended_at, created_at',
			{ count: 'exact' }
		);
		expect(organizationsQuery.order).toHaveBeenCalledWith('created_at', { ascending: false });
		expect(organizationsQuery.ilike).not.toHaveBeenCalled();
		expect(organizationsQuery.range).toHaveBeenCalledWith(25, 49);
		expect(result).toEqual({
			organizations: [organization('org-26')],
			totalCount: 101
		});
	});

	it('applies organization-name search only when a normalized query exists', async () => {
		const organizationsQuery = createQueryStub({
			data: [],
			count: 0,
			error: null
		});
		const from = vi.fn(() => organizationsQuery);
		const store = createSupabasePlatformOrganizationLedgerStore({ from } as never);

		await store.listOrganizationsPage({
			page: 1,
			pageSize: 25,
			q: 'Able',
			tier: 'all',
			status: 'all',
			statusScope: 'organizations',
			from: 0,
			to: 24
		});

		expect(organizationsQuery.ilike).toHaveBeenCalledWith('name', '%Able%');
		expect(organizationsQuery.range).toHaveBeenCalledWith(0, 24);
	});

	it('applies tier and organization status filters before the bounded range', async () => {
		const organizationsQuery = createQueryStub({
			data: [],
			count: 0,
			error: null
		});
		const from = vi.fn(() => organizationsQuery);
		const store = createSupabasePlatformOrganizationLedgerStore({ from } as never);

		await store.listOrganizationsPage({
			page: 1,
			pageSize: 25,
			q: '',
			tier: 'team',
			status: 'active',
			statusScope: 'organizations',
			from: 0,
			to: 24
		});

		expect(organizationsQuery.or).toHaveBeenCalledWith('gift_tier.eq.team,and(gift_tier.is.null,tier.eq.team)');
		expect(organizationsQuery.is).toHaveBeenCalledWith('suspended_at', null);
		expect(organizationsQuery.is).not.toHaveBeenCalledWith('gift_tier', null);
		expect(organizationsQuery.range).toHaveBeenCalledWith(0, 24);
	});

	it('applies subscription billing status filters before the bounded range', async () => {
		const organizationsQuery = createQueryStub({
			data: [],
			count: 0,
			error: null
		});
		const from = vi.fn(() => organizationsQuery);
		const store = createSupabasePlatformOrganizationLedgerStore({ from } as never);

		await store.listOrganizationsPage({
			page: 1,
			pageSize: 25,
			q: '',
			tier: 'all',
			status: 'canceling',
			statusScope: 'subscriptions',
			from: 0,
			to: 24
		});

		expect(organizationsQuery.select).toHaveBeenCalledWith(
			'id, name, tier, gift_tier, gift_expires_at, suspended_at, created_at, organization_billing_snapshots!inner(organization_id)',
			{ count: 'exact' }
		);
		expect(organizationsQuery.eq).toHaveBeenCalledWith('organization_billing_snapshots.cancel_at_period_end', true);
		expect(organizationsQuery.or).toHaveBeenCalledWith('subscription_status.is.null,subscription_status.neq.canceled', {
			referencedTable: 'organization_billing_snapshots'
		});
		expect(organizationsQuery.range).toHaveBeenCalledWith(0, 24);
	});

	it('loads billing snapshots only for current-page organization ids', async () => {
		const billingQuery = createQueryStub({
			data: [],
			count: null,
			error: null
		});
		const from = vi.fn(() => billingQuery);
		const store = createSupabasePlatformOrganizationLedgerStore({ from } as never);

		await store.listBillingSnapshotsByOrganization(['org-1', 'org-2']);

		expect(from).toHaveBeenCalledWith('organization_billing_snapshots');
		expect(billingQuery.in).toHaveBeenCalledWith('organization_id', ['org-1', 'org-2']);
		expect(billingQuery.range).toHaveBeenCalledWith(0, 1);
	});
});

describe('createSupabasePlatformOrganizationLedger', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		readEffectivePlanPolicyMock.mockResolvedValue({ kind: 'policy' });
		readOrganizationPlanUsageMock.mockResolvedValue({ kind: 'usage' });
		buildPlanAdminDiagnosticsMock.mockReturnValue(diagnostics());
	});

	it('requests metrics, billing snapshots, and plan diagnostics only for page organization ids', async () => {
		const organizationsQuery = createQueryStub({
			data: [organization('org-1'), organization('org-2')],
			count: 100,
			error: null
		});
		const billingQuery = createQueryStub({
			data: [],
			count: null,
			error: null
		});
		const from = vi.fn((table: string) => {
			if (table === 'organizations') return organizationsQuery;
			if (table === 'organization_billing_snapshots') return billingQuery;
			throw new Error(`Unexpected table ${table}`);
		});
		const rpc = vi.fn(async (name: string, params: unknown) => {
			if (name === 'count_personnel_by_organization') {
				return {
					data: [
						{ organization_id: 'org-1', personnel_count: 7 },
						{ organization_id: 'org-2', personnel_count: 9 }
					],
					error: null
				};
			}
			if (name === 'list_platform_owner_membership_metrics') {
				return { data: [], error: null };
			}
			throw new Error(`Unexpected RPC ${name} ${JSON.stringify(params)}`);
		});
		const ledger = createSupabasePlatformOrganizationLedger({
			adminUser: { id: 'admin-1', role: 'super_admin' },
			adminClient: { from, rpc },
			sessionClient: { from, rpc },
			session: null,
			audit: vi.fn()
		} as never);

		const result = await ledger.listSubscriptions({ page: 1, pageSize: 2 });

		expect(result.pagination).toMatchObject({ totalCount: 100, pageSize: 2 });
		expect(organizationsQuery.range).toHaveBeenCalledWith(0, 1);
		expect(rpc).toHaveBeenCalledWith('count_personnel_by_organization', {
			p_org_ids: ['org-1', 'org-2']
		});
		expect(rpc).toHaveBeenCalledWith('list_platform_owner_membership_metrics', {
			p_org_ids: ['org-1', 'org-2']
		});
		expect(billingQuery.in).toHaveBeenCalledWith('organization_id', ['org-1', 'org-2']);
		expect(readEffectivePlanPolicyMock).toHaveBeenCalledTimes(2);
		expect(readEffectivePlanPolicyMock).toHaveBeenCalledWith(expect.objectContaining({ auth: { orgId: 'org-1' } }));
		expect(readEffectivePlanPolicyMock).toHaveBeenCalledWith(expect.objectContaining({ auth: { orgId: 'org-2' } }));
		expect(readEffectivePlanPolicyMock).not.toHaveBeenCalledWith(
			expect.objectContaining({ auth: { orgId: 'org-99' } })
		);
	});
});
