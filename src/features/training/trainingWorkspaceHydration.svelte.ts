import { SvelteMap } from 'svelte/reactivity';
import { personnelTrainingsStore } from './stores/personnelTrainings.svelte';
import { trainingTypesStore } from './stores/trainingTypes.svelte';
import { trainingViewsStore } from './stores/trainingViews.svelte';
import type { PersonnelTraining, TrainingType, TrainingView } from './training.types';
import { groupsStore, type Group } from '$lib/stores/groups.svelte';
import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
import { rosterStore } from '$lib/stores/roster.svelte';
import type { Personnel } from '$lib/types';
import type { TrainingWorkspaceHydration, TrainingWorkspaceHydrationTarget } from './server/trainingWorkspaceBootstrap';

export interface TrainingHydrationLoadable<T> {
	readonly orgId: string;
	readonly items?: T[];
	load(items: T[], orgId: string): void;
	startLoading?(): void;
}

export interface TrainingHydrationStores {
	personnelStore: TrainingHydrationLoadable<Personnel>;
	groupsStore: TrainingHydrationLoadable<Group>;
	trainingTypesStore: TrainingHydrationLoadable<TrainingType>;
	trainingViewsStore: TrainingHydrationLoadable<TrainingView>;
	personnelTrainingsStore: TrainingHydrationLoadable<PersonnelTraining>;
	pinnedGroupsStore: TrainingHydrationLoadable<string>;
}

export interface TrainingWorkspaceHydrator {
	hydrate(hydration?: TrainingWorkspaceHydration, stores?: TrainingHydrationStores): Promise<void>;
	reset(): void;
}

interface TargetSnapshotState {
	orgId: string;
	snapshotKey: string;
}

interface TrainingHydrationTargetDescriptor {
	targetName: string;
	snapshotKey: string;
	items: unknown | Promise<unknown>;
	storeOrgId(): string;
	startLoading?(): void;
	apply(resolved: unknown): void;
}

const defaultTrainingHydrationStores: TrainingHydrationStores = {
	personnelStore: rosterStore,
	groupsStore,
	trainingTypesStore,
	trainingViewsStore,
	personnelTrainingsStore,
	pinnedGroupsStore
};

function isPromiseLike<T>(value: unknown): value is Promise<T> {
	return !!value && typeof value === 'object' && typeof (value as { then?: unknown }).then === 'function';
}

function createTargetDescriptor<T>(
	target: TrainingWorkspaceHydrationTarget<T>,
	store: TrainingHydrationLoadable<T>,
	orgId: string,
	targetName: string
): TrainingHydrationTargetDescriptor | undefined {
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

export function createTrainingWorkspaceHydrator(): TrainingWorkspaceHydrator {
	const appliedSnapshotKeys = new SvelteMap<string, TargetSnapshotState>();
	const pendingSnapshotKeys = new SvelteMap<string, TargetSnapshotState>();

	async function applyDescriptor(descriptor: TrainingHydrationTargetDescriptor, orgId: string): Promise<void> {
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
			descriptor.startLoading?.();
			try {
				const items = await descriptor.items;
				const latestPending = pendingSnapshotKeys.get(targetName);
				if (latestPending?.orgId !== orgId || latestPending.snapshotKey !== snapshotKey) return;
				descriptor.apply(items);
				pendingSnapshotKeys.delete(targetName);
				appliedSnapshotKeys.set(targetName, { orgId, snapshotKey });
				return;
			} catch (error) {
				const latestPending = pendingSnapshotKeys.get(targetName);
				if (latestPending?.orgId === orgId && latestPending.snapshotKey === snapshotKey) {
					pendingSnapshotKeys.delete(targetName);
				}
				console.error(`[training-hydration] Failed to load ${targetName} for org ${orgId}`, error);
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
			hydration?: TrainingWorkspaceHydration,
			stores: TrainingHydrationStores = defaultTrainingHydrationStores
		): Promise<void> {
			if (!hydration) return;
			const { orgId } = hydration;
			const descriptors = [
				createTargetDescriptor(hydration.personnel, stores.personnelStore, orgId, 'personnel'),
				createTargetDescriptor(hydration.groups, stores.groupsStore, orgId, 'groups'),
				createTargetDescriptor(hydration.trainingTypes, stores.trainingTypesStore, orgId, 'trainingTypes'),
				createTargetDescriptor(hydration.trainingViews, stores.trainingViewsStore, orgId, 'trainingViews'),
				createTargetDescriptor(
					hydration.personnelTrainings,
					stores.personnelTrainingsStore,
					orgId,
					'personnelTrainings'
				),
				createTargetDescriptor(hydration.pinnedGroups, stores.pinnedGroupsStore, orgId, 'pinnedGroups')
			].filter((descriptor): descriptor is TrainingHydrationTargetDescriptor => descriptor !== undefined);

			await Promise.all(descriptors.map((descriptor) => applyDescriptor(descriptor, orgId)));
		}
	};
}

export const trainingWorkspaceHydrator = createTrainingWorkspaceHydrator();
