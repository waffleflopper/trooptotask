import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { describe, it, expect } from 'vitest';
import { personnelProvider } from './test-support/personnelProvider';
import { createSupabasePersonnelRosterReader } from './personnelRosterReader.server';
const SAVED = {
	organization_id: 'org-a',
	slug: 'smith-jamie',
	rank: 'SGT',
	last_name: 'Smith',
	first_name: 'Jamie',
	clinic_role: 'Medic',
	mos: null,
	ets: null,
	deros: null,
	group_id: 'alpha',
	archived_at: null
};
describe('ordinary Personnel roster persistence', () => {
	it('returns every admitted tied row once across changed page storage order with captured scope', async () => {
		const ids = Array.from({ length: 1001 }, (_, i) => `person-${String(i).padStart(4, '0')}`);
		const { client, state } = personnelProvider({
			personnel: [
				...ids.map((id) => ({ ...SAVED, id })),
				{ ...SAVED, id: 'foreign', organization_id: 'org-b' },
				{ ...SAVED, id: 'bravo', group_id: 'bravo' },
				{ ...SAVED, id: 'unassigned', group_id: null },
				{ ...SAVED, id: 'archived', archived_at: '2026-01-01' }
			]
		});
		state.unstablePages = true;
		const scope = groupCoverageForTest({ kind: 'groups' as const, groupIds: ['alpha'] });
		const roster = createSupabasePersonnelRosterReader(client, 'org-a', scope);
		Object.defineProperty(scope, 'groupIds', { value: ['alpha', 'bravo'] });
		expect((await roster.list()).map((person) => person.id)).toEqual(ids);
		expect((await roster.list({ status: 'archived', order: 'archived-newest' })).map((person) => person.id)).toEqual([
			'archived'
		]);
		expect((await roster.list({ status: 'all' })).map((person) => person.id).sort()).toEqual(
			[...ids, 'archived'].sort()
		);
	});
	it('counts only admitted archived rows including null count and an empty scope without provider access', async () => {
		const { client, state } = personnelProvider({
			personnel: [
				{ ...SAVED, id: 'active' },
				{ ...SAVED, id: 'old', archived_at: '2026-01-01' },
				{ ...SAVED, id: 'foreign', organization_id: 'org-b', archived_at: '2026-01-01' }
			]
		});
		const roster = createSupabasePersonnelRosterReader(client, 'org-a');
		expect(await roster.countArchived()).toBe(1);
		state.nullCount = true;
		expect(await roster.countArchived()).toBe(0);
		const requests = state.requests.length;
		const empty = createSupabasePersonnelRosterReader(
			client,
			'org-a',
			groupCoverageForTest({ kind: 'groups', groupIds: [] })
		);
		expect(await empty.list({ status: 'all' })).toEqual([]);
		expect(await empty.countArchived()).toBe(0);
		expect(state.requests).toHaveLength(requests);
	});
	it('finds the earliest admitted archive date without reading archived rows outside the scope', async () => {
		const { client, state } = personnelProvider({
			personnel: [
				{ ...SAVED, id: 'active' },
				{ ...SAVED, id: 'recent', archived_at: '2026-03-01T10:00:00.000Z' },
				{ ...SAVED, id: 'oldest', archived_at: '2024-11-02T03:00:00.000Z', group_id: 'bravo' },
				{ ...SAVED, id: 'foreign', organization_id: 'org-b', archived_at: '2020-01-01T00:00:00.000Z' }
			]
		});
		expect(await createSupabasePersonnelRosterReader(client, 'org-a').findOldestArchivedAt()).toBe(
			'2024-11-02T03:00:00.000Z'
		);
		const alpha = createSupabasePersonnelRosterReader(
			client,
			'org-a',
			groupCoverageForTest({ kind: 'groups', groupIds: ['alpha'] })
		);
		expect(await alpha.findOldestArchivedAt()).toBe('2026-03-01T10:00:00.000Z');
		const requests = state.requests.length;
		const empty = createSupabasePersonnelRosterReader(
			client,
			'org-a',
			groupCoverageForTest({ kind: 'groups', groupIds: [] })
		);
		expect(await empty.findOldestArchivedAt()).toBeNull();
		expect(state.requests).toHaveLength(requests);
		expect(await createSupabasePersonnelRosterReader(client, 'org-c').findOldestArchivedAt()).toBeNull();
	});
	it('lists only admitted active people with a loss date, holding the fields the loss window reads', async () => {
		const { client, state } = personnelProvider({
			personnel: [
				{ ...SAVED, id: 'kim', ets: '2026-11-20' },
				{ ...SAVED, id: 'reed', deros: '2027-03-02', group_id: 'bravo' },
				{ ...SAVED, id: 'hale' },
				{ ...SAVED, id: 'gone', ets: '2026-11-01', archived_at: '2026-01-01' },
				{ ...SAVED, id: 'foreign', organization_id: 'org-b', ets: '2026-11-01' }
			]
		});
		expect(await createSupabasePersonnelRosterReader(client, 'org-a').listLossCandidates()).toEqual([
			{ id: 'kim', rank: 'SGT', lastName: 'Smith', ets: '2026-11-20', deros: null, groupId: 'alpha' },
			{ id: 'reed', rank: 'SGT', lastName: 'Smith', ets: null, deros: '2027-03-02', groupId: 'bravo' }
		]);
		const alpha = createSupabasePersonnelRosterReader(
			client,
			'org-a',
			groupCoverageForTest({ kind: 'groups', groupIds: ['alpha'] })
		);
		expect((await alpha.listLossCandidates()).map((person) => person.id)).toEqual(['kim']);
		const requests = state.requests.length;
		const empty = createSupabasePersonnelRosterReader(
			client,
			'org-a',
			groupCoverageForTest({ kind: 'groups', groupIds: [] })
		);
		expect(await empty.listLossCandidates()).toEqual([]);
		expect(state.requests).toHaveLength(requests);
	});
	it('rejects a later page failure without publishing a partial roster', async () => {
		const { client, state } = personnelProvider({
			personnel: Array.from({ length: 1001 }, (_, i) => ({ ...SAVED, id: `p-${i}` }))
		});
		state.failure = (op) => (op.offset === 1000 ? { code: '42501', message: 'Roster unavailable', status: 403 } : null);
		await expect(createSupabasePersonnelRosterReader(client, 'org-a').list()).rejects.toThrow('Roster unavailable');
	});
});
