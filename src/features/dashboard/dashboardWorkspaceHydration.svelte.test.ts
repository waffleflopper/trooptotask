import { describe, expect, it, vi } from 'vitest';
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

function createHydration(
	overrides: Partial<DashboardWorkspaceHydration> = {},
	targetOverrides: {
		personnel?: Partial<DashboardWorkspaceHydration['personnel']>;
		availabilityEntries?: Partial<DashboardWorkspaceHydration['availabilityEntries']>;
		calendarAssignments?: Partial<DashboardWorkspaceHydration['calendarAssignments']>;
	} = {}
): DashboardWorkspaceHydration {
	return {
		orgId: 'org-1',
		personnel: {
			mode: 'replace',
			snapshotKey: 'personnel:1',
			items: [{ id: 'p1' } as Personnel],
			...targetOverrides.personnel
		},
		groups: { mode: 'replace', snapshotKey: 'groups:1', items: [] },
		statusTypes: { mode: 'replace', snapshotKey: 'status-types:1', items: [] },
		availabilityEntries: {
			mode: 'replace',
			snapshotKey: 'availability:1',
			items: [],
			...targetOverrides.availabilityEntries
		},
		calendarAssignments: {
			mode: 'replace',
			snapshotKey: 'assignments:1',
			items: { types: [], assignments: [] },
			...targetOverrides.calendarAssignments
		},
		trainingTypes: { mode: 'replace', snapshotKey: 'training-types:1', items: [] },
		pinnedGroups: { mode: 'replace', snapshotKey: 'pinned:1', items: [] },
		...overrides
	};
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

	it('ignores stale deferred Dashboard targets when another org hydration wins', async () => {
		const stores = createStores();
		const hydrator = createDashboardWorkspaceHydrator();
		const staleAvailability = deferred<AvailabilityEntry[]>();
		const freshAvailability = { id: 'fresh', personnelId: 'p2' } as AvailabilityEntry;
		const staleHydration: DashboardWorkspaceHydration = {
			orgId: 'org-old',
			personnel: { mode: 'replace', snapshotKey: 'old-personnel', items: [] },
			groups: { mode: 'replace', snapshotKey: 'old-groups', items: [] },
			statusTypes: { mode: 'replace', snapshotKey: 'old-status-types', items: [] },
			availabilityEntries: {
				mode: 'replace',
				deferred: true,
				snapshotKey: 'old-availability',
				items: staleAvailability.promise
			},
			calendarAssignments: {
				mode: 'replace',
				snapshotKey: 'old-assignments',
				items: { types: [], assignments: [] }
			},
			trainingTypes: { mode: 'replace', snapshotKey: 'old-training-types', items: [] },
			pinnedGroups: { mode: 'replace', snapshotKey: 'old-pinned', items: [] }
		};
		const freshHydration: DashboardWorkspaceHydration = {
			...staleHydration,
			orgId: 'org-new',
			availabilityEntries: {
				mode: 'replace',
				snapshotKey: 'new-availability',
				items: [freshAvailability]
			}
		};

		const stalePending = hydrator.hydrate(staleHydration, stores);
		await hydrator.hydrate(freshHydration, stores);
		staleAvailability.resolve([{ id: 'stale', personnelId: 'p1' } as AvailabilityEntry]);
		await stalePending;

		expect(stores.availabilityEntriesStore.orgId).toBe('org-new');
		expect(stores.availabilityEntriesStore.items).toEqual([freshAvailability]);
	});

	it('skips duplicate snapshots that are already applied for the same org', async () => {
		const stores = createStores();
		const hydrator = createDashboardWorkspaceHydrator();
		const hydration = createHydration();

		await hydrator.hydrate(hydration, stores);
		await hydrator.hydrate(hydration, stores);

		expect(stores.personnelStore.loadCount).toBe(1);
		expect(stores.availabilityEntriesStore.loadCount).toBe(1);
		expect(stores.calendarAssignmentsStore.loadCount).toBe(1);
	});

	it('dedupes concurrent hydration for the same pending snapshot', async () => {
		const stores = createStores();
		const hydrator = createDashboardWorkspaceHydrator();
		const availability = deferred<AvailabilityEntry[]>();
		const hydration = createHydration(
			{},
			{
				availabilityEntries: {
					deferred: true,
					snapshotKey: 'availability:pending',
					items: availability.promise
				}
			}
		);

		const firstPending = hydrator.hydrate(hydration, stores);
		const secondPending = hydrator.hydrate(hydration, stores);

		expect(stores.availabilityEntriesStore.loading).toBe(true);

		const availabilityItems = [{ id: 'av1', personnelId: 'p1' } as AvailabilityEntry];
		availability.resolve(availabilityItems);
		await Promise.all([firstPending, secondPending]);

		expect(stores.availabilityEntriesStore.loadCount).toBe(1);
		expect(stores.availabilityEntriesStore.items).toEqual(availabilityItems);
	});

	it('clears failed pending snapshots so the same target can retry', async () => {
		const stores = createStores();
		const hydrator = createDashboardWorkspaceHydrator();
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const failedHydration = createHydration(
			{},
			{
				availabilityEntries: {
					deferred: true,
					snapshotKey: 'availability:retry',
					items: Promise.reject(new Error('temporary failure'))
				}
			}
		);

		await expect(hydrator.hydrate(failedHydration, stores)).rejects.toThrow('temporary failure');

		const retryItems = [{ id: 'av-retry', personnelId: 'p1' } as AvailabilityEntry];
		await hydrator.hydrate(
			createHydration(
				{},
				{
					availabilityEntries: {
						deferred: true,
						snapshotKey: 'availability:retry',
						items: Promise.resolve(retryItems)
					}
				}
			),
			stores
		);

		expect(stores.availabilityEntriesStore.items).toEqual(retryItems);
		expect(stores.availabilityEntriesStore.loadCount).toBe(1);
		consoleError.mockRestore();
	});

	it('allows an applied snapshot to hydrate again after reset', async () => {
		const stores = createStores();
		const hydrator = createDashboardWorkspaceHydrator();
		const hydration = createHydration();

		await hydrator.hydrate(hydration, stores);
		hydrator.reset();
		await hydrator.hydrate(hydration, stores);

		expect(stores.personnelStore.loadCount).toBe(2);
		expect(stores.calendarAssignmentsStore.loadCount).toBe(2);
	});
});
