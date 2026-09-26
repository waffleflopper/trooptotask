import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import { createSupabasePersonnelRatingSchemeRosterPort } from './ratingSchemeRoster.server';

function ratingSchemeActor(scopeSet: ReturnType<typeof createTestAuthContext>['scopeSet'] = { kind: 'organization' }) {
	return createTestAuthContext({
		orgId: 'org-1',
		role: 'member',
		isPrivileged: false,
		scopeSet,
		capabilityMap: {
			calendar: 'none',
			personnel: 'none',
			training: 'none',
			criticalTasks: 'none',
			onboarding: 'none',
			ratingScheme: 'view'
		}
	});
}

describe('Personnel Rating Scheme roster port', () => {
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
		const port = createSupabasePersonnelRatingSchemeRosterPort({ rpc } as unknown as SupabaseClient);

		const result = await port.listActiveReferences(ratingSchemeActor({ kind: 'groups', groupIds: ['group-1'] }));

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
		const port = createSupabasePersonnelRatingSchemeRosterPort({ rpc } as unknown as SupabaseClient);

		await expect(port.listActiveReferences(ratingSchemeActor())).rejects.toThrow(
			'permission denied for function list_rating_scheme_personnel_lookup'
		);
	});

	it('denies a caller without Rating Scheme view before invoking the RPC', async () => {
		const rpc = vi.fn();
		const port = createSupabasePersonnelRatingSchemeRosterPort({ rpc } as unknown as SupabaseClient);
		const actor = ratingSchemeActor();
		actor.capabilityMap.ratingScheme = 'none';
		actor.capabilityMap.personnel = 'view';

		await expect(port.listActiveReferences(actor)).rejects.toMatchObject({ status: 403 });
		expect(rpc).not.toHaveBeenCalled();
	});
});
