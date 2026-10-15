import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$features/critical-tasks/server/criticalTasksPersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { isUuid } from '$lib/utils/inputSchemas';
import { _deleteConfig, _postConfig, _putConfig } from './+server';

const PERSON_1 = '00000000-0000-4000-8000-000000001001';
const PERSON_ALPHA = '00000000-0000-4000-8000-000000001002';
const PERSON_ALPHA_2 = '00000000-0000-4000-8000-000000001003';
const PERSON_BRAVO = '00000000-0000-4000-8000-000000001004';
const PERSON_ACTIVE = '00000000-0000-4000-8000-000000001005';
const PERSON_ARCHIVED = '00000000-0000-4000-8000-000000001006';
const PERSON_FOREIGN = '00000000-0000-4000-8000-000000001007';
const PERSON_MISSING = '00000000-0000-4000-8000-000000001008';
const TASK_ACTIVE = '00000000-0000-4000-8000-000000001009';
const TASK_ARCHIVED = '00000000-0000-4000-8000-00000000100a';
const TASK_FOREIGN = '00000000-0000-4000-8000-00000000100b';
const COMPLETION_1 = '00000000-0000-4000-8000-00000000100c';
const COMPLETION_ARCHIVED_PERSON = '00000000-0000-4000-8000-00000000100d';
const COMPLETION_ARCHIVED_TASK = '00000000-0000-4000-8000-00000000100e';

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
		{ id: PERSON_ALPHA, organization_id: ctx.auth.orgId, group_id: 'group-alpha', archived_at: null },
		{ id: PERSON_ALPHA_2, organization_id: ctx.auth.orgId, group_id: 'group-alpha', archived_at: null },
		{ id: PERSON_BRAVO, organization_id: ctx.auth.orgId, group_id: 'group-bravo', archived_at: null },
		{ id: PERSON_ARCHIVED, organization_id: ctx.auth.orgId, group_id: 'group-alpha', archived_at: '2026-04-01' },
		{ id: PERSON_FOREIGN, organization_id: 'other-org', group_id: 'group-alpha', archived_at: null }
	]);
	ctx.store.seed('ict_tasks', [
		{
			id: TASK_ACTIVE,
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
			id: COMPLETION_1,
			organization_id: ctx.auth.orgId,
			personnel_id: personnelId,
			ict_task_id: TASK_ACTIVE,
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

function rejectMalformedUuidLookups(ctx: ReturnType<typeof createTestContext>) {
	for (const store of new Set([ctx.store, ctx.rawStore])) {
		const findOne = store.findOne.bind(store);
		vi.spyOn(store, 'findOne').mockImplementation((...args) => {
			const id = (args[2] as { id?: unknown } | undefined)?.id;
			if (typeof id === 'string' && !isUuid(id)) throw new Error('invalid input syntax for type uuid');
			return findOne(...args);
		});
	}
}

describe('personnel ICT completions API', () => {
	it('rejects a malformed completion id on DELETE with 400 before any lookup', async () => {
		const ctx = criticalTasksOnlyContext({ kind: 'organization' });
		seedCompletionReferences(ctx);
		seedCompletion(ctx, PERSON_ALPHA);
		rejectMalformedUuidLookups(ctx);

		await expect(handleUseCaseRequest(_deleteConfig, ctx, { id: 'abc' }, () => ctx)).rejects.toMatchObject({
			status: 400,
			message: 'Invalid ID'
		});
		await expect(handleUseCaseRequest(_deleteConfig, ctx, {}, () => ctx)).rejects.toMatchObject({
			status: 400,
			message: 'Missing id'
		});
		expect(await ctx.store.findMany('personnel_ict_completions', ctx.auth.orgId)).toMatchObject([{ id: COMPLETION_1 }]);
	});

	it('answers an update of a missing completion with 404 and a malformed completion date with 400', async () => {
		const ctx = criticalTasksOnlyContext({ kind: 'organization' });
		seedCompletionReferences(ctx);
		seedCompletion(ctx, PERSON_ALPHA);

		await expect(
			handleUseCaseRequest(_putConfig, ctx, { id: COMPLETION_ARCHIVED_TASK, notes: 'Changed' }, () => ctx)
		).rejects.toMatchObject({ status: 404, message: 'That completion is no longer available.' });
		await expect(
			handleUseCaseRequest(_putConfig, ctx, { id: COMPLETION_1, completedAt: '2026-02-30' }, () => ctx)
		).rejects.toMatchObject({ status: 400, message: 'Use a valid date (YYYY-MM-DD)' });
		expect(await ctx.store.findMany('personnel_ict_completions', ctx.auth.orgId)).toMatchObject([
			{ id: COMPLETION_1, completed_at: '2026-04-10', notes: 'Original note' }
		]);
	});

	it('audits successful completion create, update, and delete actions through the guarded route configs', async () => {
		const ctx = createTestContext();
		ctx.store.seed('personnel', [
			{
				id: PERSON_1,
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
				id: TASK_ACTIVE,
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

		const created = await handleUseCaseRequest(
			_postConfig,
			ctx,
			{
				personnelId: PERSON_1,
				ictTaskId: TASK_ACTIVE,
				completedAt: '2026-04-15',
				validationMethod: 'Lecture'
			},
			() => ctx
		);

		await handleUseCaseRequest(
			_putConfig,
			ctx,
			{
				id: (created as { id: string }).id,
				notes: 'Corrected entry'
			},
			() => ctx
		);

		await handleUseCaseRequest(
			_deleteConfig,
			ctx,
			{
				id: (created as { id: string }).id
			},
			() => ctx
		);

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
				id: PERSON_1,
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
				id: TASK_ARCHIVED,
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
			handleUseCaseRequest(
				_postConfig,
				ctx,
				{
					personnelId: PERSON_1,
					ictTaskId: TASK_ARCHIVED,
					completedAt: '2026-04-15',
					validationMethod: 'Lecture'
				},
				() => ctx
			)
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
				id: PERSON_ARCHIVED,
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
				id: TASK_ACTIVE,
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
			handleUseCaseRequest(
				_postConfig,
				ctx,
				{
					personnelId: PERSON_ARCHIVED,
					ictTaskId: TASK_ACTIVE,
					completedAt: '2026-04-15',
					validationMethod: 'Lecture'
				},
				() => ctx
			)
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
				id: TASK_ARCHIVED,
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
				id: COMPLETION_1,
				organization_id: ctx.auth.orgId,
				personnel_id: PERSON_1,
				ict_task_id: TASK_ARCHIVED,
				completed_at: '2026-04-10',
				validation_method: 'Lecture',
				validated_by: null,
				notes: 'Original note',
				logged_by: 'user-1',
				created_at: '2026-04-10T00:00:00Z'
			}
		]);

		await expect(
			handleUseCaseRequest(
				_putConfig,
				ctx,
				{
					id: COMPLETION_1,
					notes: 'Updated note'
				},
				() => ctx
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Archived critical task history cannot be edited'
		});

		const stored = await ctx.store.findOne<{ notes: string }>('personnel_ict_completions', ctx.auth.orgId, {
			id: COMPLETION_1
		});
		expect(stored?.notes).toBe('Original note');
	});

	it('rejects updating a completion when its person has been archived', async () => {
		const ctx = createTestContext();
		ctx.store.seed('personnel', [
			{
				id: PERSON_ARCHIVED,
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
				id: TASK_ACTIVE,
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
				id: COMPLETION_ARCHIVED_PERSON,
				organization_id: ctx.auth.orgId,
				personnel_id: PERSON_ARCHIVED,
				ict_task_id: TASK_ACTIVE,
				completed_at: '2026-04-10',
				validation_method: 'Lecture',
				validated_by: null,
				notes: 'Original note',
				logged_by: 'user-1',
				created_at: '2026-04-10T00:00:00Z'
			}
		]);

		await expect(
			handleUseCaseRequest(
				_putConfig,
				ctx,
				{
					id: COMPLETION_ARCHIVED_PERSON,
					notes: 'Updated note'
				},
				() => ctx
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Archived personnel completion history cannot be edited'
		});

		const stored = await ctx.store.findOne<{ notes: string }>('personnel_ict_completions', ctx.auth.orgId, {
			id: COMPLETION_ARCHIVED_PERSON
		});
		expect(stored?.notes).toBe('Original note');
	});

	it('rejects updating archived task history even when the payload includes an active personnel id', async () => {
		const ctx = createTestContext();
		ctx.store.seed('personnel', [
			{
				id: PERSON_ACTIVE,
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
				id: TASK_ARCHIVED,
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
				id: COMPLETION_ARCHIVED_TASK,
				organization_id: ctx.auth.orgId,
				personnel_id: PERSON_ACTIVE,
				ict_task_id: TASK_ARCHIVED,
				completed_at: '2026-04-10',
				validation_method: 'Lecture',
				validated_by: null,
				notes: 'Original note',
				logged_by: 'user-1',
				created_at: '2026-04-10T00:00:00Z'
			}
		]);

		await expect(
			handleUseCaseRequest(
				_putConfig,
				ctx,
				{
					id: COMPLETION_ARCHIVED_TASK,
					personnelId: PERSON_ACTIVE,
					notes: 'Updated note'
				},
				() => ctx
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Archived critical task history cannot be edited'
		});
	});

	it('rejects updating archived personnel history even when the payload includes an active task id', async () => {
		const ctx = createTestContext();
		ctx.store.seed('personnel', [
			{
				id: PERSON_ARCHIVED,
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
				id: TASK_ACTIVE,
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
				id: COMPLETION_ARCHIVED_PERSON,
				organization_id: ctx.auth.orgId,
				personnel_id: PERSON_ARCHIVED,
				ict_task_id: TASK_ACTIVE,
				completed_at: '2026-04-10',
				validation_method: 'Lecture',
				validated_by: null,
				notes: 'Original note',
				logged_by: 'user-1',
				created_at: '2026-04-10T00:00:00Z'
			}
		]);

		await expect(
			handleUseCaseRequest(
				_putConfig,
				ctx,
				{
					id: COMPLETION_ARCHIVED_PERSON,
					ictTaskId: TASK_ACTIVE,
					notes: 'Updated note'
				},
				() => ctx
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Archived personnel completion history cannot be edited'
		});
	});

	it('rejects deleting a completion when its ICT task has been archived to preserve history', async () => {
		const ctx = createTestContext();
		ctx.store.seed('ict_tasks', [
			{
				id: TASK_ARCHIVED,
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
				id: COMPLETION_1,
				organization_id: ctx.auth.orgId,
				personnel_id: PERSON_1,
				ict_task_id: TASK_ARCHIVED,
				completed_at: '2026-04-10',
				validation_method: 'Lecture',
				validated_by: null,
				notes: 'Historical record',
				logged_by: 'user-1',
				created_at: '2026-04-10T00:00:00Z'
			}
		]);

		await expect(
			handleUseCaseRequest(
				_deleteConfig,
				ctx,
				{
					id: COMPLETION_1
				},
				() => ctx
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Archived critical task history cannot be deleted'
		});

		const stored = await ctx.store.findOne<{ id: string }>('personnel_ict_completions', ctx.auth.orgId, {
			id: COMPLETION_1
		});
		expect(stored?.id).toBe(COMPLETION_1);
	});

	it('rejects deleting a completion when its person has been archived to preserve history', async () => {
		const ctx = createTestContext();
		ctx.store.seed('personnel', [
			{
				id: PERSON_ARCHIVED,
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
				id: TASK_ACTIVE,
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
				id: COMPLETION_ARCHIVED_PERSON,
				organization_id: ctx.auth.orgId,
				personnel_id: PERSON_ARCHIVED,
				ict_task_id: TASK_ACTIVE,
				completed_at: '2026-04-10',
				validation_method: 'Lecture',
				validated_by: null,
				notes: 'Historical record',
				logged_by: 'user-1',
				created_at: '2026-04-10T00:00:00Z'
			}
		]);

		await expect(
			handleUseCaseRequest(
				_deleteConfig,
				ctx,
				{
					id: COMPLETION_ARCHIVED_PERSON
				},
				() => ctx
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Archived personnel completion history cannot be deleted'
		});

		const stored = await ctx.store.findOne<{ id: string }>('personnel_ict_completions', ctx.auth.orgId, {
			id: COMPLETION_ARCHIVED_PERSON
		});
		expect(stored?.id).toBe(COMPLETION_ARCHIVED_PERSON);
	});

	it('allows Critical Tasks-only Group create, reassignment, and delete without request Personnel SELECT', async () => {
		const ctx = criticalTasksOnlyContext();
		seedCompletionReferences(ctx);
		blockRequestPersonnelLookup(ctx);

		const created = (await handleUseCaseRequest(
			_postConfig,
			ctx,
			{
				personnelId: PERSON_ALPHA,
				ictTaskId: TASK_ACTIVE,
				completedAt: '2026-04-15',
				validationMethod: 'Lecture'
			},
			() => ctx
		)) as { id: string };
		const updated = await handleUseCaseRequest(
			_putConfig,
			ctx,
			{
				id: created.id,
				personnelId: PERSON_ALPHA_2,
				notes: 'Corrected entry'
			},
			() => ctx
		);
		expect(updated).toMatchObject({ personnelId: PERSON_ALPHA_2, notes: 'Corrected entry' });
		await handleUseCaseRequest(_deleteConfig, ctx, { id: created.id }, () => ctx);

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
		seedCompletion(ctx, PERSON_ALPHA);
		blockRequestPersonnelLookup(ctx);

		await expect(
			handleUseCaseRequest(
				_putConfig,
				ctx,
				{
					id: COMPLETION_1,
					personnelId: PERSON_BRAVO,
					notes: 'Unauthorized move'
				},
				() => ctx
			)
		).rejects.toMatchObject({ status: 403 });
		expect(await ctx.store.findOne('personnel_ict_completions', ctx.auth.orgId, { id: COMPLETION_1 })).toMatchObject({
			personnel_id: PERSON_ALPHA,
			notes: 'Original note'
		});
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({ action: 'policy.denied', resourceId: COMPLETION_1 })
		]);
	});

	it('denies moving another Group’s existing completion into the actor Group', async () => {
		const ctx = criticalTasksOnlyContext();
		seedCompletionReferences(ctx);
		seedCompletion(ctx, PERSON_BRAVO);
		blockRequestPersonnelLookup(ctx);

		await expect(
			handleUseCaseRequest(
				_putConfig,
				ctx,
				{
					id: COMPLETION_1,
					personnelId: PERSON_ALPHA,
					notes: 'Unauthorized move'
				},
				() => ctx
			)
		).rejects.toMatchObject({ status: 403 });
		expect(await ctx.rawStore.findOne('personnel_ict_completions', ctx.auth.orgId, { id: COMPLETION_1 })).toMatchObject(
			{
				personnel_id: PERSON_BRAVO,
				notes: 'Original note'
			}
		);
	});

	it('protects archived Person history for a Critical Tasks-only Organization operator', async () => {
		const ctx = criticalTasksOnlyContext({ kind: 'organization' });
		seedCompletionReferences(ctx);
		seedCompletion(ctx, PERSON_ARCHIVED);
		blockRequestPersonnelLookup(ctx);

		await expect(
			handleUseCaseRequest(
				_putConfig,
				ctx,
				{
					id: COMPLETION_1,
					personnelId: PERSON_ALPHA,
					notes: 'Bypass attempt'
				},
				() => ctx
			)
		).rejects.toMatchObject({ status: 400, message: 'Archived personnel completion history cannot be edited' });
		await expect(handleUseCaseRequest(_deleteConfig, ctx, { id: COMPLETION_1 }, () => ctx)).rejects.toMatchObject({
			status: 400,
			message: 'Archived personnel completion history cannot be deleted'
		});
		expect(await ctx.store.findOne('personnel_ict_completions', ctx.auth.orgId, { id: COMPLETION_1 })).toMatchObject({
			personnel_id: PERSON_ARCHIVED,
			notes: 'Original note'
		});
	});

	it('rejects edits to historical completions referencing a foreign Organization task', async () => {
		const ctx = criticalTasksOnlyContext({ kind: 'organization' });
		seedCompletionReferences(ctx);
		ctx.store.seed('ict_tasks', [{ id: TASK_FOREIGN, organization_id: 'other-org', archived_at: null }]);
		ctx.store.seed('personnel_ict_completions', [
			{
				id: COMPLETION_1,
				organization_id: ctx.auth.orgId,
				personnel_id: PERSON_ALPHA,
				ict_task_id: TASK_FOREIGN,
				completed_at: '2026-04-10',
				validation_method: 'Lecture',
				notes: 'Historical note'
			}
		]);
		blockRequestPersonnelLookup(ctx);

		await expect(
			handleUseCaseRequest(_putConfig, ctx, { id: COMPLETION_1, notes: 'Changed note' }, () => ctx)
		).rejects.toMatchObject({ status: 400, message: 'Critical task not found' });
		await expect(handleUseCaseRequest(_deleteConfig, ctx, { id: COMPLETION_1 }, () => ctx)).rejects.toMatchObject({
			status: 400,
			message: 'Critical task not found'
		});
		expect(await ctx.store.findOne('personnel_ict_completions', ctx.auth.orgId, { id: COMPLETION_1 })).toMatchObject({
			ict_task_id: TASK_FOREIGN,
			notes: 'Historical note'
		});
		expect(ctx.auditPort.events).toEqual([]);
	});

	it('denies missing, foreign and archived new Person references under Critical Tasks-only access', async () => {
		const ctx = criticalTasksOnlyContext({ kind: 'organization' });
		seedCompletionReferences(ctx);
		seedCompletion(ctx, PERSON_ALPHA);
		blockRequestPersonnelLookup(ctx);
		for (const personnelId of [PERSON_MISSING, PERSON_FOREIGN]) {
			await expect(
				handleUseCaseRequest(
					_postConfig,
					ctx,
					{
						personnelId,
						ictTaskId: TASK_ACTIVE,
						completedAt: '2026-04-15',
						validationMethod: 'Lecture'
					},
					() => ctx
				)
			).rejects.toMatchObject({ status: 400, message: 'Personnel record not found' });
		}
		await expect(
			handleUseCaseRequest(
				_postConfig,
				ctx,
				{
					personnelId: PERSON_ARCHIVED,
					ictTaskId: TASK_ACTIVE,
					completedAt: '2026-04-15',
					validationMethod: 'Lecture'
				},
				() => ctx
			)
		).rejects.toMatchObject({ status: 400, message: 'Archived personnel cannot receive new completion entries' });
		await expect(
			handleUseCaseRequest(_putConfig, ctx, { id: COMPLETION_1, personnelId: PERSON_ARCHIVED }, () => ctx)
		).rejects.toMatchObject({ status: 400, message: 'Archived personnel cannot receive new completion entries' });
		expect(await ctx.store.findMany('personnel_ict_completions', ctx.auth.orgId)).toEqual([
			expect.objectContaining({ id: COMPLETION_1, personnel_id: PERSON_ALPHA, notes: 'Original note' })
		]);
	});

	it('denies new completion writes for an empty Group scope without exposing Person references', async () => {
		const ctx = criticalTasksOnlyContext({ kind: 'groups', groupIds: [] });
		seedCompletionReferences(ctx);
		blockRequestPersonnelLookup(ctx);
		await expect(
			handleUseCaseRequest(
				_postConfig,
				ctx,
				{
					personnelId: PERSON_ALPHA,
					ictTaskId: TASK_ACTIVE,
					completedAt: '2026-04-15',
					validationMethod: 'Lecture'
				},
				() => ctx
			)
		).rejects.toMatchObject({ status: 403 });
		expect(await ctx.rawStore.findMany('personnel_ict_completions', ctx.auth.orgId)).toEqual([]);
	});
});
