import { ictTasksStore } from './stores/ictTasks.svelte';
import { personnelIctCompletionsStore } from './stores/personnelIctCompletions.svelte';
import type { CriticalTasksSettings, IctTask, PersonnelIctCompletion } from './criticalTasks.types';
import { groupsStore, type Group } from '$lib/stores/groups.svelte';
import { personnelRosterHydration } from '$features/personnel';
import {
	createFeatureLaneWorkspaceHydrator,
	type FeatureLaneWorkspaceHydrationTargetDescriptor
} from '$lib/utils/featureLaneWorkspaceHydration.svelte';
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

const defaultCriticalTasksHydrationStores: CriticalTasksHydrationStores = {
	personnelStore: personnelRosterHydration,
	groupsStore,
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
