import { describe, it, expect } from 'vitest';
import { GroupEntity } from './group';
import type { Group } from '$lib/stores/groups.svelte';

describe('GroupEntity', () => {
	it('fromDb produces correct Group shape matching existing transform', () => {
		const row = { id: 'g-1', name: 'Alpha', sort_order: 2 };
		const result = GroupEntity.fromDb(row) as Group;

		expect(result).toEqual({
			id: 'g-1',
			name: 'Alpha',
			sortOrder: 2
		});
	});

	it('fromDbArray transforms multiple rows', () => {
		const rows = [
			{ id: 'g-1', name: 'Alpha', sort_order: 1 },
			{ id: 'g-2', name: 'Bravo', sort_order: 2 }
		];
		const results = GroupEntity.fromDbArray(rows) as Group[];

		expect(results).toEqual([
			{ id: 'g-1', name: 'Alpha', sortOrder: 1 },
			{ id: 'g-2', name: 'Bravo', sortOrder: 2 }
		]);
	});

	it('toDbInsert applies sort_order default and adds organization_id', () => {
		const result = GroupEntity.toDbInsert({ name: 'Charlie' }, 'org-1');

		expect(result).toEqual({
			organization_id: 'org-1',
			name: 'Charlie',
			sort_order: 0 // insertDefault
		});
	});

	it('toDbInsert allows explicit sortOrder', () => {
		const result = GroupEntity.toDbInsert({ name: 'Delta', sortOrder: 5 }, 'org-1');

		expect(result).toEqual({
			organization_id: 'org-1',
			name: 'Delta',
			sort_order: 5
		});
	});

	it('createSchema requires name, makes sortOrder optional', () => {
		const valid = GroupEntity.createSchema.safeParse({ name: 'Echo' });
		expect(valid.success).toBe(true);

		const missing = GroupEntity.createSchema.safeParse({});
		expect(missing.success).toBe(false);

		const withOrder = GroupEntity.createSchema.safeParse({ name: 'Foxtrot', sortOrder: 3 });
		expect(withOrder.success).toBe(true);
	});
});
