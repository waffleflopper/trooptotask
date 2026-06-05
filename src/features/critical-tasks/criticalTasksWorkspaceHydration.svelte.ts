import { SvelteMap } from 'svelte/reactivity';
import { ictTasksStore } from './stores/ictTasks.svelte';
import { personnelIctCompletionsStore } from './stores/personnelIctCompletions.svelte';
import type { CriticalTasksSettings, IctTask, PersonnelIctCompletion } from './criticalTasks.types';
import { groupsStore, type Group } from '$lib/stores/groups.svelte';
import { rosterStore } from '$lib/stores/roster.svelte';
import type { Personnel } from '$lib/types';
import type {
	CriticalTasksWorkspaceHydration,
	CriticalTasksWorkspaceHydrationTarget,
	CriticalTasksWorkspaceResult
} from './server/criticalTasksWorkspaceBootstrap';

export interface CriticalTasksHydrationLoadable<T> {
	readonly orgId: string;
	readonly items?: T[];
	load(items: T[], orgId: string): void;
	startLoading?(): void;
}

export interface CriticalTasksHydrationStores {
	personnelStore: CriticalTasksHydrationLoadable<Personnel>;
	groupsStore: CriticalTasksHydrationLoadable<Group>;
	ictTasksStore: CriticalTasksHydrationLoadable<IctTask>;
	personnelIctCompletionsStore: CriticalTasksHydrationLoadable<PersonnelIctCompletion>;
}

export interface CriticalTasksWorkspaceHydrator {
	hydrate(hydration?: CriticalTasksWorkspaceHydration, stores?: CriticalTasksHydrationStores): Promise<void>;
	reset(): void;
}

export const criticalTasksWorkspaceStatus = $state<{
	orgId: string | null;
	settings: CriticalTasksSettings | null;
	pending: boolean;
	error: Error | null;
}>({
	orgId: null,
	settings: null,
	pending: false,
	error: null
});

export function markCriticalTasksWorkspacePending(orgId: string | null | undefined): void {
	criticalTasksWorkspaceStatus.orgId = orgId ?? null;
	criticalTasksWorkspaceStatus.settings = null;
	criticalTasksWorkspaceStatus.pending = true;
	criticalTasksWorkspaceStatus.error = null;
}

export function markCriticalTasksWorkspaceResolved(workspace: CriticalTasksWorkspaceResult): void {
	criticalTasksWorkspaceStatus.orgId = workspace.hydration.orgId;
	criticalTasksWorkspaceStatus.settings = workspace.data.settings;
	criticalTasksWorkspaceStatus.pending = false;
	criticalTasksWorkspaceStatus.error = null;
}

export function markCriticalTasksWorkspaceRejected(error: Error, orgId: string | null | undefined): void {
	criticalTasksWorkspaceStatus.orgId = orgId ?? criticalTasksWorkspaceStatus.orgId;
	criticalTasksWorkspaceStatus.pending = false;
	criticalTasksWorkspaceStatus.error = error;
}

export function resetCriticalTasksWorkspaceStatus(): void {
	criticalTasksWorkspaceStatus.orgId = null;
	criticalTasksWorkspaceStatus.settings = null;
	criticalTasksWorkspaceStatus.pending = false;
	criticalTasksWorkspaceStatus.error = null;
}

interface TargetSnapshotState {
	orgId: string;
	snapshotKey: string;
}

interface CriticalTasksHydrationTargetDescriptor {
	targetName: string;
	snapshotKey: string;
	items: unknown | Promise<unknown>;
	storeOrgId(): string;
	startLoading?(): void;
	apply(resolved: unknown): void;
}

const defaultCriticalTasksHydrationStores: CriticalTasksHydrationStores = {
	personnelStore: rosterStore,
	groupsStore,
	ictTasksStore,
	personnelIctCompletionsStore
};

function isPromiseLike<T>(value: unknown): value is Promise<T> {
	return !!value && typeof value === 'object' && typeof (value as { then?: unknown }).then === 'function';
}

function storeMovedToAnotherOrg(
	descriptor: CriticalTasksHydrationTargetDescriptor,
	orgId: string,
	initialStoreOrgId: string
): boolean {
	const storeOrgId = descriptor.storeOrgId();
	return storeOrgId !== '' && storeOrgId !== orgId && storeOrgId !== initialStoreOrgId;
}

function createTargetDescriptor<T>(
	target: CriticalTasksWorkspaceHydrationTarget<T>,
	store: CriticalTasksHydrationLoadable<T>,
	orgId: string,
	targetName: string
): CriticalTasksHydrationTargetDescriptor | undefined {
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

export function createCriticalTasksWorkspaceHydrator(): CriticalTasksWorkspaceHydrator {
	const appliedSnapshotKeys = new SvelteMap<string, TargetSnapshotState>();
	const pendingSnapshotKeys = new SvelteMap<string, TargetSnapshotState>();

	async function applyDescriptor(descriptor: CriticalTasksHydrationTargetDescriptor, orgId: string): Promise<void> {
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
				if (latestPending?.orgId === orgId && latestPending.snapshotKey === snapshotKey) {
					pendingSnapshotKeys.delete(targetName);
				}
				console.error(`[critical-tasks-hydration] Failed to load ${targetName} for org ${orgId}`, error);
				throw error;
			}
		}

		descriptor.apply(descriptor.items);
		pendingSnapshotKeys.delete(targetName);
		appliedSnapshotKeys.set(targetName, { orgId, snapshotKey });
	}

	return {
		reset() {
			appliedSnapshotKeys.clear();
			pendingSnapshotKeys.clear();
		},

		async hydrate(
			hydration?: CriticalTasksWorkspaceHydration,
			stores: CriticalTasksHydrationStores = defaultCriticalTasksHydrationStores
		): Promise<void> {
			if (!hydration) return;
			const { orgId } = hydration;
			const descriptors = [
				createTargetDescriptor(hydration.personnel, stores.personnelStore, orgId, 'personnel'),
				createTargetDescriptor(hydration.groups, stores.groupsStore, orgId, 'groups'),
				createTargetDescriptor(hydration.ictTasks, stores.ictTasksStore, orgId, 'ictTasks'),
				createTargetDescriptor(
					hydration.personnelIctCompletions,
					stores.personnelIctCompletionsStore,
					orgId,
					'personnelIctCompletions'
				)
			].filter((descriptor): descriptor is CriticalTasksHydrationTargetDescriptor => descriptor !== undefined);

			await Promise.all(descriptors.map((descriptor) => applyDescriptor(descriptor, orgId)));
		}
	};
}

export const criticalTasksWorkspaceHydrator = createCriticalTasksWorkspaceHydrator();
