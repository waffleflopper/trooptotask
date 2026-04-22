import { describe, expect, it, vi } from 'vitest';
import { PersonnelIctCompletionEntity } from './personnelIctCompletion';
import type { PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
import { entityHandlers, handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { createTestContext } from '$lib/server/adapters/inMemory';

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

	it('uses the critical tasks edit permission boundary for writes', () => {
		expect(PersonnelIctCompletionEntity.table).toBe('personnel_ict_completions');
		expect(PersonnelIctCompletionEntity.permission).toBe('critical-tasks');
		expect(PersonnelIctCompletionEntity.requireFullEditor).toBeUndefined();
		expect(PersonnelIctCompletionEntity.groupScope).toEqual({ personnelColumn: 'personnel_id' });
		expect(PersonnelIctCompletionEntity.personnelIdField).toBe('personnelId');
	});

	it('rejects completion writes when the user lacks critical tasks edit permission', async () => {
		const handlers = entityHandlers(PersonnelIctCompletionEntity);
		const ctx = createTestContext({
			auth: {
				requireEdit() {
					throw { status: 403, body: { message: 'Forbidden' } };
				}
			}
		});

		await expect(
			handleUseCaseRequest(handlers._configs.POST!, ctx, {
				personnelId: 'person-1',
				ictTaskId: 'task-1',
				completedAt: '2026-04-01',
				validationMethod: 'Lecture'
			})
		).rejects.toMatchObject({ status: 403 });

		const stored = await ctx.store.findMany('personnel_ict_completions', 'test-org');
		expect(stored).toHaveLength(0);
	});

	it('enforces scoped-group access for create and update writes', async () => {
		const handlers = entityHandlers(PersonnelIctCompletionEntity);
		const outsideId = '22222222-2222-4222-8222-222222222222';
		const requireGroupAccess = vi.fn(async (personnelId: string) => {
			if (personnelId === 'person-outside') {
				throw new Error('Access denied: personnel not in group');
			}
		});
		const requireGroupAccessByRecord = vi.fn(async (table: string, recordId: string, _personnelColumn: string) => {
			if (recordId === outsideId) {
				throw new Error('Access denied: record not in group');
			}
		});
		const ctx = createTestContext({
			auth: {
				scopedGroupId: 'group-1',
				requireGroupAccess,
				requireGroupAccessByRecord
			}
		});

		const created = (await handleUseCaseRequest(handlers._configs.POST!, ctx, {
			personnelId: 'person-inside',
			ictTaskId: 'task-1',
			completedAt: '2026-04-01',
			validationMethod: 'Practical Exercise'
		})) as PersonnelIctCompletion;

		expect(requireGroupAccess).toHaveBeenCalledWith('person-inside');
		expect(created.personnelId).toBe('person-inside');

		await expect(
			handleUseCaseRequest(handlers._configs.POST!, ctx, {
				personnelId: 'person-outside',
				ictTaskId: 'task-1',
				completedAt: '2026-04-01',
				validationMethod: 'Lecture'
			})
		).rejects.toThrow('Access denied: personnel not in group');

		await handleUseCaseRequest(handlers._configs.PUT!, ctx, {
			id: created.id,
			notes: 'Corrected entry'
		});

		expect(requireGroupAccessByRecord).toHaveBeenCalledWith('personnel_ict_completions', created.id, 'personnel_id');

		await ctx.rawStore.insert('personnel_ict_completions', 'test-org', {
			id: outsideId,
			personnel_id: 'person-outside',
			ict_task_id: 'task-1',
			completed_at: '2026-04-01',
			validation_method: 'Lecture',
			validated_by: null,
			notes: null,
			logged_by: null,
			created_at: '2026-04-01T12:00:00Z'
		});

		await expect(
			handleUseCaseRequest(handlers._configs.PUT!, ctx, {
				id: outsideId,
				notes: 'Unauthorized update'
			})
		).rejects.toThrow('Access denied: record not in group');
	});
});
