import { describe, expect, it, vi } from 'vitest';
import type { Group } from '$lib/stores/groups.svelte';
import type { AssignmentType, AvailabilityEntry, DailyAssignment, Personnel, SpecialDay, StatusType } from '$lib/types';
import { createCalendarWorkspaceHydrator, type CalendarHydrationStores } from './calendarWorkspaceHydration.svelte';
import type { CalendarWorkspaceHydration } from './server/calendarWorkspaceBootstrap';

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

function createCalendarAssignmentsLoadable() {
	let orgId = '';
	let types: AssignmentType[] = [];
	let assignments: DailyAssignment[] = [];
	let loading = false;
	let loadCount = 0;
	let startLoadingCount = 0;
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
		get loadCount() {
			return loadCount;
		},
		get startLoadingCount() {
			return startLoadingCount;
		},
		load(nextTypes: AssignmentType[], nextAssignments: DailyAssignment[], nextOrgId: string) {
			loadCount += 1;
			types = nextTypes;
			assignments = nextAssignments;
			orgId = nextOrgId;
			loading = false;
		},
		startLoading() {
			startLoadingCount += 1;
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
		specialDaysStore: createLoadable<SpecialDay>(),
		calendarAssignmentsStore: createCalendarAssignmentsLoadable(),
		pinnedGroupsStore: createLoadable<string>()
	} satisfies CalendarHydrationStores;
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((innerResolve, innerReject) => {
		resolve = innerResolve;
		reject = innerReject;
	});

	return { promise, resolve, reject };
}

function preserveClientHydration(overrides: Partial<CalendarWorkspaceHydration> = {}): CalendarWorkspaceHydration {
	return {
		orgId: 'org-1',
		personnel: { mode: 'preserve-client', snapshotKey: 'personnel:preserve', items: [] },
		groups: { mode: 'preserve-client', snapshotKey: 'groups:preserve', items: [] },
		statusTypes: { mode: 'preserve-client', snapshotKey: 'status-types:preserve', items: [] },
		availabilityEntries: { mode: 'preserve-client', snapshotKey: 'availability:preserve', items: [] },
		specialDays: { mode: 'preserve-client', snapshotKey: 'special-days:preserve', items: [] },
		calendarAssignments: {
			mode: 'preserve-client',
			snapshotKey: 'assignments:preserve',
			items: { types: [], assignments: [] }
		},
		pinnedGroups: { mode: 'preserve-client', snapshotKey: 'pinned:preserve', items: [] },
		...overrides
	};
}

