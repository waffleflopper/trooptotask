import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '$lib/server/database';
import {
	createSupabasePlatformOrganizationDirectory,
	normalizePlatformOrganizationListQuery
} from './organizationDirectory.server';

describe('normalizePlatformOrganizationListQuery', () => {
	it.each([
		[{}, { pages: 1, q: '', filter: 'all' }],
		[
			{ pages: '3', q: '  Able ', filter: 'Quiet' },
			{ pages: 3, q: 'Able', filter: 'quiet' }
		],
		[
			{ pages: '0', filter: 'nope' },
			{ pages: 1, q: '', filter: 'all' }
		],
		[{ pages: '2.5' }, { pages: 1, q: '', filter: 'all' }],
		[{ pages: '9999' }, { pages: 20, q: '', filter: 'all' }],
		[{ q: 'x'.repeat(300) }, { pages: 1, q: 'x'.repeat(100), filter: 'all' }]
	])('reads %j as %j', (input, expected) => {
		expect(normalizePlatformOrganizationListQuery(input)).toEqual({
			...expected,
			sort: { key: 'lastActive', direction: 'desc' }
		});
	});
	it.each([
		[{ sort: 'name' }, { key: 'name', direction: 'asc' }],
		[
			{ sort: 'members', dir: 'asc' },
			{ key: 'members', direction: 'asc' }
		],
		[
			{ sort: 'owner', dir: 'invalid' },
			{ key: 'owner', direction: 'asc' }
		],
		[
			{ sort: 'invalid', dir: 'asc' },
			{ key: 'lastActive', direction: 'desc' }
		]
	])('normalizes header sorting %j', (input, sort) => {
		expect(normalizePlatformOrganizationListQuery(input).sort).toEqual(sort);
	});
});

function directoryWith(data: unknown, error: unknown = null) {
	const rpc = vi.fn(async () => ({ data, error }));
	return { rpc, directory: createSupabasePlatformOrganizationDirectory({ rpc } as unknown as SupabaseClient) };
}

describe('Organization directory provider', () => {
	it('reads the page total from the page rows and drops the placeholder row of an empty result', async () => {
		const { directory } = directoryWith([
			{
				total_count: '0',
				all_count: '0',
				active_week_count: '0',
				quiet_count: '0',
				suspended_count: '0',
				organization_id: null,
				name: null,
				created_at: null,
				status: null,
				last_active_at: null,
				member_count: null,
				personnel_count: null,
				owner_count: null,
				owner_email: null
			}
		]);
		await expect(directory.listOrganizations(normalizePlatformOrganizationListQuery({ q: 'zzz' }))).resolves.toEqual({
			counts: { all: 0, activeWeek: 0, quiet: 0, suspended: 0 },
			organizations: [],
			totalCount: 0
		});
	});

	it('reads the four filter counts from the first page row', async () => {
		const { directory } = directoryWith([
			{
				total_count: 1,
				all_count: '38',
				active_week_count: 31,
				quiet_count: 4,
				suspended_count: 1,
				organization_id: 'org-1',
				name: 'Able Company',
				created_at: '2026-06-01T00:00:00Z',
				status: 'active',
				last_active_at: null,
				member_count: 1,
				personnel_count: 2,
				owner_count: 1,
				owner_email: 'owner@example.test'
			}
		]);
		const page = await directory.listOrganizations(normalizePlatformOrganizationListQuery({ filter: 'quiet' }));
		expect(page.counts).toEqual({ all: 38, activeWeek: 31, quiet: 4, suspended: 1 });
		expect(page.totalCount).toBe(1);
	});

	it('asks for every row from the top, one page more for each page shown', async () => {
		const { directory, rpc } = directoryWith([
			{
				total_count: 60,
				all_count: 60,
				active_week_count: 0,
				quiet_count: 0,
				suspended_count: 0,
				organization_id: null,
				name: null,
				created_at: null,
				status: null,
				last_active_at: null,
				member_count: null,
				personnel_count: null,
				owner_count: null,
				owner_email: null
			}
		]);
		await directory.listOrganizations(
			normalizePlatformOrganizationListQuery({ pages: 3, q: 'Able', filter: 'quiet', sort: 'members', dir: 'asc' })
		);
		expect(rpc).toHaveBeenCalledWith('platform_list_organizations', {
			p_search: 'Able',
			p_filter: 'quiet',
			p_sort: 'members',
			p_dir: 'asc',
			p_page: 1,
			p_page_size: 75
		});
	});

	it('throws the database error instead of returning an empty list', async () => {
		const { directory } = directoryWith(null, new Error('permission denied'));
		await expect(directory.listOrganizations(normalizePlatformOrganizationListQuery())).rejects.toThrow(
			'permission denied'
		);
	});

	it('rejects a malformed row instead of showing guessed facts', async () => {
		const { directory } = directoryWith([{ total_count: 1, status: 'bogus' }]);
		await expect(directory.listOrganizations(normalizePlatformOrganizationListQuery())).rejects.toThrow();
	});

	it('returns null for an Organization that does not exist', async () => {
		const { directory } = directoryWith(null);
		await expect(directory.getOrganization('missing')).resolves.toBeNull();
	});
});
