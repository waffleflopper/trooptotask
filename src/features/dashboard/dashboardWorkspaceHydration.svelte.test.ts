import { describe, expect, it } from 'vitest';
import type { Group } from '$lib/stores/groups.svelte';
import type { TrainingType } from '$features/training/training.types';
import type { AssignmentType, AvailabilityEntry, DailyAssignment, Personnel, StatusType } from '$lib/types';
import { createDashboardWorkspaceHydrator, type DashboardHydrationStores } from './dashboardWorkspaceHydration.svelte';
import type { DashboardWorkspaceHydration } from './server/dashboardWorkspaceBootstrap';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

function createLoadable<T>() {
	let orgId = '';
	let items: T[] = [];
	let loading = false;
	return {
		get orgId() {
			return orgId;
		},
		get items() {
			return items;
		},
		get loading() {
			return loading;
		},
		loadCount: 0,
		load(nextItems: T[], nextOrgId: string) {
			items = nextItems;
			orgId = nextOrgId;
			loading = false;
			this.loadCount += 1;
		},
		startLoading() {
			loading = true;
		}
	};
}

function createCalendarAssignmentsLoadable() {
	let orgId = '';
	let types: AssignmentType[] = [];
	let assignments: DailyAssignment[] = [];
	let loading = false;
	return {
		get orgId() {
			return orgId;
		},
		get types() {
			return types;
		},
		get assignments() {
			return assignments;
		},
		get loading() {
			return loading;
		},
		loadCount: 0,
		load(typesNext: AssignmentType[], assignmentsNext: DailyAssignment[], nextOrgId: string) {
			types = typesNext;
			assignments = assignmentsNext;
			orgId = nextOrgId;
			loading = false;
			this.loadCount += 1;
		},
		startLoading() {
			loading = true;
		}
	};
}

function createStores() {
	return {
		personnelStore: createLoadable<Personnel>(),
		groupsStore: createLoadable<Group>(),
		statusTypesStore: createLoadable<StatusType>(),
		availabilityEntriesStore: createLoadable<AvailabilityEntry>(),
		calendarAssignmentsStore: createCalendarAssignmentsLoadable(),
		trainingTypesStore: createLoadable<TrainingType>(),
		pinnedGroupsStore: createLoadable<string>()
	} satisfies DashboardHydrationStores;
}

describe('Dashboard workspace hydration adapter', () => {
	it('hydrates explicit Dashboard targets through the adapter interface', async () => {
		const stores = createStores();
		const availability = deferred<AvailabilityEntry[]>();
		const assignments = deferred<{ types: AssignmentType[]; assignments: DailyAssignment[] }>();
		const assignmentType = { id: 'at1', name: 'CQ' } as AssignmentType;
		const assignment = { id: 'da1', date: '2026-05-01', assignmentTypeId: 'at1' } as DailyAssignment;
		const hydration: DashboardWorkspaceHydration = {
			orgId: 'org-1',
			personnel: { mode: 'replace', snapshotKey: 'personnel:1', items: [{ id: 'p1' } as Personnel] },
			groups: { mode: 'replace', snapshotKey: 'groups:1', items: [{ id: 'g1', name: 'Alpha' } as Group] },
			statusTypes: { mode: 'replace', snapshotKey: 'status-types:1', items: [{ id: 'st1' } as StatusType] },
			availabilityEntries: {
				mode: 'replace',
				deferred: true,
				snapshotKey: 'availability:1',
				items: availability.promise
			},
			calendarAssignments: {
				mode: 'replace',
				deferred: true,
				snapshotKey: 'assignments:1',
				items: assignments.promise
			},
			trainingTypes: { mode: 'replace', snapshotKey: 'training-types:1', items: [{ id: 'tt1' } as TrainingType] },
			pinnedGroups: { mode: 'replace', snapshotKey: 'pinned:1', items: ['Alpha'] }
		};

		const pending = createDashboardWorkspaceHydrator().hydrate(hydration, stores);

		expect(stores.personnelStore.items).toEqual([{ id: 'p1' }]);
		expect(stores.availabilityEntriesStore.loading).toBe(true);
		expect(stores.calendarAssignmentsStore.loading).toBe(true);

		availability.resolve([{ id: 'av1', personnelId: 'p1' } as AvailabilityEntry]);
		assignments.resolve({ types: [assignmentType], assignments: [assignment] });
		await pending;

		expect(stores.availabilityEntriesStore.items).toEqual([{ id: 'av1', personnelId: 'p1' }]);
		expect(stores.calendarAssignmentsStore.types).toEqual([assignmentType]);
		expect(stores.calendarAssignmentsStore.assignments).toEqual([assignment]);
		expect(stores.calendarAssignmentsStore.orgId).toBe('org-1');
		expect(stores.pinnedGroupsStore.items).toEqual(['Alpha']);
	});
});
