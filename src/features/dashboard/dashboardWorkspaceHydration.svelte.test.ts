// @vitest-environment happy-dom
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import type { Group } from '$features/personnel/contracts';
import type { TrainingType } from '$features/training/contracts';
import type { Personnel } from '$features/personnel/contracts';
import type { AssignmentType, AvailabilityEntry, StatusType, DailyAssignment } from '$features/calendar/contracts';
import { createMockAdapter, createStore, endOrganizationLifetime } from '$lib/stores/core';
import { dailyAssignmentsStore } from '$features/calendar';
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

	it('drops a removed entry that continued an absence past the range, keeping unrelated later rows', async () => {
		const stores = createStores();
		const entry = (id: string, personnelId: string, startDate: string, endDate: string) =>
			({ id, personnelId, startDate, endDate }) as AvailabilityEntry;
		const deployment = entry('deployment', 'p1', '2026-05-10', '2026-05-20');
		const later = entry('later', 'p1', '2026-06-10', '2026-06-12');
		const otherPerson = entry('other', 'p2', '2026-05-21', '2026-05-23');
		stores.availabilityEntriesStore.load(
			[deployment, entry('removed', 'p1', '2026-05-21', '2026-05-25'), later, otherPerson],
			'org-1'
		);
		const hydration: DashboardWorkspaceHydration = {
			orgId: 'org-1',
			confirmedChangesByTab: confirmedChangesSentNow(),
			personnel: { mode: 'preserve-client', snapshotKey: 'personnel', items: [] },
			groups: { mode: 'preserve-client', snapshotKey: 'groups', items: [] },
			statusTypes: { mode: 'preserve-client', snapshotKey: 'status-types', items: [] },
			availabilityEntries: {
				mode: 'range',
				snapshotKey: 'availability:continued',
				items: [deployment],
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

		await createDashboardWorkspaceHydrator().hydrate(hydration, stores);

		expect(stores.availabilityEntriesStore.items).toEqual([later, otherPerson, deployment]);
	});

	it("lists only saved types' duty after a type deletion overtakes a Dashboard read", async () => {
		const today = '2026-05-01';
		const chargeOfQuarters = {
			id: 'cq',
			name: 'Charge of Quarters',
			shortName: 'CQ',
			assignTo: 'group',
			color: '#2563eb',
			poolRules: null,
			weekendMode: 'same',
			excusals: [],
			showOnCalendar: false,
			sortOrder: 0
		} satisfies AssignmentType;
		const runnerTeam = { ...chargeOfQuarters, id: 'rt', name: 'Runner Team', shortName: 'RT' };
		const cqDuty = { id: 'cq-duty', date: today, assignmentTypeId: 'cq', assigneeId: 'g1' };
		const runnerDutyByB = { id: 'runner-by-b', date: today, assignmentTypeId: 'rt', assigneeId: 'g1' };
		onTestFinished(() => {
			vi.unstubAllGlobals();
		});
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init?: RequestInit) =>
				Response.json(init?.method === 'DELETE' ? { success: true } : [chargeOfQuarters])
			)
		);
		const preserved = { mode: 'preserve-client' as const, items: [] };
		const dashboard = (snapshotKey: string, items: DashboardWorkspaceHydration['calendarAssignments']['items']) =>
			({
				orgId: 'org-1',
				confirmedChangesByTab: confirmedChangesSentNow(),
				personnel: { ...preserved, snapshotKey: 'personnel' },
				groups: { ...preserved, snapshotKey: 'groups' },
				statusTypes: { ...preserved, snapshotKey: 'status-types' },
				availabilityEntries: { ...preserved, snapshotKey: 'availability', range: DASHBOARD_RANGE },
				calendarAssignments: { mode: 'range', deferred: true, snapshotKey, items, range: DASHBOARD_RANGE },
				trainingTypes: { ...preserved, snapshotKey: 'training-types' },
				pinnedGroups: { ...preserved, snapshotKey: 'pinned' }
			}) satisfies DashboardWorkspaceHydration;
		endOrganizationLifetime();
		const hydrator = createDashboardWorkspaceHydrator();
		await hydrator.hydrate(
			dashboard('assignments:1', { types: [chargeOfQuarters, runnerTeam], assignments: [cqDuty] })
		);
		const late = deferred<{ types: AssignmentType[]; assignments: DailyAssignment[] }>();
		const pending = hydrator.hydrate(dashboard('assignments:2', late.promise));

		expect(await dailyAssignmentsStore.removeType('rt')).toBe(true);
		late.resolve({ types: [chargeOfQuarters, runnerTeam], assignments: [cqDuty, runnerDutyByB] });
		await pending;
		expect(dailyAssignmentsStore.types.map(({ id }) => id)).toEqual(['cq']);
		expect(dailyAssignmentsStore.assignments.map(({ id }) => id)).toEqual(['cq-duty']);
	});
});
