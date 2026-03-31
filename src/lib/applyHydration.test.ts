import { describe, it, expect, beforeEach } from 'vitest';
import { defineStore } from '$lib/stores/core';
import type { Personnel, StatusType } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import type { PersonnelTraining, TrainingType, TrainingView } from '$features/training/training.types';
import { applyHydration, resetHydrationState } from './applyHydration.svelte';
import type { HydrationStores } from './applyHydration.svelte';
import type { HydrationPlan } from '$lib/server/core/orgShell';

const ORG = 'test-org';

function createTestStores(): HydrationStores & {
	personnel: ReturnType<typeof defineStore<Personnel>>;
	groups: ReturnType<typeof defineStore<Group>>;
	statusTypes: ReturnType<typeof defineStore<StatusType>>;
	trainingTypes: ReturnType<typeof defineStore<TrainingType>>;
	trainingViews: ReturnType<typeof defineStore<TrainingView>>;
	personnelTrainings: ReturnType<typeof defineStore<PersonnelTraining>>;
} {
	const personnel = defineStore<Personnel>({ table: 'personnel' });
	const groups = defineStore<Group>({ table: 'groups' });
	const statusTypes = defineStore<StatusType>({ table: 'status_types' });
	const trainingTypes = defineStore<TrainingType>({ table: 'training_types' });
	const trainingViews = defineStore<TrainingView>({ table: 'training_views' });
	const personnelTrainings = defineStore<PersonnelTraining>({ table: 'personnel_trainings' });
	return {
		personnelStore: personnel as unknown as HydrationStores['personnelStore'],
		groupsStore: groups as unknown as HydrationStores['groupsStore'],
		statusTypesStore: statusTypes as unknown as HydrationStores['statusTypesStore'],
		trainingTypesStore: trainingTypes as unknown as HydrationStores['trainingTypesStore'],
		trainingViewsStore: trainingViews as unknown as HydrationStores['trainingViewsStore'],
		personnelTrainingsStore: personnelTrainings as unknown as HydrationStores['personnelTrainingsStore'],
		personnel,
		groups,
		statusTypes,
		trainingTypes,
		trainingViews,
		personnelTrainings
	};
}

const group: Group = { id: 'g1', name: 'Alpha', sortOrder: 0 };
const statusType: StatusType = { id: 'st1', name: 'Leave', color: '#ff0', textColor: '#000' };
const trainingType = { id: 'tt1', name: 'CPR', expirationMonths: 12 } as unknown as TrainingType;
const trainingView = {
	id: 'tv1',
	name: 'All Personnel',
	columnIds: [],
	createdBy: 'u1',
	createdAt: '2024-01-01',
	updatedAt: '2024-01-01'
} as TrainingView;
const person = { id: 'p1', lastName: 'Smith', firstName: 'John' } as unknown as Personnel;
const personnelTraining = {
	id: 'pt1',
	personnelId: 'p1',
	trainingTypeId: 'tt1',
	completionDate: null,
	expirationDate: null,
	notes: null,
	certificateUrl: null
} as PersonnelTraining;

