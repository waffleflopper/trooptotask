import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _deleteConfig, _postConfig, _putConfig } from './+server';

describe('personnel ICT completions API', () => {
	it('audits successful completion create, update, and delete actions through the guarded route configs', async () => {
		const ctx = createTestContext();
		ctx.store.seed('personnel', [
			{
				id: 'person-1',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jane',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-alpha',
				archived_at: null
			}
		]);
		ctx.store.seed('ict_tasks', [
			{
				id: 'task-active',
				organization_id: ctx.auth.orgId,
				task_code: '181-105-1001',
				title: 'Active task',
				description: null,
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 0,
				archived_at: null,
				created_at: '2026-04-01T00:00:00Z'
			}
		]);

		const created = await handleUseCaseRequest(_postConfig, ctx, {
			personnelId: 'person-1',
			ictTaskId: 'task-active',
			completedAt: '2026-04-15',
			validationMethod: 'Lecture'
		});

		await handleUseCaseRequest(_putConfig, ctx, {
			id: (created as { id: string }).id,
			notes: 'Corrected entry'
		});

		await handleUseCaseRequest(_deleteConfig, ctx, {
			id: (created as { id: string }).id
		});

		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'personnel_ict_completion.created',
				resourceType: 'personnel_ict_completion',
				resourceId: (created as { id: string }).id
			}),
			expect.objectContaining({
				action: 'personnel_ict_completion.updated',
				resourceType: 'personnel_ict_completion',
				resourceId: (created as { id: string }).id
			}),
			expect.objectContaining({
				action: 'personnel_ict_completion.deleted',
				resourceType: 'personnel_ict_completion',
				resourceId: (created as { id: string }).id
			})
		]);
	});

	it('rejects creating a completion for an archived ICT task', async () => {
		const ctx = createTestContext();
		ctx.store.seed('personnel', [
			{
				id: 'person-1',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jane',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-alpha',
				archived_at: null
			}
		]);
		ctx.store.seed('ict_tasks', [
			{
				id: 'task-archived',
				organization_id: ctx.auth.orgId,
				task_code: '181-105-1999',
				title: 'Archived task',
				description: null,
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 0,
				archived_at: '2026-04-14T12:00:00Z',
				created_at: '2026-04-01T00:00:00Z'
			}
		]);

		await expect(
			handleUseCaseRequest(_postConfig, ctx, {
				personnelId: 'person-1',
				ictTaskId: 'task-archived',
				completedAt: '2026-04-15',
				validationMethod: 'Lecture'
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Archived critical tasks cannot receive new completion entries'
		});

		expect(await ctx.store.findMany('personnel_ict_completions', ctx.auth.orgId)).toEqual([]);
	});

	it('rejects creating a completion for an archived person', async () => {
		const ctx = createTestContext();
		ctx.store.seed('personnel', [
			{
				id: 'person-archived',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jane',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-alpha',
				archived_at: '2026-04-14T12:00:00Z'
			}
		]);
		ctx.store.seed('ict_tasks', [
			{
				id: 'task-active',
				organization_id: ctx.auth.orgId,
				task_code: '181-105-1001',
				title: 'Active task',
				description: null,
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 0,
				archived_at: null,
				created_at: '2026-04-01T00:00:00Z'
			}
		]);

		await expect(
			handleUseCaseRequest(_postConfig, ctx, {
				personnelId: 'person-archived',
				ictTaskId: 'task-active',
				completedAt: '2026-04-15',
				validationMethod: 'Lecture'
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Archived personnel cannot receive new completion entries'
		});

		expect(await ctx.store.findMany('personnel_ict_completions', ctx.auth.orgId)).toEqual([]);
	});

	it('rejects updating a completion when its ICT task has been archived', async () => {
		const ctx = createTestContext();
		ctx.store.seed('ict_tasks', [
			{
				id: 'task-archived',
				organization_id: ctx.auth.orgId,
				task_code: '181-105-1999',
				title: 'Archived task',
				description: null,
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 0,
				archived_at: '2026-04-14T12:00:00Z',
				created_at: '2026-04-01T00:00:00Z'
			}
		]);
		ctx.store.seed('personnel_ict_completions', [
			{
				id: 'completion-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				ict_task_id: 'task-archived',
				completed_at: '2026-04-10',
				validation_method: 'Lecture',
				validated_by: null,
				notes: 'Original note',
				logged_by: 'user-1',
				created_at: '2026-04-10T00:00:00Z'
			}
		]);

		await expect(
			handleUseCaseRequest(_putConfig, ctx, {
				id: 'completion-1',
				notes: 'Updated note'
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Archived critical tasks cannot receive new completion entries'
		});

		const stored = await ctx.store.findOne<{ notes: string }>('personnel_ict_completions', ctx.auth.orgId, {
			id: 'completion-1'
		});
		expect(stored?.notes).toBe('Original note');
	});

	it('rejects updating a completion when its person has been archived', async () => {
		const ctx = createTestContext();
		ctx.store.seed('personnel', [
			{
				id: 'person-archived',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jane',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-alpha',
				archived_at: '2026-04-14T12:00:00Z'
			}
		]);
		ctx.store.seed('ict_tasks', [
			{
				id: 'task-active',
				organization_id: ctx.auth.orgId,
				task_code: '181-105-1001',
				title: 'Active task',
				description: null,
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 0,
				archived_at: null,
				created_at: '2026-04-01T00:00:00Z'
			}
		]);
		ctx.store.seed('personnel_ict_completions', [
			{
				id: 'completion-archived-person',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-archived',
				ict_task_id: 'task-active',
				completed_at: '2026-04-10',
				validation_method: 'Lecture',
				validated_by: null,
				notes: 'Original note',
				logged_by: 'user-1',
				created_at: '2026-04-10T00:00:00Z'
			}
		]);

		await expect(
			handleUseCaseRequest(_putConfig, ctx, {
				id: 'completion-archived-person',
				notes: 'Updated note'
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Archived personnel completion history cannot be edited'
		});

		const stored = await ctx.store.findOne<{ notes: string }>('personnel_ict_completions', ctx.auth.orgId, {
			id: 'completion-archived-person'
		});
		expect(stored?.notes).toBe('Original note');
	});

	it('rejects deleting a completion when its ICT task has been archived to preserve history', async () => {
		const ctx = createTestContext();
		ctx.store.seed('ict_tasks', [
			{
				id: 'task-archived',
				organization_id: ctx.auth.orgId,
				task_code: '181-105-1999',
				title: 'Archived task',
				description: null,
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 0,
				archived_at: '2026-04-14T12:00:00Z',
				created_at: '2026-04-01T00:00:00Z'
			}
		]);
		ctx.store.seed('personnel_ict_completions', [
			{
				id: 'completion-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				ict_task_id: 'task-archived',
				completed_at: '2026-04-10',
				validation_method: 'Lecture',
				validated_by: null,
				notes: 'Historical record',
				logged_by: 'user-1',
				created_at: '2026-04-10T00:00:00Z'
			}
		]);

		await expect(
			handleUseCaseRequest(_deleteConfig, ctx, {
				id: 'completion-1'
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Archived critical task history cannot be deleted'
		});

		const stored = await ctx.store.findOne<{ id: string }>('personnel_ict_completions', ctx.auth.orgId, {
			id: 'completion-1'
		});
		expect(stored?.id).toBe('completion-1');
	});

	it('rejects deleting a completion when its person has been archived to preserve history', async () => {
		const ctx = createTestContext();
		ctx.store.seed('personnel', [
			{
				id: 'person-archived',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jane',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-alpha',
				archived_at: '2026-04-14T12:00:00Z'
			}
		]);
		ctx.store.seed('ict_tasks', [
			{
				id: 'task-active',
				organization_id: ctx.auth.orgId,
				task_code: '181-105-1001',
				title: 'Active task',
				description: null,
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 0,
				archived_at: null,
				created_at: '2026-04-01T00:00:00Z'
			}
		]);
		ctx.store.seed('personnel_ict_completions', [
			{
				id: 'completion-archived-person',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-archived',
				ict_task_id: 'task-active',
				completed_at: '2026-04-10',
				validation_method: 'Lecture',
				validated_by: null,
				notes: 'Historical record',
				logged_by: 'user-1',
				created_at: '2026-04-10T00:00:00Z'
			}
		]);

		await expect(
			handleUseCaseRequest(_deleteConfig, ctx, {
				id: 'completion-archived-person'
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Archived personnel completion history cannot be deleted'
		});

		const stored = await ctx.store.findOne<{ id: string }>('personnel_ict_completions', ctx.auth.orgId, {
			id: 'completion-archived-person'
		});
		expect(stored?.id).toBe('completion-archived-person');
	});
});
