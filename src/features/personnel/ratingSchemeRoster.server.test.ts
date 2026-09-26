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

function createPersonnelClient(rows: Array<Record<string, unknown>>) {
	let filtered = rows;
	const query = {
		select: () => query,
		eq: (column: string, value: unknown) => {
			filtered = filtered.filter((row) => row[column] === value);
			return query;
		},
		in: (column: string, values: unknown[]) => {
			filtered = filtered.filter((row) => values.includes(row[column]));
			return query;
		},
		order: () => query,
		range: (from: number, to: number) => Promise.resolve({ data: filtered.slice(from, to + 1), error: null })
	};
	return vi.fn(
		() =>
			({
				from: () => {
					filtered = rows;
					return query;
				}
			}) as unknown as SupabaseClient
	);
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
		const port = createSupabasePersonnelRatingSchemeRosterPort({ rpc } as unknown as SupabaseClient, vi.fn());

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
		const port = createSupabasePersonnelRatingSchemeRosterPort({ rpc } as unknown as SupabaseClient, vi.fn());

		await expect(port.listActiveReferences(ratingSchemeActor())).rejects.toThrow(
			'permission denied for function list_rating_scheme_personnel_lookup'
		);
	});

	it('denies a caller without Rating Scheme view before invoking the RPC', async () => {
		const rpc = vi.fn();
		const port = createSupabasePersonnelRatingSchemeRosterPort({ rpc } as unknown as SupabaseClient, vi.fn());
		const actor = ratingSchemeActor();
		actor.capabilityMap.ratingScheme = 'none';
		actor.capabilityMap.personnel = 'view';

		await expect(port.listActiveReferences(actor)).rejects.toMatchObject({ status: 403 });
		expect(rpc).not.toHaveBeenCalled();
	});

	it('resolves only same-Organization and in-Group write references, including archived People', async () => {
		const rows = [
			{ id: 'alpha', organization_id: 'org-1', group_id: 'group-1', archived_at: null },
			{ id: 'archived-alpha', organization_id: 'org-1', group_id: 'group-1', archived_at: '2026-01-01' },
			{ id: 'bravo', organization_id: 'org-1', group_id: 'group-2', archived_at: null },
			{ id: 'unassigned', organization_id: 'org-1', group_id: null, archived_at: null },
			{ id: 'foreign', organization_id: 'org-2', group_id: 'group-1', archived_at: null }
		];
		const port = createSupabasePersonnelRatingSchemeRosterPort({} as SupabaseClient, createPersonnelClient(rows));
		const groupActor = ratingSchemeActor({ kind: 'groups', groupIds: ['group-1'] });
		groupActor.capabilityMap.ratingScheme = 'operate';

		await expect(port.findRatedPersonGroupForWrite(groupActor, 'alpha')).resolves.toEqual({ groupId: 'group-1' });
		await expect(port.findRatedPersonGroupForWrite(groupActor, 'archived-alpha')).resolves.toEqual({
			groupId: 'group-1'
		});
		for (const id of ['bravo', 'unassigned', 'foreign']) {
			await expect(port.findRatedPersonGroupForWrite(groupActor, id)).resolves.toBeNull();
		}
		const orgActor = ratingSchemeActor();
		orgActor.capabilityMap.ratingScheme = 'operate';
		await expect(port.findRatedPersonGroupForWrite(orgActor, 'unassigned')).resolves.toEqual({ groupId: null });
	});

	it('denies missing Rating Scheme write capability before admin access and opens no client for empty Group scope', async () => {
		const getAdminClient = vi.fn();
		const port = createSupabasePersonnelRatingSchemeRosterPort(
			{} as SupabaseClient,
			getAdminClient as () => SupabaseClient
		);
		await expect(port.findRatedPersonGroupForWrite(ratingSchemeActor(), 'alpha')).rejects.toMatchObject({
			status: 403
		});
		const emptyActor = ratingSchemeActor({ kind: 'groups', groupIds: [] });
		emptyActor.capabilityMap.ratingScheme = 'operate';
		await expect(port.findRatedPersonGroupForWrite(emptyActor, 'alpha')).resolves.toBeNull();
		expect(getAdminClient).not.toHaveBeenCalled();
	});
});
