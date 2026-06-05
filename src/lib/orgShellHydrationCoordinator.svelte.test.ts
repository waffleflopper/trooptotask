import { describe, expect, it, vi } from 'vitest';
import { createOrgShellHydrationCoordinator } from '$lib/orgShellHydrationCoordinator.svelte';
import type { AssignmentType, DailyAssignment } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import type { HydrationPlan } from '$lib/server/core/orgShell';
import type { HydrationStores } from '$lib/orgShellCoordinator';

interface Deferred<T> {
	promise: Promise<T>;
	resolve(value: T): void;
	reject(error: unknown): void;
}

function createDeferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function createLoadable<T>(config: { orgId?: string; items?: T[] } = {}) {
	return {
		orgId: config.orgId ?? '',
		items: config.items ?? [],
		loadCalls: [] as Array<{ items: T[]; orgId: string }>,
		startLoadingCalls: 0,
		load(items: T[], orgId: string) {
			this.items = items;
			this.orgId = orgId;
			this.loadCalls.push({ items, orgId });
		},
		startLoading() {
			this.startLoadingCalls += 1;
		}
	};
}

function createCalendarAssignmentsStore(config: Partial<HydrationStores['calendarAssignmentsStore']> = {}) {
	return {
		orgId: config.orgId ?? '',
		types: config.types ?? [],
		assignments: config.assignments ?? [],
		loadCalls: [] as Array<{ types: AssignmentType[]; assignments: DailyAssignment[]; orgId: string }>,
		startLoadingCalls: 0,
		load(types: AssignmentType[], assignments: DailyAssignment[], orgId: string) {
			this.types = types;
			this.assignments = assignments;
			this.orgId = orgId;
			this.loadCalls.push({ types, assignments, orgId });
		},
		startLoading() {
			this.startLoadingCalls += 1;
		}
	};
}

function createOnboardingTemplatesStore() {
	return {
		orgId: '',
		templates: [] as unknown[],
		steps: [] as unknown[],
		loadCalls: [] as Array<{ templates: unknown[]; steps: unknown[]; orgId: string }>,
		load(templates: unknown[], steps: unknown[], orgId: string) {
			this.templates = templates;
			this.steps = steps;
			this.orgId = orgId;
			this.loadCalls.push({ templates, steps, orgId });
		}
	};
}

function createHydrationStores(overrides: Partial<HydrationStores> = {}) {
	const stores = {
		personnelStore: createLoadable(),
		groupsStore: createLoadable<Group>(),
		statusTypesStore: createLoadable(),
		availabilityEntriesStore: createLoadable(),
		specialDaysStore: createLoadable(),
		calendarAssignmentsStore: createCalendarAssignmentsStore(),
		trainingTypesStore: createLoadable(),
		trainingViewsStore: createLoadable(),
		personnelTrainingsStore: createLoadable(),
		pinnedGroupsStore: createLoadable<string>(),
		ratingSchemeStore: createLoadable(),
		onboardingTemplateStore: createOnboardingTemplatesStore(),
		onboardingStore: createLoadable(),
		...overrides
	};

	return stores as unknown as HydrationStores;
}

const group = (id: string, name = id, sortOrder = 0): Group => ({ id, name, sortOrder });

function asGroupStore(store: ReturnType<typeof createLoadable<Group>>): HydrationStores['groupsStore'] {
	return store as unknown as HydrationStores['groupsStore'];
}

