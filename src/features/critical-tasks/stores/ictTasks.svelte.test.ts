import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ictTasksStore } from './ictTasks.svelte';
import type { IctTask } from '$features/critical-tasks/criticalTasks.types';

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
			errors: [{ rowNumber: 7, taskCode: 'bad', title: 'Bad row', message: 'Task code is required' }]
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
});
