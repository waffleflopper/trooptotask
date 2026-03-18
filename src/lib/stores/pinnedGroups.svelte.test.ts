import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pinnedGroupsStore } from './pinnedGroups.svelte';

describe('pinnedGroupsStore - load during in-flight mutations (issue #113)', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		pinnedGroupsStore.load([], 'org-1');
	});

	it('should not clobber optimistic pin when load is called mid-flight', async () => {
		pinnedGroupsStore.load(['Alpha'], 'org-1');

		let resolveFetch!: (value: unknown) => void;
		const fetchPromise = new Promise((resolve) => {
			resolveFetch = resolve;
		});
		vi.stubGlobal(
			'fetch',
			vi.fn().mockReturnValue(fetchPromise.then(() => ({ ok: true, status: 200, json: () => Promise.resolve({}) })))
		);

		const pinPromise = pinnedGroupsStore.pin('Bravo');

		// Optimistic: Bravo should be pinned
		expect(pinnedGroupsStore.list).toEqual(['Alpha', 'Bravo']);

		// Stale load (only Alpha)
		pinnedGroupsStore.load(['Alpha'], 'org-1');

		// Should NOT clobber optimistic pin
		expect(pinnedGroupsStore.list).toContain('Bravo');

		resolveFetch(undefined);
		await pinPromise;
	});

	it('should not clobber optimistic unpin when load is called mid-flight', async () => {
		pinnedGroupsStore.load(['Alpha', 'Bravo'], 'org-1');

		let resolveFetch!: (value: unknown) => void;
		const fetchPromise = new Promise((resolve) => {
			resolveFetch = resolve;
		});
		vi.stubGlobal(
			'fetch',
			vi.fn().mockReturnValue(fetchPromise.then(() => ({ ok: true, status: 200, json: () => Promise.resolve({}) })))
		);

		const unpinPromise = pinnedGroupsStore.unpin('Bravo');

		// Optimistic: Bravo removed
		expect(pinnedGroupsStore.list).toEqual(['Alpha']);

		// Stale load (still has both)
		pinnedGroupsStore.load(['Alpha', 'Bravo'], 'org-1');

		// Should NOT clobber optimistic unpin
		expect(pinnedGroupsStore.list).not.toContain('Bravo');

		resolveFetch(undefined);
		await unpinPromise;
	});

	it('should allow load when org changes during in-flight mutation', async () => {
		pinnedGroupsStore.load(['Alpha'], 'org-1');

		let resolveFetch!: (value: unknown) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn().mockReturnValue(
				new Promise((resolve) => {
					resolveFetch = resolve;
				}).then(() => ({ ok: true, status: 200, json: () => Promise.resolve({}) }))
			)
		);

		pinnedGroupsStore.pin('Bravo');

		// Different org
		pinnedGroupsStore.load(['Charlie'], 'org-2');
		expect(pinnedGroupsStore.list).toEqual(['Charlie']);

		resolveFetch(undefined);
	});
});
