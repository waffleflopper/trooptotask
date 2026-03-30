import { describe, it, expect } from 'vitest';
import { createDefaultHydrationPlanner } from './hydrationPlanner';

const ORG = 'test-org';

describe('createDefaultHydrationPlanner', () => {
	it('returns undefined when data has no hydratable fields', () => {
		const planner = createDefaultHydrationPlanner(ORG);
		expect(planner.createPlan('calendar', {})).toBeUndefined();
		expect(planner.createPlan('personnel', { foo: 'bar' })).toBeUndefined();
	});

	it('returns undefined for null, arrays, and primitives', () => {
		const planner = createDefaultHydrationPlanner(ORG);
		expect(planner.createPlan('calendar', null)).toBeUndefined();
		expect(planner.createPlan('calendar', [{ groups: [] }])).toBeUndefined();
		expect(planner.createPlan('calendar', 42)).toBeUndefined();
	});

	it('embeds orgId in the plan', () => {
		const planner = createDefaultHydrationPlanner(ORG);
		const plan = planner.createPlan('calendar', { groups: [{ id: 'g1' }] });
		expect(plan?.orgId).toBe(ORG);
	});

	it('creates groups target with replace mode when groups present', () => {
		const planner = createDefaultHydrationPlanner(ORG);
		const groups = [{ id: 'g1', name: 'Alpha', sortOrder: 0 }];
		const plan = planner.createPlan('calendar', { groups });
		expect(plan?.groups).toMatchObject({ mode: 'replace', items: groups });
		expect(plan?.groups?.snapshotKey).toEqual(expect.any(String));
	});

	it('creates statusTypes target when present', () => {
		const planner = createDefaultHydrationPlanner(ORG);
		const statusTypes = [{ id: 'st1', name: 'Leave' }];
		const plan = planner.createPlan('calendar', { statusTypes });
		expect(plan?.statusTypes).toMatchObject({ mode: 'replace', items: statusTypes });
		expect(plan?.statusTypes?.snapshotKey).toEqual(expect.any(String));
	});

	it('creates trainingTypes target when present', () => {
		const planner = createDefaultHydrationPlanner(ORG);
		const trainingTypes = [{ id: 'tt1', name: 'CPR' }];
		const plan = planner.createPlan('calendar', { trainingTypes });
		expect(plan?.trainingTypes).toMatchObject({ mode: 'replace', items: trainingTypes });
		expect(plan?.trainingTypes?.snapshotKey).toEqual(expect.any(String));
	});

	it('creates personnel.scoped but not personnel.all when only scoped data present', () => {
		const planner = createDefaultHydrationPlanner(ORG);
		const personnel = [{ id: 'p1', lastName: 'Smith' }];
		const plan = planner.createPlan('personnel', { personnel });
		expect(plan?.personnel?.scoped).toMatchObject({ mode: 'replace', items: personnel });
		expect(plan?.personnel?.scoped.snapshotKey).toEqual(expect.any(String));
		expect(plan?.personnel?.all).toBeUndefined();
	});

	it('uses allPersonnel for personnel.all when both are present', () => {
		const planner = createDefaultHydrationPlanner(ORG);
		const scoped = [{ id: 'p1' }];
		const all = [{ id: 'p1' }, { id: 'p2' }];
		const plan = planner.createPlan('personnel', { personnel: scoped, allPersonnel: all });
		expect(plan?.personnel?.scoped).toMatchObject({ mode: 'replace', items: scoped });
		expect(plan?.personnel?.all).toMatchObject({ mode: 'replace', items: all });
	});

	it('omits targets for absent fields', () => {
		const planner = createDefaultHydrationPlanner(ORG);
		const plan = planner.createPlan('calendar', { groups: [{ id: 'g1' }] });
		expect(plan?.personnel).toBeUndefined();
		expect(plan?.statusTypes).toBeUndefined();
		expect(plan?.trainingTypes).toBeUndefined();
	});

	it('creates a full plan when all shared fields are present', () => {
		const planner = createDefaultHydrationPlanner(ORG);
		const data = {
			personnel: [{ id: 'p1' }],
			allPersonnel: [{ id: 'p1' }, { id: 'p2' }],
			groups: [{ id: 'g1' }],
			statusTypes: [{ id: 'st1' }],
			trainingTypes: [{ id: 'tt1' }]
		};
		const plan = planner.createPlan('dashboard', data);
		expect(plan).toMatchObject({
			orgId: ORG,
			personnel: {
				scoped: { mode: 'replace', items: data.personnel },
				all: { mode: 'replace', items: data.allPersonnel }
			},
			groups: { mode: 'replace', items: data.groups },
			statusTypes: { mode: 'replace', items: data.statusTypes },
			trainingTypes: { mode: 'replace', items: data.trainingTypes }
		});
	});

	it('creates a plan with only scoped personnel when allPersonnel is absent', () => {
		const planner = createDefaultHydrationPlanner(ORG);
		const plan = planner.createPlan('dashboard', {
			personnel: [{ id: 'p1' }],
			groups: [{ id: 'g1' }]
		});
		expect(plan?.personnel?.scoped.items).toHaveLength(1);
		expect(plan?.personnel?.all).toBeUndefined();
		expect(plan?.groups?.items).toHaveLength(1);
	});

	it('uses identical snapshot keys for unchanged resolved data', () => {
		const planner = createDefaultHydrationPlanner(ORG);
		const data = { groups: [{ id: 'g1', name: 'Alpha', sortOrder: 0 }] };

		const first = planner.createPlan('calendar', data);
		const second = planner.createPlan('calendar', data);

		expect(first?.groups?.snapshotKey).toBe(second?.groups?.snapshotKey);
	});

	it('preserves promise identity for deferred data snapshot keys', () => {
		const planner = createDefaultHydrationPlanner(ORG);
		const groups = Promise.resolve([{ id: 'g1', name: 'Alpha', sortOrder: 0 }]);

		const first = planner.createPlan('calendar', { groups });
		const second = planner.createPlan('calendar', { groups });

		expect(first?.groups?.items).toBe(groups);
		expect(first?.groups?.snapshotKey).toBe(second?.groups?.snapshotKey);
	});
});
