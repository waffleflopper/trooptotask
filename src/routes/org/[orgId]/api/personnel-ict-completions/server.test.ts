import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _deleteConfig, _postConfig, _putConfig } from './+server';

function criticalTasksOnlyContext(
	scopeSet: { kind: 'organization' } | { kind: 'groups'; groupIds: string[] } = {
		kind: 'groups',
		groupIds: ['group-alpha']
	}
) {
	return createTestContext({
		auth: {
			role: 'member',
			isPrivileged: false,
			scopeSet,
			capabilityMap: {
				calendar: 'none',
				personnel: 'none',
				training: 'none',
				criticalTasks: 'operate',
				onboarding: 'none',
				ratingScheme: 'none'
			}
		}
	});
}

function seedCompletionReferences(ctx: ReturnType<typeof createTestContext>) {
	ctx.store.seed('personnel', [
		{ id: 'person-alpha', organization_id: ctx.auth.orgId, group_id: 'group-alpha', archived_at: null },
		{ id: 'person-alpha-2', organization_id: ctx.auth.orgId, group_id: 'group-alpha', archived_at: null },
		{ id: 'person-bravo', organization_id: ctx.auth.orgId, group_id: 'group-bravo', archived_at: null },
		{ id: 'person-archived', organization_id: ctx.auth.orgId, group_id: 'group-alpha', archived_at: '2026-04-01' },
		{ id: 'person-foreign', organization_id: 'other-org', group_id: 'group-alpha', archived_at: null }
	]);
	ctx.store.seed('ict_tasks', [
		{
			id: 'task-active',
			organization_id: ctx.auth.orgId,
			task_code: 'T-1',
			title: 'Active task',
			mos: [],
			archived_at: null
		}
	]);
}

function seedCompletion(ctx: ReturnType<typeof createTestContext>, personnelId: string) {
	ctx.store.seed('personnel_ict_completions', [
		{
			id: 'completion-1',
			organization_id: ctx.auth.orgId,
			personnel_id: personnelId,
			ict_task_id: 'task-active',
			completed_at: '2026-04-10',
			validation_method: 'Lecture',
			notes: 'Original note'
		}
	]);
}

