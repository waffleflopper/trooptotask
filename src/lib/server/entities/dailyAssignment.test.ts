import { describe, it, expect } from 'vitest';
import { DailyAssignmentEntity } from './dailyAssignment';
import type { DailyAssignment } from '$lib/types';

describe('DailyAssignmentEntity', () => {
	it('fromDb produces correct DailyAssignment shape', () => {
		const row = {
			id: 'da-1',
			date: '2026-03-01',
			assignment_type_id: 'at-1',
			assignee_id: 'p-1'
		};
		const result = DailyAssignmentEntity.fromDb(row) as DailyAssignment;

		expect(result).toEqual({
			id: 'da-1',
			date: '2026-03-01',
			assignmentTypeId: 'at-1',
			assigneeId: 'p-1'
		});
	});

	it('fromDbArray transforms multiple rows', () => {
		const rows = [
			{ id: 'da-1', date: '2026-03-01', assignment_type_id: 'at-1', assignee_id: 'p-1' },
			{ id: 'da-2', date: '2026-03-02', assignment_type_id: 'at-2', assignee_id: 'p-2' }
		];
		const results = DailyAssignmentEntity.fromDbArray(rows) as DailyAssignment[];

		expect(results).toHaveLength(2);
		expect(results[0].assignmentTypeId).toBe('at-1');
		expect(results[1].assigneeId).toBe('p-2');
	});

	it('toDbInsert maps camelCase to snake_case and adds organization_id', () => {
		const result = DailyAssignmentEntity.toDbInsert(
			{
				date: '2026-03-01',
				assignmentTypeId: 'at-1',
				assigneeId: 'p-1'
			},
			'org-1'
		);

		expect(result).toEqual({
			organization_id: 'org-1',
			date: '2026-03-01',
			assignment_type_id: 'at-1',
			assignee_id: 'p-1'
		});
	});

	it('createSchema validates', () => {
		const valid = DailyAssignmentEntity.createSchema.safeParse({
			date: '2026-03-01',
			assignmentTypeId: 'at-1',
			assigneeId: 'p-1'
		});
		expect(valid.success).toBe(true);

		const missing = DailyAssignmentEntity.createSchema.safeParse({
			date: '2026-03-01'
		});
		expect(missing.success).toBe(false);
	});

	it('has correct table name', () => {
		expect(DailyAssignmentEntity.table).toBe('daily_assignments');
	});

	it('has groupScope none', () => {
		expect(DailyAssignmentEntity.groupScope).toBe('none');
	});
});
