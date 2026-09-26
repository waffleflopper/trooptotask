import { groupsStore } from '$lib/stores/groups.svelte';
import type { Group } from '$features/personnel/contracts';
import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
import { personnelRosterHydration } from './stores/personnel.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import {
	createFeatureLaneWorkspaceHydrator,
	type FeatureLaneWorkspaceHydrationTargetDescriptor
} from '$lib/utils/featureLaneWorkspaceHydration.svelte';
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

const defaultPersonnelHydrationStores: PersonnelHydrationStores = {
	personnelStore: personnelRosterHydration,
	groupsStore,
	statusTypesStore,
	pinnedGroupsStore
};

function createTargetDescriptor<T>(
	target: PersonnelWorkspaceHydrationTarget<T>,
	store: PersonnelHydrationLoadable<T>,
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

function createPinnedGroupsDescriptor(
	target: PersonnelWorkspaceHydrationTarget<string>,
	store: PersonnelPinnedGroupsHydrationLoadable,
	orgId: string,
	targetName: string
): FeatureLaneWorkspaceHydrationTargetDescriptor | undefined {
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
	const hydrationTargets = createFeatureLaneWorkspaceHydrator({ logTag: 'personnel-hydration' });

	return {
		reset() {
			hydrationTargets.reset();
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
			].filter((descriptor): descriptor is FeatureLaneWorkspaceHydrationTargetDescriptor => descriptor !== undefined);

			await hydrationTargets.applyDescriptors(orgId, descriptors);
		}
	};
}

export const personnelWorkspaceHydrator = createPersonnelWorkspaceHydrator();