function blockRequestPersonnelLookup(ctx: ReturnType<typeof createTestContext>) {
	const requestFindOne = ctx.store.findOne.bind(ctx.store);
	vi.spyOn(ctx.store, 'findOne').mockImplementation((...args) => {
		if (args[0] === 'personnel') throw new Error('Request Personnel SELECT denied');
		return requestFindOne(...args);
	});
	if (ctx.rawStore === ctx.store) return;
	const rawFindOne = ctx.rawStore.findOne.bind(ctx.rawStore);
	vi.spyOn(ctx.rawStore, 'findOne').mockImplementation((...args) => {
		if (args[0] === 'personnel') throw new Error('Raw request Personnel SELECT denied');
		return rawFindOne(...args);
	});
}

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
			message: 'Archived critical task history cannot be edited'
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

	it('rejects updating archived task history even when the payload includes an active personnel id', async () => {
		const ctx = createTestContext();
		ctx.store.seed('personnel', [
			{
				id: 'person-active',
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
		ctx.store.seed('personnel_ict_completions', [
			{
				id: 'completion-archived-task',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-active',
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
				id: 'completion-archived-task',
				personnelId: 'person-active',
				notes: 'Updated note'
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Archived critical task history cannot be edited'
		});
	});

	it('rejects updating archived personnel history even when the payload includes an active task id', async () => {
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
				ictTaskId: 'task-active',
				notes: 'Updated note'
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Archived personnel completion history cannot be edited'
		});
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

	it('allows Critical Tasks-only Group create, reassignment, and delete without request Personnel SELECT', async () => {
		const ctx = criticalTasksOnlyContext();
		seedCompletionReferences(ctx);
		blockRequestPersonnelLookup(ctx);

		const created = (await handleUseCaseRequest(_postConfig, ctx, {
			personnelId: 'person-alpha',
			ictTaskId: 'task-active',
			completedAt: '2026-04-15',
			validationMethod: 'Lecture'
		})) as { id: string };
		const updated = await handleUseCaseRequest(_putConfig, ctx, {
			id: created.id,
			personnelId: 'person-alpha-2',
			notes: 'Corrected entry'
		});
		expect(updated).toMatchObject({ personnelId: 'person-alpha-2', notes: 'Corrected entry' });
		await handleUseCaseRequest(_deleteConfig, ctx, { id: created.id });

		expect(await ctx.store.findOne('personnel_ict_completions', ctx.auth.orgId, { id: created.id })).toBeNull();
		expect(ctx.auditPort.events.map((event) => event.action)).toEqual([
			'personnel_ict_completion.created',
			'personnel_ict_completion.updated',
			'personnel_ict_completion.deleted'
		]);
	});

	it('denies a replacement Person outside Group scope and preserves the existing completion', async () => {
		const ctx = criticalTasksOnlyContext();
		seedCompletionReferences(ctx);
		seedCompletion(ctx, 'person-alpha');
		blockRequestPersonnelLookup(ctx);

		await expect(
			handleUseCaseRequest(_putConfig, ctx, {
				id: 'completion-1',
				personnelId: 'person-bravo',
				notes: 'Unauthorized move'
			})
		).rejects.toMatchObject({ status: 403 });
		expect(await ctx.store.findOne('personnel_ict_completions', ctx.auth.orgId, { id: 'completion-1' })).toMatchObject({
			personnel_id: 'person-alpha',
			notes: 'Original note'
		});
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({ action: 'policy.denied', resourceId: 'completion-1' })
		]);
	});

	it('denies moving another Group’s existing completion into the actor Group', async () => {
		const ctx = criticalTasksOnlyContext();
		seedCompletionReferences(ctx);
		seedCompletion(ctx, 'person-bravo');
		blockRequestPersonnelLookup(ctx);

		await expect(
			handleUseCaseRequest(_putConfig, ctx, {
				id: 'completion-1',
				personnelId: 'person-alpha',
				notes: 'Unauthorized move'
			})
		).rejects.toMatchObject({ status: 403 });
		expect(
			await ctx.rawStore.findOne('personnel_ict_completions', ctx.auth.orgId, { id: 'completion-1' })
		).toMatchObject({
			personnel_id: 'person-bravo',
			notes: 'Original note'
		});
	});

	it('protects archived Person history for a Critical Tasks-only Organization operator', async () => {
		const ctx = criticalTasksOnlyContext({ kind: 'organization' });
		seedCompletionReferences(ctx);
		seedCompletion(ctx, 'person-archived');
		blockRequestPersonnelLookup(ctx);

		await expect(
			handleUseCaseRequest(_putConfig, ctx, {
				id: 'completion-1',
				personnelId: 'person-alpha',
				notes: 'Bypass attempt'
			})
		).rejects.toMatchObject({ status: 400, message: 'Archived personnel completion history cannot be edited' });
		await expect(handleUseCaseRequest(_deleteConfig, ctx, { id: 'completion-1' })).rejects.toMatchObject({
			status: 400,
			message: 'Archived personnel completion history cannot be deleted'
		});
		expect(await ctx.store.findOne('personnel_ict_completions', ctx.auth.orgId, { id: 'completion-1' })).toMatchObject({
			personnel_id: 'person-archived',
			notes: 'Original note'
		});
	});

	it('rejects edits to historical completions referencing a foreign Organization task', async () => {
		const ctx = criticalTasksOnlyContext({ kind: 'organization' });
		seedCompletionReferences(ctx);
		ctx.store.seed('ict_tasks', [{ id: 'task-foreign', organization_id: 'other-org', archived_at: null }]);
		ctx.store.seed('personnel_ict_completions', [
			{
				id: 'completion-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-alpha',
				ict_task_id: 'task-foreign',
				completed_at: '2026-04-10',
				validation_method: 'Lecture',
				notes: 'Historical note'
			}
		]);
		blockRequestPersonnelLookup(ctx);

		await expect(
			handleUseCaseRequest(_putConfig, ctx, { id: 'completion-1', notes: 'Changed note' })
		).rejects.toMatchObject({ status: 400, message: 'Critical task not found' });
		await expect(handleUseCaseRequest(_deleteConfig, ctx, { id: 'completion-1' })).rejects.toMatchObject({
			status: 400,
			message: 'Critical task not found'
		});
		expect(await ctx.store.findOne('personnel_ict_completions', ctx.auth.orgId, { id: 'completion-1' })).toMatchObject({
			ict_task_id: 'task-foreign',
			notes: 'Historical note'
		});
		expect(ctx.auditPort.events).toEqual([]);
	});

	it('denies missing, foreign and archived new Person references under Critical Tasks-only access', async () => {
		const ctx = criticalTasksOnlyContext({ kind: 'organization' });
		seedCompletionReferences(ctx);
		seedCompletion(ctx, 'person-alpha');
		blockRequestPersonnelLookup(ctx);
		for (const personnelId of ['person-missing', 'person-foreign']) {
			await expect(
				handleUseCaseRequest(_postConfig, ctx, {
					personnelId,
					ictTaskId: 'task-active',
					completedAt: '2026-04-15',
					validationMethod: 'Lecture'
				})
			).rejects.toMatchObject({ status: 400, message: 'Personnel record not found' });
		}
		await expect(
			handleUseCaseRequest(_postConfig, ctx, {
				personnelId: 'person-archived',
				ictTaskId: 'task-active',
				completedAt: '2026-04-15',
				validationMethod: 'Lecture'
			})
		).rejects.toMatchObject({ status: 400, message: 'Archived personnel cannot receive new completion entries' });
		await expect(
			handleUseCaseRequest(_putConfig, ctx, { id: 'completion-1', personnelId: 'person-archived' })
		).rejects.toMatchObject({ status: 400, message: 'Archived personnel cannot receive new completion entries' });
		expect(await ctx.store.findMany('personnel_ict_completions', ctx.auth.orgId)).toEqual([
			expect.objectContaining({ id: 'completion-1', personnel_id: 'person-alpha', notes: 'Original note' })
		]);
	});

	it('denies new completion writes for an empty Group scope without exposing Person references', async () => {
		const ctx = criticalTasksOnlyContext({ kind: 'groups', groupIds: [] });
		seedCompletionReferences(ctx);
		blockRequestPersonnelLookup(ctx);
		await expect(
			handleUseCaseRequest(_postConfig, ctx, {
				personnelId: 'person-alpha',
				ictTaskId: 'task-active',
				completedAt: '2026-04-15',
				validationMethod: 'Lecture'
			})
		).rejects.toMatchObject({ status: 403 });
		expect(await ctx.rawStore.findMany('personnel_ict_completions', ctx.auth.orgId)).toEqual([]);
	});
});
