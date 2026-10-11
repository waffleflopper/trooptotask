import type { PlatformOrganizationLedgerBaseRow } from '../organizationSupportTypes';
import { describe, expect, it, vi } from 'vitest';
import {
	createPlatformOrganizationLedger,
	normalizePlatformOrganizationLedgerQuery
} from './organizationLedger.server';
import type {
	PlatformMetrics,
	PlatformOrganizationMetrics,
	PlatformOrganizationLedgerStore
} from '../organizationSupportTypes';

function organization(overrides: Partial<PlatformOrganizationLedgerBaseRow> = {}): PlatformOrganizationLedgerBaseRow {
	return {
		id: 'org-1',
		name: 'Able Company',
		suspended_at: null,
		created_at: '2026-06-01T00:00:00.000Z',
		...overrides
	};
}

function metrics(values: Partial<PlatformOrganizationMetrics> = {}): PlatformMetrics {
	return {
		countMembershipsByOrganization: vi.fn(async () => new Map()),
		countActivePersonnelByOrganization: vi.fn(async () => new Map()),
		countActivePersonnelForOrganization: vi.fn(async () => 0),
		getOwnerMembershipsByOrganization: vi.fn(async () => new Map()),
		getOrganizationMetrics: vi.fn(async () => ({
			memberCounts: new Map(),
			activePersonnelCounts: new Map(),
			ownerMemberships: new Map(),
			...values
		}))
	};
}

describe('normalizePlatformOrganizationLedgerQuery', () => {
	it('clamps invalid pages to page 1 with the default page size', () => {
		expect(normalizePlatformOrganizationLedgerQuery({ page: '0', pageSize: 'not-a-number' })).toEqual({
			page: 1,
			pageSize: 25,
			q: '',
			status: 'all',
			from: 0,
			to: 24
		});
	});

	it('caps requested page sizes at the platform maximum', () => {
		expect(normalizePlatformOrganizationLedgerQuery({ page: '2', pageSize: '999' })).toEqual({
			page: 2,
			pageSize: 100,
			q: '',
			status: 'all',
			from: 100,
			to: 199
		});
	});

	it('trims search query input before building the bounded range', () => {
		expect(normalizePlatformOrganizationLedgerQuery({ page: '3', pageSize: '25', q: '  able  ' })).toEqual({
			page: 3,
			pageSize: 25,
			q: 'able',
			status: 'all',
			from: 50,
			to: 74
		});
	});

	it.each([
		[' ACTIVE ', 'active'],
		[' suspended ', 'suspended'],
		['unknown', 'all']
	])('normalizes status %s to %s', (status, expected) => {
		expect(normalizePlatformOrganizationLedgerQuery({ status }).status).toBe(expected);
	});
});

describe('createPlatformOrganizationLedger', () => {
	it('retains organization identity, suspension, owner, and separate member/personnel counts on a page', async () => {
		const store: PlatformOrganizationLedgerStore = {
			listOrganizationsPage: async () => ({
				organizations: [organization(), organization({ id: 'org-2', suspended_at: '2026-09-19T00:00:00.000Z' })],
				totalCount: 12
			})
		};
		const ledger = createPlatformOrganizationLedger({
			store,
			metrics: metrics({
				memberCounts: new Map([['org-1', 3]]),
				activePersonnelCounts: new Map([['org-1', 42]]),
				ownerMemberships: new Map([
					[
						'org-1',
						{ kind: 'single', membership: { organizationId: 'org-1', userId: 'owner-1', email: 'owner@example.mil' } }
					]
				])
			})
		});

		const result = await ledger.listOrganizations({ page: 2, pageSize: 5, q: ' Able ' });

		expect(result.pagination).toEqual({
			page: 2,
			pageSize: 5,
			totalCount: 12,
			totalPages: 3,
			q: 'Able',
			status: 'all'
		});
		expect(result.organizations).toEqual([
			{
				id: 'org-1',
				name: 'Able Company',
				suspended_at: null,
				created_at: '2026-06-01T00:00:00.000Z',
				memberCount: 3,
				personnelCount: 42,
				ownerEmail: 'owner@example.mil',
				isSuspended: false
			},
			{
				id: 'org-2',
				name: 'Able Company',
				suspended_at: '2026-09-19T00:00:00.000Z',
				created_at: '2026-06-01T00:00:00.000Z',
				memberCount: 0,
				personnelCount: 0,
				ownerEmail: 'No owner',
				isSuspended: true
			}
		]);
	});

	it('keeps one empty page when no organizations match', async () => {
		const ledger = createPlatformOrganizationLedger({
			store: { listOrganizationsPage: async () => ({ organizations: [], totalCount: 0 }) },
			metrics: metrics()
		});
		expect(await ledger.listOrganizations({ q: 'missing', status: 'active' })).toEqual({
			organizations: [],
			pagination: { page: 1, pageSize: 25, totalCount: 0, totalPages: 1, q: 'missing', status: 'active' }
		});
	});
	it('shows the last page when the requested page is past the end', async () => {
		const rows = [organization({ id: 'a' }), organization({ id: 'b' }), organization({ id: 'c' })];
		const listOrganizationsPage = vi.fn(async ({ from, to }: { from: number; to: number }) => ({
			organizations: rows.slice(from, to + 1),
			totalCount: rows.length
		}));
		const ledger = createPlatformOrganizationLedger({ store: { listOrganizationsPage }, metrics: metrics() });

		const result = await ledger.listOrganizations({ page: 9, pageSize: 2 });

		expect(result.pagination).toMatchObject({ page: 2, pageSize: 2, totalCount: 3, totalPages: 2 });
		expect(result.organizations.map((row) => row.id)).toEqual(['c']);
		expect(listOrganizationsPage.mock.calls.map(([query]) => [query.from, query.to])).toEqual([
			[16, 17],
			[2, 3]
		]);
	});

	it('shows the empty first page when nothing matches a requested later page', async () => {
		const listOrganizationsPage = vi.fn(async (_query: { from: number; to: number }) => ({
			organizations: [],
			totalCount: 0
		}));
		const ledger = createPlatformOrganizationLedger({ store: { listOrganizationsPage }, metrics: metrics() });

		expect(await ledger.listOrganizations({ q: 'zzz', page: 2 })).toEqual({
			organizations: [],
			pagination: { page: 1, pageSize: 25, totalCount: 0, totalPages: 1, q: 'zzz', status: 'all' }
		});
		expect(listOrganizationsPage.mock.calls.map(([query]) => [query.from, query.to])).toEqual([
			[25, 49],
			[0, 24]
		]);
	});

	it('does not publish rows with false metrics when the admitted source read fails', async () => {
		const ledger = createPlatformOrganizationLedger({
			store: { listOrganizationsPage: async () => ({ organizations: [organization()], totalCount: 1 }) },
			metrics: {
				...metrics(),
				getOrganizationMetrics: async () => {
					throw new Error('metrics unavailable');
				}
			}
		});
		await expect(ledger.listOrganizations()).rejects.toThrow('metrics unavailable');
	});
});
