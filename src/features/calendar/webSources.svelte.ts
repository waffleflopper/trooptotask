import type { AssignmentType, AvailabilityEntry, StatusType, DailyAssignment } from './contracts';
import { availabilityStore } from './stores/availability.svelte';
import { dailyAssignmentsStore } from './stores/dailyAssignments.svelte';
import { statusTypesStore } from './stores/statusTypes.svelte';

/** Live Calendar facts for another feature's screen model. */
export const calendarStatusSource = {
	get items(): StatusType[] {
		return statusTypesStore.items;
	},
	get loading() {
		return statusTypesStore.loading;
	}
};

export const calendarAvailabilitySource = {
	get items(): AvailabilityEntry[] {
		return availabilityStore.items;
	},
	get loading() {
		return availabilityStore.loading;
	}
};

export const calendarAssignmentsSource = {
	get types(): AssignmentType[] {
		return dailyAssignmentsStore.types;
	},
	get assignments(): DailyAssignment[] {
		return dailyAssignmentsStore.assignments;
	},
	get loading() {
		return dailyAssignmentsStore.loading;
	}
};

/** Apply workspace snapshots through Calendar without exposing mutation methods. */
export const calendarStatusHydration = {
	get loadVersion() {
		return statusTypesStore.loadVersion;
	},
	get orgId() {
		return statusTypesStore.orgId;
	},
	load(items: StatusType[], orgId: string) {
		statusTypesStore.load(items, orgId);
	},
	startLoading() {
		statusTypesStore.startLoading();
	}
};

export const calendarAvailabilityHydration = {
	get loadVersion() {
		return availabilityStore.loadVersion;
	},
	get orgId() {
		return availabilityStore.orgId;
	},
	load(items: AvailabilityEntry[], orgId: string) {
		availabilityStore.load(items, orgId);
	},
	beginRead(since?: number) {
		return availabilityStore.beginRead(since);
	},
	startLoading() {
		availabilityStore.startLoading();
	}
};

export const calendarAssignmentsHydration = {
	get loadVersion() {
		return dailyAssignmentsStore.loadVersion;
	},
	get orgId() {
		return dailyAssignmentsStore.orgId;
	},
	load(types: AssignmentType[], assignments: DailyAssignment[], orgId: string) {
		dailyAssignmentsStore.load(types, assignments, orgId);
	},
	beginRead(since?: number) {
		return dailyAssignmentsStore.beginRead(since);
	},
	startLoading() {
		dailyAssignmentsStore.startLoading();
	}
};
