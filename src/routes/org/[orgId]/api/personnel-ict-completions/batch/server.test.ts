import { describe, expect, it } from 'vitest';
import { createTestContext } from '$features/critical-tasks/server/criticalTasksPersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

const PERSON_ID = '00000001-0000-4000-8000-000000000001';
const TASK_ID = '00000002-0000-4000-8000-000000000001';

function seed(ctx: ReturnType<typeof createTestContext>) {
	ctx.store.seed('personnel', [
		{
			id: PERSON_ID,
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
			id: TASK_ID,
			organization_id: ctx.auth.orgId,
			task_code: '181-105-1001',
			title: 'Perform tactical combat casualty care',
			description: null,
			mos: ['68W'],
			expiration_months: 12,
			sort_order: 1,
			archived_at: null,
			created_at: '2026-04-01T00:00:00Z'
		}
	]);
}

function groupOperator(criticalTasks: 'operate' | 'view') {
	return createTestContext({
		auth: {
			role: 'member',
			isPrivileged: false,
			scopeSet: { kind: 'groups', groupIds: ['group-alpha'] },
			capabilityMap: {
				calendar: 'none',
				personnel: 'none',
				training: 'none',
				criticalTasks,
				onboarding: 'none',
				ratingScheme: 'none'
			}
		}
	});
}

describe('personnel ICT completions batch API', () => {
	it('records a completion and ignores fields that would change the person, the task or who logged it', async () => {
		const ctx = groupOperator('operate');
		seed(ctx);
		const personnelBefore = await ctx.store.findMany('personnel', ctx.auth.orgId);
		const tasksBefore = await ctx.store.findMany('ict_tasks', ctx.auth.orgId);

		const reply = await handleUseCaseRequest(
			_postConfig,
			ctx,
			{
				records: [
					{
						personnelId: PERSON_ID,
						ictTaskId: TASK_ID,
						completedAt: '2026-04-15',
						title: 'Attempted overwrite',
						groupId: 'group-bravo',
						loggedBy: 'forged'
					}
				]
			},
			() => ctx
		);

		expect(reply.results).toEqual([
			{
				kind: 'added',
				record: expect.objectContaining({ personnelId: PERSON_ID, ictTaskId: TASK_ID, completedAt: '2026-04-15' })
			}
		]);
		expect(reply.results[0].kind === 'added' && reply.results[0].record.loggedBy).not.toBe('forged');
		expect(await ctx.store.findMany('personnel', ctx.auth.orgId)).toEqual(personnelBefore);
		expect(await ctx.store.findMany('ict_tasks', ctx.auth.orgId)).toEqual(tasksBefore);
	});

	it('refuses a record that is not a date or names a person by text', async () => {
		for (const record of [
			{ personnelId: PERSON_ID, ictTaskId: TASK_ID, completedAt: '04/15/2026' },
			{ personnelId: 'Smith, Jane', ictTaskId: TASK_ID, completedAt: '2026-04-15' }
		])
			expect(_postConfig.input.safeParse({ records: [record] }).success).toBe(false);
	});

	it('denies a view-only Critical Tasks member before importing a completion', async () => {
		const ctx = groupOperator('view');
		seed(ctx);
		await expect(
			handleUseCaseRequest(
				_postConfig,
				ctx,
				{ records: [{ personnelId: PERSON_ID, ictTaskId: TASK_ID, completedAt: '2026-04-15' }] },
				() => ctx
			)
		).rejects.toMatchObject({ status: 403 });
		expect(await ctx.store.findMany('personnel_ict_completions', ctx.auth.orgId)).toEqual([]);
	});
});
