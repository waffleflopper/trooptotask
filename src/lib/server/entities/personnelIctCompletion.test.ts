import { describe, expect, it } from 'vitest';
import { PersonnelIctCompletionEntity } from './personnelIctCompletion';
import type { PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';

describe('PersonnelIctCompletionEntity', () => {
	it('maps database rows to personnel ICT completion records', () => {
		const result = PersonnelIctCompletionEntity.fromDb({
			id: 'completion-1',
			personnel_id: 'person-1',
			ict_task_id: 'task-1',
			completed_at: '2026-04-01',
			validation_method: 'Practical Exercise',
			validated_by: 'SFC Smith',
			notes: 'Validated during lane training',
			logged_by: 'user-1',
			created_at: '2026-04-01T12:00:00Z'
		}) as PersonnelIctCompletion;

		expect(result).toEqual({
			id: 'completion-1',
			personnelId: 'person-1',
			ictTaskId: 'task-1',
			completedAt: '2026-04-01',
			validationMethod: 'Practical Exercise',
			validatedBy: 'SFC Smith',
			notes: 'Validated during lane training',
			loggedBy: 'user-1',
			createdAt: '2026-04-01T12:00:00Z'
		});
	});

	it('allows nullable validation details while requiring the completion date and method', () => {
		const valid = PersonnelIctCompletionEntity.createSchema.safeParse({
			personnelId: 'person-1',
			ictTaskId: 'task-1',
			completedAt: '2026-04-01',
			validationMethod: 'Lecture'
		});
		const missingMethod = PersonnelIctCompletionEntity.createSchema.safeParse({
			personnelId: 'person-1',
			ictTaskId: 'task-1',
			completedAt: '2026-04-01'
		});

		expect(valid.success).toBe(true);
		expect(missingMethod.success).toBe(false);
	});

	it('maps create input to database columns with nullable detail defaults', () => {
		const result = PersonnelIctCompletionEntity.toDbInsert(
			{
				personnelId: 'person-1',
				ictTaskId: 'task-1',
				completedAt: '2026-04-01',
				validationMethod: 'Lecture'
			},
			'org-1'
		);

		expect(result).toEqual({
			organization_id: 'org-1',
			personnel_id: 'person-1',
			ict_task_id: 'task-1',
			completed_at: '2026-04-01',
			validation_method: 'Lecture',
			validated_by: null,
			notes: null
		});
	});

	it('maps updates to database columns without logged_by or created_at', () => {
		const result = PersonnelIctCompletionEntity.toDbUpdate({
			id: 'completion-1',
			completedAt: '2026-04-02',
			validatedBy: 'SFC Jones',
			loggedBy: 'user-1',
			createdAt: '2026-04-01T12:00:00Z'
		});

		expect(result).toEqual({
			completed_at: '2026-04-02',
			validated_by: 'SFC Jones'
		});
	});

	it('uses the existing training edit permission boundary for writes', () => {
		expect(PersonnelIctCompletionEntity.table).toBe('personnel_ict_completions');
		expect(PersonnelIctCompletionEntity.permission).toBe('training');
		expect(PersonnelIctCompletionEntity.requireFullEditor).toBeUndefined();
		expect(PersonnelIctCompletionEntity.groupScope).toEqual({ personnelColumn: 'personnel_id' });
		expect(PersonnelIctCompletionEntity.personnelIdField).toBe('personnelId');
	});
});
