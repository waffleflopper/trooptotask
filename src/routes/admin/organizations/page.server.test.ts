import { isHttpError } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageData } from './$types';

const { organizationLedgerMock, createOrganizationLedgerMock, activationHealthMock, createActivationHealthMock } =
	vi.hoisted(() => ({
		organizationLedgerMock: {
			listOrganizations: vi.fn()
		},
		createOrganizationLedgerMock: vi.fn(),
		activationHealthMock: {
			summarize: vi.fn()
		},
		createActivationHealthMock: vi.fn()
	}));

vi.mock('$lib/server/adapters/adminAdapter', () => ({
	loadWithAdminContext: (config: { fn: (ctx: unknown, event: unknown) => unknown }) => (event: { __ctx: unknown }) =>
		config.fn(event.__ctx, event)
}));

vi.mock('$lib/server/adapters/supabasePlatformOrganizationLedger', () => ({
	createSupabasePlatformOrganizationLedger: createOrganizationLedgerMock
}));

vi.mock('$lib/server/adapters/supabasePlatformActivationHealth', () => ({
	createSupabasePlatformActivationHealth: createActivationHealthMock
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
		if (!isHttpError(err)) {
			throw err;
		}
		expect(err.status).toBe(500);

		const errorMessage = err.body.message;
		expect(errorMessage).toBe(message);
		expect(errorMessage).not.toContain('database offline');
	}
}

describe('admin organizations route load', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		createOrganizationLedgerMock.mockReturnValue(organizationLedgerMock);
		createActivationHealthMock.mockReturnValue(activationHealthMock);
		organizationLedgerMock.listOrganizations.mockResolvedValue({
			organizations: [],
			pagination: {
				page: 1,
				pageSize: 25,
				totalCount: 0,
				totalPages: 1,
				q: ''
			}
		});
		activationHealthMock.summarize.mockResolvedValue({
			generatedAt: '2026-06-28T12:00:00.000Z',
			overallState: 'no_candidates',
			counts: {
				candidateOrganizations: 0,
				activatedOrganizations: 0,
				checkoutStarted: 0,
				checkoutCompleted: 0,
				meaningfulRosters: 0,
				acceptedLeaders: 0,
				dutyRosterStarted: 0,
				setupStarted: 0,
				paidBelowRosterThreshold: 0,
				supportAttentionItems: 0
			},
			organizations: [],
			diagnosticsError: false
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('passes page, page size, search, and filter params into the Platform Organization Ledger', async () => {
		organizationLedgerMock.listOrganizations.mockResolvedValueOnce({
			organizations: [{ id: 'org-1', name: 'Able Company' }],
			pagination: {
				page: 3,
				pageSize: 50,
				totalCount: 101,
				totalPages: 3,
				q: 'Able',
				tier: 'team',
				status: 'active'
			}
		});

		const result = (await load({
			__ctx: makeContext(),
			url: new URL('http://localhost/admin/organizations?page=3&pageSize=50&q=Able&tier=team&status=active')
		} as unknown as Parameters<typeof load>[0])) as PageData;

		expect(createOrganizationLedgerMock).toHaveBeenCalledWith(
			expect.objectContaining({ adminUser: { id: 'admin-1', role: 'super_admin' } })
		);
		expect(createActivationHealthMock).toHaveBeenCalledWith(
			expect.objectContaining({ adminUser: { id: 'admin-1', role: 'super_admin' } })
		);
		expect(organizationLedgerMock.listOrganizations).toHaveBeenCalledWith({
			page: '3',
			pageSize: '50',
			q: 'Able',
			tier: 'team',
			status: 'active'
		});
		expect(activationHealthMock.summarize).toHaveBeenCalledWith();
		expect(result.pagination).toMatchObject({
			page: 3,
			pageSize: 50,
			totalCount: 101,
			q: 'Able',
			tier: 'team',
			status: 'active'
		});
		expect(result).toMatchObject({
			adminRole: 'super_admin',
			activationHealth: expect.objectContaining({ overallState: 'no_candidates' })
		});
	});

	it('throws a sanitized load error when the primary organization ledger cannot load', async () => {
		organizationLedgerMock.listOrganizations.mockRejectedValueOnce(new Error('database offline'));

		await expectSanitizedServerError(
			load({
				__ctx: makeContext(),
				url: new URL('http://localhost/admin/organizations')
			} as unknown as Parameters<typeof load>[0]),
			'Unable to load platform organizations.'
		);
	});

	it('keeps the organization ledger available when activation health unexpectedly fails', async () => {
		organizationLedgerMock.listOrganizations.mockResolvedValueOnce({
			organizations: [{ id: 'org-1', name: 'Able Company' }],
			pagination: {
				page: 1,
				pageSize: 25,
				totalCount: 1,
				totalPages: 1,
				q: ''
			}
		});
		activationHealthMock.summarize.mockRejectedValueOnce(new Error('activation diagnostics offline'));

		const result = (await load({
			__ctx: makeContext(),
			url: new URL('http://localhost/admin/organizations')
		} as unknown as Parameters<typeof load>[0])) as PageData;

		expect(result.organizations).toEqual([{ id: 'org-1', name: 'Able Company' }]);
		expect(result.adminRole).toBe('super_admin');
		expect(result.activationHealth).toMatchObject({
			overallState: 'diagnostics_unavailable',
			diagnosticsError: true,
			counts: {
				candidateOrganizations: 0,
				supportAttentionItems: 0
			},
			organizations: []
		});
		expect(console.error).toHaveBeenCalledWith(
			'Admin organizations activation health query failed:',
			expect.any(Error)
		);
	});
});
