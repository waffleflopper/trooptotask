import { describe, expect, it } from 'vitest';
import { createIctTask, reorderIctTasks, updateIctTask } from './ictTaskOperations.server';
import { createWritePortsContext } from './criticalTasksPersistence.test-support.server';
import { getActiveIctTasksForLibrary, planIctTaskMove } from '../utils/ictTaskLibrary';

const TASK_A = '00000000-0000-4000-8000-00000000d001';
const TASK_B = '00000000-0000-4000-8000-00000000d002';
const TASK_C = '00000000-0000-4000-8000-00000000d003';
const TASK_OLD = '00000000-0000-4000-8000-00000000d004';
const TASK_FOREIGN = '00000000-0000-4000-8000-00000000d005';
const TASK_GONE = '00000000-0000-4000-8000-00000000d006';
const taskIdForCode = (code: string) => `00000000-0000-4000-8000-0000000000${code.toLowerCase().repeat(2)}`;
const ordersByCode = (orders: Record<string, number>) =>
	Object.fromEntries(Object.entries(orders).map(([code, order]) => [taskIdForCode(code), order]));

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
				id: TASK_A,
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
				id: TASK_A,
				archivedAt: '2026-10-06T00:00:00Z',
				createdAt: 'changed',
				organization_id: 'other-org'
			})
		).toEqual({
			id: TASK_A,
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
		expect(await updateIctTask(ctx, { id: TASK_A, archivedAt: null, description: null, mos: [] })).toMatchObject({
			id: TASK_A,
			archivedAt: null,
			description: null,
			mos: [],
			expirationMonths: 12,
			sortOrder: 7
		});
		expect(ctx.audit.events).toMatchObject([
			{ action: 'ict_task.updated', resourceType: 'ict_task', resourceId: TASK_A },
			{ action: 'ict_task.updated', resourceType: 'ict_task', resourceId: TASK_A }
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
		await expect(updateIctTask(ctx, { id: TASK_A, expirationMonths: -1 })).rejects.toMatchObject({ status: 400 });
		expect(await ctx.rawStore.findMany('ict_tasks', ctx.auth.orgId)).toEqual([]);
		expect(ctx.audit.events).toEqual([]);
	});

	it('rejects a malformed archive timestamp on create and update without writing', async () => {
		const ctx = createWritePortsContext();
		const retained = {
			id: TASK_A,
			organization_id: 'test-org',
			task_code: 'KEEP',
			title: 'Retained',
			archived_at: null
		};
		ctx.rawStore.seed('ict_tasks', [retained]);

		for (const write of [
			() => createIctTask(ctx, { taskCode: 'NEW', title: 'New', archivedAt: 'not-a-date' }),
			() => updateIctTask(ctx, { id: TASK_A, archivedAt: 'not-a-date' }),
			() => updateIctTask(ctx, { id: TASK_A, archivedAt: '2026-04-14' })
		]) {
			await expect(write()).rejects.toMatchObject({ status: 400, message: 'Use a valid archive timestamp' });
		}
		expect(await ctx.rawStore.findMany('ict_tasks', ctx.auth.orgId)).toEqual([retained]);

		await updateIctTask(ctx, { id: TASK_A, archivedAt: '2026-04-14T12:30:00.000Z' });
		expect(await ctx.rawStore.findMany('ict_tasks', ctx.auth.orgId)).toMatchObject([
			{ id: TASK_A, archived_at: '2026-04-14T12:30:00.000Z' }
		]);
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
			{ id: TASK_A, organization_id: 'test-org', task_code: 'KEEP', title: 'Retained', archived_at: null }
		]);
		await expect(createIctTask(ctx, { taskCode: 'NEW', title: 'New' })).rejects.toMatchObject({ status: 403 });
		await expect(updateIctTask(ctx, { id: TASK_A, title: 'Changed' })).rejects.toMatchObject({ status: 403 });
		await expect(
			reorderIctTasks(ctx, { changes: [{ id: TASK_A, expectedSortOrder: 0, sortOrder: 1 }] })
		).rejects.toMatchObject({ status: 403 });
		expect(await ctx.rawStore.findMany('ict_tasks', ctx.auth.orgId)).toEqual([
			{ id: TASK_A, organization_id: 'test-org', task_code: 'KEEP', title: 'Retained', archived_at: null }
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
		await expect(updateIctTask({ ...ctx, criticalTaskLibrary }, { id: TASK_A, title: 'Changed' })).rejects.toThrow(
			'Unavailable'
		);
		await expect(
			reorderIctTasks(
				{ ...ctx, criticalTaskLibrary },
				{ changes: [{ id: TASK_A, expectedSortOrder: 0, sortOrder: 1 }] }
			)
		).rejects.toThrow('Unavailable');
		expect(ctx.audit.events).toEqual([]);
	});
});

