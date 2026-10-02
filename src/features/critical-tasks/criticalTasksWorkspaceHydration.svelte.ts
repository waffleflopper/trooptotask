import { ictTasksStore } from './stores/ictTasks.svelte';
import { personnelIctCompletionsStore } from './stores/personnelIctCompletions.svelte';
import type { IctTask, PersonnelIctCompletion } from './criticalTasks.types';
import { groupCatalogHydration } from '$features/personnel';
import type { Group } from '$features/personnel/contracts';
import { personnelRosterHydration } from '$features/personnel';
import {
	createFeatureLaneWorkspaceHydrator,
	type FeatureLaneWorkspaceHydrationTargetDescriptor
} from '$lib/utils/featureLaneWorkspaceHydration.svelte';
import type { Personnel } from '$features/personnel/contracts';
import type { CriticalTasksWorkspaceHydration, CriticalTasksWorkspaceHydrationTarget } from './contracts';

export {
	criticalTasksWorkspaceStatus,
	markCriticalTasksWorkspacePending,
	markCriticalTasksWorkspaceResolved,
	markCriticalTasksWorkspaceRejected,
	resetCriticalTasksWorkspaceStatus
} from './criticalTasksWorkspaceStatus.svelte';

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

const defaultCriticalTasksHydrationStores: CriticalTasksHydrationStores = {
	personnelStore: personnelRosterHydration,
	groupsStore: groupCatalogHydration,
	ictTasksStore,
	personnelIctCompletionsStore
};

function createTargetDescriptor<T>(
	target: CriticalTasksWorkspaceHydrationTarget<T>,
	store: CriticalTasksHydrationLoadable<T>,
	orgId: string,
	targetName: string
): FeatureLaneWorkspaceHydrationTargetDescriptor | undefined {
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
	const hydrationTargets = createFeatureLaneWorkspaceHydrator({ logTag: 'critical-tasks-hydration' });

	return {
		reset() {
			hydrationTargets.reset();
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
			].filter((descriptor): descriptor is FeatureLaneWorkspaceHydrationTargetDescriptor => descriptor !== undefined);

			await hydrationTargets.applyDescriptors(orgId, descriptors);
		}
	};
}

export const criticalTasksWorkspaceHydrator = createCriticalTasksWorkspaceHydrator();
