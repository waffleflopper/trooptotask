import { withOnboardingPersistence } from '$features/onboarding/server/onboardingPersistence.test-support.server';
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
	createInMemoryDataStore,
	createTestAuthContext
} from '$features/onboarding/server/onboardingPersistence.test-support.server';
import { createQueryPortsContext } from '$features/calendar/calendarPersistence.test-support.server';
import { fetchDashboardBootstrap } from './dashboardQuery.server';
import type { FeatureKey } from '$lib/access/featureSwitches';

const ORG = 'test-org';
const USER = 'user-1';

function buildCtx(overrides?: {
	auth?: Parameters<typeof createTestAuthContext>[0];
	disabledFeatures?: FeatureKey[];
}): ReturnType<typeof createQueryPortsContext> & {
	store: ReturnType<typeof createQueryPortsContext>['store'];
} {
	return createQueryPortsContext(
		withOnboardingPersistence({
			auth: { orgId: ORG, userId: USER, ...overrides?.auth },
			disabledFeatures: overrides?.disabledFeatures
		})
	);
}

describe('Dashboard packet read', () => {
	const load = fetchDashboardBootstrap;
	it('preserves saved progress and attributed history with Personnel access alone', async () => {
		const ctx = buildCtx({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					personnel: 'view',
					calendar: 'none',
					training: 'none',
					onboarding: 'none',
					criticalTasks: 'none',
					ratingScheme: 'none'
				}
			}
		});
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;
		const note = { text: 'Retained work', timestamp: '2026-03-01T12:00:00Z', userId: 'author-1' };
		const active = {
			id: 'packet-active',
			organization_id: ORG,
			personnel_id: 'p1',
			status: 'in_progress',
			started_at: '2026-03-01',
			completed_at: null,
			cancelled_at: null,
			template_id: 'template-1',
			onboarding_step_progress: [
				{
					id: 'saved-training',
					onboarding_id: 'packet-active',
					template_step_id: 'definition-1',
					step_name: 'Required training',
					step_type: 'training',
					training_type_id: 'training-1',
					sort_order: 0,
					completed: false,
					active: true,
					notes: []
				},
				{
					id: 'saved-history',
					onboarding_id: 'packet-active',
					template_step_id: null,
					step_name: 'Removed work',
					step_type: 'checkbox',
					sort_order: 1,
					completed: true,
					active: false,
					notes: [note]
				}
			]
		};
		store.seed('personnel_onboardings', [
			active,
			{ ...active, id: 'packet-completed', status: 'completed' },
			{ ...active, id: 'packet-foreign', organization_id: 'another-org' }
		]);
		// The Dashboard uses saved snapshots. Only Onboarding's workspace hydrates current Training facts.
		const trainingReferences = ctx.trainingOnboardingReferences!;
		const hydrateTraining = vi
			.spyOn(trainingReferences, 'completedTypeIds')
			.mockRejectedValue(new Error('Training workflow is not authorized'));
		const result = await load(ctx);

		expect(result.activeOnboardings).toHaveLength(1);
		expect(result.activeOnboardings[0]).toMatchObject({
			id: 'packet-active',
			personnelId: 'p1',
			templateId: 'template-1',
			steps: [
				{
					id: 'saved-training',
					templateStepId: 'definition-1',
					trainingTypeId: 'training-1',
					completed: false,
					active: true
				},
				{ id: 'saved-history', templateStepId: null, completed: true, active: false, notes: [note] }
			]
		});
		expect(hydrateTraining).not.toHaveBeenCalled();
	});
});

