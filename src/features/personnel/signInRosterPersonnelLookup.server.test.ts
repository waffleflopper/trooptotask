import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseSignInRosterPersonnelLookupPort } from './signInRosterPersonnelLookup.server';

function createPersonnelQueryMock(result: unknown) {
	const query = {
		select: vi.fn(),
		eq: vi.fn(),
		is: vi.fn(),
		in: vi.fn(),
		order: vi.fn(),
		then: vi.fn((resolve, reject) => Promise.resolve(result).then(resolve, reject))
	};
	query.select.mockReturnValue(query);
	query.eq.mockReturnValue(query);
	query.is.mockReturnValue(query);
	query.in.mockReturnValue(query);
	query.order.mockReturnValue(query);

	const supabase = {
		from: vi.fn().mockReturnValue(query)
	};

	return { supabase, query };
}

describe('SupabaseSignInRosterPersonnelLookupPort', () => {
	it('loads roster snapshot personnel through the admin client and maps group names', async () => {
		const { supabase, query } = createPersonnelQueryMock({
			data: [
				{
					id: 'person-1',
					rank: 'SGT',
					last_name: 'Smith',
					first_name: 'Jane',
					group_id: 'group-1',
					groups: { name: 'Alpha' }
				},
				{
					id: 'person-2',
					rank: null,
					last_name: null,
					first_name: null,
					group_id: null,
					groups: null
				}
			],
			error: null
		});
		const getAdminClient = vi.fn(() => supabase as unknown as SupabaseClient);
		const port = createSupabaseSignInRosterPersonnelLookupPort(getAdminClient);

		const result = await port.findPersonnelForRosterSnapshot('org-1', ['person-1', 'person-2']);

		expect(getAdminClient).toHaveBeenCalledOnce();
		expect(supabase.from).toHaveBeenCalledWith('personnel');
		expect(query.select).toHaveBeenCalledWith('id, rank, last_name, first_name, group_id, groups(name)');
		expect(query.eq).toHaveBeenCalledWith('organization_id', 'org-1');
		expect(query.in).toHaveBeenCalledWith('id', ['person-1', 'person-2']);
		expect(result).toEqual([
			{
				id: 'person-1',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jane',
				group_id: 'group-1',
				group_name: 'Alpha'
			},
			{
				id: 'person-2',
				rank: null,
				last_name: null,
				first_name: null,
				group_id: null,
				group_name: null
			}
		]);
	});

	it('does not create the admin client for empty lookups', async () => {
		const getAdminClient = vi.fn();
		const port = createSupabaseSignInRosterPersonnelLookupPort(getAdminClient as () => SupabaseClient);

		await expect(port.findPersonnelForRosterSnapshot('org-1', [])).resolves.toEqual([]);
		expect(getAdminClient).not.toHaveBeenCalled();
	});

	it('throws query errors', async () => {
		const { supabase } = createPersonnelQueryMock({
			data: null,
			error: { message: 'permission denied for table personnel' }
		});
		const port = createSupabaseSignInRosterPersonnelLookupPort(() => supabase as unknown as SupabaseClient);

		await expect(port.findPersonnelForRosterSnapshot('org-1', ['person-1'])).rejects.toThrow(
			'permission denied for table personnel'
		);
	});
});
