import { isHttpError } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageData } from './$types';

const { organizationLedgerMock, createOrganizationLedgerMock, billingHealthMock, createBillingHealthMock } = vi.hoisted(
	() => ({
		organizationLedgerMock: {
			listSubscriptions: vi.fn()
		},
		createOrganizationLedgerMock: vi.fn(),
		billingHealthMock: {
			summarize: vi.fn()
		},
		createBillingHealthMock: vi.fn()
	})
);

vi.mock('$lib/server/adapters/adminAdapter', () => ({
	loadWithAdminContext: (config: { fn: (ctx: unknown, event: unknown) => unknown }) => (event: { __ctx: unknown }) =>
		config.fn(event.__ctx, event)
}));

vi.mock('$lib/server/adapters/supabasePlatformOrganizationLedger', () => ({
	createSupabasePlatformOrganizationLedger: createOrganizationLedgerMock
}));

vi.mock('$lib/server/adapters/supabasePlatformBillingHealth', () => ({
	createSupabasePlatformBillingHealth: createBillingHealthMock
}));

import { load } from './+page.server';

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
		createOrganizationLedgerMock.mockReturnValue(organizationLedgerMock);
		createBillingHealthMock.mockReturnValue(billingHealthMock);
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
		billingHealthMock.summarize.mockResolvedValue({
			generatedAt: '2026-06-24T12:00:00.000Z',
			overallState: 'healthy',
			states: ['healthy'],
			counts: {
				retryableFailures: 0,
				permanentFailures: 0,
				staleFailedEvents: 0,
				recentPaymentFailures: 0,
				driftedOrganizations: 0,
				staleReconciliation: 0,
				supportAttentionItems: 0
			},
			issues: [],
			diagnosticsError: false
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('passes page, page size, search, and filter params into the Platform Organization Ledger', async () => {
		organizationLedgerMock.listSubscriptions.mockResolvedValueOnce({
			subscriptions: [{ id: 'org-1', name: 'Able Company' }],
			pagination: {
				page: 2,
				pageSize: 50,
				totalCount: 77,
				totalPages: 2,
				q: 'Able',
				tier: 'unit',
				status: 'drifted'
			},
			billingDiagnosticsError: false,
			planDiagnosticsError: false
		});

		const result = (await load({
			__ctx: makeContext(),
			url: new URL('http://localhost/admin/subscriptions?page=2&pageSize=50&q=Able&tier=unit&status=drifted')
		} as unknown as Parameters<typeof load>[0])) as PageData;

		expect(createOrganizationLedgerMock).toHaveBeenCalledWith(
			expect.objectContaining({ adminUser: { id: 'admin-1', role: 'super_admin' } })
		);
		expect(createBillingHealthMock).toHaveBeenCalledWith(
			expect.objectContaining({ adminUser: { id: 'admin-1', role: 'super_admin' } })
		);
		expect(organizationLedgerMock.listSubscriptions).toHaveBeenCalledWith({
			page: '2',
			pageSize: '50',
			q: 'Able',
			tier: 'unit',
			status: 'drifted'
		});
		expect(billingHealthMock.summarize).toHaveBeenCalledWith();
		expect(result.pagination).toMatchObject({
			page: 2,
			pageSize: 50,
			totalCount: 77,
			q: 'Able',
			tier: 'unit',
			status: 'drifted'
		});
		expect(result).toMatchObject({
			adminRole: 'super_admin',
			billingHealth: expect.objectContaining({ overallState: 'healthy' })
		});
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

	it('keeps the subscription ledger available when billing health unexpectedly fails', async () => {
		organizationLedgerMock.listSubscriptions.mockResolvedValueOnce({
			subscriptions: [{ id: 'org-1', name: 'Able Company' }],
			pagination: {
				page: 1,
				pageSize: 25,
				totalCount: 1,
				totalPages: 1,
				q: ''
			},
			billingDiagnosticsError: false,
			planDiagnosticsError: false
		});
		billingHealthMock.summarize.mockRejectedValueOnce(new Error('health diagnostics offline'));

		const result = (await load({
			__ctx: makeContext(),
			url: new URL('http://localhost/admin/subscriptions')
		} as unknown as Parameters<typeof load>[0])) as PageData;

		expect(result.subscriptions).toEqual([{ id: 'org-1', name: 'Able Company' }]);
		expect(result.adminRole).toBe('super_admin');
		expect(result.billingHealth).toMatchObject({
			overallState: 'diagnostics_unavailable',
			states: ['diagnostics_unavailable'],
			diagnosticsError: true,
			counts: {
				retryableFailures: 0,
				permanentFailures: 0,
				staleFailedEvents: 0,
				recentPaymentFailures: 0,
				driftedOrganizations: 0,
				staleReconciliation: 0,
				supportAttentionItems: 0
			},
			issues: []
		});
		expect(console.error).toHaveBeenCalledWith('Admin subscriptions billing health query failed:', expect.any(Error));
	});
});