describe('fetchDashboardBootstrap', () => {
	it.each([
		['availability_entries', 'availabilityEntries'],
		['daily_assignments', 'todayAssignments']
	] as const)(
		'keeps an early %s failure handled while eager reads are pending, then exposes it to the consumer',
		async (table, field) => {
			const ctx = buildCtx();
			let release!: () => void;
			const findPolicies = ctx.organizationSettings.findPolicies.bind(ctx.organizationSettings);
			ctx.organizationSettings.findPolicies = (orgId) =>
				new Promise<void>((resolve) => {
					release = resolve;
				}).then(() => findPolicies(orgId));
			const findMany = ctx.store.findMany.bind(ctx.store);
			const reads: string[] = [];
			vi.spyOn(ctx.store, 'findMany').mockImplementation((name, ...args) => {
				reads.push(name);
				return name === table ? Promise.reject(new Error('Deferred source unavailable')) : findMany(name, ...args);
			});
			const bootstrap = fetchDashboardBootstrap(ctx);
			await new Promise<void>((resolve) => setImmediate(resolve));
			expect(reads).toEqual(expect.arrayContaining(['availability_entries', 'daily_assignments']));
			release();
			const data = await bootstrap;
			await expect(data[field]).rejects.toThrow('Deferred source unavailable');
		}
	);

	it('provides ordered same-Organization Training definitions for the Dashboard summary', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;
		store.seed('training_types', [
			{
				id: 'later',
				organization_id: ORG,
				name: 'Annual',
				sort_order: 2,
				applies_to_mos: ['68W']
			},
			{
				id: 'foreign',
				organization_id: 'another-org',
				name: 'Foreign',
				sort_order: 0
			},
			{
				id: 'first',
				organization_id: ORG,
				name: 'Orientation',
				sort_order: 1,
				applies_to_mos: []
			}
		]);

		const result = await fetchDashboardBootstrap(ctx);

		expect(result.trainingTypes.map((type) => type.id)).toEqual(['first', 'later']);
		expect(result.trainingTypes[1]).toMatchObject({ name: 'Annual', sortOrder: 2, appliesToMos: ['68W'] });
	});

	it('returns only in-scope Groups and pinned names beside scoped Personnel facts', async () => {
		const ctx = buildCtx({ auth: { scopeSet: { kind: 'groups', groupIds: ['g1'] } } });
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;
		store.seed('groups', [
			{ id: 'g1', organization_id: ORG, name: 'Alpha', sort_order: 0 },
			{ id: 'g2', organization_id: ORG, name: 'Bravo', sort_order: 1 },
			{ id: 'foreign', organization_id: 'other-org', name: 'Foreign', sort_order: -1 }
		]);
		store.seed('personnel', [
			{ id: 'p1', organization_id: ORG, group_id: 'g1', archived_at: null },
			{ id: 'p2', organization_id: ORG, group_id: 'g2', archived_at: null }
		]);
		store.seed('user_pinned_groups', [
			{ id: 'pin-bravo', organization_id: ORG, user_id: USER, group_name: 'Bravo', sort_order: 0 },
			{ id: 'pin-alpha', organization_id: ORG, user_id: USER, group_name: 'Alpha', sort_order: 1 }
		]);

		const result = await fetchDashboardBootstrap(ctx);

		expect(result.groups).toEqual([{ id: 'g1', name: 'Alpha', sortOrder: 0 }]);
		expect(result.pinnedGroups).toEqual(['Alpha']);
		expect(result.personnel.map((person) => person.id)).toEqual(['p1']);
	});

	it('keeps the full Group catalog for an Organization-wide member', async () => {
		const ctx = buildCtx({ auth: { role: 'member', isPrivileged: false, scopeSet: { kind: 'organization' } } });
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;
		store.seed('groups', [
			{ id: 'g1', organization_id: ORG, name: 'Alpha', sort_order: 0 },
			{ id: 'g2', organization_id: ORG, name: 'Bravo', sort_order: 1 }
		]);

		const result = await fetchDashboardBootstrap(ctx);

		expect(result.groups.map((group) => group.name)).toEqual(['Alpha', 'Bravo']);
	});

	it.each([
		[0, 0],
		[null, 180]
	] as const)('reads a configured loss warning window of %s as %s days', async (value, expected) => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;
		store.seed('organizations', [{ id: ORG, loss_warning_window_days: value }]);
		const data = await fetchDashboardBootstrap(ctx);
		expect(data.lossWarningWindowDays).toBe(expected);
	});

	it('preserves a loss-setting provider failure instead of inventing a warning window', async () => {
		const ctx = buildCtx();
		ctx.organizationSettings.findPolicies = async () => {
			throw new Error('Settings unavailable');
		};
		await expect(fetchDashboardBootstrap(ctx)).rejects.toThrow('Settings unavailable');
	});

	it('returns the configured loss warning window from the organizations row', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;

		store.seed('organizations', [{ id: ORG, loss_warning_window_days: 90 }]);

		const result = await fetchDashboardBootstrap(ctx);

		expect(result.lossWarningWindowDays).toBe(90);
	});

	it('defaults the loss warning window to 180 when the organizations row is missing the value', async () => {
		const ctx = buildCtx();

		const result = await fetchDashboardBootstrap(ctx);

		expect(result.lossWarningWindowDays).toBe(180);
	});

	it('returns personnel IDs whose award tracking has been acknowledged', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;

		store.seed('personnel', [
			{ id: 'p-1', organization_id: ORG, group_id: 'g-1' },
			{ id: 'p-2', organization_id: ORG, group_id: 'g-1' }
		]);
		store.seed('personnel_extended_info', [
			{
				id: 'ext-1',
				organization_id: ORG,
				personnel_id: 'p-1',
				award_tracking_acknowledged_at: '2026-04-14T12:00:00.000Z'
			},
			{
				id: 'ext-2',
				organization_id: ORG,
				personnel_id: 'p-2',
				award_tracking_acknowledged_at: null
			}
		]);

		const result = await fetchDashboardBootstrap(ctx);

		expect(result.awardTrackingAcknowledgedPersonnelIds).toEqual(['p-1']);
	});

	it('skips the reads of each feature the unit has turned off', async () => {
		const ctx = buildCtx({ disabledFeatures: ['training', 'evaluations', 'onboarding', 'lossesAndAwards'] });
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;
		store.seed('organizations', [{ id: ORG, loss_warning_window_days: 90, strength_floor_percent: 70 }]);
		store.seed('training_types', [{ id: 't1', organization_id: ORG, name: 'Annual', sort_order: 0 }]);
		store.seed('personnel_onboardings', [
			{ id: 'po1', organization_id: ORG, personnel_id: 'p1', status: 'in_progress', onboarding_step_progress: [] }
		]);
		store.seed('personnel_extended_info', [
			{ id: 'ext-1', organization_id: ORG, personnel_id: 'p1', award_tracking_acknowledged_at: '2026-04-14T12:00:00Z' }
		]);
		ctx.ratingSchemeDue = {
			listDueEntries: async () => {
				throw new Error('Evaluations are off for this unit');
			}
		};
		const findMany = ctx.store.findMany.bind(ctx.store);
		const reads: string[] = [];
		vi.spyOn(ctx.store, 'findMany').mockImplementation((name, ...args) => {
			reads.push(name);
			return findMany(name, ...args);
		});

		const result = await fetchDashboardBootstrap(ctx);

		expect(reads).not.toContain('personnel_onboardings');
		expect(reads).not.toContain('training_types');
		expect(result).toMatchObject({
			ratingSchemeEntries: [],
			activeOnboardings: [],
			trainingTypes: [],
			awardTrackingAcknowledgedPersonnelIds: [],
			lossWarningWindowDays: 90,
			strengthFloorPercent: 70
		});
	});

	it("reads UTC day -2 through +15 so every viewer's yesterday through today plus 14 is loaded", async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-19T23:30:00Z'));

		const result = await fetchDashboardBootstrap(buildCtx());

		expect(result.range).toEqual({ rangeStart: '2026-10-17', rangeEnd: '2026-11-03' });
	});

	it('returns the stored holidays and closures inside the window for the forecast', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;
		store.seed('special_days', [
			{ id: 'before', organization_id: ORG, date: '2026-10-16', name: 'Training holiday', type: 'org-closure' },
			{ id: 'veterans', organization_id: ORG, date: '2026-11-11', name: 'Veterans Day', type: 'federal-holiday' },
			{ id: 'closure', organization_id: ORG, date: '2026-10-30', name: 'Unit closure', type: 'org-closure' },
			{ id: 'foreign', organization_id: 'another-org', date: '2026-10-28', name: 'Other', type: 'org-closure' }
		]);

		const result = await fetchDashboardBootstrap(ctx);

		expect(result.specialDays.map((day) => [day.id, day.date, day.type])).toEqual([
			['closure', '2026-10-30', 'org-closure']
		]);
	});

	it('defaults the strength floor to 80 percent', async () => {
		const result = await fetchDashboardBootstrap(buildCtx());

		expect(result.strengthFloorPercent).toBe(80);
	});

	it('filters onboardings at query time', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;

		store.seed('personnel_onboardings', [
			{
				id: 'po1',
				organization_id: ORG,
				personnel_id: 'p1',
				started_at: '2026-03-01',
				completed_at: null,
				cancelled_at: null,
				status: 'in_progress',
				template_id: null,
				onboarding_step_progress: []
			},
			{
				id: 'po2',
				organization_id: ORG,
				personnel_id: 'p2',
				started_at: '2026-03-01',
				completed_at: '2026-03-15',
				cancelled_at: null,
				status: 'completed',
				template_id: null,
				onboarding_step_progress: []
			}
		]);

		const findManySpy = vi.spyOn(ctx.store, 'findMany');
		const result = await fetchDashboardBootstrap(ctx);
		const onboardingCalls = findManySpy.mock.calls.filter(([table]) => table === 'personnel_onboardings');

		expect(onboardingCalls).toHaveLength(1);
		expect(onboardingCalls[0][2]).toEqual({ status: 'in_progress' });
		expect(result.activeOnboardings).toHaveLength(1);
		expect(result.activeOnboardings[0].personnelId).toBe('p1');
	});
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe.each([fetchDashboardBootstrap])('%s Rating Scheme projection', (load) => {
	it('keeps the Rating-only projection when generic Rating storage is unavailable', async () => {
		const ctx = buildCtx({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'groups', groupIds: ['alpha'] }
			}
		});
		ctx.ratingSchemeDue = {
			listDueEntries: vi.fn().mockResolvedValue([
				{ ratingPeriodEnd: '2026-09-25', status: 'active' },
				{ ratingPeriodEnd: '2026-10-20', status: 'change-of-rater' }
			])
		};
		const findMany = ctx.store.findMany.bind(ctx.store);
		vi.spyOn(ctx.store, 'findMany').mockImplementation((table, ...args) => {
			if (table === 'rating_scheme_entries') throw new Error('Generic Rating storage is unavailable');
			return findMany(table, ...args);
		});
		const result = await load(ctx);
		expect(result.ratingSchemeEntries).toEqual([
			{ ratingPeriodEnd: '2026-09-25', status: 'active' },
			{ ratingPeriodEnd: '2026-10-20', status: 'change-of-rater' }
		]);
		expect(ctx.ratingSchemeDue.listDueEntries).toHaveBeenCalledWith(ctx.auth);
	});

	it.each([
		['Organization', { kind: 'organization' as const }],
		['Group', { kind: 'groups' as const, groupIds: ['g-1'] }]
	])('leaves archived People out of the in-memory %s-scoped projection', async (_label, scopeSet) => {
		const ctx = buildCtx({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'view'
				},
				scopeSet
			}
		});
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;
		store.seed('personnel', [
			{ id: 'p-active', organization_id: ORG, group_id: 'g-1', archived_at: null },
			{ id: 'p-archived', organization_id: ORG, group_id: 'g-1', archived_at: '2026-10-01T00:00:00Z' }
		]);
		store.seed('rating_scheme_entries', [
			{
				id: 'e-active',
				organization_id: ORG,
				rated_person_id: 'p-active',
				rating_period_end: '2026-09-25',
				status: 'active'
			},
			{
				id: 'e-archived',
				organization_id: ORG,
				rated_person_id: 'p-archived',
				rating_period_end: '2026-09-20',
				status: 'active'
			}
		]);
		const result = await load(ctx);
		expect(result.ratingSchemeEntries).toEqual([{ ratingPeriodEnd: '2026-09-25', status: 'active' }]);
	});

	it('surfaces an authorized projection failure instead of reporting zero evaluations', async () => {
		const ctx = buildCtx();
		ctx.ratingSchemeDue = { listDueEntries: vi.fn().mockRejectedValue(new Error('Rating provider unavailable')) };
		await expect(load(ctx)).rejects.toThrow('Rating provider unavailable');
	});
});