describe('createOrgShellHydrationCoordinator', () => {
	it('treats missing plans and missing targets as no-ops', async () => {
		const coordinator = createOrgShellHydrationCoordinator();
		const groupsStore = createLoadable<Group>();
		const stores = createHydrationStores({ groupsStore: asGroupStore(groupsStore) });

		await coordinator.hydrate(undefined, stores);
		await coordinator.hydrate({ orgId: 'org-1' }, stores);

		expect(groupsStore.loadCalls).toHaveLength(0);
	});

	it('skips an already-applied snapshot for the same org and can apply it again after reset', async () => {
		const coordinator = createOrgShellHydrationCoordinator();
		const groupsStore = createLoadable<Group>();
		const stores = createHydrationStores({ groupsStore: asGroupStore(groupsStore) });
		const plan: HydrationPlan = {
			orgId: 'org-1',
			groups: {
				mode: 'replace',
				snapshotKey: 'groups:v1',
				items: [group('group-1')]
			}
		};

		await coordinator.hydrate(plan, stores);
		await coordinator.hydrate(plan, stores);
		coordinator.reset();
		await coordinator.hydrate(plan, stores);

		expect(groupsStore.loadCalls).toHaveLength(2);
	});

	it('deduplicates a second concurrent hydration for the same pending snapshot', async () => {
		const coordinator = createOrgShellHydrationCoordinator();
		const groupsStore = createLoadable<Group>();
		const stores = createHydrationStores({ groupsStore: asGroupStore(groupsStore) });
		const groups = createDeferred<Group[]>();
		const plan: HydrationPlan = {
			orgId: 'org-1',
			groups: {
				mode: 'replace',
				snapshotKey: 'groups:v1',
				items: groups.promise
			}
		};

		const first = coordinator.hydrate(plan, stores);
		const second = coordinator.hydrate(plan, stores);
		groups.resolve([group('group-1')]);
		await Promise.all([first, second]);

		expect(groupsStore.startLoadingCalls).toBe(1);
		expect(groupsStore.loadCalls).toHaveLength(1);
	});

	it('drops a stale async resolve after a newer pending snapshot supersedes it', async () => {
		const coordinator = createOrgShellHydrationCoordinator();
		const groupsStore = createLoadable<Group>();
		const stores = createHydrationStores({ groupsStore: asGroupStore(groupsStore) });
		const staleGroups = createDeferred<Group[]>();
		const latestGroups = createDeferred<Group[]>();

		const stale = coordinator.hydrate(
			{
				orgId: 'org-1',
				groups: { mode: 'replace', snapshotKey: 'groups:old', items: staleGroups.promise }
			},
			stores
		);
		const latest = coordinator.hydrate(
			{
				orgId: 'org-1',
				groups: { mode: 'replace', snapshotKey: 'groups:new', items: latestGroups.promise }
			},
			stores
		);

		staleGroups.resolve([group('old')]);
		latestGroups.resolve([group('new')]);
		await Promise.all([stale, latest]);

		expect(groupsStore.loadCalls).toHaveLength(1);
		expect(groupsStore.items).toEqual([group('new')]);
	});

	it('does not let a stale async rejection clear a newer pending snapshot', async () => {
		const coordinator = createOrgShellHydrationCoordinator();
		const groupsStore = createLoadable<Group>();
		const stores = createHydrationStores({ groupsStore: asGroupStore(groupsStore) });
		const staleGroups = createDeferred<Group[]>();
		const latestGroups = createDeferred<Group[]>();
		const error = new Error('stale load failed');
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		try {
			const stale = coordinator.hydrate(
				{
					orgId: 'org-1',
					groups: { mode: 'replace', snapshotKey: 'groups:old', items: staleGroups.promise }
				},
				stores
			);
			const latest = coordinator.hydrate(
				{
					orgId: 'org-1',
					groups: { mode: 'replace', snapshotKey: 'groups:new', items: latestGroups.promise }
				},
				stores
			);

			staleGroups.reject(error);
			await expect(stale).rejects.toThrow(error);
			latestGroups.resolve([group('new')]);
			await latest;
		} finally {
			consoleError.mockRestore();
		}

		expect(groupsStore.startLoadingCalls).toBe(2);
		expect(groupsStore.loadCalls).toHaveLength(1);
		expect(groupsStore.items).toEqual([group('new')]);
	});

	it('honors replace, merge, preserve-client, and merge bypass behavior for generic stores', async () => {
		const coordinator = createOrgShellHydrationCoordinator();
		const groupsStore = createLoadable<Group>({
			orgId: 'org-1',
			items: [group('group-1', 'old', 1), group('group-2', 'old', 2)]
		});
		const pinnedGroupsStore = createLoadable<string>({ orgId: 'org-1', items: ['pin-1'] });
		const stores = createHydrationStores({
			groupsStore: asGroupStore(groupsStore),
			pinnedGroupsStore: pinnedGroupsStore as HydrationStores['pinnedGroupsStore']
		});

		await coordinator.hydrate(
			{
				orgId: 'org-1',
				groups: {
					mode: 'merge',
					snapshotKey: 'groups:merge',
					items: [group('group-2', 'new', 20), group('group-3', 'new', 30)]
				}
			},
			stores
		);
		await coordinator.hydrate(
			{
				orgId: 'org-1',
				groups: {
					mode: 'replace',
					snapshotKey: 'groups:replace',
					items: [group('group-4', 'new', 40)]
				}
			},
			stores
		);
		await coordinator.hydrate(
			{
				orgId: 'org-1',
				groups: {
					mode: 'preserve-client',
					snapshotKey: 'groups:preserve',
					items: [group('group-5', 'new', 50)]
				},
				pinnedGroups: {
					mode: 'merge',
					snapshotKey: 'pinned:strings',
					items: ['pin-2']
				}
			},
			stores
		);

		expect(groupsStore.loadCalls[0]?.items).toEqual([
			group('group-1', 'old', 1),
			group('group-2', 'new', 20),
			group('group-3', 'new', 30)
		]);
		expect(groupsStore.loadCalls[1]?.items).toEqual([group('group-4', 'new', 40)]);
		expect(groupsStore.loadCalls).toHaveLength(2);
		expect(pinnedGroupsStore.loadCalls[0]?.items).toEqual(['pin-2']);
	});

	it('bypasses merge when a generic store belongs to a different org', async () => {
		const coordinator = createOrgShellHydrationCoordinator();
		const groupsStore = createLoadable<Group>({ orgId: 'org-2', items: [group('group-1', 'old')] });
		const stores = createHydrationStores({ groupsStore: asGroupStore(groupsStore) });

		await coordinator.hydrate(
			{
				orgId: 'org-1',
				groups: {
					mode: 'merge',
					snapshotKey: 'groups:merge',
					items: [group('group-2', 'new')]
				}
			},
			stores
		);

		expect(groupsStore.loadCalls[0]?.items).toEqual([group('group-2', 'new')]);
	});

	it('range-merges calendar assignments by keeping out-of-window assignments and replacing in-window assignments', async () => {
		const coordinator = createOrgShellHydrationCoordinator();
		const existingOutside = { id: 'assignment-outside', date: '2024-01-05' };
		const existingInside = { id: 'assignment-inside-old', date: '2024-01-15' };
		const incomingInside = { id: 'assignment-inside-new', date: '2024-01-16' };
		const assignmentTypes = [{ id: 'type-1' }] as AssignmentType[];
		const calendarAssignmentsStore = createCalendarAssignmentsStore({
			orgId: 'org-1',
			assignments: [existingOutside, existingInside] as HydrationStores['calendarAssignmentsStore']['assignments']
		});
		const stores = createHydrationStores({
			calendarAssignmentsStore: calendarAssignmentsStore as HydrationStores['calendarAssignmentsStore']
		});

		await coordinator.hydrate(
			{
				orgId: 'org-1',
				calendarAssignments: {
					mode: 'merge',
					snapshotKey: 'calendar:v1',
					rangeStart: '2024-01-10',
					rangeEnd: '2024-01-20',
					items: {
						types: assignmentTypes,
						assignments: [incomingInside] as DailyAssignment[]
					}
				}
			},
			stores
		);

		expect(calendarAssignmentsStore.loadCalls[0]?.assignments).toEqual([existingOutside, incomingInside]);
		expect(calendarAssignmentsStore.loadCalls[0]?.types).toEqual(assignmentTypes);
	});

	it('loads onboarding templates and steps through the two-array store interface', async () => {
		const coordinator = createOrgShellHydrationCoordinator();
		const onboardingTemplateStore = createOnboardingTemplatesStore();
		const stores = createHydrationStores({
			onboardingTemplateStore: onboardingTemplateStore as HydrationStores['onboardingTemplateStore']
		});
		const templates = [{ id: 'template-1' }];
		const steps = [{ id: 'step-1', templateId: 'template-1' }];

		await coordinator.hydrate(
			{
				orgId: 'org-1',
				onboardingTemplates: {
					mode: 'replace',
					snapshotKey: 'onboarding-templates:v1',
					templates: templates as Parameters<HydrationStores['onboardingTemplateStore']['load']>[0],
					steps: steps as Parameters<HydrationStores['onboardingTemplateStore']['load']>[1]
				}
			},
			stores
		);

		expect(onboardingTemplateStore.loadCalls).toEqual([{ templates, steps, orgId: 'org-1' }]);
	});

	it('clears pending state, rethrows, and does not mark an async failure as applied', async () => {
		const coordinator = createOrgShellHydrationCoordinator();
		const groupsStore = createLoadable<Group>();
		const stores = createHydrationStores({ groupsStore: asGroupStore(groupsStore) });
		const groups = createDeferred<Group[]>();
		const error = new Error('load failed');
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		try {
			const failedHydration = coordinator.hydrate(
				{
					orgId: 'org-1',
					groups: {
						mode: 'replace',
						snapshotKey: 'groups:v1',
						items: groups.promise
					}
				},
				stores
			);
			groups.reject(error);
			await expect(failedHydration).rejects.toThrow(error);

			await coordinator.hydrate(
				{
					orgId: 'org-1',
					groups: {
						mode: 'replace',
						snapshotKey: 'groups:v1',
						items: [group('group-1')]
					}
				},
				stores
			);
		} finally {
			consoleError.mockRestore();
		}

		expect(groupsStore.startLoadingCalls).toBe(1);
		expect(groupsStore.loadCalls).toHaveLength(1);
		expect(groupsStore.items).toEqual([group('group-1')]);
	});
});
