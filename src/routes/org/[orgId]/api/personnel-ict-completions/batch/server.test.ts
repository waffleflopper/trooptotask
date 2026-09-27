import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

describe('personnel ICT completions batch API', () => {
	it('imports completion rows without creating or mutating personnel or ICT task definitions', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: { kind: 'groups', groupIds: ['group-alpha'] },
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
				id: 'task-1',
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

		const personnelBefore = await ctx.store.findMany('personnel', ctx.auth.orgId);
		const tasksBefore = await ctx.store.findMany('ict_tasks', ctx.auth.orgId);

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			records: [
				{
					rowNumber: 2,
					values: {
						rank: 'SGT',
						lastName: 'Smith',
						firstName: 'Jane',
						taskCode: '181-105-1001',
						completedAt: '2026-04-15',
						title: 'Attempted overwrite',
						mos: '11B',
						groupId: 'group-bravo'
					}
				}
			]
		});

		expect(result).toMatchObject({
			inserted: [
				expect.objectContaining({
					personnelId: 'person-1',
					ictTaskId: 'task-1',
					completedAt: '2026-04-15'
				})
			],
			updated: [],
			errors: []
		});

		const personnelAfter = await ctx.store.findMany('personnel', ctx.auth.orgId);
		const tasksAfter = await ctx.store.findMany('ict_tasks', ctx.auth.orgId);

		expect(personnelAfter).toEqual(personnelBefore);
		expect(tasksAfter).toEqual(tasksBefore);
	});

	it('does not create personnel or ICT tasks from unmatched completion import rows', async () => {
		const ctx = createTestContext();
		const personnelBefore = await ctx.store.findMany('personnel', ctx.auth.orgId);
		const tasksBefore = await ctx.store.findMany('ict_tasks', ctx.auth.orgId);

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			records: [
				{
					rowNumber: 2,
					values: {
						rank: 'SSG',
						lastName: 'Unknown',
						firstName: 'Pat',
						taskCode: 'BAD-TASK',
						completedAt: '2026-04-15',
						title: 'New task title',
						mos: '68W'
					}
				}
			]
		});

		expect(result).toEqual({
			inserted: [],
			updated: [],
			errors: [
				{
					rowNumber: 2,
					personnelName: 'SSG Pat Unknown',
					taskCode: 'BAD-TASK',
					message: 'Task code "BAD-TASK" does not match an existing critical task'
				}
			]
		});

		const personnelAfter = await ctx.store.findMany('personnel', ctx.auth.orgId);
		const tasksAfter = await ctx.store.findMany('ict_tasks', ctx.auth.orgId);
		const completionsAfter = await ctx.store.findMany('personnel_ict_completions', ctx.auth.orgId);

		expect(personnelAfter).toEqual(personnelBefore);
		expect(tasksAfter).toEqual(tasksBefore);
		expect(completionsAfter).toEqual([]);
	});

	it('denies a view-only Critical Tasks member before importing a completion', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'view',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		await expect(
			handleUseCaseRequest(_postConfig, ctx, {
				records: [
					{ rowNumber: 2, values: { firstName: 'Jane', lastName: 'Smith', taskCode: 'T-1', completedAt: '2026-04-15' } }
				]
			})
		).rejects.toMatchObject({ status: 403 });
		expect(await ctx.store.findMany('personnel_ict_completions', ctx.auth.orgId)).toEqual([]);
	});
});
