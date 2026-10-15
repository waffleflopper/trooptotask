// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { Group } from '$features/personnel/contracts';
import type { TrainingType } from '$features/training/contracts';
import type { Personnel } from '$features/personnel/contracts';
import type { AssignmentType, AvailabilityEntry, StatusType, DailyAssignment } from '$features/calendar/contracts';
import { createMockAdapter, createStore } from '$lib/stores/core';
import { confirmedChangesSentNow } from '$lib/test-support/confirmedChangeCookies';
import { createDashboardWorkspaceHydrator, type DashboardHydrationStores } from './dashboardWorkspaceHydration.svelte';
import type { DashboardWorkspaceHydration } from './contracts';

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

function createRangeStore<T extends { id: string }>() {
	return createStore<T>({
		resource: 'shared-calendar-rows',
		adapter: createMockAdapter<T>({ create: async (data) => ({ id: 'saved-1', ...data }) as T })
	});
}

function createCalendarAssignmentsLoadable() {
	const rows = createRangeStore<DailyAssignment>();
	let types: AssignmentType[] = [];
	return {
		get orgId() {
			return rows.orgId;
		},
		get loadVersion() {
			return rows.loadVersion;
		},
		get types() {
			return types;
		},
		get assignments() {
			return rows.items;
		},
		get loading() {
			return rows.loading;
		},
		load(typesNext: AssignmentType[], assignmentsNext: DailyAssignment[], nextOrgId: string) {
			types = typesNext;
			rows.load(assignmentsNext, nextOrgId);
		},
		beginRead: (since?: number) => rows.beginRead(since),
		startLoading: () => rows.startLoading()
	};
}

function createStores() {
	return {
		personnelStore: createLoadable<Personnel>(),
		groupsStore: createLoadable<Group>(),
		statusTypesStore: createLoadable<StatusType>(),
		availabilityEntriesStore: createRangeStore<AvailabilityEntry>(),
		calendarAssignmentsStore: createCalendarAssignmentsLoadable(),
		trainingTypesStore: createLoadable<TrainingType>(),
		pinnedGroupsStore: createLoadable<string>()
	} satisfies DashboardHydrationStores;
}

const DASHBOARD_RANGE = { rangeStart: '2026-04-30', rangeEnd: '2026-05-15' };

describe('Dashboard workspace hydration adapter', () => {
	it('hydrates explicit Dashboard targets through the adapter interface', async () => {
		const stores = createStores();
		const availability = deferred<AvailabilityEntry[]>();
		const assignments = deferred<{ types: AssignmentType[]; assignments: DailyAssignment[] }>();
		const assignmentType = { id: 'at1', name: 'CQ' } as AssignmentType;
		const assignment = { id: 'da1', date: '2026-05-01', assignmentTypeId: 'at1' } as DailyAssignment;
		const hydration: DashboardWorkspaceHydration = {
			orgId: 'org-1',
			confirmedChangesByTab: {},
			personnel: { mode: 'replace', snapshotKey: 'personnel:1', items: [{ id: 'p1' } as Personnel] },
			groups: { mode: 'replace', snapshotKey: 'groups:1', items: [{ id: 'g1', name: 'Alpha' } as Group] },
			statusTypes: { mode: 'replace', snapshotKey: 'status-types:1', items: [{ id: 'st1' } as StatusType] },
			availabilityEntries: {
				mode: 'range',
				deferred: true,
				snapshotKey: 'availability:1',
				items: availability.promise,
				range: DASHBOARD_RANGE
			},
			calendarAssignments: {
				mode: 'range',
				deferred: true,
				snapshotKey: 'assignments:1',
				items: assignments.promise,
				range: DASHBOARD_RANGE
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

	it("keeps Calendar's saves and rows outside its range when the shared stores reload", async () => {
		const stores = createStores();
		const december = {
			id: 'dec',
			personnelId: 'p1',
			startDate: '2026-12-04',
			endDate: '2026-12-04'
		} as AvailabilityEntry;
		const stale = {
			id: 'stale',
			personnelId: 'p1',
			startDate: '2026-05-01',
			endDate: '2026-05-01'
		} as AvailabilityEntry;
		stores.availabilityEntriesStore.load([december, stale], 'org-1');
		const availability = deferred<AvailabilityEntry[]>();
		const hydration: DashboardWorkspaceHydration = {
			orgId: 'org-1',
			confirmedChangesByTab: confirmedChangesSentNow(),
			personnel: { mode: 'preserve-client', snapshotKey: 'personnel', items: [] },
			groups: { mode: 'preserve-client', snapshotKey: 'groups', items: [] },
			statusTypes: { mode: 'preserve-client', snapshotKey: 'status-types', items: [] },
			availabilityEntries: {
				mode: 'range',
				snapshotKey: 'availability:2',
				items: availability.promise,
				range: DASHBOARD_RANGE
			},
			calendarAssignments: {
				mode: 'preserve-client',
				snapshotKey: 'assignments',
				items: { types: [], assignments: [] },
				range: DASHBOARD_RANGE
			},
			trainingTypes: { mode: 'preserve-client', snapshotKey: 'training-types', items: [] },
			pinnedGroups: { mode: 'preserve-client', snapshotKey: 'pinned', items: [] }
		};

		const saved = await stores.availabilityEntriesStore.add({
			personnelId: 'p1',
			statusTypeId: 'leave',
			startDate: '2026-05-02',
			endDate: '2026-05-02'
		});
		const pending = createDashboardWorkspaceHydrator().hydrate(hydration, stores);
		availability.resolve([]);
		await pending;

		expect(stores.availabilityEntriesStore.items).toEqual([december, saved]);
	});
});
