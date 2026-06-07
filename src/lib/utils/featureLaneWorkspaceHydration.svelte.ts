import { SvelteMap } from 'svelte/reactivity';
import { isPromiseLike } from './streamedRouteData';

export interface FeatureLaneWorkspaceHydrationTargetDescriptor {
	targetName: string;
	snapshotKey: string;
	items: unknown | Promise<unknown>;
	storeOrgId(): string;
	startLoading?(): void;
	apply(resolved: unknown): void;
}

export interface FeatureLaneWorkspaceHydrator {
	applyDescriptors(orgId: string, descriptors: FeatureLaneWorkspaceHydrationTargetDescriptor[]): Promise<void>;
	reset(): void;
}

interface TargetSnapshotState {
	orgId: string;
	snapshotKey: string;
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
			snapshotKey: descriptor.snapshotKey
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
		orgId: string
	): Promise<void> {
		const { targetName, snapshotKey } = descriptor;

		const appliedState = appliedSnapshotKeys.get(targetName);
		if (
			descriptor.storeOrgId() === orgId &&
			appliedState?.orgId === orgId &&
			appliedState.snapshotKey === snapshotKey
		) {
			return;
		}

		const pendingState = pendingSnapshotKeys.get(targetName);
		if (pendingState?.orgId === orgId && pendingState.snapshotKey === snapshotKey) return;

		pendingSnapshotKeys.set(targetName, { orgId, snapshotKey });

		if (isPromiseLike<unknown>(descriptor.items)) {
			const initialStoreOrgId = descriptor.storeOrgId();
			descriptor.startLoading?.();
			try {
				const items = await descriptor.items;
				const latestPending = pendingSnapshotKeys.get(targetName);
				if (latestPending?.orgId !== orgId || latestPending.snapshotKey !== snapshotKey) return;
				if (storeMovedToAnotherOrg(descriptor, orgId, initialStoreOrgId)) {
					pendingSnapshotKeys.delete(targetName);
					return;
				}
				applyResolvedDescriptor(descriptor, orgId, items);
				return;
			} catch (error) {
				const latestPending = pendingSnapshotKeys.get(targetName);
				if (latestPending?.orgId !== orgId || latestPending.snapshotKey !== snapshotKey) {
					return;
				}
				pendingSnapshotKeys.delete(targetName);
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

		async applyDescriptors(orgId: string, descriptors: FeatureLaneWorkspaceHydrationTargetDescriptor[]): Promise<void> {
			await Promise.all(descriptors.map((descriptor) => applyDescriptor(descriptor, orgId)));
		}
	};
}
