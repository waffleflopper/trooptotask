import { describe, expect, it } from 'vitest';
import { createQueryPortsContext } from '$lib/server/adapters/inMemory';
import { loadRosterPersonnel } from './index.server';

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
});
