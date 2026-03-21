import { describe, it, expect } from 'vitest';
import { PinnedGroupsEntity } from './pinnedGroups';

describe('PinnedGroupsEntity', () => {
	it('fromDb returns a string (group name)', () => {
		const row = {
			id: 'pg-1',
			group_name: 'Alpha',
			user_id: 'u-1',
			sort_order: 0
		};
		const result = PinnedGroupsEntity.fromDb(row);

		expect(result).toBe('Alpha');
		expect(typeof result).toBe('string');
	});

	it('fromDbArray returns string[]', () => {
		const rows = [
			{ id: 'pg-1', group_name: 'Alpha', user_id: 'u-1', sort_order: 0 },
			{ id: 'pg-2', group_name: 'Bravo', user_id: 'u-1', sort_order: 1 },
			{ id: 'pg-3', group_name: 'Charlie', user_id: 'u-1', sort_order: 2 }
		];
		const results = PinnedGroupsEntity.fromDbArray(rows);

		expect(results).toEqual(['Alpha', 'Bravo', 'Charlie']);
		expect(results).toHaveLength(3);
		results.forEach((r) => expect(typeof r).toBe('string'));
	});

	it('has correct table name', () => {
		expect(PinnedGroupsEntity.table).toBe('user_pinned_groups');
	});

	it('has groupScope none', () => {
		expect(PinnedGroupsEntity.groupScope).toBe('none');
	});

	it('has repo', () => {
		expect(PinnedGroupsEntity.repo).toBeDefined();
		expect(PinnedGroupsEntity.repo.list).toBeDefined();
		expect(PinnedGroupsEntity.repo.query).toBeDefined();
	});
});
