import { describe, expect, it } from 'vitest';
import type { Group } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';
import type { PersonnelTraining, TrainingType, TrainingView } from './training.types';
import { createTrainingWorkspaceHydrator, type TrainingHydrationStores } from './trainingWorkspaceHydration.svelte';
import type { TrainingWorkspaceHydration } from './server/trainingWorkspaceBootstrap';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
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

function createStores() {
	return {
		personnelStore: createLoadable<Personnel>(),
		groupsStore: createLoadable<Group>(),
		trainingTypesStore: createLoadable<TrainingType>(),
		trainingViewsStore: createLoadable<TrainingView>(),
		personnelTrainingsStore: createLoadable<PersonnelTraining>(),
		pinnedGroupsStore: createLoadable<string>()
	} satisfies TrainingHydrationStores;
}

describe('Training workspace hydration adapter', () => {
	it('hydrates explicit Training workspace targets through the adapter interface', async () => {
		const stores = createStores();
		const trainingType = { id: 'tt1', name: 'CPR' } as TrainingType;
		const personnelTraining = { id: 'pt1', personnelId: 'p1', trainingTypeId: 'tt1' } as PersonnelTraining;
		const personnel = { id: 'p1', firstName: 'John', lastName: 'Smith' } as Personnel;
		const group = { id: 'g1', name: 'Alpha', sortOrder: 0 } as Group;
		const trainingView = {
			id: 'tv1',
			name: 'All',
			columnIds: [],
			createdBy: 'user-1',
			createdAt: '2024-01-01',
			updatedAt: '2024-01-01'
		} as TrainingView;
		const deferredTrainings = deferred<PersonnelTraining[]>();
		const hydration: TrainingWorkspaceHydration = {
			orgId: 'org-1',
			personnel: { mode: 'replace', snapshotKey: 'personnel:1', items: [personnel] },
			groups: { mode: 'replace', snapshotKey: 'groups:1', items: [group] },
			trainingTypes: { mode: 'replace', snapshotKey: 'types:1', items: [trainingType] },
			trainingViews: { mode: 'replace', snapshotKey: 'views:1', items: [trainingView] },
			personnelTrainings: {
				mode: 'replace',
				deferred: true,
				snapshotKey: 'personnel-trainings:1',
				items: deferredTrainings.promise
			},
			pinnedGroups: { mode: 'replace', snapshotKey: 'pinned:1', items: ['Alpha'] }
		};

		const pending = createTrainingWorkspaceHydrator().hydrate(hydration, stores);

		expect(stores.trainingTypesStore.items).toEqual([trainingType]);
		expect(stores.personnelTrainingsStore.loading).toBe(true);

		deferredTrainings.resolve([personnelTraining]);
		await pending;

		expect(stores.personnelStore.items).toEqual([personnel]);
		expect(stores.groupsStore.items).toEqual([group]);
		expect(stores.trainingViewsStore.items).toEqual([trainingView]);
		expect(stores.personnelTrainingsStore.items).toEqual([personnelTraining]);
		expect(stores.pinnedGroupsStore.items).toEqual(['Alpha']);
		expect(stores.personnelTrainingsStore.orgId).toBe('org-1');
		expect(stores.personnelTrainingsStore.loading).toBe(false);
	});

	it('ignores stale deferred Training targets when a newer org hydration wins', async () => {
		const stores = createStores();
		const hydrator = createTrainingWorkspaceHydrator();
		const staleTrainings = deferred<PersonnelTraining[]>();
		const freshTraining = { id: 'fresh', personnelId: 'p2', trainingTypeId: 'tt1' } as PersonnelTraining;

		const staleHydration: TrainingWorkspaceHydration = {
			orgId: 'org-old',
			personnel: { mode: 'replace', snapshotKey: 'old-personnel', items: [] },
			groups: { mode: 'replace', snapshotKey: 'old-groups', items: [] },
			trainingTypes: { mode: 'replace', snapshotKey: 'old-types', items: [] },
			trainingViews: { mode: 'replace', snapshotKey: 'old-views', items: [] },
			personnelTrainings: {
				mode: 'replace',
				deferred: true,
				snapshotKey: 'old-trainings',
				items: staleTrainings.promise
			},
			pinnedGroups: { mode: 'replace', snapshotKey: 'old-pinned', items: [] }
		};
		const freshHydration: TrainingWorkspaceHydration = {
			...staleHydration,
			orgId: 'org-new',
			personnelTrainings: {
				mode: 'replace',
				snapshotKey: 'new-trainings',
				items: [freshTraining]
			}
		};

		const stalePending = hydrator.hydrate(staleHydration, stores);
		await hydrator.hydrate(freshHydration, stores);
		staleTrainings.resolve([{ id: 'stale', personnelId: 'p1', trainingTypeId: 'tt1' } as PersonnelTraining]);
		await stalePending;

		expect(stores.personnelTrainingsStore.orgId).toBe('org-new');
		expect(stores.personnelTrainingsStore.items).toEqual([freshTraining]);
	});

	it('skips already-applied Training target snapshots until reset clears the adapter state', async () => {
		const stores = createStores();
		const hydrator = createTrainingWorkspaceHydrator();
		const trainingType = { id: 'tt1', name: 'CPR' } as TrainingType;
		const hydration: TrainingWorkspaceHydration = {
			orgId: 'org-1',
			personnel: { mode: 'replace', snapshotKey: 'personnel:1', items: [] },
			groups: { mode: 'replace', snapshotKey: 'groups:1', items: [] },
			trainingTypes: { mode: 'replace', snapshotKey: 'types:1', items: [trainingType] },
			trainingViews: { mode: 'replace', snapshotKey: 'views:1', items: [] },
			personnelTrainings: { mode: 'replace', snapshotKey: 'trainings:1', items: [] },
			pinnedGroups: { mode: 'replace', snapshotKey: 'pinned:1', items: [] }
		};

		await hydrator.hydrate(hydration, stores);
		await hydrator.hydrate(hydration, stores);
		expect(stores.trainingTypesStore.loadCount).toBe(1);

		hydrator.reset();
		await hydrator.hydrate(hydration, stores);
		expect(stores.trainingTypesStore.loadCount).toBe(2);
	});
});
