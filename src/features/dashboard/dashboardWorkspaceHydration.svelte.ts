import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import { groupCatalogHydration } from '$features/personnel';
import type { Group } from '$features/personnel/contracts';
import { pinnedGroupsHydration } from '$features/personnel';
import { personnelRosterHydration } from '$features/personnel';
import {
	createFeatureLaneWorkspaceHydrator,
	type FeatureLaneWorkspaceHydrationTargetDescriptor
} from '$lib/utils/featureLaneWorkspaceHydration.svelte';
import type { TrainingType } from '$features/training/training.types';
import type { AssignmentType, AvailabilityEntry, DailyAssignment, Personnel, StatusType } from '$lib/types';
import type {
	DashboardAssignmentsWorkspaceHydrationTarget,
	DashboardWorkspaceHydration,
	DashboardWorkspaceHydrationTarget
} from './server/dashboardWorkspaceBootstrap';

export interface DashboardHydrationLoadable<T> {
	readonly orgId: string;
	readonly items?: T[];
	load(items: T[], orgId: string): void;
	startLoading?(): void;
}

export interface DashboardAssignmentsHydrationLoadable {
	readonly orgId: string;
	load(types: AssignmentType[], assignments: DailyAssignment[], orgId: string): void;
	startLoading?(): void;
}

export interface DashboardPinnedGroupsHydrationLoadable {
	readonly orgId: string;
	load(items: string[], orgId: string): void;
}

export interface DashboardHydrationStores {
	personnelStore: DashboardHydrationLoadable<Personnel>;
	groupsStore: DashboardHydrationLoadable<Group>;
	statusTypesStore: DashboardHydrationLoadable<StatusType>;
	availabilityEntriesStore: DashboardHydrationLoadable<AvailabilityEntry>;
	calendarAssignmentsStore: DashboardAssignmentsHydrationLoadable;
	trainingTypesStore: DashboardHydrationLoadable<TrainingType>;
	pinnedGroupsStore: DashboardPinnedGroupsHydrationLoadable;
}

export interface DashboardWorkspaceHydrator {
	hydrate(hydration?: DashboardWorkspaceHydration, stores?: DashboardHydrationStores): Promise<void>;
	reset(): void;
}

const defaultDashboardHydrationStores: DashboardHydrationStores = {
	personnelStore: personnelRosterHydration,
	groupsStore: groupCatalogHydration,
	statusTypesStore,
	availabilityEntriesStore: availabilityStore,
	calendarAssignmentsStore: dailyAssignmentsStore,
	trainingTypesStore,
	pinnedGroupsStore: pinnedGroupsHydration
};

function createTargetDescriptor<T>(
	target: DashboardWorkspaceHydrationTarget<T>,
	store: DashboardHydrationLoadable<T>,
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

function createCalendarAssignmentsDescriptor(
	target: DashboardAssignmentsWorkspaceHydrationTarget,
	store: DashboardAssignmentsHydrationLoadable,
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
		apply: (items) => {
			const { types, assignments } = items as { types: AssignmentType[]; assignments: DailyAssignment[] };
			store.load(types, assignments, orgId);
		}
	};
}

function createPinnedGroupsDescriptor(
	target: DashboardWorkspaceHydrationTarget<string>,
	store: DashboardPinnedGroupsHydrationLoadable,
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

export function createDashboardWorkspaceHydrator(): DashboardWorkspaceHydrator {
	const hydrationTargets = createFeatureLaneWorkspaceHydrator({ logTag: 'dashboard-hydration' });

	return {
		reset() {
			hydrationTargets.reset();
		},

		async hydrate(
			hydration?: DashboardWorkspaceHydration,
			stores: DashboardHydrationStores = defaultDashboardHydrationStores
		): Promise<void> {
			if (!hydration) return;
			const { orgId } = hydration;
			const descriptors = [
				createTargetDescriptor(hydration.personnel, stores.personnelStore, orgId, 'personnel'),
				createTargetDescriptor(hydration.groups, stores.groupsStore, orgId, 'groups'),
				createTargetDescriptor(hydration.statusTypes, stores.statusTypesStore, orgId, 'statusTypes'),
				createTargetDescriptor(
					hydration.availabilityEntries,
					stores.availabilityEntriesStore,
					orgId,
					'availabilityEntries'
				),
				createCalendarAssignmentsDescriptor(
					hydration.calendarAssignments,
					stores.calendarAssignmentsStore,
					orgId,
					'calendarAssignments'
				),
				createTargetDescriptor(hydration.trainingTypes, stores.trainingTypesStore, orgId, 'trainingTypes'),
				createPinnedGroupsDescriptor(hydration.pinnedGroups, stores.pinnedGroupsStore, orgId, 'pinnedGroups')
			].filter((descriptor): descriptor is FeatureLaneWorkspaceHydrationTargetDescriptor => descriptor !== undefined);

			await hydrationTargets.applyDescriptors(orgId, descriptors);
		}
	};
}

export const dashboardWorkspaceHydrator = createDashboardWorkspaceHydrator();
