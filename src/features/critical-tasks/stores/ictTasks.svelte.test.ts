import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ictTasksStore } from './ictTasks.svelte';
import type { IctTask } from '$features/critical-tasks/criticalTasks.types';
import { settles } from '$lib/test-support/settles';
import { CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE, ICT_TASK_ORDER_CHANGED_MESSAGE } from '../contracts';

const existingTask: IctTask = {
	id: 'task-existing',
	taskCode: '181-105-1001',
	title: 'Existing task',
	description: 'Old description',
	mos: ['68W'],
	expirationMonths: 12,
	sortOrder: 5,
	archivedAt: null,
	createdAt: '2026-04-01T00:00:00Z'
};

const archivedTask: IctTask = {
	...existingTask,
	id: 'task-archived',
	taskCode: '181-105-1003',
	title: 'Archived task',
	archivedAt: '2026-04-14T00:00:00Z'
};

describe('ictTasksStore', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		ictTasksStore.load([structuredClone(existingTask), structuredClone(archivedTask)], 'org-1');
	});

	it('merges the tasks a chunk saved, including a restore, and leaves a failed row out', async () => {
		const restored = { ...archivedTask, archivedAt: null, title: 'Restored task' };
		const added = { ...existingTask, id: 'task-new', taskCode: '181-105-1002', title: 'New task' };
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({
					results: [
						{ kind: 'added', record: added },
						{ kind: 'updated', record: restored },
						{ kind: 'failed', message: 'A new task needs a title.' }
					]
				})
			})
		);

		const reply = await ictTasksStore.importChunk([
			{ taskCode: '181-105-1002', title: 'New task' },
			{ taskCode: '181-105-1003', title: 'Restored task' },
			{ taskCode: '181-105-1004' }
		]);

		expect(reply.kind).toBe('saved');
		expect(
			ictTasksStore.items
				.map((task) => [task.taskCode, task.title, task.archivedAt])
				.sort((a, b) => a[0]!.localeCompare(b[0]!))
		).toEqual([
			['181-105-1001', 'Existing task', null],
			['181-105-1002', 'New task', null],
			['181-105-1003', 'Restored task', null]
		]);
	});

	it('never settles or adopts a chunk reply after the Organization changes', async () => {
		const foreignTask: IctTask = { ...existingTask, id: 'task-foreign', taskCode: 'B-1', title: 'Foreign task' };
		let release!: (response: unknown) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(() => new Promise((resolve) => (release = resolve)))
		);

		const pending = ictTasksStore.importChunk([{ taskCode: 'A-1', title: 'Task' }]);
		ictTasksStore.load([structuredClone(foreignTask)], 'org-2');
		release({
			ok: true,
			status: 200,
			json: async () => ({ results: [{ kind: 'added', record: { ...existingTask, id: 'task-a', taskCode: 'A-1' } }] })
		});

		expect(await settles(pending)).toBe(false);
		expect(ictTasksStore.items).toEqual([foreignTask]);
	});
});

describe('ictTasksStore.reorder', () => {
	const neighbour: IctTask = { ...existingTask, id: 'task-next', taskCode: '181-105-1002', sortOrder: 6 };
	const changes = [
		{ id: 'task-next', expectedSortOrder: 6, sortOrder: 5 },
		{ id: 'task-existing', expectedSortOrder: 5, sortOrder: 6 }
	];
	const reply = (status: number, body: unknown) => Promise.resolve(Response.json(body, { status }));
	const sortOrders = () => ictTasksStore.items.map((task) => [task.id, task.sortOrder]);

	beforeEach(() => {
		ictTasksStore.load([structuredClone(existingTask), structuredClone(neighbour)], 'org-1');
	});

	it('sends unchanged guards and merges their acknowledgement with the moved rows', async () => {
		const guard: IctTask = { ...existingTask, id: 'guard', taskCode: 'GUARD', sortOrder: 9 };
		ictTasksStore.load([structuredClone(existingTask), structuredClone(neighbour), guard], 'org-1');
		const participants = [...changes, { id: 'guard', expectedSortOrder: 9, sortOrder: 9 }];
		const fetchMock = vi.fn(() =>
			reply(200, [{ ...neighbour, sortOrder: 5 }, { ...existingTask, sortOrder: 6 }, guard])
		);
		vi.stubGlobal('fetch', fetchMock);
		await ictTasksStore.reorder(participants);
		expect(fetchMock.mock.calls).toEqual([
			[
				'/org/org-1/api/ict-tasks/order',
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ changes: participants })
				}
			]
		]);
		expect(sortOrders()).toEqual([
			['task-next', 5],
			['task-existing', 6],
			['guard', 9]
		]);
	});

	it.each([
		['a refusal', () => reply(409, { message: ICT_TASK_ORDER_CHANGED_MESSAGE }), ICT_TASK_ORDER_CHANGED_MESSAGE],
		[
			'an unavailable reply',
			() => reply(503, { message: 'Synthetic outage' }),
			CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE
		],
		['a lost reply', () => Promise.reject(new TypeError('Failed to fetch')), CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE],
		['an unreadable success', () => reply(200, { saved: true }), CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE]
	])('keeps the displayed order and sends nothing more after %s', async (_label, respond, message) => {
		const fetchMock = vi.fn(respond);
		vi.stubGlobal('fetch', fetchMock);

		await expect(ictTasksStore.reorder(changes)).rejects.toThrow(message);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(sortOrders()).toEqual([
			['task-existing', 5],
			['task-next', 6]
		]);
	});

	it('never settles or adopts a reply after the Organization changes', async () => {
		let release!: (response: Response) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(() => new Promise<Response>((resolve) => (release = resolve)))
		);

		const pending = ictTasksStore.reorder(changes);
		ictTasksStore.load([structuredClone(archivedTask)], 'org-2');
		release(
			Response.json([
				{ ...neighbour, sortOrder: 5 },
				{ ...existingTask, sortOrder: 6 }
			])
		);

		expect(await settles(pending)).toBe(false);
		expect(ictTasksStore.items).toEqual([archivedTask]);
	});
});
