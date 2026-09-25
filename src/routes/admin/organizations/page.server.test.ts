import { isHttpError, isRedirect } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageData } from './$types';

const {
	organizationLedgerMock,
	createOrganizationLedgerMock,
	activationHealthMock,
	createActivationHealthMock,
	lookupRole
} = vi.hoisted(() => ({
	organizationLedgerMock: {
		listOrganizations: vi.fn()
	},
	createOrganizationLedgerMock: vi.fn(),
	activationHealthMock: {
		summarize: vi.fn()
	},
	createActivationHealthMock: vi.fn(),
	lookupRole: vi.fn()
}));

vi.mock('$lib/server/admin', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/admin')>()),
	getAdminRole: lookupRole
}));
vi.mock('$lib/server/supabase', () => ({ getAdminClient: () => ({}) }));

vi.mock('$lib/server/adapters/supabasePlatformOrganizationLedger', () => ({
	createSupabasePlatformOrganizationLedger: createOrganizationLedgerMock
}));

vi.mock('$lib/server/adapters/supabasePlatformActivationHealth', () => ({
	createSupabasePlatformActivationHealth: createActivationHealthMock
}));

import { load } from './+page.server';

function event(path = '/admin/organizations', authenticated = true) {
	const url = new URL(path, 'http://localhost');
	return {
		locals: {
			actor: authenticated ? { userId: 'admin-1' } : null,
			user: authenticated ? { id: 'admin-1' } : null,
			supabase: {},
			session: null
		},
		url,
		request: new Request(url),
		getClientAddress: () => '127.0.0.1'
	} as unknown as Parameters<typeof load>[0];
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
		lookupRole.mockResolvedValue('super_admin');
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
			candidateLimit: 100,
			counts: {
				candidateOrganizations: 0,
				activatedOrganizations: 0,
				meaningfulRosters: 0,
				acceptedLeaders: 0,
				setupStarted: 0,
				inProgressOrganizations: 0
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
				status: 'active'
			}
		});

		const result = (await load(
			event('/admin/organizations?page=3&pageSize=50&q=Able&tier=team&status=active')
		)) as PageData;

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
			status: 'active'
		});
		expect(activationHealthMock.summarize).toHaveBeenCalledWith();
		expect(result.pagination).toMatchObject({
			page: 3,
			pageSize: 50,
			totalCount: 101,
			q: 'Able',
			status: 'active'
		});
		expect(result.activationHealth).toMatchObject({ overallState: 'no_candidates' });
	});

	it.each([null, 'billing'])('denies Organization listing for role %s before any protected read', async (role) => {
		lookupRole.mockResolvedValue(role);
		const caught = await Promise.resolve(load(event())).catch((error: unknown) => error);
		expect(isHttpError(caught, 403)).toBe(true);
		expect(createOrganizationLedgerMock).not.toHaveBeenCalled();
		expect(createActivationHealthMock).not.toHaveBeenCalled();
	});

	it('redirects an anonymous request before any protected read', async () => {
		const caught = await Promise.resolve(load(event('/admin/organizations', false))).catch((error: unknown) => error);
		expect(isRedirect(caught)).toBe(true);
		expect(caught).toMatchObject({ status: 303, location: '/auth/login' });
		expect(createOrganizationLedgerMock).not.toHaveBeenCalled();
		expect(createActivationHealthMock).not.toHaveBeenCalled();
	});

	it('allows support to read the Organization index', async () => {
		lookupRole.mockResolvedValue('support');
		const result = await load(event());
		expect(result).toMatchObject({ organizations: [], pagination: { totalCount: 0 } });
		expect(createOrganizationLedgerMock).toHaveBeenCalledWith(
			expect.objectContaining({ adminUser: { id: 'admin-1', role: 'support' } })
		);
	});

	it('throws a sanitized load error when the primary organization ledger cannot load', async () => {
		organizationLedgerMock.listOrganizations.mockRejectedValueOnce(new Error('database offline'));

		await expectSanitizedServerError(load(event()), 'Unable to load platform organizations.');
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

		const result = (await load(event())) as PageData;

		expect(result.organizations).toEqual([{ id: 'org-1', name: 'Able Company' }]);
		expect(result.activationHealth).toMatchObject({
			overallState: 'diagnostics_unavailable',
			diagnosticsError: true,
			counts: {
				candidateOrganizations: 0,
				inProgressOrganizations: 0
			},
			organizations: []
		});
		expect(console.error).toHaveBeenCalledWith(
			'Admin organizations activation health query failed:',
			expect.any(Error)
		);
	});
});
