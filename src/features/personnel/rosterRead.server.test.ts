import { describe, expect, it } from 'vitest';
import { createInMemoryDataStore, createQueryPortsContext } from '$lib/server/adapters/inMemory';
import { listPersonnelNamesByIds, loadRosterPersonnel } from './index.server';

const ORG = 'test-org';

function seedPersonnel(ctx: ReturnType<typeof createQueryPortsContext>) {
	ctx.store.seed('personnel', [
		{ id: 'active-z', organization_id: ORG, first_name: 'Zoey', last_name: 'Zulu', archived_at: null },
		{ id: 'active-a', organization_id: ORG, first_name: 'Ada', last_name: 'Alpha', archived_at: null },
		{
			id: 'archived-old',
			organization_id: ORG,
			first_name: 'Olivia',
			last_name: 'Baker',
			archived_at: '2025-01-01T00:00:00.000Z'
		},
		{
			id: 'archived-new',
			organization_id: ORG,
			first_name: 'Nora',
			last_name: 'Yankee',
			archived_at: '2026-01-01T00:00:00.000Z'
		},
		{ id: 'foreign', organization_id: 'another-org', first_name: 'Fran', last_name: 'Foreign', archived_at: null }
	]);
}

describe('Personnel server roster read', () => {
	it('returns only active Organization personnel in name order by default', async () => {
		const ctx = createQueryPortsContext();
		seedPersonnel(ctx);
		expect((await loadRosterPersonnel(ctx)).map((person) => person.id)).toEqual(['active-a', 'active-z']);
	});

	it('keeps active, archived, and all status choices explicit', async () => {
		const ctx = createQueryPortsContext();
		seedPersonnel(ctx);
		expect((await loadRosterPersonnel(ctx, { status: 'active' })).map((p) => p.id)).toEqual(['active-a', 'active-z']);
		expect((await loadRosterPersonnel(ctx, { status: 'archived' })).map((p) => p.id)).toEqual([
			'archived-old',
			'archived-new'
		]);
		expect((await loadRosterPersonnel(ctx, { status: 'all' })).map((p) => p.id)).toEqual([
			'active-a',
			'archived-old',
			'archived-new',
			'active-z'
		]);
	});

	it('orders archived records by archive time for settings', async () => {
		const ctx = createQueryPortsContext();
		seedPersonnel(ctx);
		expect((await loadRosterPersonnel(ctx, { status: 'archived', order: 'archived-newest' })).map((p) => p.id)).toEqual(
			['archived-new', 'archived-old']
		);
	});

	it('returns only referenced Organization names, retaining archived labels and empty name parts', async () => {
		const store = createInMemoryDataStore();
		store.seed('personnel', [
			{ id: 'active', organization_id: ORG, rank: 'SPC', last_name: 'Vega', first_name: 'Rowan', archived_at: null },
			{
				id: 'archived',
				organization_id: ORG,
				rank: '',
				last_name: 'Vale',
				first_name: '',
				archived_at: '2026-01-01T00:00:00Z'
			},
			{ id: 'unrequested', organization_id: ORG, rank: 'SGT', last_name: 'Hidden', first_name: 'Local' },
			{ id: 'foreign', organization_id: 'other-org', rank: 'SFC', last_name: 'Foreign', first_name: 'Person' }
		]);

		expect(await listPersonnelNamesByIds(store, ORG, ['active', 'archived', 'foreign', 'missing'])).toEqual(
			new Map([
				['active', 'SPC Vega Rowan'],
				['archived', 'Vale']
			])
		);
	});

	it('returns no Personnel names without accessing persistence when no IDs are referenced', async () => {
		await expect(
			listPersonnelNamesByIds(
				{
					async findMany() {
						throw new Error('Persistence is unavailable');
					}
				},
				ORG,
				[]
			)
		).resolves.toEqual(new Map());
	});
});
