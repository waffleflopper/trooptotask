import { SvelteMap } from 'svelte/reactivity';
import { groupsStore, type Group } from '$lib/stores/groups.svelte';
import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
import { rosterStore } from '$lib/stores/roster.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import type { Personnel, StatusType } from '$lib/types';
import type {
	PersonnelWorkspaceHydration,
	PersonnelWorkspaceHydrationTarget
} from './server/personnelWorkspaceBootstrap';

export interface PersonnelHydrationLoadable<T> {
	readonly orgId: string;
	readonly items?: T[];
	load(items: T[], orgId: string): void;
	startLoading?(): void;
}

export interface PersonnelPinnedGroupsHydrationLoadable {
	readonly orgId: string;
	load(items: string[], orgId: string): void;
}

export interface PersonnelHydrationStores {
	personnelStore: PersonnelHydrationLoadable<Personnel>;
	groupsStore: PersonnelHydrationLoadable<Group>;
	statusTypesStore: PersonnelHydrationLoadable<StatusType>;
	pinnedGroupsStore: PersonnelPinnedGroupsHydrationLoadable;
}

export interface PersonnelWorkspaceHydrator {
	hydrate(hydration?: PersonnelWorkspaceHydration, stores?: PersonnelHydrationStores): Promise<void>;
	reset(): void;
}

interface TargetSnapshotState {
	orgId: string;
	snapshotKey: string;
}

interface PersonnelHydrationTargetDescriptor {
	targetName: string;
	snapshotKey: string;
	items: unknown | Promise<unknown>;
	storeOrgId(): string;
	startLoading?(): void;
	apply(resolved: unknown): void;
}

const defaultPersonnelHydrationStores: PersonnelHydrationStores = {
	personnelStore: rosterStore,
	groupsStore,
	statusTypesStore,
	pinnedGroupsStore
};

function isPromiseLike<T>(value: unknown): value is Promise<T> {
	return !!value && typeof value === 'object' && typeof (value as { then?: unknown }).then === 'function';
}

function storeMovedToAnotherOrg(
	descriptor: PersonnelHydrationTargetDescriptor,
	orgId: string,
	initialStoreOrgId: string
): boolean {
	const storeOrgId = descriptor.storeOrgId();
	return storeOrgId !== '' && storeOrgId !== orgId && storeOrgId !== initialStoreOrgId;
}

function createTargetDescriptor<T>(
	target: PersonnelWorkspaceHydrationTarget<T>,
	store: PersonnelHydrationLoadable<T>,
	orgId: string,
	targetName: string
): PersonnelHydrationTargetDescriptor | undefined {
	if (target.mode === 'preserve-client') return undefined;

	return {
		targetName,
		snapshotKey: target.snapshotKey,
		items: target.items,
		storeOrgId: () => store.orgId,
		startLoading: store.startLoading ? () => store.startLoading?.() : undefined,
		apply: (items) => store.load(items as T[], orgId)
	};
}

function createPinnedGroupsDescriptor(
	target: PersonnelWorkspaceHydrationTarget<string>,
	store: PersonnelPinnedGroupsHydrationLoadable,
	orgId: string,
	targetName: string
): PersonnelHydrationTargetDescriptor | undefined {
	if (target.mode === 'preserve-client') return undefined;

	return {
		targetName,
		snapshotKey: target.snapshotKey,
		items: target.items,
		storeOrgId: () => store.orgId,
		apply: (items) => store.load(items as string[], orgId)
	};
}

export function createPersonnelWorkspaceHydrator(): PersonnelWorkspaceHydrator {
	const appliedSnapshotKeys = new SvelteMap<string, TargetSnapshotState>();
	const pendingSnapshotKeys = new SvelteMap<string, TargetSnapshotState>();

	async function applyDescriptor(descriptor: PersonnelHydrationTargetDescriptor, orgId: string): Promise<void> {
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
				descriptor.apply(items);
				pendingSnapshotKeys.delete(targetName);
				appliedSnapshotKeys.set(targetName, { orgId, snapshotKey });
				return;
			} catch (error) {
				const latestPending = pendingSnapshotKeys.get(targetName);
				if (latestPending?.orgId !== orgId || latestPending.snapshotKey !== snapshotKey) {
					return;
				}
				pendingSnapshotKeys.delete(targetName);
				console.error(`[personnel-hydration] Failed to load ${targetName} for org ${orgId}`, error);
				throw error;
			}
		}

		try {
			descriptor.apply(descriptor.items);
		} catch (error) {
			pendingSnapshotKeys.delete(targetName);
			throw error;
		}
		pendingSnapshotKeys.delete(targetName);
		appliedSnapshotKeys.set(targetName, { orgId, snapshotKey });
	}

	return {
		reset() {
			appliedSnapshotKeys.clear();
			pendingSnapshotKeys.clear();
		},

		async hydrate(
			hydration?: PersonnelWorkspaceHydration,
			stores: PersonnelHydrationStores = defaultPersonnelHydrationStores
		): Promise<void> {
			if (!hydration) return;
			const { orgId } = hydration;
			const descriptors = [
				createTargetDescriptor(hydration.personnel, stores.personnelStore, orgId, 'personnel'),
				createTargetDescriptor(hydration.groups, stores.groupsStore, orgId, 'groups'),
				createTargetDescriptor(hydration.statusTypes, stores.statusTypesStore, orgId, 'statusTypes'),
				createPinnedGroupsDescriptor(hydration.pinnedGroups, stores.pinnedGroupsStore, orgId, 'pinnedGroups')
			].filter((descriptor): descriptor is PersonnelHydrationTargetDescriptor => descriptor !== undefined);

			await Promise.all(descriptors.map((descriptor) => applyDescriptor(descriptor, orgId)));
		}
	};
}

export const personnelWorkspaceHydrator = createPersonnelWorkspaceHydrator();
