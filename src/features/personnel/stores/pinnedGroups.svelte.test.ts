import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PinnedGroupsStore } from './pinnedGroups.svelte';

describe('pinned Group state', () => {
	let store: PinnedGroupsStore;

	beforeEach(() => {
		vi.restoreAllMocks();
		store = new PinnedGroupsStore();
		store.load([], 'org-1');
	});

	it('should not clobber optimistic pin when load is called mid-flight', async () => {
		store.load(['Alpha'], 'org-1');

		let resolveFetch!: (value: unknown) => void;
		const fetchPromise = new Promise((resolve) => {
			resolveFetch = resolve;
		});
		vi.stubGlobal(
			'fetch',
			vi.fn().mockReturnValue(fetchPromise.then(() => ({ ok: true, status: 200, json: () => Promise.resolve({}) })))
		);

		const pinPromise = store.pin('Bravo');

		// Optimistic: Bravo should be pinned
		expect(store.list).toEqual(['Alpha', 'Bravo']);

		// Stale load (only Alpha)
		store.load(['Alpha'], 'org-1');

		// Should NOT clobber optimistic pin
		expect(store.list).toContain('Bravo');

		resolveFetch(undefined);
		await pinPromise;
	});

	it('should not clobber optimistic unpin when load is called mid-flight', async () => {
		store.load(['Alpha', 'Bravo'], 'org-1');

		let resolveFetch!: (value: unknown) => void;
		const fetchPromise = new Promise((resolve) => {
			resolveFetch = resolve;
		});
		vi.stubGlobal(
			'fetch',
			vi.fn().mockReturnValue(fetchPromise.then(() => ({ ok: true, status: 200, json: () => Promise.resolve({}) })))
		);

		const unpinPromise = store.unpin('Bravo');

		// Optimistic: Bravo removed
		expect(store.list).toEqual(['Alpha']);

		// Stale load (still has both)
		store.load(['Alpha', 'Bravo'], 'org-1');

		// Should NOT clobber optimistic unpin
		expect(store.list).not.toContain('Bravo');

		resolveFetch(undefined);
		await unpinPromise;
	});

	it('should allow load when org changes during in-flight mutation', async () => {
		store.load(['Alpha'], 'org-1');

		let resolveFetch!: (value: unknown) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn().mockReturnValue(
				new Promise((resolve) => {
					resolveFetch = resolve;
				}).then(() => ({ ok: true, status: 200, json: () => Promise.resolve({}) }))
			)
		);

		const pinPromise = store.pin('Bravo');

		// Different org
		store.load(['Charlie'], 'org-2');
		expect(store.list).toEqual(['Charlie']);

		resolveFetch(undefined);
		await pinPromise;
	});

	it.each([
		{ action: 'pin', initial: ['Alpha'], group: 'Bravo' },
		{ action: 'unpin', initial: ['Alpha', 'Bravo'], group: 'Bravo' },
		{ action: 'moveUp', initial: ['Alpha', 'Bravo'], group: 'Bravo' },
		{ action: 'moveDown', initial: ['Alpha', 'Bravo'], group: 'Alpha' }
	] as const)('does not roll back a new Organization after failed $action', async ({ action, initial, group }) => {
		store.load([...initial], 'org-1');
		let rejectRequest!: (error: Error) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(
				() =>
					new Promise((_resolve, reject) => {
						rejectRequest = reject;
					})
			)
		);

		const mutation = store[action](group);
		store.load(['Bravo', 'Charlie'], 'org-2');
		rejectRequest(new Error('Old Organization request failed'));

		expect(await mutation).toBe(false);
		expect(store.orgId).toBe('org-2');
		expect(store.list).toEqual(['Bravo', 'Charlie']);
	});

	it('accepts another new-Organization load while an old request is still pending', async () => {
		store.load(['Alpha'], 'org-1');
		let resolveRequest!: (response: { ok: boolean }) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(
				() =>
					new Promise((resolve) => {
						resolveRequest = resolve;
					})
			)
		);

		const oldPin = store.pin('Bravo');
		store.load(['Charlie'], 'org-2');
		store.load(['Delta'], 'org-2');
		expect(store.list).toEqual(['Delta']);

		resolveRequest({ ok: true });
		await oldPin;
	});

	it('keeps a fresh snapshot after switching away and back to the same Organization', async () => {
		store.load(['Alpha'], 'org-1');
		let rejectRequest!: (error: Error) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(
				() =>
					new Promise((_resolve, reject) => {
						rejectRequest = reject;
					})
			)
		);

		const oldPin = store.pin('Bravo');
		store.load(['Charlie'], 'org-2');
		store.load(['Bravo', 'Delta'], 'org-1');
		rejectRequest(new Error('Old request failed'));

		expect(await oldPin).toBe(false);
		expect(store.list).toEqual(['Bravo', 'Delta']);
	});

	it.each([
		{ action: 'pin', group: 'Charlie', optimistic: ['Alpha', 'Bravo', 'Charlie'] },
		{ action: 'unpin', group: 'Bravo', optimistic: ['Alpha'] },
		{ action: 'moveUp', group: 'Bravo', optimistic: ['Bravo', 'Alpha'] },
		{ action: 'moveDown', group: 'Alpha', optimistic: ['Bravo', 'Alpha'] }
	] as const)(
		'updates $action immediately and restores current order on failure',
		async ({ action, group, optimistic }) => {
			store.load(['Alpha', 'Bravo'], 'org-1');
			let rejectRequest!: (error: Error) => void;
			vi.stubGlobal(
				'fetch',
				vi.fn(
					() =>
						new Promise((_resolve, reject) => {
							rejectRequest = reject;
						})
				)
			);

			const mutation = store[action](group);
			expect(store.list).toEqual(optimistic);
			rejectRequest(new Error('Current request failed'));
			expect(await mutation).toBe(false);
			expect(store.list).toEqual(['Alpha', 'Bravo']);
		}
	);

	it.each([
		{ action: 'unpin', group: 'Bravo' },
		{ action: 'moveUp', group: 'Bravo' },
		{ action: 'moveDown', group: 'Alpha' }
	] as const)('preserves a newer pin when an earlier $action fails', async ({ action, group }) => {
		store.load(['Alpha', 'Bravo'], 'org-1');
		let rejectFirst!: (error: Error) => void;
		let resolveSecond!: (response: { ok: boolean }) => void;
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockImplementationOnce(
					() =>
						new Promise((_resolve, reject) => {
							rejectFirst = reject;
						})
				)
				.mockImplementationOnce(
					() =>
						new Promise((resolve) => {
							resolveSecond = resolve;
						})
				)
		);

		const first = store[action](group);
		const second = store.pin('Charlie');
		rejectFirst(new Error('Earlier request failed'));
		expect(await first).toBe(false);
		expect(store.list).toEqual(['Alpha', 'Bravo', 'Charlie']);

		resolveSecond({ ok: true });
		expect(await second).toBe(true);
		expect(store.list).toEqual(['Alpha', 'Bravo', 'Charlie']);
	});
});
