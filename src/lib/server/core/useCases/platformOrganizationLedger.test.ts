import { describe, expect, it, vi } from 'vitest';
import {
	createPlatformOrganizationLedger,
	normalizePlatformOrganizationLedgerQuery,
	type PlatformOrganizationLedgerBaseRow,
	type PlatformOrganizationLedgerStore
} from './platformOrganizationLedger';
import type { PlatformMetrics, PlatformOrganizationMetrics } from './platformMetrics';

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
});
