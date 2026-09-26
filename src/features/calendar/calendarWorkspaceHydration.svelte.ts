import { availabilityStore } from './stores/availability.svelte';
import { dailyAssignmentsStore } from './stores/dailyAssignments.svelte';
import { specialDaysStore } from './stores/specialDays.svelte';
import { statusTypesStore } from './stores/statusTypes.svelte';
import { groupCatalogHydration } from '$features/personnel';
import type { Group } from '$features/personnel/contracts';
import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
import { personnelRosterHydration } from '$features/personnel';
import { mergeById } from '$lib/utils/mergeById';
import {
	createFeatureLaneWorkspaceHydrator,
	type FeatureLaneWorkspaceHydrationTargetDescriptor
} from '$lib/utils/featureLaneWorkspaceHydration.svelte';
import type { AssignmentType, AvailabilityEntry, DailyAssignment, Personnel, SpecialDay, StatusType } from '$lib/types';
import type {
	CalendarAssignmentsWorkspaceHydrationTarget,
	CalendarWorkspaceHydration,
	CalendarWorkspaceHydrationTarget
} from './server/calendarWorkspaceBootstrap';

export interface CalendarHydrationLoadable<T> {
	readonly orgId: string;
	readonly items?: T[];
	load(items: T[], orgId: string): void;
	startLoading?(): void;
}

export interface CalendarAssignmentsHydrationLoadable {
	readonly orgId: string;
	readonly assignments?: DailyAssignment[];
	load(types: AssignmentType[], assignments: DailyAssignment[], orgId: string): void;
	startLoading?(): void;
}

export interface CalendarPinnedGroupsHydrationLoadable {
	readonly orgId: string;
	load(items: string[], orgId: string): void;
}

export interface CalendarHydrationStores {
	personnelStore: CalendarHydrationLoadable<Personnel>;
	groupsStore: CalendarHydrationLoadable<Group>;
	statusTypesStore: CalendarHydrationLoadable<StatusType>;
	availabilityEntriesStore: CalendarHydrationLoadable<AvailabilityEntry>;
	specialDaysStore: CalendarHydrationLoadable<SpecialDay>;
	calendarAssignmentsStore: CalendarAssignmentsHydrationLoadable;
	pinnedGroupsStore: CalendarPinnedGroupsHydrationLoadable;
}

export interface CalendarWorkspaceHydrator {
	hydrate(hydration?: CalendarWorkspaceHydration, stores?: CalendarHydrationStores): Promise<void>;
	reset(): void;
}

const defaultCalendarHydrationStores: CalendarHydrationStores = {
	personnelStore: personnelRosterHydration,
	groupsStore: groupCatalogHydration,
	statusTypesStore,
	availabilityEntriesStore: availabilityStore,
	specialDaysStore,
	calendarAssignmentsStore: dailyAssignmentsStore,
	pinnedGroupsStore
};

function hasStringId(value: unknown): value is { id: string } {
	return !!value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string';
}

function canMergeById<T>(items: readonly T[]): items is Array<T & { id: string }> {
	return items.every(hasStringId);
}

function mergeLoadItems<T>(
	store: CalendarHydrationLoadable<T>,
	items: T[],
	orgId: string,
	mode: CalendarWorkspaceHydrationTarget<T>['mode']
): T[] {
	const existingItems = store.items ?? [];
	if (mode !== 'merge' || store.orgId !== orgId || !canMergeById(existingItems) || !canMergeById(items)) {
		return items;
	}

	return mergeById(existingItems, items);
}

function mergeCalendarAssignments(
	store: CalendarAssignmentsHydrationLoadable,
	items: { types: AssignmentType[]; assignments: DailyAssignment[] },
	orgId: string,
	target: CalendarAssignmentsWorkspaceHydrationTarget
): { types: AssignmentType[]; assignments: DailyAssignment[] } {
	if (target.mode !== 'merge' || store.orgId !== orgId) {
		return items;
	}

	const existingAssignments = store.assignments ?? [];
	const assignments =
		target.rangeStart && target.rangeEnd
			? mergeById(
					existingAssignments.filter(
						(assignment) => assignment.date < target.rangeStart! || assignment.date > target.rangeEnd!
					),
					items.assignments
				)
			: mergeById(existingAssignments, items.assignments);

	return {
		types: items.types,
		assignments
	};
}

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
		startLoading: store.startLoading ? () => store.startLoading?.() : undefined,
		apply: (items) => store.load(mergeLoadItems(store, items as T[], orgId, target.mode), orgId)
	};
}

function createCalendarAssignmentsDescriptor(
	target: CalendarAssignmentsWorkspaceHydrationTarget,
	store: CalendarAssignmentsHydrationLoadable,
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
			const mergedItems = mergeCalendarAssignments(
				store,
				items as { types: AssignmentType[]; assignments: DailyAssignment[] },
				orgId,
				target
			);
			store.load(mergedItems.types, mergedItems.assignments, orgId);
		}
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
		apply: (items) => store.load(items as string[], orgId)
	};
}

export function createCalendarWorkspaceHydrator(): CalendarWorkspaceHydrator {
	const hydrationTargets = createFeatureLaneWorkspaceHydrator({ logTag: 'calendar-hydration' });

	return {
		reset() {
			hydrationTargets.reset();
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
				createTargetDescriptor(
					hydration.availabilityEntries,
					stores.availabilityEntriesStore,
					orgId,
					'availabilityEntries'
				),
				createTargetDescriptor(hydration.specialDays, stores.specialDaysStore, orgId, 'specialDays'),
				createCalendarAssignmentsDescriptor(
					hydration.calendarAssignments,
					stores.calendarAssignmentsStore,
					orgId,
					'calendarAssignments'
				),
				createPinnedGroupsDescriptor(hydration.pinnedGroups, stores.pinnedGroupsStore, orgId, 'pinnedGroups')
			].filter((descriptor): descriptor is FeatureLaneWorkspaceHydrationTargetDescriptor => descriptor !== undefined);

			await hydrationTargets.applyDescriptors(orgId, descriptors);
		}
	};
}

export const calendarWorkspaceHydrator = createCalendarWorkspaceHydrator();