describe('task order command', () => {
	it.each([false, true])('refuses overlapping tied moves from the same view, reverse execution %s', async (reverse) => {
		const ctx = createWritePortsContext();
		ctx.rawStore.seed(
			'ict_tasks',
			['A', 'B', 'C'].map((code) => ({
				id: taskIdForCode(code),
				organization_id: 'test-org',
				task_code: code,
				title: code,
				sort_order: 0,
				archived_at: null
			}))
		);
		const tasks = getActiveIctTasksForLibrary(await ctx.criticalTaskLibrary.listCatalog());
		const plans = [planIctTaskMove(tasks, 0, 1), planIctTaskMove(tasks, 1, 1)];
		if (reverse) plans.reverse();
		const outcomes = await Promise.allSettled(
			plans.map((plan) => {
				if (plan.status !== 'ready') throw new Error('Expected a supported move');
				return reorderIctTasks(ctx, { changes: plan.changes });
			})
		);
		expect(outcomes.map((outcome) => outcome.status)).toEqual(['fulfilled', 'rejected']);
		expect(outcomes[1]).toMatchObject({ reason: { status: 409 } });
		expect(getActiveIctTasksForLibrary(await ctx.criticalTaskLibrary.listCatalog()).map((task) => task.id)).toEqual(
			(reverse ? ['A', 'C', 'B'] : ['B', 'A', 'C']).map(taskIdForCode)
		);
	});

	const seeded = () => {
		const ctx = createWritePortsContext();
		ctx.rawStore.seed('ict_tasks', [
			{ id: TASK_A, organization_id: 'test-org', task_code: 'A', title: 'A', sort_order: 2, archived_at: null },
			{ id: TASK_B, organization_id: 'test-org', task_code: 'B', title: 'B', sort_order: 3, archived_at: null },
			{
				id: TASK_OLD,
				organization_id: 'test-org',
				task_code: 'OLD',
				title: 'Old',
				sort_order: 4,
				archived_at: '2026-01-01'
			},
			{ id: TASK_FOREIGN, organization_id: 'other-org', task_code: 'F', title: 'F', sort_order: 3, archived_at: null }
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
		{ id: TASK_B, expectedSortOrder: 3, sortOrder: 2 },
		{ id: TASK_A, expectedSortOrder: 2, sortOrder: 3 }
	];
	it('acknowledges guards without changing them or auditing them as moves and returns independent copies', async () => {
		const ctx = seeded();
		await ctx.rawStore.update('ict_tasks', ctx.auth.orgId, TASK_B, { mos: ['68V'], updated_at: 'retained' });
		const before = structuredClone(await ctx.rawStore.findOne('ict_tasks', ctx.auth.orgId, { id: TASK_B }));
		const saved = await reorderIctTasks(ctx, {
			changes: [
				{ id: TASK_B, expectedSortOrder: 3, sortOrder: 3 },
				{ id: TASK_A, expectedSortOrder: 2, sortOrder: 4 }
			]
		});
		expect(saved.map(({ id, sortOrder }) => [id, sortOrder])).toEqual([
			[TASK_B, 3],
			[TASK_A, 4]
		]);
		saved[0].sortOrder = 99;
		saved[0].mos.push('11B');
		expect(await ctx.rawStore.findOne('ict_tasks', ctx.auth.orgId, { id: TASK_B })).toEqual(before);
		expect(ctx.audit.events.map((event) => event.resourceId)).toEqual([TASK_A]);
		await expect(
			reorderIctTasks(ctx, { changes: [{ id: TASK_B, expectedSortOrder: 3, sortOrder: 3 }] })
		).resolves.toMatchObject([{ id: TASK_B, sortOrder: 3, mos: ['68V'] }]);
		expect(ctx.audit.events.map((event) => event.resourceId)).toEqual([TASK_A]);
	});

	it.each([TASK_OLD, TASK_FOREIGN, TASK_GONE])('refuses an unavailable unchanged guard %s atomically', async (id) => {
		const ctx = seeded();
		await expect(
			reorderIctTasks(ctx, {
				changes: [
					{ id: TASK_A, expectedSortOrder: 2, sortOrder: 5 },
					{ id, expectedSortOrder: 4, sortOrder: 4 }
				]
			})
		).rejects.toMatchObject({ status: 404 });
		expect(await sortOrders(ctx)).toEqual({ [TASK_A]: 2, [TASK_B]: 3, [TASK_OLD]: 4 });
	});

	it.each(['A', 'D'])('refuses a stale unchanged boundary %s without applying the move', async (boundary) => {
		const ctx = createWritePortsContext();
		ctx.rawStore.seed(
			'ict_tasks',
			[
				['A', 0],
				['B', 1],
				['C', 1],
				['D', 4],
				['E', 5]
			].map(([code, order]) => ({
				id: taskIdForCode(code as string),
				organization_id: 'test-org',
				task_code: code,
				title: code,
				sort_order: order,
				archived_at: null
			}))
		);
		const tasks = getActiveIctTasksForLibrary(await ctx.criticalTaskLibrary.listCatalog());
		const plan = planIctTaskMove(tasks, 1, 1);
		if (plan.status !== 'ready') throw new Error('Expected a supported move');
		await ctx.rawStore.update('ict_tasks', ctx.auth.orgId, taskIdForCode(boundary), { sort_order: 10 });
		await expect(reorderIctTasks(ctx, { changes: plan.changes })).rejects.toMatchObject({ status: 409 });
		expect(await sortOrders(ctx)).toEqual(
			ordersByCode(boundary === 'A' ? { A: 10, B: 1, C: 1, D: 4, E: 5 } : { A: 0, B: 1, C: 1, D: 10, E: 5 })
		);
	});

	it('saves every change and audits each moved task', async () => {
		const ctx = seeded();
		expect((await reorderIctTasks(ctx, { changes: swap })).map(({ id, sortOrder }) => [id, sortOrder])).toEqual([
			[TASK_B, 2],
			[TASK_A, 3]
		]);
		expect(await sortOrders(ctx)).toEqual({ [TASK_A]: 3, [TASK_B]: 2, [TASK_OLD]: 4 });
		expect(ctx.audit.events).toMatchObject([
			{ action: 'ict_task.reordered', resourceType: 'ict_task', resourceId: TASK_B },
			{ action: 'ict_task.reordered', resourceType: 'ict_task', resourceId: TASK_A }
		]);
	});

	it.each([
		{ label: 'a repeated move', changes: swap, prior: swap, status: 409 },
		{
			label: 'an archived task',
			changes: [
				{ id: TASK_A, expectedSortOrder: 2, sortOrder: 5 },
				{ id: TASK_OLD, expectedSortOrder: 4, sortOrder: 1 }
			],
			prior: null,
			status: 404
		},
		{
			label: 'a foreign task',
			changes: [
				{ id: TASK_A, expectedSortOrder: 2, sortOrder: 5 },
				{ id: TASK_FOREIGN, expectedSortOrder: 3, sortOrder: 1 }
			],
			prior: null,
			status: 404
		},
		{
			label: 'a missing task',
			changes: [
				{ id: TASK_A, expectedSortOrder: 2, sortOrder: 5 },
				{ id: TASK_GONE, expectedSortOrder: 0, sortOrder: 1 }
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
			reorderIctTasks(ctx, { changes: [{ id: TASK_A, expectedSortOrder: 2, sortOrder: 3 }] }),
			reorderIctTasks(ctx, { changes: [{ id: TASK_A, expectedSortOrder: 3, sortOrder: 4 }] })
		]);

		expect(replies.map((rows) => rows.map(({ id, sortOrder }) => [id, sortOrder]))).toEqual([
			[[TASK_A, 3]],
			[[TASK_A, 4]]
		]);
		expect(await sortOrders(ctx)).toEqual({ [TASK_A]: 4, [TASK_B]: 3, [TASK_OLD]: 4 });
	});

	it('lets one of two overlapping moves from the same view win and leaves the other unapplied', async () => {
		const ctx = createWritePortsContext();
		ctx.rawStore.seed('ict_tasks', [
			{ id: TASK_A, organization_id: 'test-org', task_code: 'A', title: 'A', sort_order: 0, archived_at: null },
			{ id: TASK_B, organization_id: 'test-org', task_code: 'B', title: 'B', sort_order: 1, archived_at: null },
			{ id: TASK_C, organization_id: 'test-org', task_code: 'C', title: 'C', sort_order: 2, archived_at: null }
		]);
		const withB = [
			{ id: TASK_B, expectedSortOrder: 1, sortOrder: 0 },
			{ id: TASK_A, expectedSortOrder: 0, sortOrder: 1 }
		];
		const withC = [
			{ id: TASK_C, expectedSortOrder: 2, sortOrder: 0 },
			{ id: TASK_A, expectedSortOrder: 0, sortOrder: 2 }
		];

		const outcomes = await Promise.allSettled([
			reorderIctTasks(ctx, { changes: withB }),
			reorderIctTasks(ctx, { changes: withC })
		]);

		expect(outcomes.map((outcome) => outcome.status)).toEqual(['fulfilled', 'rejected']);
		expect(outcomes[1]).toMatchObject({ reason: { status: 409 } });
		expect(await sortOrders(ctx)).toEqual({ [TASK_A]: 1, [TASK_B]: 0, [TASK_C]: 2 });
		expect(ctx.audit.events.map((event) => event.resourceId)).toEqual([TASK_B, TASK_A]);
	});

	it.each([
		{},
		{ changes: [] },
		{ changes: [{ id: TASK_A, expectedSortOrder: 2, sortOrder: -1 }] },
		{ changes: [{ id: TASK_A, expectedSortOrder: 2, sortOrder: 1.5 }] },
		{ changes: [{ id: TASK_A, expectedSortOrder: 2, sortOrder: 2147483648 }] },
		{ changes: [{ id: TASK_A, expectedSortOrder: 2147483648, sortOrder: 1 }] },
		{
			changes: Array.from({ length: 1001 }, (_, index) => ({
				id: `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
				expectedSortOrder: 0,
				sortOrder: 1
			}))
		},
		{ changes: [swap[1], { ...swap[1], sortOrder: 4 }] }
	])('rejects invalid changes %j before effects', async (input) => {
		const ctx = seeded();
		await expect(reorderIctTasks(ctx, input)).rejects.toMatchObject({ status: 400 });
		expect(await sortOrders(ctx)).toEqual({ [TASK_A]: 2, [TASK_B]: 3, [TASK_OLD]: 4 });
	});
});
