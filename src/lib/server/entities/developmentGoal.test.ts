import { describe, it, expect } from 'vitest';
import { DevelopmentGoalEntity } from './developmentGoal';
import type { DevelopmentGoal } from './developmentGoal';

describe('DevelopmentGoalEntity', () => {
	it('fromDb produces correct shape', () => {
		const row = {
			id: 'dg-1',
			personnel_id: 'p-1',
			title: 'Complete NCOER',
			term_type: 'short',
			is_completed: true,
			notes: 'On track'
		};
		const result = DevelopmentGoalEntity.fromDb(row) as DevelopmentGoal;

		expect(result).toEqual({
			id: 'dg-1',
			personnelId: 'p-1',
			title: 'Complete NCOER',
			termType: 'short',
			isCompleted: true,
			notes: 'On track'
		});
	});

	it('fromDb handles null notes', () => {
		const row = {
			id: 'dg-2',
			personnel_id: 'p-2',
			title: 'Attend SLC',
			term_type: 'long',
			is_completed: false,
			notes: null
		};
		const result = DevelopmentGoalEntity.fromDb(row) as DevelopmentGoal;

		expect(result.notes).toBeNull();
	});

	it('fromDb defaults isCompleted to false when null', () => {
		const row = {
			id: 'dg-3',
			personnel_id: 'p-3',
			title: 'PT improvement',
			term_type: 'short',
			is_completed: null,
			notes: null
		};
		const result = DevelopmentGoalEntity.fromDb(row) as DevelopmentGoal;

		expect(result.isCompleted).toBe(false);
	});

	it('fromDbArray transforms multiple rows', () => {
		const rows = [
			{
				id: 'dg-1',
				personnel_id: 'p-1',
				title: 'Goal 1',
				term_type: 'short',
				is_completed: false,
				notes: null
			},
			{
				id: 'dg-2',
				personnel_id: 'p-2',
				title: 'Goal 2',
				term_type: 'long',
				is_completed: true,
				notes: 'Done'
			}
		];
		const results = DevelopmentGoalEntity.fromDbArray(rows) as DevelopmentGoal[];

		expect(results).toHaveLength(2);
		expect(results[0].termType).toBe('short');
		expect(results[1].isCompleted).toBe(true);
	});

	it('toDbInsert includes isCompleted default', () => {
		const result = DevelopmentGoalEntity.toDbInsert(
			{
				personnelId: 'p-1',
				title: 'New Goal',
				termType: 'short'
			},
			'org-1'
		);

		expect(result).toEqual({
			organization_id: 'org-1',
			personnel_id: 'p-1',
			title: 'New Goal',
			term_type: 'short',
			is_completed: false,
			notes: null
		});
	});

	it('createSchema validates termType enum', () => {
		const valid = DevelopmentGoalEntity.createSchema.safeParse({
			personnelId: 'p-1',
			title: 'Goal',
			termType: 'short'
		});
		expect(valid.success).toBe(true);

		const validLong = DevelopmentGoalEntity.createSchema.safeParse({
			personnelId: 'p-1',
			title: 'Goal',
			termType: 'long'
		});
		expect(validLong.success).toBe(true);

		const invalid = DevelopmentGoalEntity.createSchema.safeParse({
			personnelId: 'p-1',
			title: 'Goal',
			termType: 'medium'
		});
		expect(invalid.success).toBe(false);
	});

	it('has group scope with personnelColumn', () => {
		expect(DevelopmentGoalEntity.groupScope).toEqual({ personnelColumn: 'personnel_id' });
	});

	it('has personnelIdField set', () => {
		expect(DevelopmentGoalEntity.personnelIdField).toBe('personnelId');
	});

	it('has correct table name', () => {
		expect(DevelopmentGoalEntity.table).toBe('development_goals');
	});

	it('has repo', () => {
		expect(DevelopmentGoalEntity.repo).toBeDefined();
		expect(DevelopmentGoalEntity.repo.query).toBeTypeOf('function');
		expect(DevelopmentGoalEntity.repo.list).toBeTypeOf('function');
	});
});
