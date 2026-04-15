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
});
