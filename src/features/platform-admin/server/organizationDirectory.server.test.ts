import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	createSupabasePlatformOrganizationDirectory,
	normalizePlatformOrganizationListQuery
} from './organizationDirectory.server';

describe('normalizePlatformOrganizationListQuery', () => {
	it.each([
		[{}, { page: 1, q: '', filter: 'all' }],
		[
			{ page: '3', q: '  Able ', filter: 'Quiet' },
			{ page: 3, q: 'Able', filter: 'quiet' }
		],
		[
			{ page: '0', filter: 'nope' },
			{ page: 1, q: '', filter: 'all' }
		],
		[{ page: '2.5' }, { page: 1, q: '', filter: 'all' }],
		[{ q: 'x'.repeat(300) }, { page: 1, q: 'x'.repeat(100), filter: 'all' }]
	])('reads %j as %j', (input, expected) => {
		expect(normalizePlatformOrganizationListQuery(input)).toEqual(expected);
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
				page: 1,
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
		await expect(directory.listOrganizations({ page: 1, q: 'zzz', filter: 'all' })).resolves.toEqual({
			organizations: [],
			page: 1,
			pageSize: 25,
			totalCount: 0,
			totalPages: 1
		});
	});

	it('throws the database error instead of returning an empty list', async () => {
		const { directory } = directoryWith(null, new Error('permission denied'));
		await expect(directory.listOrganizations({ page: 1, q: '', filter: 'all' })).rejects.toThrow('permission denied');
	});

	it('rejects a malformed row instead of showing guessed facts', async () => {
		const { directory } = directoryWith([{ total_count: 1, page: 1, status: 'bogus' }]);
		await expect(directory.listOrganizations({ page: 1, q: '', filter: 'all' })).rejects.toThrow();
	});

	it('returns null for an Organization that does not exist', async () => {
		const { directory } = directoryWith(null);
		await expect(directory.getOrganization('missing')).resolves.toBeNull();
	});
});