describe('applyHydration', () => {
	let stores: ReturnType<typeof createTestStores>;

	beforeEach(() => {
		stores = createTestStores();
		resetHydrationState();
	});

	it('is a no-op when plan is undefined', async () => {
		await applyHydration(undefined, stores);
		expect(stores.groups.items).toHaveLength(0);
		expect(stores.personnel.items).toHaveLength(0);
	});

	it('hydrates groups store with replace mode', async () => {
		const plan: HydrationPlan = {
			orgId: ORG,
			groups: { mode: 'replace', snapshotKey: 'groups:1', items: [group] }
		};
		await applyHydration(plan, stores);
		expect(stores.groups.items).toEqual([group]);
	});

	it('hydrates statusTypes store with replace mode', async () => {
		const plan: HydrationPlan = {
			orgId: ORG,
			statusTypes: { mode: 'replace', snapshotKey: 'status:1', items: [statusType] }
		};
		await applyHydration(plan, stores);
		expect(stores.statusTypes.items).toEqual([statusType]);
	});

	it('hydrates trainingTypes store with replace mode', async () => {
		const plan: HydrationPlan = {
			orgId: ORG,
			trainingTypes: { mode: 'replace', snapshotKey: 'training:1', items: [trainingType] }
		};
		await applyHydration(plan, stores);
		expect(stores.trainingTypes.items).toEqual([trainingType]);
	});

	it('hydrates trainingViews store with replace mode', async () => {
		const plan: HydrationPlan = {
			orgId: ORG,
			trainingViews: { mode: 'replace', snapshotKey: 'views:1', items: [trainingView] }
		};
		await applyHydration(plan, stores);
		expect(stores.trainingViews.items).toEqual([trainingView]);
	});

	it('hydrates deferred personnelTrainings and keeps loading true until resolution', async () => {
		let resolveTrainings!: (items: PersonnelTraining[]) => void;
		const deferredTrainings = new Promise<PersonnelTraining[]>((resolve) => {
			resolveTrainings = resolve;
		});

		const hydrationPromise = applyHydration(
			{
				orgId: ORG,
				personnelTrainings: {
					mode: 'replace',
					snapshotKey: 'personnel-trainings:deferred:1',
					items: deferredTrainings
				}
			},
			stores
		);

		expect(stores.personnelTrainings.loading).toBe(true);

		resolveTrainings([personnelTraining]);
		await hydrationPromise;

		expect(stores.personnelTrainings.items).toEqual([personnelTraining]);
		expect(stores.personnelTrainings.loading).toBe(false);
	});

	it('falls back to empty personnelTrainings when deferred hydration rejects', async () => {
		let rejectTrainings!: (reason?: unknown) => void;
		const deferredTrainings = new Promise<PersonnelTraining[]>((_, reject) => {
			rejectTrainings = reject;
		});

		const hydrationPromise = applyHydration(
			{
				orgId: ORG,
				personnelTrainings: {
					mode: 'replace',
					snapshotKey: 'personnel-trainings:deferred:error',
					items: deferredTrainings
				}
			},
			stores
		);

		expect(stores.personnelTrainings.loading).toBe(true);

		rejectTrainings(new Error('training bootstrap failed'));
		await expect(hydrationPromise).resolves.toBeUndefined();

		expect(stores.personnelTrainings.items).toEqual([]);
		expect(stores.personnelTrainings.loading).toBe(false);
	});

	it('hydrates personnelStore from personnel.scoped', async () => {
		const plan: HydrationPlan = {
			orgId: ORG,
			personnel: {
				scoped: { mode: 'replace', snapshotKey: 'personnel:scoped:1', items: [person] },
				all: { mode: 'replace', snapshotKey: 'personnel:all:1', items: [person] }
			}
		};
		await applyHydration(plan, stores);
		expect(stores.personnel.items).toEqual([person]);
	});

	it('skips a target when mode is preserve-client', async () => {
		// Pre-load the store with existing data
		stores.groups.load([group], ORG);

		const plan: HydrationPlan = {
			orgId: ORG,
			groups: { mode: 'preserve-client', snapshotKey: 'groups:preserve', items: [] }
		};
		await applyHydration(plan, stores);
		// Store should still contain the original data
		expect(stores.groups.items).toEqual([group]);
	});

	it('treats merge mode the same as replace', async () => {
		const plan: HydrationPlan = {
			orgId: ORG,
			groups: { mode: 'merge', snapshotKey: 'groups:merge:1', items: [group] }
		};
		await applyHydration(plan, stores);
		expect(stores.groups.items).toEqual([group]);
	});

	it('skips reloading a target when snapshotKey is unchanged', async () => {
		const first = { id: 'g1', name: 'Alpha', sortOrder: 0 };
		const second = { id: 'g2', name: 'Bravo', sortOrder: 1 };

		await applyHydration(
			{
				orgId: ORG,
				groups: { mode: 'replace', snapshotKey: 'groups:same', items: [first] }
			},
			stores
		);
		await applyHydration(
			{
				orgId: ORG,
				groups: { mode: 'replace', snapshotKey: 'groups:same', items: [second] }
			},
			stores
		);

		expect(stores.groups.items).toEqual([first]);
	});

	it('reloads when returning to a prior org with the same snapshotKey', async () => {
		const orgAGroup = { id: 'g1', name: 'Alpha', sortOrder: 0 };
		const orgBGroup = { id: 'g2', name: 'Bravo', sortOrder: 1 };

		await applyHydration(
			{
				orgId: 'org-a',
				groups: { mode: 'replace', snapshotKey: 'groups:stable', items: [orgAGroup] }
			},
			stores
		);
		await applyHydration(
			{
				orgId: 'org-b',
				groups: { mode: 'replace', snapshotKey: 'groups:other', items: [orgBGroup] }
			},
			stores
		);
		await applyHydration(
			{
				orgId: 'org-a',
				groups: { mode: 'replace', snapshotKey: 'groups:stable', items: [orgAGroup] }
			},
			stores
		);

		expect(stores.groups.orgId).toBe('org-a');
		expect(stores.groups.items).toEqual([orgAGroup]);
	});

	it('hydrates a deferred target once it resolves', async () => {
		const deferredItems = Promise.resolve([group]);

		await applyHydration(
			{
				orgId: ORG,
				groups: { mode: 'replace', snapshotKey: 'groups:deferred:1', items: deferredItems }
			},
			stores
		);

		expect(stores.groups.items).toEqual([group]);
	});

	it('ignores a stale deferred resolution after a newer snapshot wins', async () => {
		let resolveFirst!: (items: Group[]) => void;
		const firstDeferred = new Promise<Group[]>((resolve) => {
			resolveFirst = resolve;
		});

		const firstApply = applyHydration(
			{
				orgId: ORG,
				groups: { mode: 'replace', snapshotKey: 'groups:deferred:old', items: firstDeferred }
			},
			stores
		);

		await applyHydration(
			{
				orgId: ORG,
				groups: { mode: 'replace', snapshotKey: 'groups:deferred:new', items: [group] }
			},
			stores
		);

		resolveFirst([{ id: 'g2', name: 'Stale', sortOrder: 1 }]);
		await firstApply;

		expect(stores.groups.items).toEqual([group]);
	});

	it('only hydrates stores present in the plan', async () => {
		const plan: HydrationPlan = {
			orgId: ORG,
			groups: { mode: 'replace', snapshotKey: 'groups:only', items: [group] }
		};
		await applyHydration(plan, stores);
		expect(stores.groups.items).toEqual([group]);
		expect(stores.personnel.items).toHaveLength(0);
		expect(stores.statusTypes.items).toHaveLength(0);
		expect(stores.trainingTypes.items).toHaveLength(0);
	});

	it('hydrates all stores in a full plan', async () => {
		const plan: HydrationPlan = {
			orgId: ORG,
			personnel: {
				scoped: { mode: 'replace', snapshotKey: 'personnel:scoped:full', items: [person] },
				all: { mode: 'replace', snapshotKey: 'personnel:all:full', items: [person] }
			},
			groups: { mode: 'replace', snapshotKey: 'groups:full', items: [group] },
			statusTypes: { mode: 'replace', snapshotKey: 'status:full', items: [statusType] },
			trainingTypes: { mode: 'replace', snapshotKey: 'training:full', items: [trainingType] }
		};
		await applyHydration(plan, stores);
		expect(stores.personnel.items).toHaveLength(1);
		expect(stores.groups.items).toHaveLength(1);
		expect(stores.statusTypes.items).toHaveLength(1);
		expect(stores.trainingTypes.items).toHaveLength(1);
	});
});
