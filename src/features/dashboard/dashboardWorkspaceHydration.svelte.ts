import { SvelteMap } from 'svelte/reactivity';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import { groupsStore, type Group } from '$lib/stores/groups.svelte';
import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
import { rosterStore } from '$lib/stores/roster.svelte';
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

interface TargetSnapshotState {
	orgId: string;
	snapshotKey: string;
}

interface DashboardHydrationTargetDescriptor {
	targetName: string;
	snapshotKey: string;
	items: unknown | Promise<unknown>;
	storeOrgId(): string;
	startLoading?(): void;
	apply(resolved: unknown): void;
}

const defaultDashboardHydrationStores: DashboardHydrationStores = {
	personnelStore: rosterStore,
	groupsStore,
	statusTypesStore,
	availabilityEntriesStore: availabilityStore,
	calendarAssignmentsStore: dailyAssignmentsStore,
	trainingTypesStore,
	pinnedGroupsStore
};

function isPromiseLike<T>(value: unknown): value is Promise<T> {
	return !!value && typeof value === 'object' && typeof (value as { then?: unknown }).then === 'function';
}

function storeMovedToAnotherOrg(
	descriptor: DashboardHydrationTargetDescriptor,
	orgId: string,
	initialStoreOrgId: string
): boolean {
	const storeOrgId = descriptor.storeOrgId();
	return storeOrgId !== '' && storeOrgId !== orgId && storeOrgId !== initialStoreOrgId;
}

function createTargetDescriptor<T>(
	target: DashboardWorkspaceHydrationTarget<T>,
	store: DashboardHydrationLoadable<T>,
	orgId: string,
	targetName: string
): DashboardHydrationTargetDescriptor | undefined {
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
): DashboardHydrationTargetDescriptor | undefined {
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
): DashboardHydrationTargetDescriptor | undefined {
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
	const appliedSnapshotKeys = new SvelteMap<string, TargetSnapshotState>();
	const pendingSnapshotKeys = new SvelteMap<string, TargetSnapshotState>();

	async function applyDescriptor(descriptor: DashboardHydrationTargetDescriptor, orgId: string): Promise<void> {
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
				console.error(`[dashboard-hydration] Failed to load ${targetName} for org ${orgId}`, error);
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
			].filter((descriptor): descriptor is DashboardHydrationTargetDescriptor => descriptor !== undefined);

			await Promise.all(descriptors.map((descriptor) => applyDescriptor(descriptor, orgId)));
		}
	};
}

export const dashboardWorkspaceHydrator = createDashboardWorkspaceHydrator();
