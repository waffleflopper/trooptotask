import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import { createSupabasePersonnelTrainingRosterPort } from './trainingRoster.server';

function actor(training: 'none' | 'view' | 'operate' = 'view', groupIds: string[] = ['group-1']) {
	return createTestAuthContext({
		orgId: 'org-1',
		role: 'member',
		isPrivileged: false,
		scopeSet: { kind: 'groups', groupIds },
		capabilityMap: {
			calendar: 'none',
			personnel: 'none',
			training,
			criticalTasks: 'none',
			onboarding: 'none',
			ratingScheme: 'none'
		}
	});
}

function createPersonnelQueryMock(result: unknown | unknown[]) {
	const results = Array.isArray(result) ? [...result] : [result];
	const query = {
		select: vi.fn(),
		eq: vi.fn(),
		is: vi.fn(),
		in: vi.fn(),
		order: vi.fn(),
		range: vi.fn(),
		then: vi.fn((resolve, reject) => Promise.resolve(results.shift()).then(resolve, reject))
	};
	query.select.mockReturnValue(query);
	query.eq.mockReturnValue(query);
	query.is.mockReturnValue(query);
	query.in.mockReturnValue(query);
	query.order.mockReturnValue(query);
	query.range.mockReturnValue(query);
	return { supabase: { from: vi.fn().mockReturnValue(query) }, query };
}

describe('Personnel Training roster', () => {
	it('reads active people only in the authorized Organization and Group, ordered for Training', async () => {
		const { supabase, query } = createPersonnelQueryMock({
			data: [
				{
					id: 'person-1',
					slug: 'smith-jane',
					rank: 'SGT',
					last_name: 'Smith',
					first_name: 'Jane',
					mos: '68W',
					clinic_role: 'Medic',
					ets: null,
					deros: null,
					group_id: 'group-1',
					groups: { name: 'Alpha' },
					archived_at: null
				}
			],
			error: null
		});
		const port = createSupabasePersonnelTrainingRosterPort(() => supabase as unknown as SupabaseClient);
		const result = await port.listActiveForWorkspace(actor());

		expect(query.eq).toHaveBeenCalledWith('organization_id', 'org-1');
		expect(query.is).toHaveBeenCalledWith('archived_at', null);
		expect(query.in).toHaveBeenCalledWith('group_id', ['group-1']);
		expect(query.order).toHaveBeenNthCalledWith(1, 'last_name', { ascending: true });
		expect(query.order).toHaveBeenNthCalledWith(2, 'first_name', { ascending: true });
		expect(query.order).toHaveBeenNthCalledWith(3, 'id', { ascending: true });
		expect(query.range).toHaveBeenCalledWith(0, 499);
		expect(result).toEqual([
			{
				id: 'person-1',
				slug: 'smith-jane',
				rank: 'SGT',
				lastName: 'Smith',
				firstName: 'Jane',
				mos: '68W',
				clinicRole: 'Medic',
				ets: null,
				deros: null,
				groupId: 'group-1',
				groupName: 'Alpha',
				archivedAt: null
			}
		]);
	});

	it('returns candidates beyond the first provider page without truncation', async () => {
		const row = (index: number) => ({
			id: `person-${index}`,
			slug: `person-${index}`,
			rank: 'SGT',
			last_name: 'Smith',
			first_name: 'Jane',
			clinic_role: 'Medic',
			archived_at: null
		});
		const { supabase, query } = createPersonnelQueryMock([
			{ data: Array.from({ length: 500 }, (_, index) => row(index)), error: null },
			{ data: [row(500)], error: null }
		]);
		const port = createSupabasePersonnelTrainingRosterPort(() => supabase as unknown as SupabaseClient);

		const candidates = await port.listActiveForReports(
			createTestAuthContext({
				...actor(),
				scopeSet: { kind: 'organization' }
			})
		);

		expect(candidates).toHaveLength(501);
		expect(candidates[500]?.id).toBe('person-500');
		expect(query.range).toHaveBeenNthCalledWith(1, 0, 499);
		expect(query.range).toHaveBeenNthCalledWith(2, 500, 999);
	});

	it('returns no people for an empty Group scope without using the admin client', async () => {
		const getAdminClient = vi.fn();
		const port = createSupabasePersonnelTrainingRosterPort(getAdminClient as () => SupabaseClient);
		await expect(port.listActiveForWorkspace(actor('view', []))).resolves.toEqual([]);
		expect(getAdminClient).not.toHaveBeenCalled();
	});

	it('denies a member without Training access before opening the admin provider', async () => {
		const getAdminClient = vi.fn();
		const port = createSupabasePersonnelTrainingRosterPort(getAdminClient as () => SupabaseClient);

		await expect(port.listActiveForWorkspace(actor('none'))).rejects.toMatchObject({ status: 403 });
		await expect(port.listActiveForReports(actor('none'))).rejects.toMatchObject({ status: 403 });
		expect(getAdminClient).not.toHaveBeenCalled();
	});

	it('returns archived same-Group write references without leaking another Group or Organization', async () => {
		const rows = [
			{ id: 'archived-alpha', organization_id: 'org-1', group_id: 'group-1', archived_at: '2026-01-01' },
			{ id: 'active-bravo', organization_id: 'org-1', group_id: 'group-2', archived_at: null },
			{ id: 'other-org', organization_id: 'org-2', group_id: 'group-1', archived_at: null }
		];
		let filtered = rows;
		const query = {
			select: () => query,
			eq: (column: string, value: string) => {
				filtered = filtered.filter((row) => row[column as keyof typeof row] === value);
				return query;
			},
			in: (column: string, values: string[]) => {
				filtered = filtered.filter((row) => values.includes(row[column as keyof typeof row] as string));
				return query;
			},
			order: () => query,
			range: (from: number, to: number) => Promise.resolve({ data: filtered.slice(from, to + 1), error: null })
		};
		const getAdminClient = vi.fn(() => ({ from: () => query }) as unknown as SupabaseClient);
		const port = createSupabasePersonnelTrainingRosterPort(getAdminClient);

		await expect(
			port.findGroupIdsForWrites(
				actor('operate'),
				rows.map((row) => row.id)
			)
		).resolves.toEqual(new Map([['archived-alpha', 'group-1']]));
		await expect(port.findGroupIdsForWrites(actor('operate', []), ['archived-alpha'])).resolves.toEqual(new Map());
		expect(getAdminClient).toHaveBeenCalledTimes(1);
	});

	it('denies write references to view-only members before the admin provider', async () => {
		const getAdminClient = vi.fn();
		const port = createSupabasePersonnelTrainingRosterPort(getAdminClient as () => SupabaseClient);
		await expect(port.findGroupIdsForWrites(actor('view'), ['archived-alpha'])).rejects.toMatchObject({ status: 403 });
		expect(getAdminClient).not.toHaveBeenCalled();
	});

	it('propagates provider errors without returning incomplete candidate data', async () => {
		const { supabase } = createPersonnelQueryMock({ data: null, error: { message: 'query failed' } });
		const port = createSupabasePersonnelTrainingRosterPort(() => supabase as unknown as SupabaseClient);
		await expect(port.listActiveForReports(actor())).rejects.toThrow('query failed');
	});
});