describe.each([fetchDashboardBootstrap])('%s Calendar independence', (load) => {
	it('retains scoped saved assignments without attempting duty event, slot or run reads', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-09-21T12:00:00'));
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;
		store.seed('assignment_types', [
			{ id: 'person-type', organization_id: ORG, name: 'Staff Duty', assign_to: 'personnel', sort_order: 0 },
			{ id: 'group-type', organization_id: ORG, name: 'Clinic Coverage', assign_to: 'group', sort_order: 1 }
		]);
		store.seed('daily_assignments', [
			{
				id: 'saved-historical',
				organization_id: ORG,
				date: '2026-09-21',
				assignment_type_id: 'person-type',
				assignee_id: 'person-a'
			},
			{
				id: 'saved-group',
				organization_id: ORG,
				date: '2026-09-22',
				assignment_type_id: 'group-type',
				assignee_id: 'group-a'
			},
			{
				id: 'foreign',
				organization_id: 'another-org',
				date: '2026-09-21',
				assignment_type_id: 'person-type',
				assignee_id: 'foreign-person'
			},
			{
				id: 'outside-window',
				organization_id: ORG,
				date: '2027-01-01',
				assignment_type_id: 'person-type',
				assignee_id: 'person-a'
			}
		]);

		const findMany = store.findMany.bind(store);
		const dutyReads: string[] = [];
		vi.spyOn(store, 'findMany').mockImplementation((table, ...args) => {
			if (table.startsWith('duty_') || table.startsWith('advanced_duty_')) {
				dutyReads.push(table);
				throw new Error('Retired Duty storage is unavailable');
			}
			return findMany(table, ...args);
		});

		const result = await load(ctx);

		expect(await result.todayAssignments).toEqual([
			expect.objectContaining({
				id: 'saved-historical',
				date: '2026-09-21',
				assignmentTypeId: 'person-type',
				assigneeId: 'person-a'
			}),
			expect.objectContaining({
				id: 'saved-group',
				date: '2026-09-22',
				assignmentTypeId: 'group-type',
				assigneeId: 'group-a'
			})
		]);
		expect(result.assignmentTypes.map((type) => type.name)).toEqual(['Staff Duty', 'Clinic Coverage']);
		expect(dutyReads).toEqual([]);
	});
});
