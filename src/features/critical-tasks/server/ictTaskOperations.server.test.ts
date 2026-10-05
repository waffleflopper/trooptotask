import { describe, expect, it } from 'vitest';
import { createIctTask, updateIctTask } from './ictTaskOperations.server';
import { createWritePortsContext } from './criticalTaskLibrary.test-support';

describe('owned task library operations', () => {
	it('creates defaults, ignores readonly/unknown input and audits the persisted task', async () => {
		const ctx = createWritePortsContext();
		const task = await createIctTask(ctx, {
			taskCode: 'RESP-1',
			title: 'Airway check',
			id: 'supplied-id',
			createdAt: 'supplied-time',
			organization_id: 'foreign-org',
			extra: 'hidden'
		});
		expect(task).toMatchObject({
			taskCode: 'RESP-1',
			title: 'Airway check',
			description: null,
			category: null,
			mos: [],
			expirationMonths: null,
			sortOrder: 0,
			archivedAt: null
		});
		expect(task.id).not.toBe('supplied-id');
		expect(task.createdAt).not.toBe('supplied-time');
		expect(await ctx.rawStore.findMany('ict_tasks', ctx.auth.orgId)).toEqual([
			{
				id: task.id,
				organization_id: 'test-org',
				task_code: 'RESP-1',
				title: 'Airway check',
				description: null,
				category: null,
				mos: [],
				expiration_months: null,
				sort_order: 0,
				archived_at: null,
				created_at: task.createdAt
			}
		]);
		expect(ctx.audit.events).toMatchObject([
			{ action: 'ict_task.created', resourceType: 'ict_task', resourceId: task.id }
		]);
	});

	it('updates only supplied writable fields and retains defaults, timestamps and identity through archive/restore', async () => {
		const ctx = createWritePortsContext();
		ctx.rawStore.seed('ict_tasks', [
			{
				id: 'task-a',
				organization_id: 'test-org',
				task_code: 'RESP-1',
				title: 'Airway check',
				description: 'Keep notes',
				category: 'Respiratory',
				mos: ['68V'],
				expiration_months: 12,
				sort_order: 7,
				archived_at: null,
				created_at: '2026-01-01T00:00:00.123456Z'
			}
		]);
		expect(
			await updateIctTask(ctx, {
				id: 'task-a',
				archivedAt: '2026-10-06T00:00:00Z',
				createdAt: 'changed',
				organization_id: 'other-org'
			})
		).toEqual({
			id: 'task-a',
			taskCode: 'RESP-1',
			title: 'Airway check',
			description: 'Keep notes',
			category: 'Respiratory',
			mos: ['68V'],
			expirationMonths: 12,
			sortOrder: 7,
			archivedAt: '2026-10-06T00:00:00Z',
			createdAt: '2026-01-01T00:00:00.123456Z'
		});
		expect(await updateIctTask(ctx, { id: 'task-a', archivedAt: null, description: null, mos: [] })).toMatchObject({
			id: 'task-a',
			archivedAt: null,
			description: null,
			mos: [],
			expirationMonths: 12,
			sortOrder: 7
		});
		expect(ctx.audit.events).toMatchObject([
			{ action: 'ict_task.updated', resourceType: 'ict_task', resourceId: 'task-a' },
			{ action: 'ict_task.updated', resourceType: 'ict_task', resourceId: 'task-a' }
		]);
	});

	it.each([
		{ taskCode: '', title: 'Valid' },
		{ taskCode: 'RESP-1', title: '' },
		{ taskCode: 'RESP-1', title: 'Valid', expirationMonths: 0 },
		{ taskCode: 'RESP-1', title: 'Valid', sortOrder: -1 },
		{ taskCode: 'RESP-1', title: 'Valid', mos: null }
	])('rejects invalid create input %j before effects', async (input) => {
		const ctx = createWritePortsContext();
		await expect(createIctTask(ctx, input)).rejects.toMatchObject({ status: 400 });
		expect(await ctx.rawStore.findMany('ict_tasks', ctx.auth.orgId)).toEqual([]);
		expect(ctx.audit.events).toEqual([]);
	});

	it('requires an update ID and validates supplied fields without writing', async () => {
		const ctx = createWritePortsContext();
		await expect(updateIctTask(ctx, { title: 'Changed' })).rejects.toMatchObject({ status: 400 });
		await expect(updateIctTask(ctx, { id: 'task-a', expirationMonths: -1 })).rejects.toMatchObject({ status: 400 });
		expect(await ctx.rawStore.findMany('ict_tasks', ctx.auth.orgId)).toEqual([]);
		expect(ctx.audit.events).toEqual([]);
	});

	it.each([
		{ criticalTasks: 'view' as const, scopeSet: { kind: 'organization' as const } },
		{ criticalTasks: 'configure' as const, scopeSet: { kind: 'groups' as const, groupIds: ['group-a'] } }
	])('denies library writes outside the Organization configure lane %j', async ({ criticalTasks, scopeSet }) => {
		const ctx = createWritePortsContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'configure',
					criticalTasks,
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		ctx.rawStore.seed('ict_tasks', [
			{ id: 'task-a', organization_id: 'test-org', task_code: 'KEEP', title: 'Retained', archived_at: null }
		]);
		await expect(createIctTask(ctx, { taskCode: 'NEW', title: 'New' })).rejects.toMatchObject({ status: 403 });
		await expect(updateIctTask(ctx, { id: 'task-a', title: 'Changed' })).rejects.toMatchObject({ status: 403 });
		expect(await ctx.rawStore.findMany('ict_tasks', ctx.auth.orgId)).toEqual([
			{ id: 'task-a', organization_id: 'test-org', task_code: 'KEEP', title: 'Retained', archived_at: null }
		]);
		expect(ctx.audit.events.filter((event) => event.action.startsWith('ict_task.'))).toEqual([]);
	});

	it('permits a dedicated Organization configurator without Personnel or Training grants', async () => {
		const ctx = createWritePortsContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: { kind: 'organization' },
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'configure',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		const task = await createIctTask(ctx, { taskCode: 'RESP-1', title: 'Allowed' });
		expect((await updateIctTask(ctx, { id: task.id, title: 'Still allowed' })).title).toBe('Still allowed');
		expect(await ctx.rawStore.findMany('ict_tasks', ctx.auth.orgId)).toMatchObject([
			{ task_code: 'RESP-1', title: 'Still allowed' }
		]);
	});

	it('propagates provider failure without a success audit', async () => {
		const ctx = createWritePortsContext();
		const criticalTaskLibrary = {
			create: async () => {
				throw new Error('Unavailable');
			},
			update: async () => {
				throw new Error('Unavailable');
			}
		};
		await expect(createIctTask({ ...ctx, criticalTaskLibrary }, { taskCode: 'RESP-1', title: 'New' })).rejects.toThrow(
			'Unavailable'
		);
		await expect(updateIctTask({ ...ctx, criticalTaskLibrary }, { id: 'task-a', title: 'Changed' })).rejects.toThrow(
			'Unavailable'
		);
		expect(ctx.audit.events).toEqual([]);
	});
});
