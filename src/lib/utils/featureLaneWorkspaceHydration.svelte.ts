import { SvelteMap } from 'svelte/reactivity';
import { confirmedBeforeRequest, type ConfirmedChangesByTab, type StoreRead } from '$lib/stores/core';
import { isPromiseLike } from './streamedRouteData';

export interface FeatureLaneWorkspaceHydrationTargetDescriptor {
	targetName: string;
	snapshotKey: string;
	items: unknown | Promise<unknown>;
	storeOrgId(): string;
	storeLoadVersion?(): number | undefined;
	startLoading?(): void;
	apply(resolved: unknown): void;
	/** Runs once the request is applied, superseded or failed. */
	settle?(): void;
}

export interface ReconcilableStore<T extends { id: string }> {
	readonly orgId: string;
	load(items: T[], orgId: string): void;
	beginRead?(since?: number): StoreRead<T>;
}

/**
 * A store that stays usable through a refresh can confirm a save after the refresh's request left. Its snapshot is
 * older than that save, so the changes confirmed since are applied on top of it instead of being replaced.
 */
export function reconcileOnLoad<T extends { id: string }>(
	descriptor: FeatureLaneWorkspaceHydrationTargetDescriptor | undefined,
	store: ReconcilableStore<T>,
	orgId: string,
	confirmedChangesByTab: ConfirmedChangesByTab | undefined
): FeatureLaneWorkspaceHydrationTargetDescriptor | undefined {
	if (!descriptor || store.orgId !== orgId || !store.beginRead) return descriptor;
	const read = store.beginRead(confirmedChangesByTab && confirmedBeforeRequest(confirmedChangesByTab));
	return {
		...descriptor,
		apply: (items) =>
			store.load(store.orgId === orgId ? read.reconcile(items as T[], () => true) : (items as T[]), orgId),
		settle: () => read.close()
	};
}

export interface FeatureLaneHydrationOptions {
	/**
	 * Set for a refresh of the workspace already on screen: its stores keep their rows while newer snapshots stream
	 * in. Any other load, including the same Organization under changed access, puts them back into loading.
	 */
	keepRows?: boolean;
}

export interface FeatureLaneWorkspaceHydrator {
	applyDescriptors(
		orgId: string,
		descriptors: FeatureLaneWorkspaceHydrationTargetDescriptor[],
		options?: FeatureLaneHydrationOptions
	): Promise<void>;
	reset(): void;
}

interface TargetSnapshotState {
	orgId: string;
	snapshotKey: string;
	storeLoadVersion?: number;
}

interface CreateFeatureLaneWorkspaceHydratorOptions {
	logTag: string;
}

function storeMovedToAnotherOrg(
	descriptor: FeatureLaneWorkspaceHydrationTargetDescriptor,
	orgId: string,
	initialStoreOrgId: string
): boolean {
	const storeOrgId = descriptor.storeOrgId();
	return storeOrgId !== '' && storeOrgId !== orgId && storeOrgId !== initialStoreOrgId;
}

export function createFeatureLaneWorkspaceHydrator(
	options: CreateFeatureLaneWorkspaceHydratorOptions
): FeatureLaneWorkspaceHydrator {
	const appliedSnapshotKeys = new SvelteMap<string, TargetSnapshotState>();
	const pendingSnapshotKeys = new SvelteMap<string, TargetSnapshotState>();

	function markApplied(descriptor: FeatureLaneWorkspaceHydrationTargetDescriptor, orgId: string): void {
		pendingSnapshotKeys.delete(descriptor.targetName);
		appliedSnapshotKeys.set(descriptor.targetName, {
			orgId,
			snapshotKey: descriptor.snapshotKey,
			storeLoadVersion: descriptor.storeLoadVersion?.()
		});
	}

	function applyResolvedDescriptor(
		descriptor: FeatureLaneWorkspaceHydrationTargetDescriptor,
		orgId: string,
		resolved: unknown
	): void {
		try {
			descriptor.apply(resolved);
			markApplied(descriptor, orgId);
		} catch (error) {
			pendingSnapshotKeys.delete(descriptor.targetName);
			throw error;
		}
	}

	async function applyDescriptor(
		descriptor: FeatureLaneWorkspaceHydrationTargetDescriptor,
		orgId: string,
		keepRows: boolean
	): Promise<void> {
		const { targetName, snapshotKey } = descriptor;

		const appliedState = appliedSnapshotKeys.get(targetName);
		if (
			descriptor.storeOrgId() === orgId &&
			appliedState?.orgId === orgId &&
			appliedState.snapshotKey === snapshotKey &&
			appliedState.storeLoadVersion === descriptor.storeLoadVersion?.()
		) {
			return;
		}

		const storeLoadVersion = descriptor.storeLoadVersion?.();
		const pendingState = pendingSnapshotKeys.get(targetName);
		if (
			pendingState?.orgId === orgId &&
			pendingState.snapshotKey === snapshotKey &&
			pendingState.storeLoadVersion === storeLoadVersion
		)
			return;

		const requestState = { orgId, snapshotKey, storeLoadVersion };
		pendingSnapshotKeys.set(targetName, requestState);

		if (isPromiseLike<unknown>(descriptor.items)) {
			const initialStoreOrgId = descriptor.storeOrgId();
			if (!keepRows) descriptor.startLoading?.();
			try {
				const items = await descriptor.items;
				const latestPending = pendingSnapshotKeys.get(targetName);
				if (latestPending !== requestState) return;
				if (
					descriptor.storeLoadVersion?.() !== storeLoadVersion ||
					storeMovedToAnotherOrg(descriptor, orgId, initialStoreOrgId)
				) {
					pendingSnapshotKeys.delete(targetName);
					return;
				}
				applyResolvedDescriptor(descriptor, orgId, items);
				return;
			} catch (error) {
				const latestPending = pendingSnapshotKeys.get(targetName);
				if (latestPending !== requestState) {
					return;
				}
				pendingSnapshotKeys.delete(targetName);
				if (descriptor.storeLoadVersion?.() !== storeLoadVersion) return;
				console.error(`[${options.logTag}] Failed to load ${targetName} for org ${orgId}`, error);
				throw error;
			}
		}

		applyResolvedDescriptor(descriptor, orgId, descriptor.items);
	}

	return {
		reset() {
			appliedSnapshotKeys.clear();
			pendingSnapshotKeys.clear();
		},

		async applyDescriptors(orgId, descriptors, { keepRows = false } = {}): Promise<void> {
			await Promise.all(
				descriptors.map((descriptor) =>
					applyDescriptor(descriptor, orgId, keepRows).finally(() => descriptor.settle?.())
				)
			);
		}
	};
}
