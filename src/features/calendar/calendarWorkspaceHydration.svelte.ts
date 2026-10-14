import { availabilityStore } from './stores/availability.svelte';
import { dailyAssignmentsStore } from './stores/dailyAssignments.svelte';
import { specialDaysStore } from './stores/specialDays.svelte';
import { statusTypesStore } from './stores/statusTypes.svelte';
import { groupCatalogHydration } from '$features/personnel';
import type { Group } from '$features/personnel/contracts';
import { pinnedGroupsHydration } from '$features/personnel';
import { personnelRosterHydration } from '$features/personnel';
import type { StoreRead } from '$lib/stores/core';
import { rangeCoversDate, rangeCoversSpan } from './utils/calendarRange';
import {
	createFeatureLaneWorkspaceHydrator,
	type FeatureLaneWorkspaceHydrationTargetDescriptor
} from '$lib/utils/featureLaneWorkspaceHydration.svelte';
import type { Personnel } from '$features/personnel/contracts';
import type {
	AssignmentType,
	AvailabilityEntry,
	DailyAssignment,
	SpecialDay,
	StatusType
} from '$features/calendar/contracts';
import type {
	CalendarAssignmentsHydrationItems,
	CalendarAssignmentsWorkspaceHydrationTarget,
	CalendarRangeHydrationTarget,
	CalendarWorkspaceHydration,
	CalendarWorkspaceHydrationTarget
} from './calendar.types';

export interface CalendarHydrationLoadable<T> {
	readonly orgId: string;
	readonly loadVersion?: number;
	load(items: T[], orgId: string): void;
	startLoading?(): void;
}

export interface CalendarRangeHydrationLoadable<T extends { id: string }> extends CalendarHydrationLoadable<T> {
	beginRead(since?: number): StoreRead<T>;
}

export interface CalendarAssignmentsHydrationLoadable {
	readonly orgId: string;
	readonly loadVersion?: number;
	load(types: AssignmentType[], assignments: DailyAssignment[], orgId: string): void;
	beginRead(since?: number): StoreRead<DailyAssignment>;
	startLoading?(): void;
}

export interface CalendarPinnedGroupsHydrationLoadable {
	readonly orgId: string;
	readonly loadVersion?: number;
	load(items: string[], orgId: string): void;
}

export interface CalendarHydrationStores {
	personnelStore: CalendarHydrationLoadable<Personnel>;
	groupsStore: CalendarHydrationLoadable<Group>;
	statusTypesStore: CalendarHydrationLoadable<StatusType>;
	availabilityEntriesStore: CalendarRangeHydrationLoadable<AvailabilityEntry>;
	specialDaysStore: CalendarRangeHydrationLoadable<SpecialDay>;
	calendarAssignmentsStore: CalendarAssignmentsHydrationLoadable;
	pinnedGroupsStore: CalendarPinnedGroupsHydrationLoadable;
}

export interface CalendarWorkspaceHydrator {
	hydrate(hydration?: CalendarWorkspaceHydration, stores?: CalendarHydrationStores): Promise<void>;
	restrict(stores?: CalendarHydrationStores): void;
	reset(): void;
}

const defaultCalendarHydrationStores: CalendarHydrationStores = {
	personnelStore: personnelRosterHydration,
	groupsStore: groupCatalogHydration,
	statusTypesStore,
	availabilityEntriesStore: availabilityStore,
	specialDaysStore,
	calendarAssignmentsStore: dailyAssignmentsStore,
	pinnedGroupsStore: pinnedGroupsHydration
};

