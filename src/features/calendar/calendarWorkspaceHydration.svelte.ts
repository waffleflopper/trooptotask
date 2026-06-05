import { SvelteMap } from 'svelte/reactivity';
import { availabilityStore } from './stores/availability.svelte';
import { dailyAssignmentsStore } from './stores/dailyAssignments.svelte';
import { specialDaysStore } from './stores/specialDays.svelte';
import { statusTypesStore } from './stores/statusTypes.svelte';
import { groupsStore, type Group } from '$lib/stores/groups.svelte';
import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
import { rosterStore } from '$lib/stores/roster.svelte';
import { mergeById } from '$lib/utils/mergeById';
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

interface TargetSnapshotState {
	orgId: string;
	snapshotKey: string;
}

interface CalendarHydrationTargetDescriptor {
	targetName: string;
	snapshotKey: string;
	items: unknown | Promise<unknown>;
	storeOrgId(): string;
	startLoading?(): void;
	apply(resolved: unknown): void;
}

const defaultCalendarHydrationStores: CalendarHydrationStores = {
	personnelStore: rosterStore,
	groupsStore,
	statusTypesStore,
	availabilityEntriesStore: availabilityStore,
	specialDaysStore,
	calendarAssignmentsStore: dailyAssignmentsStore,
	pinnedGroupsStore
};

function isPromiseLike<T>(value: unknown): value is Promise<T> {
	return !!value && typeof value === 'object' && typeof (value as { then?: unknown }).then === 'function';
}

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

function storeMovedToAnotherOrg(
	descriptor: CalendarHydrationTargetDescriptor,
	orgId: string,
	initialStoreOrgId: string
): boolean {
	const storeOrgId = descriptor.storeOrgId();
	return storeOrgId !== '' && storeOrgId !== orgId && storeOrgId !== initialStoreOrgId;
}

function createTargetDescriptor<T>(
	target: CalendarWorkspaceHydrationTarget<T>,
	store: CalendarHydrationLoadable<T>,
	orgId: string,
	targetName: string
): CalendarHydrationTargetDescriptor | undefined {
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
): CalendarHydrationTargetDescriptor | undefined {
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
): CalendarHydrationTargetDescriptor | undefined {
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
	const appliedSnapshotKeys = new SvelteMap<string, TargetSnapshotState>();
	const pendingSnapshotKeys = new SvelteMap<string, TargetSnapshotState>();

	async function applyDescriptor(descriptor: CalendarHydrationTargetDescriptor, orgId: string): Promise<void> {
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
				console.error(`[calendar-hydration] Failed to load ${targetName} for org ${orgId}`, error);
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
			].filter((descriptor): descriptor is CalendarHydrationTargetDescriptor => descriptor !== undefined);

			await Promise.all(descriptors.map((descriptor) => applyDescriptor(descriptor, orgId)));
		}
	};
}

export const calendarWorkspaceHydrator = createCalendarWorkspaceHydrator();
