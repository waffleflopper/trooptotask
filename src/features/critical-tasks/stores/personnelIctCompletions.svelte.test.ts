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

	it('merges the completions a chunk saved and leaves a failed row out', async () => {
		const updated = { ...existingCompletion, notes: 'Updated note' };
		const added = { ...existingCompletion, id: '22222222-2222-4222-8222-222222222222', completedAt: '2098-01-01' };
		personnelIctCompletionsStore.load([structuredClone(existingCompletion)], 'org-1');
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({
					results: [
						{ kind: 'updated', record: updated },
						{ kind: 'added', record: added },
						{ kind: 'failed', message: 'This person is archived.' }
					]
				})
			})
		);

		const reply = await personnelIctCompletionsStore.importChunk([
			{ personnelId: 'person-1', ictTaskId: 'task-1', completedAt: '2097-03-10', notes: 'Updated note' },
			{ personnelId: 'person-1', ictTaskId: 'task-1', completedAt: '2098-01-01' },
			{ personnelId: 'person-2', ictTaskId: 'task-1', completedAt: '2098-01-01' }
		]);

		expect(reply.kind).toBe('saved');
		expect(
			personnelIctCompletionsStore.items
				.map((item) => [item.completedAt, item.notes])
				.sort((a, b) => a[0]!.localeCompare(b[0]!))
		).toEqual([
			['2097-03-10', 'Updated note'],
			['2098-01-01', 'Initial entry']
		]);
	});

	it.each([
		['response', 'switch'],
		['response', 'return'],
		['response', 'replace'],
		['body', 'switch'],
		['body', 'return'],
		['body', 'replace']
	] as const)('discards an old import during %s delivery after workspace %s', async (stage, change) => {
		const response = createDeferredFetch();
		let releaseBody!: (value: unknown) => void;
		const body = new Promise<unknown>((resolve) => {
			releaseBody = resolve;
		});
		const json = vi.fn(() => body);
		const fetchMock = vi
			.fn()
			.mockReturnValue(stage === 'response' ? response.promise : Promise.resolve({ ok: true, status: 200, json }));
		vi.stubGlobal('fetch', fetchMock);
		const pending = personnelIctCompletionsStore.importChunk([
			{ personnelId: 'person-1', ictTaskId: 'task-1', completedAt: '2098-01-01' }
		]);
		if (stage === 'body') await vi.waitFor(() => expect(json).toHaveBeenCalledOnce());
		const current = { ...existingCompletion, id: 'current-workspace', notes: 'New workspace data' };
		personnelIctCompletionsStore.load([current], change === 'replace' ? 'org-1' : 'org-2');
		if (change === 'return') personnelIctCompletionsStore.load([current], 'org-1');
		const oldResult = { results: [{ kind: 'added', record: existingCompletion }] };
		response.resolve({ ok: true, status: 200, json: async () => oldResult });
		releaseBody(oldResult);
		await expect(pending).rejects.toThrow('Critical Tasks workspace changed during import');
		expect(personnelIctCompletionsStore.items).toEqual([current]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