function createTargetDescriptor<T>(
	target: CalendarWorkspaceHydrationTarget<T>,
	store: CalendarHydrationLoadable<T>,
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

// A range snapshot is authoritative only within its range, and only up to the changes the store
// confirmed after its request left.
function createRangeTargetDescriptor<T extends { id: string }>(
	target: CalendarRangeHydrationTarget<T>,
	store: CalendarRangeHydrationLoadable<T>,
	orgId: string,
	targetName: string,
	covers: (item: T) => boolean,
	confirmedBeforeRequest: number
): FeatureLaneWorkspaceHydrationTargetDescriptor | undefined {
	if (target.mode === 'preserve-client') return undefined;
	const read = store.beginRead(confirmedBeforeRequest);

	return {
		targetName,
		snapshotKey: target.snapshotKey,
		items: target.items,
		storeOrgId: () => store.orgId,
		storeLoadVersion: () => store.loadVersion,
		startLoading: store.startLoading ? () => store.startLoading?.() : undefined,
		apply: (items) => store.load(store.orgId === orgId ? read.reconcile(items as T[], covers) : (items as T[]), orgId),
		settle: () => read.close()
	};
}

function createCalendarAssignmentsDescriptor(
	target: CalendarAssignmentsWorkspaceHydrationTarget,
	store: CalendarAssignmentsHydrationLoadable,
	orgId: string,
	targetName: string,
	confirmedBeforeRequest: number
): FeatureLaneWorkspaceHydrationTargetDescriptor | undefined {
	if (target.mode === 'preserve-client') return undefined;
	const read = store.beginRead(confirmedBeforeRequest);

	return {
		targetName,
		snapshotKey: target.snapshotKey,
		items: target.items,
		storeOrgId: () => store.orgId,
		storeLoadVersion: () => store.loadVersion,
		startLoading: store.startLoading ? () => store.startLoading?.() : undefined,
		apply: (items) => {
			const { types, assignments } = items as CalendarAssignmentsHydrationItems;
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
	target: CalendarWorkspaceHydrationTarget<string>,
	store: CalendarPinnedGroupsHydrationLoadable,
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

export function createCalendarWorkspaceHydrator(): CalendarWorkspaceHydrator {
	const hydrationTargets = createFeatureLaneWorkspaceHydrator({ logTag: 'calendar-hydration' });

	return {
		reset() {
			hydrationTargets.reset();
		},

		restrict(stores: CalendarHydrationStores = defaultCalendarHydrationStores) {
			hydrationTargets.reset();
			stores.personnelStore.load([], '');
			stores.groupsStore.load([], '');
			stores.statusTypesStore.load([], '');
			stores.availabilityEntriesStore.load([], '');
			stores.specialDaysStore.load([], '');
			stores.calendarAssignmentsStore.load([], [], '');
			stores.pinnedGroupsStore.load([], '');
		},

		async hydrate(
			hydration?: CalendarWorkspaceHydration,
			stores: CalendarHydrationStores = defaultCalendarHydrationStores
		): Promise<void> {
			if (!hydration) return;
			const { orgId } = hydration;
			const descriptors = [
				createTargetDescriptor(hydration.personnel, stores.personnelStore, orgId, 'personnel'),
				createTargetDescriptor(hydration.groups, stores.groupsStore, orgId, 'groups'),
				createTargetDescriptor(hydration.statusTypes, stores.statusTypesStore, orgId, 'statusTypes'),
				createRangeTargetDescriptor(
					hydration.availabilityEntries,
					stores.availabilityEntriesStore,
					orgId,
					'availabilityEntries',
					rangeCoversSpan(hydration.availabilityEntries.range),
					hydration.confirmedBeforeRequest
				),
				createRangeTargetDescriptor(
					hydration.specialDays,
					stores.specialDaysStore,
					orgId,
					'specialDays',
					rangeCoversDate(hydration.specialDays.range),
					hydration.confirmedBeforeRequest
				),
				createCalendarAssignmentsDescriptor(
					hydration.calendarAssignments,
					stores.calendarAssignmentsStore,
					orgId,
					'calendarAssignments',
					hydration.confirmedBeforeRequest
				),
				createPinnedGroupsDescriptor(hydration.pinnedGroups, stores.pinnedGroupsStore, orgId, 'pinnedGroups')
			].filter((descriptor): descriptor is FeatureLaneWorkspaceHydrationTargetDescriptor => descriptor !== undefined);

			await hydrationTargets.applyDescriptors(orgId, descriptors);
		}
	};
}

export const calendarWorkspaceHydrator = createCalendarWorkspaceHydrator();
