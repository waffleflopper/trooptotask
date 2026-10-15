import { describe, expect, it } from 'vitest';
import { createIctTask, reorderIctTasks, updateIctTask } from './ictTaskOperations.server';
import { createWritePortsContext } from './criticalTasksPersistence.test-support.server';

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
		await expect(
			reorderIctTasks(ctx, { changes: [{ id: 'task-a', expectedSortOrder: 0, sortOrder: 1 }] })
		).rejects.toMatchObject({ status: 403 });
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
			},
			reorder: async () => {
				throw new Error('Unavailable');
			}
		};
		await expect(createIctTask({ ...ctx, criticalTaskLibrary }, { taskCode: 'RESP-1', title: 'New' })).rejects.toThrow(
			'Unavailable'
		);
		await expect(updateIctTask({ ...ctx, criticalTaskLibrary }, { id: 'task-a', title: 'Changed' })).rejects.toThrow(
			'Unavailable'
		);
		await expect(
			reorderIctTasks(
				{ ...ctx, criticalTaskLibrary },
				{ changes: [{ id: 'task-a', expectedSortOrder: 0, sortOrder: 1 }] }
			)
		).rejects.toThrow('Unavailable');
		expect(ctx.audit.events).toEqual([]);
	});
});

describe('task order command', () => {
	const seeded = () => {
		const ctx = createWritePortsContext();
		ctx.rawStore.seed('ict_tasks', [
			{ id: 'task-a', organization_id: 'test-org', task_code: 'A', title: 'A', sort_order: 2, archived_at: null },
			{ id: 'task-b', organization_id: 'test-org', task_code: 'B', title: 'B', sort_order: 3, archived_at: null },
			{
				id: 'task-old',
				organization_id: 'test-org',
				task_code: 'OLD',
				title: 'Old',
				sort_order: 4,
				archived_at: '2026-01-01'
			},
			{ id: 'task-foreign', organization_id: 'other-org', task_code: 'F', title: 'F', sort_order: 3, archived_at: null }
		]);
		return ctx;
	};
	const sortOrders = async (ctx: ReturnType<typeof seeded>) =>
		Object.fromEntries(
			(await ctx.rawStore.findMany<{ id: string; sort_order: number }>('ict_tasks', ctx.auth.orgId)).map((row) => [
				row.id,
				row.sort_order
			])
		);
	const swap = [
		{ id: 'task-b', expectedSortOrder: 3, sortOrder: 2 },
		{ id: 'task-a', expectedSortOrder: 2, sortOrder: 3 }
	];

	it('saves every change and audits each moved task', async () => {
		const ctx = seeded();
		expect((await reorderIctTasks(ctx, { changes: swap })).map(({ id, sortOrder }) => [id, sortOrder])).toEqual([
			['task-b', 2],
			['task-a', 3]
		]);
		expect(await sortOrders(ctx)).toEqual({ 'task-a': 3, 'task-b': 2, 'task-old': 4 });
		expect(ctx.audit.events).toMatchObject([
			{ action: 'ict_task.reordered', resourceType: 'ict_task', resourceId: 'task-b' },
			{ action: 'ict_task.reordered', resourceType: 'ict_task', resourceId: 'task-a' }
		]);
	});

	it.each([
		{ label: 'a repeated move', changes: swap, prior: swap, status: 409 },
		{
			label: 'an archived task',
			changes: [
				{ id: 'task-a', expectedSortOrder: 2, sortOrder: 5 },
				{ id: 'task-old', expectedSortOrder: 4, sortOrder: 1 }
			],
			prior: null,
			status: 404
		},
		{
			label: 'a foreign task',
			changes: [
				{ id: 'task-a', expectedSortOrder: 2, sortOrder: 5 },
				{ id: 'task-foreign', expectedSortOrder: 3, sortOrder: 1 }
			],
			prior: null,
			status: 404
		},
		{
			label: 'a missing task',
			changes: [
				{ id: 'task-a', expectedSortOrder: 2, sortOrder: 5 },
				{ id: 'task-gone', expectedSortOrder: 0, sortOrder: 1 }
			],
			prior: null,
			status: 404
		}
	])('refuses $label and changes nothing', async ({ changes, prior, status }) => {
		const ctx = seeded();
		if (prior) await reorderIctTasks(ctx, { changes: prior });
		const before = await sortOrders(ctx);
		const events = ctx.audit.events.length;
		await expect(reorderIctTasks(ctx, { changes: changes })).rejects.toMatchObject({ status });
		expect(await sortOrders(ctx)).toEqual(before);
		expect(ctx.audit.events).toHaveLength(events);
	});

	it('returns each committed position when another valid move finishes before its reply', async () => {
		const ctx = seeded();
		const replies = await Promise.all([
			reorderIctTasks(ctx, { changes: [{ id: 'task-a', expectedSortOrder: 2, sortOrder: 3 }] }),
			reorderIctTasks(ctx, { changes: [{ id: 'task-a', expectedSortOrder: 3, sortOrder: 4 }] })
		]);

		expect(replies.map((rows) => rows.map(({ id, sortOrder }) => [id, sortOrder]))).toEqual([
			[['task-a', 3]],
			[['task-a', 4]]
		]);
		expect(await sortOrders(ctx)).toEqual({ 'task-a': 4, 'task-b': 3, 'task-old': 4 });
	});

	it('lets one of two overlapping moves from the same view win and leaves the other unapplied', async () => {
		const ctx = createWritePortsContext();
		ctx.rawStore.seed('ict_tasks', [
			{ id: 'task-a', organization_id: 'test-org', task_code: 'A', title: 'A', sort_order: 0, archived_at: null },
			{ id: 'task-b', organization_id: 'test-org', task_code: 'B', title: 'B', sort_order: 1, archived_at: null },
			{ id: 'task-c', organization_id: 'test-org', task_code: 'C', title: 'C', sort_order: 2, archived_at: null }
		]);
		const withB = [
			{ id: 'task-b', expectedSortOrder: 1, sortOrder: 0 },
			{ id: 'task-a', expectedSortOrder: 0, sortOrder: 1 }
		];
		const withC = [
			{ id: 'task-c', expectedSortOrder: 2, sortOrder: 0 },
			{ id: 'task-a', expectedSortOrder: 0, sortOrder: 2 }
		];

		const outcomes = await Promise.allSettled([
			reorderIctTasks(ctx, { changes: withB }),
			reorderIctTasks(ctx, { changes: withC })
		]);

		expect(outcomes.map((outcome) => outcome.status)).toEqual(['fulfilled', 'rejected']);
		expect(outcomes[1]).toMatchObject({ reason: { status: 409 } });
		expect(await sortOrders(ctx)).toEqual({ 'task-a': 1, 'task-b': 0, 'task-c': 2 });
		expect(ctx.audit.events.map((event) => event.resourceId)).toEqual(['task-b', 'task-a']);
	});

	it.each([
		{},
		{ changes: [] },
		{ changes: [{ id: 'task-a', expectedSortOrder: 2, sortOrder: 2 }] },
		{ changes: [{ id: 'task-a', expectedSortOrder: 2, sortOrder: -1 }] },
		{ changes: [{ id: 'task-a', expectedSortOrder: 2, sortOrder: 1.5 }] },
		{ changes: [{ id: 'task-a', expectedSortOrder: 2, sortOrder: 2147483648 }] },
		{ changes: [{ id: 'task-a', expectedSortOrder: 2147483648, sortOrder: 1 }] },
		{
			changes: Array.from({ length: 1001 }, (_, index) => ({
				id: `task-${index}`,
				expectedSortOrder: 0,
				sortOrder: 1
			}))
		},
		{ changes: [swap[1], { ...swap[1], sortOrder: 4 }] }
	])('rejects invalid changes %j before effects', async (input) => {
		const ctx = seeded();
		await expect(reorderIctTasks(ctx, input)).rejects.toMatchObject({ status: 400 });
		expect(await sortOrders(ctx)).toEqual({ 'task-a': 2, 'task-b': 3, 'task-old': 4 });
	});
});
