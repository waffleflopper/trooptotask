import type { Group } from '$features/personnel/contracts';
import {
	createFeatureLaneWorkspaceHydrator,
	type FeatureLaneWorkspaceHydrationTargetDescriptor
} from '$lib/utils/featureLaneWorkspaceHydration.svelte';
import type { Personnel } from './personnel.types';
import type { PersonnelCalendarStatusSnapshot } from '$features/personnel/contracts';
import type { PersonnelWorkspaceHydration, PersonnelWorkspaceHydrationTarget } from './contracts';

export interface PersonnelHydrationLoadable<T> {
	readonly orgId: string;
	readonly loadVersion?: number;
	readonly items?: T[];
	load(items: T[], orgId: string): void;
	startLoading?(): void;
}

export interface PersonnelPinnedGroupsHydrationLoadable {
	readonly orgId: string;
	readonly loadVersion?: number;
	load(items: string[], orgId: string): void;
}

export interface PersonnelHydrationStores {
	personnelStore: PersonnelHydrationLoadable<Personnel>;
	groupsStore: PersonnelHydrationLoadable<Group>;
	statusTypesStore: PersonnelHydrationLoadable<PersonnelCalendarStatusSnapshot>;
	pinnedGroupsStore: PersonnelPinnedGroupsHydrationLoadable;
}

export interface PersonnelWorkspaceHydrator {
	hydrate(hydration: PersonnelWorkspaceHydration | undefined, stores: PersonnelHydrationStores): Promise<void>;
	reset(): void;
	/** Drop pending hydration and this Organization's roster rows after access is denied. */
	restrict(stores: PersonnelHydrationStores): void;
}

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
		storeLoadVersion: () => store.loadVersion,
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
		storeLoadVersion: () => store.loadVersion,
		apply: (items) => store.load(items as string[], orgId)
	};
}

export function createPersonnelWorkspaceHydrator(): PersonnelWorkspaceHydrator {
	const hydrationTargets = createFeatureLaneWorkspaceHydrator({ logTag: 'personnel-hydration' });

	return {
		reset() {
			hydrationTargets.reset();
		},

		restrict(stores: PersonnelHydrationStores) {
			hydrationTargets.reset();
			for (const store of Object.values(stores)) store.load([], '');
		},

		async hydrate(hydration: PersonnelWorkspaceHydration | undefined, stores: PersonnelHydrationStores): Promise<void> {
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
