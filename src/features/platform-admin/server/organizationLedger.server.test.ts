import type { PlatformOrganizationLedgerBaseRow } from '../organizationSupportTypes';
import { describe, expect, it, vi } from 'vitest';
import {
	createPlatformOrganizationLedger,
	normalizePlatformOrganizationLedgerQuery
} from './organizationLedger.server';
import type { PlatformOrganizationLedgerDependencies } from '../organizationSupportTypes';

function organization(overrides: Partial<PlatformOrganizationLedgerBaseRow> = {}): PlatformOrganizationLedgerBaseRow {
	return {
		id: 'org-1',
		name: 'Able Company',
		suspended_at: null,
		created_at: '2026-06-01T00:00:00.000Z',
		...overrides
	};
}

function dependencies(
	listOrganizationsPage: PlatformOrganizationLedgerDependencies['store']['listOrganizationsPage'],
	facts: {
		memberCounts?: Map<string, number>;
		personnelCounts?: Map<string, number>;
		owners?: Awaited<
			ReturnType<PlatformOrganizationLedgerDependencies['store']['listOwnerMembershipMetricsByOrganization']>
		>;
	} = {}
): PlatformOrganizationLedgerDependencies {
	return {
		store: {
			listOrganizationsPage,
			countMembershipsByOrganization: vi.fn(async () => facts.memberCounts ?? new Map()),
			listOwnerMembershipMetricsByOrganization: vi.fn(async () => facts.owners ?? [])
		},
		personnel: { countActivePersonnelByOrganization: vi.fn(async () => facts.personnelCounts ?? new Map()) }
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
		const ledger = createPlatformOrganizationLedger(
			dependencies(
				async () => ({
					organizations: [
						organization(),
						organization({ id: 'org-2', suspended_at: '2026-09-19T00:00:00.000Z' }),
						organization({ id: 'org-3' })
					],
					totalCount: 12
				}),
				{
					memberCounts: new Map([['org-1', 3]]),
					personnelCounts: new Map([['org-1', 42]]),
					owners: [
						{
							organizationId: 'org-1',
							ownerCount: 1,
							singleOwner: { organizationId: 'org-1', userId: 'owner-1', email: 'owner@example.mil' }
						},
						{ organizationId: 'org-3', ownerCount: 2, singleOwner: null }
					]
				}
			)
		);

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
			},
			{
				id: 'org-3',
				name: 'Able Company',
				suspended_at: null,
				created_at: '2026-06-01T00:00:00.000Z',
				memberCount: 0,
				personnelCount: 0,
				ownerEmail: 'Multiple owners',
				isSuspended: false
			}
		]);
	});

	it('keeps one empty page when no organizations match', async () => {
		const ledger = createPlatformOrganizationLedger(dependencies(async () => ({ organizations: [], totalCount: 0 })));
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
		const ledger = createPlatformOrganizationLedger(dependencies(listOrganizationsPage));

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
		const ledger = createPlatformOrganizationLedger(dependencies(listOrganizationsPage));

		expect(await ledger.listOrganizations({ q: 'zzz', page: 2 })).toEqual({
			organizations: [],
			pagination: { page: 1, pageSize: 25, totalCount: 0, totalPages: 1, q: 'zzz', status: 'all' }
		});
		expect(listOrganizationsPage.mock.calls.map(([query]) => [query.from, query.to])).toEqual([
			[25, 49],
			[0, 24]
		]);
	});

	it.each(['members', 'personnel', 'owners'] as const)(
		'does not publish rows with false counts when the %s read fails',
		async (failure) => {
			const deps = dependencies(async () => ({ organizations: [organization()], totalCount: 1 }));
			const failing = {
				members: deps.store.countMembershipsByOrganization,
				personnel: deps.personnel.countActivePersonnelByOrganization,
				owners: deps.store.listOwnerMembershipMetricsByOrganization
			}[failure];
			vi.mocked(failing).mockRejectedValue(new Error('source unavailable'));
			await expect(createPlatformOrganizationLedger(deps).listOrganizations()).rejects.toThrow('source unavailable');
		}
	);
});
