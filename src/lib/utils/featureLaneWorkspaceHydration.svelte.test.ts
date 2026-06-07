import { describe, expect, it, vi } from 'vitest';
import {
	createFeatureLaneWorkspaceHydrator,
	type FeatureLaneWorkspaceHydrationTargetDescriptor
} from './featureLaneWorkspaceHydration.svelte';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function createTarget(name = 'personnel') {
	let orgId = '';
	let items: unknown[] = [];
	let loading = false;
	let loadCount = 0;
	let startLoadingCount = 0;
	return {
		name,
		get orgId() {
			return orgId;
		},
		get items() {
			return items;
		},
		get loading() {
			return loading;
		},
		get loadCount() {
			return loadCount;
		},
		get startLoadingCount() {
			return startLoadingCount;
		},
		load(nextItems: unknown[], nextOrgId: string) {
			items = nextItems;
			orgId = nextOrgId;
			loading = false;
			loadCount += 1;
		},
		startLoading() {
			startLoadingCount += 1;
			loading = true;
		}
	};
}

function createDescriptor(config: {
	target: ReturnType<typeof createTarget>;
	orgId: string;
	snapshotKey: string;
	items: unknown[] | Promise<unknown[]>;
}): FeatureLaneWorkspaceHydrationTargetDescriptor {
	return {
		targetName: config.target.name,
		snapshotKey: config.snapshotKey,
		items: config.items,
		storeOrgId: () => config.target.orgId,
		startLoading: () => config.target.startLoading(),
		apply: (items) => config.target.load(items as unknown[], config.orgId)
	};
}

describe('Feature Lane workspace hydration mechanics', () => {
	it('hydrates immediate targets, skips applied snapshots, and can reset the snapshot ledger', async () => {
		const target = createTarget();
		const hydrator = createFeatureLaneWorkspaceHydrator({ logTag: 'test-hydration' });
		const descriptor = createDescriptor({
			target,
			orgId: 'org-1',
			snapshotKey: 'personnel:1',
			items: ['ready']
		});

		await hydrator.applyDescriptors('org-1', [descriptor]);
		await hydrator.applyDescriptors('org-1', [descriptor]);

		expect(target.items).toEqual(['ready']);
		expect(target.loadCount).toBe(1);

		hydrator.reset();
		await hydrator.applyDescriptors('org-1', [descriptor]);

		expect(target.loadCount).toBe(2);
	});

	it('dedupes concurrent pending snapshots and starts loading only once', async () => {
		const target = createTarget();
		const hydrator = createFeatureLaneWorkspaceHydrator({ logTag: 'test-hydration' });
		const pending = deferred<unknown[]>();
		const descriptor = createDescriptor({
			target,
			orgId: 'org-1',
			snapshotKey: 'personnel:pending',
			items: pending.promise
		});

		const firstRun = hydrator.applyDescriptors('org-1', [descriptor]);
		const secondRun = hydrator.applyDescriptors('org-1', [descriptor]);

		expect(target.startLoadingCount).toBe(1);
		expect(target.loading).toBe(true);

		pending.resolve(['ready']);
		await Promise.all([firstRun, secondRun]);

		expect(target.items).toEqual(['ready']);
		expect(target.loadCount).toBe(1);
	});

	it('ignores stale deferred results and stale rejections after a newer snapshot wins', async () => {
		const target = createTarget();
		const hydrator = createFeatureLaneWorkspaceHydrator({ logTag: 'test-hydration' });
		const staleResult = deferred<unknown[]>();
		const staleError = deferred<unknown[]>();
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		const staleResultRun = hydrator.applyDescriptors('org-old', [
			createDescriptor({
				target,
				orgId: 'org-old',
				snapshotKey: 'personnel:old-result',
				items: staleResult.promise
			})
		]);
		await hydrator.applyDescriptors('org-new', [
			createDescriptor({
				target,
				orgId: 'org-new',
				snapshotKey: 'personnel:new-result',
				items: ['fresh']
			})
		]);

		staleResult.resolve(['stale']);
		await staleResultRun;

		const staleErrorRun = hydrator.applyDescriptors('org-old', [
			createDescriptor({
				target,
				orgId: 'org-old',
				snapshotKey: 'personnel:old-error',
				items: staleError.promise
			})
		]);
		await hydrator.applyDescriptors('org-new', [
			createDescriptor({
				target,
				orgId: 'org-new',
				snapshotKey: 'personnel:new-error',
				items: ['still-fresh']
			})
		]);

		staleError.reject(new Error('stale failure'));
		await staleErrorRun;

		expect(target.orgId).toBe('org-new');
		expect(target.items).toEqual(['still-fresh']);
		expect(consoleError).not.toHaveBeenCalled();
		consoleError.mockRestore();
	});

	it('protects a store that moved to a different Organization while a target was pending', async () => {
		const target = createTarget();
		const hydrator = createFeatureLaneWorkspaceHydrator({ logTag: 'test-hydration' });
		const pending = deferred<unknown[]>();
		const run = hydrator.applyDescriptors('org-1', [
			createDescriptor({
				target,
				orgId: 'org-1',
				snapshotKey: 'personnel:org-1',
				items: pending.promise
			})
		]);

		target.load(['new-org-item'], 'org-2');
		pending.resolve(['old-org-item']);
		await run;

		expect(target.orgId).toBe('org-2');
		expect(target.items).toEqual(['new-org-item']);
	});

	it('clears failed pending targets so the same snapshot can retry', async () => {
		const target = createTarget();
		const hydrator = createFeatureLaneWorkspaceHydrator({ logTag: 'test-hydration' });
		const failed = deferred<unknown[]>();
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		const failedRun = hydrator.applyDescriptors('org-1', [
			createDescriptor({
				target,
				orgId: 'org-1',
				snapshotKey: 'personnel:retry',
				items: failed.promise
			})
		]);
		failed.reject(new Error('temporary failure'));
		await expect(failedRun).rejects.toThrow('temporary failure');

		await hydrator.applyDescriptors('org-1', [
			createDescriptor({
				target,
				orgId: 'org-1',
				snapshotKey: 'personnel:retry',
				items: ['retry-ready']
			})
		]);

		expect(target.items).toEqual(['retry-ready']);
		expect(target.loadCount).toBe(1);
		consoleError.mockRestore();
	});

	it('clears immediate load failures so a later target can apply', async () => {
		const target = createTarget();
		const hydrator = createFeatureLaneWorkspaceHydrator({ logTag: 'test-hydration' });
		let shouldThrow = true;
		const descriptor = createDescriptor({
			target,
			orgId: 'org-1',
			snapshotKey: 'personnel:sync-failure',
			items: ['failed']
		});
		descriptor.apply = () => {
			if (shouldThrow) {
				throw new Error('load exploded');
			}
			target.load(['ready'], 'org-1');
		};

		await expect(hydrator.applyDescriptors('org-1', [descriptor])).rejects.toThrow('load exploded');
		shouldThrow = false;
		await hydrator.applyDescriptors('org-1', [descriptor]);

		expect(target.items).toEqual(['ready']);
		expect(target.orgId).toBe('org-1');
	});
});
