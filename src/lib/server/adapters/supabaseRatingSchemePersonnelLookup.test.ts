import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseRatingSchemePersonnelLookupPort } from './supabaseRatingSchemePersonnelLookup';

describe('SupabaseRatingSchemePersonnelLookupPort', () => {
	it('calls the rating-scheme personnel lookup RPC and maps minimal roster fields', async () => {
		const rpc = vi.fn().mockResolvedValue({
			data: [
				{
					id: 'person-1',
					rank: 'SGT',
					last_name: 'Smith',
					first_name: 'Jane'
				},
				{
					id: 'person-2',
					rank: null,
					last_name: null,
					first_name: null
				}
			],
			error: null
		});
		const port = createSupabaseRatingSchemePersonnelLookupPort({ rpc } as unknown as SupabaseClient);

		const result = await port.listPersonnelLookup('org-1');

		expect(rpc).toHaveBeenCalledWith('list_rating_scheme_personnel_lookup', {
			p_organization_id: 'org-1'
		});
		expect(result).toEqual([
			{ id: 'person-1', rank: 'SGT', lastName: 'Smith', firstName: 'Jane' },
			{ id: 'person-2', rank: '', lastName: '', firstName: '' }
		]);
	});

	it('throws RPC errors', async () => {
		const rpc = vi.fn().mockResolvedValue({
			data: null,
			error: { message: 'permission denied for function list_rating_scheme_personnel_lookup' }
		});
		const port = createSupabaseRatingSchemePersonnelLookupPort({ rpc } as unknown as SupabaseClient);

		await expect(port.listPersonnelLookup('org-1')).rejects.toThrow(
			'permission denied for function list_rating_scheme_personnel_lookup'
		);
	});
});
