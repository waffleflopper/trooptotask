import { describe, expect, it } from 'vitest';
import type { Group } from '$features/personnel/contracts';
import type { Personnel } from '$features/personnel/contracts';
import type {
	AssignmentType,
	AvailabilityEntry,
	SpecialDay,
	StatusType,
	DailyAssignment
} from '$features/calendar/contracts';
import { createMockAdapter, createStore } from '$lib/stores/core';
import { createCalendarWorkspaceHydrator, type CalendarHydrationStores } from './calendarWorkspaceHydration.svelte';
import type { CalendarWorkspaceHydration } from './calendar.types';

function createLoadable<T>() {
	let orgId = '';
	let items: T[] = [];
	let loading = false;
	let loadCount = 0;
	let startLoadingCount = 0;
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
		get loadCount() {
			return loadCount;
		},
		get startLoadingCount() {
			return startLoadingCount;
		},
		load(nextItems: T[], nextOrgId: string) {
			loadCount += 1;
			items = nextItems;
			orgId = nextOrgId;
			loading = false;
		},
		startLoading() {
			startLoadingCount += 1;
			loading = true;
		}
	};
}

function createRangeLoadable<T extends { id: string }>() {
	const store = createStore<T>({ resource: 'calendar-rows', adapter: createMockAdapter<T>({}) });
	let loadCount = 0;
	return {
		get orgId() {
			return store.orgId;
		},
		get loadVersion() {
			return store.loadVersion;
		},
		get items() {
			return store.items;
		},
		get loading() {
			return store.loading;
		},
		get loadCount() {
			return loadCount;
		},
		load(nextItems: T[], nextOrgId: string) {
			loadCount += 1;
			store.load(nextItems, nextOrgId);
		},
		startLoading: () => store.startLoading(),
		beginRead: () => store.beginRead()
	};
}

function createCalendarAssignmentsLoadable() {
	const rows = createRangeLoadable<DailyAssignment>();
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
		get loadCount() {
			return rows.loadCount;
		},
		load(nextTypes: AssignmentType[], nextAssignments: DailyAssignment[], nextOrgId: string) {
			types = nextTypes;
			rows.load(nextAssignments, nextOrgId);
		},
		startLoading: rows.startLoading,
		beginRead: rows.beginRead
	};
}

function createStores() {
	return {
		personnelStore: createLoadable<Personnel>(),
		groupsStore: createLoadable<Group>(),
		statusTypesStore: createRangeLoadable<StatusType>(),
		availabilityEntriesStore: createRangeLoadable<AvailabilityEntry>(),
		specialDaysStore: createRangeLoadable<SpecialDay>(),
		calendarAssignmentsStore: createCalendarAssignmentsLoadable(),
		pinnedGroupsStore: createLoadable<string>()
	} satisfies CalendarHydrationStores;
}

const MAY = { rangeStart: '2026-05-01', rangeEnd: '2026-05-31' };

function preserveClientHydration(overrides: Partial<CalendarWorkspaceHydration> = {}): CalendarWorkspaceHydration {
	return {
		orgId: 'org-1',
		confirmedChangesByTab: {},
		personnel: { mode: 'preserve-client', snapshotKey: 'personnel:preserve', items: [] },
		groups: { mode: 'preserve-client', snapshotKey: 'groups:preserve', items: [] },
		statusTypes: { mode: 'preserve-client', snapshotKey: 'status-types:preserve', items: [] },
		availabilityEntries: { mode: 'preserve-client', snapshotKey: 'availability:preserve', items: [], range: MAY },
		specialDays: { mode: 'preserve-client', snapshotKey: 'special-days:preserve', items: [], range: MAY },
		calendarAssignments: {
			mode: 'preserve-client',
			snapshotKey: 'assignments:preserve',
			items: { types: [], assignments: [] },
			range: MAY
		},
		pinnedGroups: { mode: 'preserve-client', snapshotKey: 'pinned:preserve', items: [] },
		...overrides
	};
}

