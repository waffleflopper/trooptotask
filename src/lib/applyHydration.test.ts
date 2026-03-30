import { describe, it, expect, beforeEach } from 'vitest';
import { defineStore } from '$lib/stores/core';
import type { Personnel, StatusType } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import type { TrainingType } from '$features/training/training.types';
import { applyHydration } from './applyHydration.svelte';
import type { HydrationStores } from './applyHydration.svelte';
import type { HydrationPlan } from '$lib/server/core/orgShell';

const ORG = 'test-org';

function createTestStores(): HydrationStores & {
	personnel: ReturnType<typeof defineStore<Personnel>>;
	groups: ReturnType<typeof defineStore<Group>>;
	statusTypes: ReturnType<typeof defineStore<StatusType>>;
	trainingTypes: ReturnType<typeof defineStore<TrainingType>>;
} {
	const personnel = defineStore<Personnel>({ table: 'personnel' });
	const groups = defineStore<Group>({ table: 'groups' });
	const statusTypes = defineStore<StatusType>({ table: 'status_types' });
	const trainingTypes = defineStore<TrainingType>({ table: 'training_types' });
	return {
		personnelStore: personnel as unknown as HydrationStores['personnelStore'],
		groupsStore: groups as unknown as HydrationStores['groupsStore'],
		statusTypesStore: statusTypes as unknown as HydrationStores['statusTypesStore'],
		trainingTypesStore: trainingTypes as unknown as HydrationStores['trainingTypesStore'],
		personnel,
		groups,
		statusTypes,
		trainingTypes
	};
}

const group: Group = { id: 'g1', name: 'Alpha', sortOrder: 0 };
const statusType: StatusType = { id: 'st1', name: 'Leave', color: '#ff0', textColor: '#000' };
const trainingType = { id: 'tt1', name: 'CPR', expirationMonths: 12 } as unknown as TrainingType;
const person = { id: 'p1', lastName: 'Smith', firstName: 'John' } as unknown as Personnel;

describe('applyHydration', () => {
	let stores: ReturnType<typeof createTestStores>;

	beforeEach(() => {
		stores = createTestStores();
	});

	it('is a no-op when plan is undefined', () => {
		applyHydration(undefined, stores);
		expect(stores.groups.items).toHaveLength(0);
		expect(stores.personnel.items).toHaveLength(0);
	});

	it('hydrates groups store with replace mode', () => {
		const plan: HydrationPlan = {
			orgId: ORG,
			groups: { mode: 'replace', items: [group] }
		};
		applyHydration(plan, stores);
		expect(stores.groups.items).toEqual([group]);
	});

	it('hydrates statusTypes store with replace mode', () => {
		const plan: HydrationPlan = {
			orgId: ORG,
			statusTypes: { mode: 'replace', items: [statusType] }
		};
		applyHydration(plan, stores);
		expect(stores.statusTypes.items).toEqual([statusType]);
	});

	it('hydrates trainingTypes store with replace mode', () => {
		const plan: HydrationPlan = {
			orgId: ORG,
			trainingTypes: { mode: 'replace', items: [trainingType] }
		};
		applyHydration(plan, stores);
		expect(stores.trainingTypes.items).toEqual([trainingType]);
	});

	it('hydrates personnelStore from personnel.scoped', () => {
		const plan: HydrationPlan = {
			orgId: ORG,
			personnel: {
				scoped: { mode: 'replace', items: [person] },
				all: { mode: 'replace', items: [person] }
			}
		};
		applyHydration(plan, stores);
		expect(stores.personnel.items).toEqual([person]);
	});

	it('skips a target when mode is preserve-client', () => {
		// Pre-load the store with existing data
		stores.groups.load([group], ORG);

		const plan: HydrationPlan = {
			orgId: ORG,
			groups: { mode: 'preserve-client', items: [] }
		};
		applyHydration(plan, stores);
		// Store should still contain the original data
		expect(stores.groups.items).toEqual([group]);
	});

	it('treats merge mode the same as replace', () => {
		const plan: HydrationPlan = {
			orgId: ORG,
			groups: { mode: 'merge', items: [group] }
		};
		applyHydration(plan, stores);
		expect(stores.groups.items).toEqual([group]);
	});

	it('only hydrates stores present in the plan', () => {
		const plan: HydrationPlan = {
			orgId: ORG,
			groups: { mode: 'replace', items: [group] }
		};
		applyHydration(plan, stores);
		expect(stores.groups.items).toEqual([group]);
		expect(stores.personnel.items).toHaveLength(0);
		expect(stores.statusTypes.items).toHaveLength(0);
		expect(stores.trainingTypes.items).toHaveLength(0);
	});

	it('hydrates all stores in a full plan', () => {
		const plan: HydrationPlan = {
			orgId: ORG,
			personnel: {
				scoped: { mode: 'replace', items: [person] },
				all: { mode: 'replace', items: [person] }
			},
			groups: { mode: 'replace', items: [group] },
			statusTypes: { mode: 'replace', items: [statusType] },
			trainingTypes: { mode: 'replace', items: [trainingType] }
		};
		applyHydration(plan, stores);
		expect(stores.personnel.items).toHaveLength(1);
		expect(stores.groups.items).toHaveLength(1);
		expect(stores.statusTypes.items).toHaveLength(1);
		expect(stores.trainingTypes.items).toHaveLength(1);
	});
});
