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

	it('posts checked rows to the ICT batch import endpoint and merges inserted and updated tasks', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({
					inserted: [
						{
							id: 'task-new',
							taskCode: '181-105-1002',
							title: 'New task',
							description: null,
							mos: ['18D'],
							expirationMonths: 24,
							sortOrder: 8,
							archivedAt: null,
							createdAt: '2026-04-15T00:00:00Z'
						}
					],
					updated: [
						{
							...existingTask,
							title: 'Updated task',
							mos: ['11B'],
							expirationMonths: 18
						}
					],
					restored: [
						{
							...archivedTask,
							title: 'Restored task',
							mos: ['18D'],
							expirationMonths: 24,
							sortOrder: 9,
							archivedAt: null
						}
					],
					errors: [{ rowNumber: 7, taskCode: 'bad', title: 'Bad row', message: 'Task code is required' }]
				})
			})
		);

		const result = await ictTasksStore.importBatch({
			mode: 'upsert',
			records: [
				{
					rowNumber: 2,
					values: {
						taskCode: '181-105-1001',
						title: 'Updated task',
						mos: '11B',
						expirationMonths: '18'
					}
				},
				{
					rowNumber: 3,
					values: {
						taskCode: '181-105-1002',
						title: 'New task',
						mos: '18D',
						expirationMonths: '24',
						sortOrder: '8'
					}
				}
			]
		});

		expect(globalThis.fetch).toHaveBeenCalledWith('/org/org-1/api/ict-tasks/batch', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				mode: 'upsert',
				records: [
					{
						rowNumber: 2,
						values: {
							taskCode: '181-105-1001',
							title: 'Updated task',
							mos: '11B',
							expirationMonths: '18'
						}
					},
					{
						rowNumber: 3,
						values: {
							taskCode: '181-105-1002',
							title: 'New task',
							mos: '18D',
							expirationMonths: '24',
							sortOrder: '8'
						}
					}
				]
			})
		});

		expect(result).toEqual({
			inserted: [
				expect.objectContaining({
					id: 'task-new',
					taskCode: '181-105-1002'
				})
			],
			updated: [
				expect.objectContaining({
					id: 'task-existing',
					title: 'Updated task'
				})
			],
			restored: [
				expect.objectContaining({
					id: 'task-archived',
					taskCode: '181-105-1003',
					title: 'Restored task'
				})
			],
			errors: [{ rowNumber: 7, taskCode: 'bad', title: 'Bad row', message: 'Task code is required' }],
			unconfirmed: [],
			notAttempted: []
		});
		expect(ictTasksStore.getById('task-existing')).toEqual(
			expect.objectContaining({
				title: 'Updated task',
				mos: ['11B'],
				expirationMonths: 18
			})
		);
		expect(ictTasksStore.getById('task-new')).toEqual(
			expect.objectContaining({
				taskCode: '181-105-1002',
				title: 'New task'
			})
		);
		expect(ictTasksStore.getById('task-archived')).toEqual(
			expect.objectContaining({
				taskCode: '181-105-1003',
				title: 'Restored task'
			})
		);
	});

	it('chunks large imports into 500-row batch requests', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				inserted: [],
				updated: [],
				restored: [],
				errors: []
			})
		});
		vi.stubGlobal('fetch', fetchMock);

		await ictTasksStore.importBatch({
			mode: 'create-only',
			records: Array.from({ length: 501 }, (_, index) => ({
				rowNumber: index + 2,
				values: {
					taskCode: `181-105-${String(index).padStart(4, '0')}`,
					title: `Task ${index}`
				}
			}))
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).records).toHaveLength(500);
		expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).records).toHaveLength(1);
	});

	const switchedImport = {
		mode: 'create-only' as const,
		records: Array.from({ length: 501 }, (_, index) => ({
			rowNumber: index + 2,
			values: { taskCode: `181-105-${String(index).padStart(4, '0')}`, title: `Task ${index}` }
		}))
	};
	const foreignTask: IctTask = { ...existingTask, id: 'task-foreign', taskCode: 'B-1', title: 'Foreign task' };

	for (const outcome of ['success', 'failure', 'rejection'] as const) {
		it(`stops an import whose first chunk finishes with ${outcome} after switching Organizations`, async () => {
			let release!: (response: unknown) => void;
			const fetchMock = vi.fn((_url: string, _init?: RequestInit) => new Promise((resolve) => (release = resolve)));
			vi.stubGlobal('fetch', fetchMock);

			const pending = ictTasksStore.importBatch(switchedImport);
			ictTasksStore.load([structuredClone(foreignTask)], 'org-2');
			release(
				outcome === 'success'
					? {
							ok: true,
							status: 200,
							json: async () => ({
								inserted: [{ ...existingTask, id: 'task-imported-a', taskCode: '181-105-0000' }],
								updated: [],
								restored: [],
								errors: []
							})
						}
					: outcome === 'failure'
						? { ok: false, status: 503, json: async () => ({ message: 'Synthetic request failure' }) }
						: Promise.reject(new TypeError('Failed to fetch'))
			);

			expect(await settles(pending)).toBe(false);
			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect(fetchMock.mock.calls[0][0]).toBe('/org/org-1/api/ict-tasks/batch');
			expect(ictTasksStore.items).toEqual([foreignTask]);
		});
	}
});