describe('Calendar workspace hydration adapter', () => {
	it('hydrates explicit Calendar targets and preserves range-aware merge behavior', async () => {
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
			personnel: { mode: 'replace', snapshotKey: 'personnel:1', items: [] },
			groups: { mode: 'replace', snapshotKey: 'groups:1', items: [] },
			statusTypes: { mode: 'replace', snapshotKey: 'status-types:1', items: [] },
			availabilityEntries: { mode: 'merge', snapshotKey: 'availability:1', items: [incomingAvailability] },
			specialDays: { mode: 'merge', snapshotKey: 'special-days:1', items: [incomingSpecialDay] },
			calendarAssignments: {
				mode: 'merge',
				snapshotKey: 'assignments:1',
				rangeStart: '2026-05-01',
				rangeEnd: '2026-05-31',
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

	it('deduplicates an in-flight snapshot for the same org and target', async () => {
		const stores = createStores();
		const hydrator = createCalendarWorkspaceHydrator();
		const availability = {
			id: 'av-deferred',
			personnelId: 'p1',
			startDate: '2026-05-01',
			endDate: '2026-05-01'
		} as AvailabilityEntry;
		const availabilityDeferred = deferred<AvailabilityEntry[]>();
		const hydration = preserveClientHydration({
			availabilityEntries: {
				mode: 'merge',
				snapshotKey: 'availability:deferred',
				items: availabilityDeferred.promise
			}
		});

		const firstHydration = hydrator.hydrate(hydration, stores);
		const secondHydration = hydrator.hydrate(hydration, stores);

		expect(stores.availabilityEntriesStore.startLoadingCount).toBe(1);

		availabilityDeferred.resolve([availability]);
		await Promise.all([firstHydration, secondHydration]);

		expect(stores.availabilityEntriesStore.loadCount).toBe(1);
		expect(stores.availabilityEntriesStore.items).toEqual([availability]);
	});

	it('skips stale deferred data when a newer snapshot wins the same target', async () => {
		const stores = createStores();
		const hydrator = createCalendarWorkspaceHydrator();
		const staleAvailability = {
			id: 'av-stale',
			personnelId: 'p1',
			startDate: '2026-05-01',
			endDate: '2026-05-01'
		} as AvailabilityEntry;
		const freshAvailability = {
			id: 'av-fresh',
			personnelId: 'p2',
			startDate: '2026-06-01',
			endDate: '2026-06-01'
		} as AvailabilityEntry;
		const staleDeferred = deferred<AvailabilityEntry[]>();
		const freshDeferred = deferred<AvailabilityEntry[]>();

		const staleHydration = preserveClientHydration({
			availabilityEntries: {
				mode: 'merge',
				snapshotKey: 'availability:stale',
				items: staleDeferred.promise
			}
		});
		const freshHydration = preserveClientHydration({
			availabilityEntries: {
				mode: 'merge',
				snapshotKey: 'availability:fresh',
				items: freshDeferred.promise
			}
		});

		const staleRun = hydrator.hydrate(staleHydration, stores);
		const freshRun = hydrator.hydrate(freshHydration, stores);

		freshDeferred.resolve([freshAvailability]);
		await freshRun;

		staleDeferred.resolve([staleAvailability]);
		await staleRun;

		expect(stores.availabilityEntriesStore.items).toEqual([freshAvailability]);
		expect(stores.availabilityEntriesStore.loadCount).toBe(1);
	});

	it('does not apply deferred data after the backing store moved to another org', async () => {
		const stores = createStores();
		const availability = {
			id: 'av-old-org',
			personnelId: 'p1',
			startDate: '2026-05-01',
			endDate: '2026-05-01'
		} as AvailabilityEntry;
		const availabilityDeferred = deferred<AvailabilityEntry[]>();
		const hydration = preserveClientHydration({
			availabilityEntries: {
				mode: 'merge',
				snapshotKey: 'availability:org-1',
				items: availabilityDeferred.promise
			}
		});

		const hydrateRun = createCalendarWorkspaceHydrator().hydrate(hydration, stores);
		stores.availabilityEntriesStore.load([], 'org-2');
		availabilityDeferred.resolve([availability]);
		await hydrateRun;

		expect(stores.availabilityEntriesStore.orgId).toBe('org-2');
		expect(stores.availabilityEntriesStore.items).toEqual([]);
	});

	it('cleans up rejected deferred snapshots so a later retry can apply', async () => {
		const stores = createStores();
		const hydrator = createCalendarWorkspaceHydrator();
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const availability = {
			id: 'av-retry',
			personnelId: 'p1',
			startDate: '2026-05-01',
			endDate: '2026-05-01'
		} as AvailabilityEntry;
		const rejectedDeferred = deferred<AvailabilityEntry[]>();
		const rejectedHydration = preserveClientHydration({
			availabilityEntries: {
				mode: 'merge',
				snapshotKey: 'availability:retry',
				items: rejectedDeferred.promise
			}
		});
		const retryHydration = preserveClientHydration({
			availabilityEntries: {
				mode: 'merge',
				snapshotKey: 'availability:retry',
				items: [availability]
			}
		});

		const rejectedRun = hydrator.hydrate(rejectedHydration, stores);
		rejectedDeferred.reject(new Error('network failed'));
		await expect(rejectedRun).rejects.toThrow('network failed');

		await hydrator.hydrate(retryHydration, stores);

		expect(stores.availabilityEntriesStore.items).toEqual([availability]);
		consoleErrorSpy.mockRestore();
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
});
