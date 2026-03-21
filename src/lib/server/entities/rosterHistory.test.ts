import { describe, it, expect } from 'vitest';
import { RosterHistoryEntity } from './rosterHistory';
import type { RosterHistoryItem } from '$features/duty-roster/stores/dutyRosterHistory.svelte';

describe('RosterHistoryEntity', () => {
	it('fromDb produces correct RosterHistoryItem shape', () => {
		const row = {
			id: 'rh-1',
			assignment_type_id: 'at-1',
			name: 'CQ Roster',
			start_date: '2026-03-01',
			end_date: '2026-03-31',
			roster: [{ name: 'Smith', date: '2026-03-01' }],
			config: { rotationDays: 3 },
			created_at: '2026-03-01T00:00:00Z'
		};
		const result = RosterHistoryEntity.fromDb(row);

		expect(result).toEqual({
			id: 'rh-1',
			assignmentTypeId: 'at-1',
			name: 'CQ Roster',
			startDate: '2026-03-01',
			endDate: '2026-03-31',
			roster: [{ name: 'Smith', date: '2026-03-01' }],
			config: { rotationDays: 3 },
			createdAt: '2026-03-01T00:00:00Z'
		});
	});

	it('fromDb defaults roster to [] when null', () => {
		const row = {
			id: 'rh-2',
			assignment_type_id: 'at-1',
			name: 'Empty Roster',
			start_date: '2026-03-01',
			end_date: '2026-03-31',
			roster: null,
			config: { rotationDays: 3 },
			created_at: '2026-03-01T00:00:00Z'
		};
		const result = RosterHistoryEntity.fromDb(row);

		expect(result).toHaveProperty('roster');
		expect((result as RosterHistoryItem).roster).toEqual([]);
	});

	it('fromDb defaults config to {} when null', () => {
		const row = {
			id: 'rh-3',
			assignment_type_id: 'at-1',
			name: 'No Config',
			start_date: '2026-03-01',
			end_date: '2026-03-31',
			roster: [],
			config: null,
			created_at: '2026-03-01T00:00:00Z'
		};
		const result = RosterHistoryEntity.fromDb(row);

		expect(result).toHaveProperty('config');
		expect((result as RosterHistoryItem).config).toEqual({});
	});

	it('fromDbArray transforms multiple rows', () => {
		const rows = [
			{
				id: 'rh-1',
				assignment_type_id: 'at-1',
				name: 'CQ Roster',
				start_date: '2026-03-01',
				end_date: '2026-03-31',
				roster: [],
				config: {},
				created_at: '2026-03-01T00:00:00Z'
			},
			{
				id: 'rh-2',
				assignment_type_id: 'at-2',
				name: 'Guard Roster',
				start_date: '2026-04-01',
				end_date: '2026-04-30',
				roster: null,
				config: null,
				created_at: '2026-04-01T00:00:00Z'
			}
		];
		const results = RosterHistoryEntity.fromDbArray(rows);

		expect(results).toHaveLength(2);
		expect((results[0] as RosterHistoryItem).assignmentTypeId).toBe('at-1');
		expect((results[1] as RosterHistoryItem).roster).toEqual([]);
		expect((results[1] as RosterHistoryItem).config).toEqual({});
	});

	it('toDbInsert maps camelCase to snake_case and adds organization_id', () => {
		const result = RosterHistoryEntity.toDbInsert(
			{
				assignmentTypeId: 'at-1',
				name: 'CQ Roster',
				startDate: '2026-03-01',
				endDate: '2026-03-31',
				roster: [{ name: 'Smith' }],
				config: { rotationDays: 3 }
			},
			'org-1'
		);

		expect(result).toEqual({
			organization_id: 'org-1',
			assignment_type_id: 'at-1',
			name: 'CQ Roster',
			start_date: '2026-03-01',
			end_date: '2026-03-31',
			roster: [{ name: 'Smith' }],
			config: { rotationDays: 3 }
		});
	});

	it('toDbUpdate maps camelCase to snake_case and excludes readOnly fields', () => {
		const result = RosterHistoryEntity.toDbUpdate({
			id: 'rh-1',
			name: 'Updated Roster'
		});

		expect(result).toEqual({ name: 'Updated Roster' });
		expect(result).not.toHaveProperty('id');
		expect(result).not.toHaveProperty('created_at');
	});

	it('createSchema requires assignmentTypeId, name, startDate, endDate, roster, config', () => {
		const valid = RosterHistoryEntity.createSchema.safeParse({
			assignmentTypeId: 'at-1',
			name: 'CQ Roster',
			startDate: '2026-03-01',
			endDate: '2026-03-31',
			roster: [],
			config: {}
		});
		expect(valid.success).toBe(true);

		const missing = RosterHistoryEntity.createSchema.safeParse({
			assignmentTypeId: 'at-1',
			name: 'CQ Roster'
		});
		expect(missing.success).toBe(false);
	});

	it('has correct table name', () => {
		expect(RosterHistoryEntity.table).toBe('duty_roster_history');
	});

	it('has groupScope none', () => {
		expect(RosterHistoryEntity.groupScope).toBe('none');
	});

	it('has repo', () => {
		expect(RosterHistoryEntity.repo).toBeDefined();
		expect(RosterHistoryEntity.repo.list).toBeDefined();
		expect(RosterHistoryEntity.repo.query).toBeDefined();
	});
});