const rowNumbers = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

describe('#1643 task import keeps confirmed chunks after a later chunk stops', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		ictTasksStore.load([structuredClone(existingTask)], 'org-1');
	});

	const largeImport = {
		mode: 'create-only' as const,
		records: Array.from({ length: 1001 }, (_, index) => ({
			rowNumber: index + 2,
			values: { taskCode: `181-105-${String(index).padStart(4, '0')}`, title: `Task ${index}` }
		}))
	};
	const firstChunkTask: IctTask = { ...existingTask, id: 'task-chunk-1', taskCode: '181-105-0000', title: 'Task 0' };

	it.each([
		['a lost browser reply', () => Promise.reject(new TypeError('Failed to fetch')), 'unknown'],
		[
			'an unavailable server',
			() => Promise.resolve({ ok: false, status: 503, json: async () => ({ message: 'Service unavailable' }) }),
			'unknown'
		],
		[
			'a refused request',
			() => Promise.resolve({ ok: false, status: 403, json: async () => ({ message: 'Import permission removed' }) }),
			'refused'
		]
	] as const)(
		'reports chunk one, the stopped chunk and the unattempted rows after %s',
		async (_label, secondChunk, kind) => {
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => ({ inserted: [firstChunkTask], updated: [], restored: [], errors: [] })
				})
				.mockImplementationOnce(secondChunk);
			vi.stubGlobal('fetch', fetchMock);

			const result = await ictTasksStore.importBatch(largeImport);

			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(ictTasksStore.getById('task-chunk-1')).toMatchObject({ title: 'Task 0' });
			expect({
				inserted: result.inserted.map((task) => task.id),
				failed: result.errors.map((error) => error.rowNumber),
				unconfirmed: result.unconfirmed.map((entry) => entry.rowNumber),
				notAttempted: result.notAttempted.map((entry) => entry.rowNumber)
			}).toEqual({
				inserted: ['task-chunk-1'],
				failed: kind === 'refused' ? rowNumbers(502, 1001) : [],
				unconfirmed: kind === 'unknown' ? rowNumbers(502, 1001) : [],
				notAttempted: [1002]
			});
		}
	);

	it('treats a success body without result arrays as unconfirmed rather than counting it as saved', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => ({ inserted: [firstChunkTask], updated: [], restored: [], errors: [] })
				})
				.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ inserted: 'none' }) })
		);

		const result = await ictTasksStore.importBatch(largeImport);

		expect({
			inserted: result.inserted.map((task) => task.id),
			unconfirmed: result.unconfirmed.map((entry) => entry.rowNumber),
			notAttempted: result.notAttempted.map((entry) => entry.rowNumber)
		}).toEqual({ inserted: ['task-chunk-1'], unconfirmed: rowNumbers(502, 1001), notAttempted: [1002] });
		expect(result.unconfirmed[0]).toMatchObject({ taskCode: '181-105-0500', title: 'Task 500' });
	});

	it.each([
		['a null inserted row', { inserted: [null], updated: [], restored: [], errors: [], unconfirmed: [] }],
		['an inserted row without its title', { inserted: [{ id: 'task-bad' }], updated: [], restored: [], errors: [] }],
		[
			'a row issue without its message',
			{ inserted: [], updated: [], restored: [], errors: [{ rowNumber: 502, taskCode: 'A', title: 'B' }] }
		]
	] as const)('treats a later chunk with %s as unconfirmed and keeps the earlier chunk', async (_label, body) => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ inserted: [firstChunkTask], updated: [], restored: [], errors: [] })
			})
			.mockResolvedValueOnce({ ok: true, status: 200, json: async () => body });
		vi.stubGlobal('fetch', fetchMock);

		const result = await ictTasksStore.importBatch(largeImport);

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(ictTasksStore.items.map((task) => task.id).sort()).toEqual(['task-chunk-1', 'task-existing']);
		expect({
			inserted: result.inserted.map((task) => task.id),
			failed: result.errors.length,
			unconfirmed: result.unconfirmed.map((entry) => entry.rowNumber),
			notAttempted: result.notAttempted.map((entry) => entry.rowNumber)
		}).toEqual({ inserted: ['task-chunk-1'], failed: 0, unconfirmed: rowNumbers(502, 1001), notAttempted: [1002] });
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

	it('posts one order command and adopts the saved tasks', async () => {
		const fetchMock = vi.fn(() =>
			reply(200, [
				{ ...neighbour, sortOrder: 5 },
				{ ...existingTask, sortOrder: 6 }
			])
		);
		vi.stubGlobal('fetch', fetchMock);

		await ictTasksStore.reorder(changes);

		expect(fetchMock.mock.calls).toEqual([
			[
				'/org/org-1/api/ict-tasks/order',
				{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes }) }
			]
		]);
		expect(sortOrders()).toEqual([
			['task-next', 5],
			['task-existing', 6]
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
