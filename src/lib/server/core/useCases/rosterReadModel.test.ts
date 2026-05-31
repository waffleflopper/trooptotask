import { describe, expect, it } from 'vitest';
import { createQueryPortsContext } from '$lib/server/adapters/inMemory';
import { createRosterReadModelFromDbRows, loadRosterPersonnel, loadRosterReadModel } from './rosterReadModel';

const ORG = 'test-org';

function seedPersonnel(ctx: ReturnType<typeof createQueryPortsContext>) {
	ctx.store.seed('groups', [
		{ id: 'group-a', organization_id: ORG, name: 'Alpha', sort_order: 1 },
		{ id: 'group-b', organization_id: ORG, name: 'Bravo', sort_order: 2 }
	]);
	ctx.store.seed('personnel', [
		{
			id: 'p-alpha',
			organization_id: ORG,
			first_name: 'Alice',
			last_name: 'Smith',
			rank: 'SGT',
			mos: '11B',
			clinic_role: 'Team Leader',
			group_id: 'group-a',
			groups: { name: 'Alpha' },
			archived_at: null
		},
		{
			id: 'p-bravo',
			organization_id: ORG,
			first_name: 'Bailey',
			last_name: 'Jones',
			rank: 'SSG',
			mos: '68W',
			clinic_role: 'Medic',
			group_id: 'group-b',
			groups: { name: 'Bravo' },
			archived_at: null
		},
		{
			id: 'p-archived',
			organization_id: ORG,
			first_name: 'Casey',
			last_name: 'Adams',
			rank: 'PFC',
			mos: '25U',
			clinic_role: '',
			group_id: 'group-b',
			groups: { name: 'Bravo' },
			archived_at: '2026-01-01T00:00:00.000Z'
		}
	]);
}

describe('server roster read model', () => {
	it('loads active roster personnel by default through the server seam', async () => {
		const ctx = createQueryPortsContext();
		seedPersonnel(ctx);

		const personnel = await loadRosterPersonnel(ctx);

		expect(personnel.map((person) => person.id)).toEqual(['p-bravo', 'p-alpha']);
	});

	it('loads explicit active, archived, and all roster statuses', async () => {
		const ctx = createQueryPortsContext();
		seedPersonnel(ctx);

		await expect(loadRosterPersonnel(ctx, { status: 'active' })).resolves.toHaveLength(2);
		await expect(loadRosterPersonnel(ctx, { status: 'archived' })).resolves.toHaveLength(1);
		await expect(loadRosterPersonnel(ctx, { status: 'all' })).resolves.toHaveLength(3);
	});

	it('keeps full and scoped view choices explicit after loading rows', async () => {
		const ctx = createQueryPortsContext();
		seedPersonnel(ctx);

		const roster = await loadRosterReadModel(ctx, { status: 'all', pinnedGroups: ['Bravo'] });

		expect(roster.full({ status: 'all' }).personnelByGroup.map((group) => group.group)).toEqual(['Bravo', 'Alpha']);
		expect(
			roster
				.scoped({ kind: 'groups', groupIds: ['group-b'] }, { status: 'active' })
				.personnel.map((person) => person.id)
		).toEqual(['p-bravo']);
	});

	it('can build the same read model from already-loaded database rows', () => {
		const roster = createRosterReadModelFromDbRows([
			{
				id: 'p-alpha',
				organization_id: ORG,
				first_name: 'Alice',
				last_name: 'Smith',
				rank: 'SGT',
				mos: '11B',
				clinic_role: 'Team Leader',
				group_id: 'group-a',
				group_name: 'Alpha',
				archived_at: null
			}
		]);

		expect(roster.full({ status: 'active' }).displayName('p-alpha')).toBe('SGT Smith, Alice');
	});
});
