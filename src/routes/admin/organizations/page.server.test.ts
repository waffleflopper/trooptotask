import { isHttpError } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageData } from './$types';

const { organizationLedgerMock, createOrganizationLedgerMock } = vi.hoisted(() => ({
	organizationLedgerMock: {
		listOrganizations: vi.fn()
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
		expect(organizationLedgerMock.listOrganizations).toHaveBeenCalledWith({
			page: '3',
			pageSize: '50',
			q: 'Able',
			tier: 'team',
			status: 'active'
		});
		expect(result.pagination).toMatchObject({
			page: 3,
			pageSize: 50,
			totalCount: 101,
			q: 'Able',
			tier: 'team',
			status: 'active'
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
});
