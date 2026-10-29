import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { describe, it, expect } from 'vitest';
import { personnelProvider } from './test-support/personnelProvider';
import { createSupabasePersonnelRecordPersistence } from './personnelRecordPersistence.server';
const SAVED = {
	id: 'person-a',
	organization_id: 'org-a',
	slug: 'smith-jamie',
	rank: 'SGT',
	last_name: 'Smith',
	first_name: 'Jamie',
	clinic_role: 'Medic',
	mos: null,
	ets: '2027-01-01',
	deros: null,
	group_id: 'alpha',
	archived_at: null
};
const INPUT = { rank: 'PFC', lastName: 'Rivera', firstName: 'Monica', clinicRole: 'Medic', slug: 'rivera-monica' };
describe('ordinary Personnel records', () => {
	it('maps joined facts and distinguishes a missing Person from a known unassigned Person', async () => {
		const { client } = personnelProvider({
			personnel: [
				SAVED,
				{ ...SAVED, id: 'unassigned', group_id: null, slug: 'unassigned' },
				{ ...SAVED, id: 'foreign', organization_id: 'org-b' }
			],
			groups: [{ id: 'alpha', organization_id: 'org-a', name: 'Alpha' }]
		});
		const port = createSupabasePersonnelRecordPersistence(client, 'org-a');
		expect(await port.findBySlug('smith-jamie')).toEqual({
			id: 'person-a',
			slug: 'smith-jamie',
			rank: 'SGT',
			lastName: 'Smith',
			firstName: 'Jamie',
			clinicRole: 'Medic',
			mos: '',
			ets: '2027-01-01',
			deros: null,
			groupId: 'alpha',
			groupName: 'Alpha',
			archivedAt: null
		});
		expect(await port.findGroupReference('unassigned')).toEqual({ groupId: null });
		expect(await port.findGroupReference('missing')).toBeNull();
		expect(await port.findById('foreign')).toBeNull();
	});
	it('keeps scoped minimal references and active backfill separate from ordinary all-status slug and rank history', async () => {
		const { client, state } = personnelProvider({
			personnel: [
				SAVED,
				{ ...SAVED, id: 'old', slug: 'smith-jamie-2', archived_at: '2026-01-01', rank: 'CPL' },
				{ ...SAVED, id: 'bravo', slug: 'smith-jamie-3', group_id: 'bravo', rank: 'SSG' }
			]
		});
		const scope = groupCoverageForTest({ kind: 'groups' as const, groupIds: ['alpha'] });
		const scoped = createSupabasePersonnelRecordPersistence(client, 'org-a', scope);
		Object.defineProperty(scope, 'groupIds', { value: ['alpha', 'bravo'] });
		expect(await scoped.findWriteReference('bravo')).toBeNull();
		expect(await scoped.listBackfillCandidates()).toEqual([
			{
				id: 'person-a',
				rank: 'SGT',
				firstName: 'Jamie',
				lastName: 'Smith',
				groupId: 'alpha',
				ets: '2027-01-01',
				deros: null
			}
		]);
		expect(await scoped.listArchiveCandidates(['person-a', 'person-a', 'bravo', 'missing'])).toEqual([
			{ id: 'person-a', rank: 'SGT', firstName: 'Jamie', lastName: 'Smith', groupId: 'alpha', archivedAt: null }
		]);
		expect(await scoped.listImportSlugs()).toEqual([{ slug: 'smith-jamie-2' }, { slug: 'smith-jamie' }]);
		expect(await scoped.findDisplayNamesByIds(['person-a', 'old', 'bravo', 'missing'])).toEqual(
			new Map([
				['person-a', 'SGT Smith'],
				['old', 'CPL Smith']
			])
		);
		const ordinary = createSupabasePersonnelRecordPersistence(client, 'org-a');
		expect((await ordinary.listSlugCandidates('smith-jamie')).map((row) => row.slug).sort()).toEqual([
			'smith-jamie',
			'smith-jamie-2',
			'smith-jamie-3'
		]);
		expect((await ordinary.listRankReferences()).map((row) => row.rank).sort()).toEqual(['CPL', 'SGT', 'SSG']);
		const before = state.requests.length;
		expect(await scoped.listArchiveCandidates([])).toEqual([]);
		const empty = createSupabasePersonnelRecordPersistence(
			client,
			'org-a',
			groupCoverageForTest({ kind: 'groups', groupIds: [] })
		);
		expect(await empty.findById('person-a')).toBeNull();
		expect(await empty.listSlugCandidates('smith')).toEqual([]);
		expect(state.requests).toHaveLength(before);
	});
	it('pages all reference rows deterministically and rejects incomplete acknowledgement', async () => {
		const ids = Array.from({ length: 1001 }, (_, i) => `row-${String(i).padStart(4, '0')}`);
		const { client, state } = personnelProvider({ personnel: ids.map((id) => ({ ...SAVED, id, slug: id })) });
		state.unstablePages = true;
		const port = createSupabasePersonnelRecordPersistence(client, 'org-a');
		expect((await port.listSlugCandidates('row')).map((row) => row.id)).toEqual(ids);
		state.failure = (op) =>
			op.offset === 1000 ? { code: '42501', message: 'References unavailable', status: 403 } : null;
		await expect(port.listRankReferences()).rejects.toThrow('References unavailable');
	});
	it('binds writes to ordinary Organization, retains omitted/null fields and separates joined CRUD from nonjoined date acknowledgement', async () => {
		const { client, state } = personnelProvider({
			personnel: [SAVED, { ...SAVED, id: 'foreign', organization_id: 'org-b' }],
			groups: [{ id: 'alpha', organization_id: 'org-a', name: 'Alpha' }]
		});
		const port = createSupabasePersonnelRecordPersistence(
			client,
			'org-a',
			groupCoverageForTest({ kind: 'groups', groupIds: [] })
		);
		const created = await port.create(INPUT);
		expect(created).toMatchObject({ ...INPUT, mos: '', ets: null, deros: null, groupId: null, groupName: '' });
		const [bulk] = await port.createMany([{ ...INPUT, slug: 'second', groupId: 'alpha' }]);
		expect(bulk.groupName).toBe('Alpha');
		expect(await port.updateEditable('person-a', { ets: null })).toMatchObject({
			id: 'person-a',
			rank: 'SGT',
			ets: null,
			deros: null,
			groupName: 'Alpha'
		});
		expect(await port.updateDates('person-a', { deros: '2028-01-01' })).toMatchObject({
			id: 'person-a',
			slug: 'smith-jamie',
			ets: null,
			deros: '2028-01-01',
			groupName: ''
		});
		await port.delete('foreign');
		expect(state.rows.personnel.find((row) => row.id === 'foreign')).toEqual({
			...SAVED,
			id: 'foreign',
			organization_id: 'org-b'
		});
		await port.delete('person-a');
		expect(state.rows.personnel.some((row) => row.id === 'person-a')).toBe(false);
	});
	it('preserves only the named slug conflict metadata and never replays an uncertain committed bulk write', async () => {
		const { client, state } = personnelProvider();
		const port = createSupabasePersonnelRecordPersistence(client, 'org-a');
		const details = 'Key (organization_id, slug)=(org-a, rivera-monica) already exists.';
		state.failure = () => ({
			code: '23505',
			message: 'duplicate key value violates unique constraint "personnel_org_slug_key"',
			details,
			status: 409
		});
		await expect(port.create(INPUT)).rejects.toMatchObject({ code: '23505', details });
		state.failure = () => ({
			code: '23505',
			message: 'duplicate key value violates unique constraint "personnel_pkey"',
			details,
			status: 409
		});
		try {
			await port.create(INPUT);
			expect.fail('Expected refusal');
		} catch (error) {
			expect(error).not.toHaveProperty('code');
			expect(error).not.toHaveProperty('details');
		}
		state.failure = null;
		state.afterWriteFailure = true;
		await expect(port.createMany([INPUT])).rejects.toThrow('Connection lost after write');
		expect(state.rows.personnel).toHaveLength(1);
		expect(state.requests.filter((op) => op.method === 'POST')).toHaveLength(3);
	});
	it('moves only active People in the Organization to a Group in one write', async () => {
		const { client, state } = personnelProvider({
			personnel: [
				SAVED,
				{ ...SAVED, id: 'archived', slug: 'archived', archived_at: '2026-01-01T00:00:00Z' },
				{ ...SAVED, id: 'foreign', organization_id: 'org-b' }
			]
		});
		const port = createSupabasePersonnelRecordPersistence(client, 'org-a', { kind: 'organization' });
		const before = state.requests.length;
		expect(await port.moveToGroup([], 'bravo')).toEqual([]);
		expect(state.requests).toHaveLength(before);

		expect(await port.moveToGroup(['person-a', 'archived', 'foreign', 'person-a'], null)).toEqual(['person-a']);
		expect(state.requests.filter((op) => op.method === 'PATCH')).toHaveLength(1);
		expect(state.rows.personnel.map((row) => [row.id, row.group_id])).toEqual([
			['person-a', null],
			['archived', 'alpha'],
			['foreign', 'alpha']
		]);
	});
});
