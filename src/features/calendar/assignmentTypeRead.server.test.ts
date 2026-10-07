import { describe, expect, it } from 'vitest';
import { createInMemoryDataStore } from '$lib/server/adapters/inMemory';
import { createInMemoryCalendarCatalogPersistence } from './inMemoryCalendarPersistence.server';
import { listAssignmentTypeTargets, listAssignmentTypes } from './assignmentTypeRead.server';

describe('Calendar assignment-type reads', () => {
	it('keeps archived references available to authorized consumers and isolates another Organization', async () => {
		const store = createInMemoryDataStore();
		store.seed('assignment_types', [
			{
				id: 'archived',
				organization_id: 'alpha',
				name: 'Historic',
				short_name: 'H',
				assign_to: 'personnel',
				color: '#111111',
				sort_order: 2,
				exempt_personnel_ids: ['person-1'],
				archived_at: '2026-01-01'
			},
			{
				id: 'foreign',
				organization_id: 'bravo',
				name: 'Hidden',
				short_name: 'X',
				assign_to: 'personnel',
				color: '#222222',
				sort_order: 0
			},
			{
				id: 'group',
				organization_id: 'alpha',
				name: 'Group Duty',
				short_name: 'GD',
				assign_to: 'group',
				color: '#333333',
				sort_order: 1
			}
		]);

		expect(
			(await listAssignmentTypes(createInMemoryCalendarCatalogPersistence(store, 'alpha'))).map(
				({ id, archivedAt }) => ({ id, archivedAt })
			)
		).toEqual([
			{ id: 'group', archivedAt: undefined },
			{ id: 'archived', archivedAt: '2026-01-01' }
		]);
		expect(
			(
				await listAssignmentTypeTargets(createInMemoryCalendarCatalogPersistence(store, 'alpha'), [
					'group',
					'archived',
					'foreign'
				])
			).map(({ id, assignTo }) => ({
				id,
				assignTo
			}))
		).toEqual([
			{ id: 'archived', assignTo: 'personnel' },
			{ id: 'group', assignTo: 'group' }
		]);
	});
});
