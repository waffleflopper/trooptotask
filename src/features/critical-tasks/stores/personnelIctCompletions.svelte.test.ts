import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { personnelIctCompletionsStore } from './personnelIctCompletions.svelte';
import type { PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';

const existingCompletion: PersonnelIctCompletion = {
	id: '11111111-1111-4111-8111-111111111111',
	personnelId: 'person-1',
	ictTaskId: 'task-1',
	completedAt: '2097-03-10',
	validationMethod: 'Lecture',
	validatedBy: 'MSG Jordan Example',
	notes: 'Initial entry',
	loggedBy: null,
	createdAt: '2026-04-02T00:00:00.000Z'
};

function createDeferredFetch() {
	let resolve!: (value: { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
	const promise = new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

describe('personnelIctCompletionsStore', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		personnelIctCompletionsStore.load([], 'org-1');
	});

	afterEach(() => {
		personnelIctCompletionsStore.load([], 'org-test-reset');
	});

	it('rolls back an optimistic add when the save fails', async () => {
		const deferred = createDeferredFetch();
		const fetchMock = vi.fn().mockReturnValue(deferred.promise);
		vi.stubGlobal('fetch', fetchMock);

		const addPromise = personnelIctCompletionsStore.add({
			personnelId: 'person-1',
			ictTaskId: 'task-1',
			completedAt: '2098-01-01',
			validationMethod: 'Practical Exercise',
			validatedBy: 'SFC Taylor Example',
			notes: 'Lane validation'
		});

		expect(personnelIctCompletionsStore.items).toHaveLength(1);
		expect(personnelIctCompletionsStore.items[0]).toMatchObject({
			personnelId: 'person-1',
			ictTaskId: 'task-1',
			completedAt: '2098-01-01',
			validationMethod: 'Practical Exercise',
			validatedBy: 'SFC Taylor Example',
			notes: 'Lane validation'
		});

		deferred.resolve({
			ok: false,
			status: 403,
			json: async () => ({ message: 'Forbidden' })
		});

		await expect(addPromise).rejects.toThrow('Forbidden');
		expect(personnelIctCompletionsStore.items).toEqual([]);
	});

	it('rolls back an optimistic update when the save fails', async () => {
		const deferred = createDeferredFetch();
		const fetchMock = vi.fn().mockReturnValue(deferred.promise);
		vi.stubGlobal('fetch', fetchMock);
		personnelIctCompletionsStore.load([existingCompletion], 'org-1');

		const updatePromise = personnelIctCompletionsStore.update(existingCompletion.id, {
			validationMethod: 'Simulation',
			notes: 'Corrected entry'
		});

		expect(personnelIctCompletionsStore.getById(existingCompletion.id)).toMatchObject({
			...existingCompletion,
			validationMethod: 'Simulation',
			notes: 'Corrected entry'
		});

		deferred.resolve({
			ok: false,
			status: 500,
			json: async () => ({ message: 'Update failed' })
		});

		await expect(updatePromise).resolves.toBe(false);
		expect(personnelIctCompletionsStore.getById(existingCompletion.id)).toEqual(existingCompletion);
	});

	it('posts checked completion rows to the batch import endpoint and merges inserted and updated completions', async () => {
		personnelIctCompletionsStore.load([existingCompletion], 'org-1');
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({
					inserted: [
						{
							id: 'completion-new',
							personnelId: 'person-2',
							ictTaskId: 'task-2',
							completedAt: '2098-02-01',
							validationMethod: 'Other',
							validatedBy: null,
							notes: null,
							loggedBy: 'user-1',
							createdAt: '2098-02-01T00:00:00Z'
						}
					],
					updated: [
						{
							...existingCompletion,
							validationMethod: 'Simulation',
							notes: 'Corrected entry'
						}
					],
					errors: [
						{
							rowNumber: 7,
							personnelName: 'SGT Jane Smith',
							taskCode: 'BAD-TASK',
							message: 'Task code "BAD-TASK" does not match an existing critical task'
						}
					]
				})
			})
		);

		const result = await personnelIctCompletionsStore.importBatch({
			records: [
				{
					rowNumber: 2,
					values: {
						rank: 'SGT',
						lastName: 'Smith',
						firstName: 'Jane',
						taskCode: '181-105-1001',
						completedAt: '2097-03-10',
						validationMethod: 'Simulation',
						notes: 'Corrected entry'
					}
				},
				{
					rowNumber: 3,
					values: {
						rank: 'SPC',
						lastName: 'Doe',
						firstName: 'Jordan',
						taskCode: '181-105-1002',
						completedAt: '2098-02-01'
					}
				}
			]
		});

		expect(globalThis.fetch).toHaveBeenCalledWith('/org/org-1/api/personnel-ict-completions/batch', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				records: [
					{
						rowNumber: 2,
						values: {
							rank: 'SGT',
							lastName: 'Smith',
							firstName: 'Jane',
							taskCode: '181-105-1001',
							completedAt: '2097-03-10',
							validationMethod: 'Simulation',
							notes: 'Corrected entry'
						}
					},
					{
						rowNumber: 3,
						values: {
							rank: 'SPC',
							lastName: 'Doe',
							firstName: 'Jordan',
							taskCode: '181-105-1002',
							completedAt: '2098-02-01'
						}
					}
				]
			})
		});

		expect(result).toEqual({
			inserted: [
				expect.objectContaining({
					id: 'completion-new',
					personnelId: 'person-2',
					ictTaskId: 'task-2'
				})
			],
			updated: [
				expect.objectContaining({
					id: existingCompletion.id,
					validationMethod: 'Simulation',
					notes: 'Corrected entry'
				})
			],
			errors: [
				{
					rowNumber: 7,
					personnelName: 'SGT Jane Smith',
					taskCode: 'BAD-TASK',
					message: 'Task code "BAD-TASK" does not match an existing critical task'
				}
			]
		});
		expect(personnelIctCompletionsStore.getById(existingCompletion.id)).toEqual(
			expect.objectContaining({
				validationMethod: 'Simulation',
				notes: 'Corrected entry'
			})
		);
		expect(personnelIctCompletionsStore.getById('completion-new')).toEqual(
			expect.objectContaining({
				personnelId: 'person-2',
				ictTaskId: 'task-2',
				completedAt: '2098-02-01'
			})
		);
	});

	it('chunks large completion imports into 500-row batch requests', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				inserted: [],
				updated: [],
				errors: []
			})
		});
		vi.stubGlobal('fetch', fetchMock);

		await personnelIctCompletionsStore.importBatch({
			records: Array.from({ length: 501 }, (_, index) => ({
				rowNumber: index + 2,
				values: {
					rank: 'SGT',
					lastName: `Smith-${index}`,
					firstName: 'Jane',
					taskCode: `181-105-${String(index).padStart(4, '0')}`,
					completedAt: '2098-01-01'
				}
			}))
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).records).toHaveLength(500);
		expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).records).toHaveLength(1);
	});
});
