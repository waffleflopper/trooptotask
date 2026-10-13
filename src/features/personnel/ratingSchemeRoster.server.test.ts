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
			{
				id: 'alpha',
				organization_id: 'org-1',
				group_id: 'group-1',
				rank: 'SGT',
				last_name: 'Alpha',
				archived_at: null
			},
			{
				id: 'archived-alpha',
				organization_id: 'org-1',
				group_id: 'group-1',
				rank: 'SPC',
				last_name: 'Archived',
				archived_at: '2026-01-01'
			},
			{ id: 'bravo', organization_id: 'org-1', group_id: 'group-2', archived_at: null },
			{
				id: 'unassigned',
				organization_id: 'org-1',
				group_id: null,
				rank: 'PFC',
				last_name: 'Loose',
				archived_at: null
			},
			{ id: 'foreign', organization_id: 'org-2', group_id: 'group-1', archived_at: null }
		];
		const port = createSupabasePersonnelRatingSchemeRosterPort({} as SupabaseClient, createPersonnelClient(rows));
		const groupActor = ratingSchemeActor({ kind: 'groups', groupIds: ['group-1'] });
		groupActor.capabilityMap.ratingScheme = 'operate';

		await expect(port.findRatedPersonForWrite(groupActor, 'alpha')).resolves.toEqual({
			groupId: 'group-1',
			rank: 'SGT',
			lastName: 'Alpha'
		});
		await expect(port.findRatedPersonForWrite(groupActor, 'archived-alpha')).resolves.toEqual({
			groupId: 'group-1',
			rank: 'SPC',
			lastName: 'Archived'
		});
		for (const id of ['bravo', 'unassigned', 'foreign']) {
			await expect(port.findRatedPersonForWrite(groupActor, id)).resolves.toBeNull();
		}
		const orgActor = ratingSchemeActor();
		orgActor.capabilityMap.ratingScheme = 'operate';
		await expect(port.findRatedPersonForWrite(orgActor, 'unassigned')).resolves.toEqual({
			groupId: null,
			rank: 'PFC',
			lastName: 'Loose'
		});
	});

	it('denies missing Rating Scheme write capability before admin access and opens no client for empty Group scope', async () => {
		const getAdminClient = vi.fn();
		const port = createSupabasePersonnelRatingSchemeRosterPort(
			{} as SupabaseClient,
			getAdminClient as () => SupabaseClient
		);
		await expect(port.findRatedPersonForWrite(ratingSchemeActor(), 'alpha')).rejects.toMatchObject({
			status: 403
		});
		const emptyActor = ratingSchemeActor({ kind: 'groups', groupIds: [] });
		emptyActor.capabilityMap.ratingScheme = 'operate';
		await expect(port.findRatedPersonForWrite(emptyActor, 'alpha')).resolves.toBeNull();
		expect(getAdminClient).not.toHaveBeenCalled();
	});
});

const alphaEvaluator = 'd1600000-0000-4000-8000-00000000000a';
const bravoEvaluator = 'd1600000-0000-4000-8000-00000000000b';
const archivedEvaluator = 'd1600000-0000-4000-8000-00000000000c';
const unassignedEvaluator = 'd1600000-0000-4000-8000-00000000000d';
const foreignEvaluator = 'd1600000-0000-4000-8000-00000000000e';

describe('Personnel evaluator references', () => {
	it('admits only Organization-local IDs, including other Groups, archives and unassigned People', async () => {
		const rows = [
			{ id: alphaEvaluator, organization_id: 'org-1', group_id: 'group-1', archived_at: null },
			{ id: bravoEvaluator, organization_id: 'org-1', group_id: 'group-2', archived_at: null },
			{ id: archivedEvaluator, organization_id: 'org-1', group_id: 'group-2', archived_at: '2026-01-01' },
			{ id: unassignedEvaluator, organization_id: 'org-1', group_id: null, archived_at: null },
			{ id: foreignEvaluator, organization_id: 'org-2', group_id: 'group-1', archived_at: null }
		];
		const getAdminClient = createPersonnelClient(rows);
		const port = createSupabasePersonnelRatingSchemeRosterPort({} as SupabaseClient, getAdminClient);
		const actor = ratingSchemeActor({ kind: 'groups', groupIds: ['group-1'] });
		actor.capabilityMap.ratingScheme = 'operate';
		await expect(
			port.hasEvaluatorReferences(actor, [alphaEvaluator, bravoEvaluator, archivedEvaluator, unassignedEvaluator])
		).resolves.toBe(true);
		expect(getAdminClient).toHaveBeenCalledTimes(1);
		await expect(port.hasEvaluatorReferences(actor, [alphaEvaluator, alphaEvaluator.toUpperCase()])).resolves.toBe(
			true
		);
		await expect(port.hasEvaluatorReferences(actor, [alphaEvaluator, foreignEvaluator])).resolves.toBe(false);
		await expect(port.hasEvaluatorReferences(actor, ['d1600000-0000-4000-8000-000000000099'])).resolves.toBe(false);
	});

	it('requires Rating Scheme operate before admin access, and avoids empty lookups', async () => {
		const getAdminClient = vi.fn();
		const port = createSupabasePersonnelRatingSchemeRosterPort({} as SupabaseClient, getAdminClient);
		const actor = ratingSchemeActor();
		actor.capabilityMap.personnel = 'configure';
		await expect(port.hasEvaluatorReferences(actor, [alphaEvaluator])).rejects.toMatchObject({ status: 403 });
		actor.capabilityMap.ratingScheme = 'operate';
		await expect(port.hasEvaluatorReferences(actor, [])).resolves.toBe(true);
		expect(getAdminClient).not.toHaveBeenCalled();
	});
});
