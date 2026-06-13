import { isHttpError } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageData } from './$types';

const {
	selectAllSupabaseRowsMock,
	platformMetricsMock,
	createSupabaseDataStoreMock,
	readEffectivePlanPolicyMock,
	readOrganizationPlanUsageMock,
	buildPlanAdminDiagnosticsMock
} = vi.hoisted(() => ({
	selectAllSupabaseRowsMock: vi.fn(),
	platformMetricsMock: {
		countActivePersonnelByOrganization: vi.fn(),
		getOwnerMembershipsByOrganization: vi.fn()
	},
	createSupabaseDataStoreMock: vi.fn(),
	readEffectivePlanPolicyMock: vi.fn(),
	readOrganizationPlanUsageMock: vi.fn(),
	buildPlanAdminDiagnosticsMock: vi.fn()
}));

vi.mock('$lib/server/adapters/adminAdapter', () => ({
	loadWithAdminContext: (config: { fn: (ctx: unknown, event: unknown) => unknown }) => (event: { __ctx: unknown }) =>
		config.fn(event.__ctx, event)
}));

vi.mock('$lib/server/supabasePagination', () => ({
	selectAllSupabaseRows: selectAllSupabaseRowsMock
}));

vi.mock('$lib/server/adapters/supabasePlatformMetrics', () => ({
	createSupabasePlatformMetrics: () => platformMetricsMock
}));

vi.mock('$lib/server/adapters/supabaseDataStore', () => ({
	createSupabaseDataStore: createSupabaseDataStoreMock
}));

vi.mock('$lib/server/core/useCases/planPolicy', () => ({
	readEffectivePlanPolicy: readEffectivePlanPolicyMock
}));

vi.mock('$lib/server/core/useCases/organizationPlanUsage', () => ({
	readOrganizationPlanUsage: readOrganizationPlanUsageMock
}));

vi.mock('$lib/server/core/useCases/planAdminDiagnostics', () => ({
	buildPlanAdminDiagnostics: buildPlanAdminDiagnosticsMock
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

describe('admin subscriptions server diagnostics', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		selectAllSupabaseRowsMock.mockResolvedValue({ data: [], error: null });
		platformMetricsMock.countActivePersonnelByOrganization.mockResolvedValue(new Map());
		platformMetricsMock.getOwnerMembershipsByOrganization.mockResolvedValue(new Map());
		createSupabaseDataStoreMock.mockReturnValue({ kind: 'data-store' });
		readEffectivePlanPolicyMock.mockResolvedValue({ kind: 'plan-policy' });
		readOrganizationPlanUsageMock.mockResolvedValue({ kind: 'plan-usage' });
		buildPlanAdminDiagnosticsMock.mockReturnValue({ overLimitReasons: [] });
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('uses the shared admin billing visibility helper', () => {
		expect(_visibleBillingSnapshotForRole('support', null)).toBeNull();
	});

	it('throws a sanitized load error when the primary organization ledger cannot load', async () => {
		selectAllSupabaseRowsMock.mockResolvedValueOnce({
			data: null,
			error: { message: 'database offline' }
		});

		await expectSanitizedServerError(
			load({
				__ctx: makeContext()
			} as unknown as Parameters<typeof load>[0]),
			'Unable to load platform subscriptions.'
		);
		expect(platformMetricsMock.countActivePersonnelByOrganization).not.toHaveBeenCalled();
	});

	it('keeps billing and plan diagnostics as warning flags after the organization ledger loads', async () => {
		selectAllSupabaseRowsMock
			.mockResolvedValueOnce({
				data: [
					{
						id: 'org-1',
						name: 'Able Company',
						tier: 'team',
						gift_tier: null,
						gift_expires_at: null,
						suspended_at: null,
						created_at: '2026-06-01T00:00:00.000Z'
					}
				],
				error: null
			})
			.mockResolvedValueOnce({
				data: null,
				error: { message: 'billing snapshots offline' }
			});
		readEffectivePlanPolicyMock.mockRejectedValueOnce(new Error('plan diagnostics offline'));

		const result = (await load({
			__ctx: makeContext()
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