describe('Calendar workspace hydration adapter', () => {
	it('replaces range targets within their range and keeps rows outside it', async () => {
		const stores = createStores();
		const existingAvailability = {
			id: 'av-existing',
			personnelId: 'p1',
			startDate: '2026-04-01',
			endDate: '2026-04-01'
		} as AvailabilityEntry;
		const incomingAvailability = {
			id: 'av-incoming',
			personnelId: 'p2',
			startDate: '2026-05-01',
			endDate: '2026-05-01'
		} as AvailabilityEntry;
		const existingSpecialDay = { id: 'sd-existing', name: 'Existing', date: '2026-04-01' } as SpecialDay;
		const incomingSpecialDay = { id: 'sd-incoming', name: 'Incoming', date: '2026-05-01' } as SpecialDay;
		const outsideAssignment = {
			id: 'da-outside',
			date: '2026-04-30',
			assignmentTypeId: 'at1',
			assigneeId: 'p1'
		} as DailyAssignment;
		const replacedInsideAssignment = {
			id: 'da-replaced',
			date: '2026-05-03',
			assignmentTypeId: 'at1',
			assigneeId: 'p1'
		} as DailyAssignment;
		const incomingAssignment = {
			id: 'da-incoming',
			date: '2026-05-03',
			assignmentTypeId: 'at1',
			assigneeId: 'p2'
		} as DailyAssignment;
		const assignmentType = { id: 'at1', name: 'CQ' } as AssignmentType;

		stores.availabilityEntriesStore.load([existingAvailability], 'org-1');
		stores.specialDaysStore.load([existingSpecialDay], 'org-1');
		stores.calendarAssignmentsStore.load([assignmentType], [outsideAssignment, replacedInsideAssignment], 'org-1');

		const hydration: CalendarWorkspaceHydration = {
			orgId: 'org-1',
			confirmedChangesByTab: {},
			personnel: { mode: 'replace', snapshotKey: 'personnel:1', items: [] },
			groups: { mode: 'replace', snapshotKey: 'groups:1', items: [] },
			statusTypes: { mode: 'replace', snapshotKey: 'status-types:1', items: [] },
			availabilityEntries: { mode: 'range', snapshotKey: 'availability:1', items: [incomingAvailability], range: MAY },
			specialDays: { mode: 'range', snapshotKey: 'special-days:1', items: [incomingSpecialDay], range: MAY },
			calendarAssignments: {
				mode: 'range',
				snapshotKey: 'assignments:1',
				range: MAY,
				items: {
					types: [assignmentType],
					assignments: [incomingAssignment]
				}
			},
			pinnedGroups: { mode: 'replace', snapshotKey: 'pinned:1', items: ['Alpha'] }
		};

		await createCalendarWorkspaceHydrator().hydrate(hydration, stores);

		expect(stores.availabilityEntriesStore.items).toEqual([existingAvailability, incomingAvailability]);
		expect(stores.specialDaysStore.items).toEqual([existingSpecialDay, incomingSpecialDay]);
		expect(stores.calendarAssignmentsStore.assignments).toEqual([outsideAssignment, incomingAssignment]);
		expect(stores.calendarAssignmentsStore.orgId).toBe('org-1');
		expect(stores.pinnedGroupsStore.items).toEqual(['Alpha']);
	});

	it('keeps a status edit confirmed while an older snapshot was in flight', async () => {
		const leave = { id: 'st-1', name: 'Leave' } as StatusType;
		const statusTypesStore = createStore<StatusType>({
			resource: 'status-types',
			adapter: createMockAdapter<StatusType>({ update: async (id, data) => ({ ...leave, ...data, id }) })
		});
		statusTypesStore.load([leave], 'org-1');
		const snapshot = Promise.withResolvers<StatusType[]>();

		const hydrating = createCalendarWorkspaceHydrator().hydrate(
			preserveClientHydration({
				statusTypes: { mode: 'replace', snapshotKey: 'status-types:1', items: snapshot.promise }
			}),
			{ ...createStores(), statusTypesStore }
		);
		await statusTypesStore.update('st-1', { name: 'Annual Leave' });
		snapshot.resolve([leave]);
		await hydrating;

		expect(statusTypesStore.items.map((type) => type.name)).toEqual(['Annual Leave']);
	});

	it('preserves client-owned targets without loading stores', async () => {
		const stores = createStores();
		const existingAvailability = {
			id: 'av-client',
			personnelId: 'p1',
			startDate: '2026-05-01',
			endDate: '2026-05-01'
		} as AvailabilityEntry;
		stores.availabilityEntriesStore.load([existingAvailability], 'org-1');

		await createCalendarWorkspaceHydrator().hydrate(preserveClientHydration(), stores);

		expect(stores.availabilityEntriesStore.items).toEqual([existingAvailability]);
		expect(stores.personnelStore.loadCount).toBe(0);
		expect(stores.groupsStore.loadCount).toBe(0);
		expect(stores.statusTypesStore.loadCount).toBe(0);
		expect(stores.specialDaysStore.loadCount).toBe(0);
		expect(stores.calendarAssignmentsStore.loadCount).toBe(0);
		expect(stores.pinnedGroupsStore.loadCount).toBe(0);
	});

	it('clears prior Calendar data and cancels pending hydration when access is revoked', async () => {
		const stores = createStores();
		const oldEntry = { id: 'old', personnelId: 'p1' } as AvailabilityEntry;
		const lateEntry = { id: 'late', personnelId: 'p1' } as AvailabilityEntry;
		stores.availabilityEntriesStore.load([oldEntry], 'org-1');
		stores.calendarAssignmentsStore.load([{ id: 'type-1' } as AssignmentType], [], 'org-1');
		stores.personnelStore.load([{ id: 'p1' } as Personnel], 'org-1');
		let resolveEntries!: (entries: AvailabilityEntry[]) => void;
		const entries = new Promise<AvailabilityEntry[]>((resolve) => {
			resolveEntries = resolve;
		});
		const hydrator = createCalendarWorkspaceHydrator();
		const pending = hydrator.hydrate(
			preserveClientHydration({
				availabilityEntries: { mode: 'range', snapshotKey: 'availability:late', items: entries, range: MAY }
			}),
			stores
		);
		expect(stores.availabilityEntriesStore.loading).toBe(true);

		hydrator.restrict(stores);
		resolveEntries([lateEntry]);
		await pending;

		expect(stores.availabilityEntriesStore.items).toEqual([]);
		expect(stores.availabilityEntriesStore.loading).toBe(false);
		expect(stores.calendarAssignmentsStore.types).toEqual([]);
		expect(stores.personnelStore.items).toEqual([]);
	});
});
