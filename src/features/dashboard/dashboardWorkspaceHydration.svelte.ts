import {
	calendarStatusHydration,
	calendarAvailabilityHydration,
	calendarAssignmentsHydration,
	rangeCoversDate,
	rangeCoversSpan
} from '$features/calendar';
import { trainingTypeHydration } from '$features/training';
import { groupCatalogHydration } from '$features/personnel';
import type { Group } from '$features/personnel/contracts';
import { pinnedGroupsHydration } from '$features/personnel';
import { personnelRosterHydration } from '$features/personnel';
import { snapshotRequestSequence, type StoreRead } from '$lib/stores/core';
import {
	createFeatureLaneWorkspaceHydrator,
	type FeatureLaneWorkspaceHydrationTargetDescriptor
} from '$lib/utils/featureLaneWorkspaceHydration.svelte';
import type { TrainingType } from '$features/training/contracts';
import type { Personnel } from '$features/personnel/contracts';
import type { AssignmentType, AvailabilityEntry, StatusType, DailyAssignment } from '$features/calendar/contracts';
import type {
	DashboardAssignmentsWorkspaceHydrationTarget,
	DashboardRangeHydrationTarget,
	DashboardWorkspaceHydration,
	DashboardWorkspaceHydrationTarget
} from './contracts';

export interface DashboardHydrationLoadable<T> {
	readonly orgId: string;
	readonly loadVersion?: number;
	readonly items?: T[];
	load(items: T[], orgId: string): void;
	startLoading?(): void;
}

export interface DashboardRangeHydrationLoadable<T extends { id: string }> extends DashboardHydrationLoadable<T> {
	beginRead(since?: number): StoreRead<T>;
}

export interface DashboardAssignmentsHydrationLoadable {
	readonly orgId: string;
	readonly loadVersion?: number;
	load(types: AssignmentType[], assignments: DailyAssignment[], orgId: string): void;
	beginRead(since?: number): StoreRead<DailyAssignment>;
	startLoading?(): void;
}

export interface DashboardPinnedGroupsHydrationLoadable {
	readonly orgId: string;
	readonly loadVersion?: number;
	load(items: string[], orgId: string): void;
}

export interface DashboardHydrationStores {
	personnelStore: DashboardHydrationLoadable<Personnel>;
	groupsStore: DashboardHydrationLoadable<Group>;
	statusTypesStore: DashboardHydrationLoadable<StatusType>;
	availabilityEntriesStore: DashboardRangeHydrationLoadable<AvailabilityEntry>;
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
	statusTypesStore: calendarStatusHydration,
	availabilityEntriesStore: calendarAvailabilityHydration,
	calendarAssignmentsStore: calendarAssignmentsHydration,
	trainingTypesStore: trainingTypeHydration,
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
		storeLoadVersion: () => store.loadVersion,
		startLoading: store.startLoading ? () => store.startLoading?.() : undefined,
		apply: (items) => store.load(items as T[], orgId)
	};
}

// Dashboard shares Calendar's stores, so its snapshot reconciles only its own date range.
function createAvailabilityDescriptor(
	target: DashboardRangeHydrationTarget<AvailabilityEntry>,
	store: DashboardRangeHydrationLoadable<AvailabilityEntry>,
	orgId: string,
	targetName: string
): FeatureLaneWorkspaceHydrationTargetDescriptor | undefined {
	if (target.mode === 'preserve-client') return undefined;
	const read = store.beginRead(snapshotRequestSequence());

	return {
		targetName,
		snapshotKey: target.snapshotKey,
		items: target.items,
		storeOrgId: () => store.orgId,
		storeLoadVersion: () => store.loadVersion,
		startLoading: store.startLoading ? () => store.startLoading?.() : undefined,
		apply: (items) => {
			const entries = items as AvailabilityEntry[];
			store.load(store.orgId === orgId ? read.reconcile(entries, rangeCoversSpan(target.range)) : entries, orgId);
		},
		settle: () => read.close()
	};
}

function createCalendarAssignmentsDescriptor(
	target: DashboardAssignmentsWorkspaceHydrationTarget,
	store: DashboardAssignmentsHydrationLoadable,
	orgId: string,
	targetName: string
): FeatureLaneWorkspaceHydrationTargetDescriptor | undefined {
	if (target.mode === 'preserve-client') return undefined;
	const read = store.beginRead(snapshotRequestSequence());

	return {
		targetName,
		snapshotKey: target.snapshotKey,
		items: target.items,
		storeOrgId: () => store.orgId,
		storeLoadVersion: () => store.loadVersion,
		startLoading: store.startLoading ? () => store.startLoading?.() : undefined,
		apply: (items) => {
			const { types, assignments } = items as { types: AssignmentType[]; assignments: DailyAssignment[] };
			store.load(
				types,
				store.orgId === orgId ? read.reconcile(assignments, rangeCoversDate(target.range)) : assignments,
				orgId
			);
		},
		settle: () => read.close()
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
		storeLoadVersion: () => store.loadVersion,
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
				createAvailabilityDescriptor(
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
