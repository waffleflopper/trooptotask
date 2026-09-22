import { afterEach, describe, it, expect, vi } from 'vitest';
import { createInMemoryDataStore, createQueryPortsContext, createTestAuthContext } from '$lib/server/adapters/inMemory';
import type { QueryPorts } from '$lib/server/core/ports';
import { fetchDashboardBootstrap, fetchDashboardData } from './dashboardQuery';

const ORG = 'test-org';
const USER = 'user-1';

/** Return today's date as YYYY-MM-DD string */
function todayStr(): string {
	const d = new Date();
	return d.toISOString().slice(0, 10);
}

function buildCtx(overrides?: { auth?: Parameters<typeof createTestAuthContext>[0] }): QueryPorts & {
	store: ReturnType<typeof createQueryPortsContext>['store'];
} {
	return createQueryPortsContext({ auth: { orgId: ORG, userId: USER, ...overrides?.auth } });
}

describe('fetchDashboardData', () => {
	it('returns all dashboard data sections via ctx.store', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;

		const today = todayStr();

		store.seed('availability_entries', [
			{
				id: 'ae1',
				organization_id: ORG,
				personnel_id: 'p1',
				status_type_id: 'st1',
				start_date: today,
				end_date: today,
				notes: null
			}
		]);
		store.seed('assignment_types', [{ id: 'at1', organization_id: ORG, name: 'CQ', color: '#f00', sort_order: 0 }]);
		store.seed('daily_assignments', [
			{
				id: 'da1',
				organization_id: ORG,
				personnel_id: 'p1',
				assignment_type_id: 'at1',
				date: today,
				notes: null
			}
		]);
		store.seed('user_pinned_groups', [
			{ id: 'pg1', organization_id: ORG, user_id: USER, group_name: 'Alpha', sort_order: 0 }
		]);
		store.seed('rating_scheme_entries', [
			{
				id: 'rs1',
				organization_id: ORG,
				rated_person_id: 'p1',
				eval_type: 'NCOER',
				rater_person_id: null,
				rater_name: null,
				senior_rater_person_id: null,
				senior_rater_name: null,
				intermediate_rater_person_id: null,
				intermediate_rater_name: null,
				reviewer_person_id: null,
				reviewer_name: null,
				rating_period_start: '2025-01-01',
				rating_period_end: '2025-12-31',
				status: 'active',
				notes: null,
				report_type: null,
				workflow_status: null
			}
		]);
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
			}
		]);

		const result = await fetchDashboardData(ctx);

		expect(result.availabilityEntries).toHaveLength(1);
		expect(result.assignmentTypes).toHaveLength(1);
		expect(result.todayAssignments).toHaveLength(1);
		expect(result.pinnedGroups).toHaveLength(1);
		expect(result.ratingSchemeEntries).toHaveLength(1);
		expect(result.activeOnboardings).toHaveLength(1);
	});

	it('filters onboardings to only in_progress status', async () => {
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
		const result = await fetchDashboardData(ctx);
		const onboardingCalls = findManySpy.mock.calls.filter(([table]) => table === 'personnel_onboardings');

		expect(onboardingCalls).toHaveLength(1);
		expect(onboardingCalls[0][2]).toEqual({ status: 'in_progress' });
		expect(result.activeOnboardings).toHaveLength(1);
		expect(result.activeOnboardings[0].personnelId).toBe('p1');
	});
});

describe('fetchDashboardBootstrap', () => {
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

describe.each([fetchDashboardBootstrap, fetchDashboardData])('%s Calendar independence', (load) => {
	it('retains scoped saved assignments without attempting duty event, slot or run reads', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-09-21T12:00:00'));
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;
		store.seed('assignment_types', [
			{ id: 'person-type', organization_id: ORG, name: 'Staff Duty', assign_to: 'personnel' },
			{ id: 'group-type', organization_id: ORG, name: 'Clinic Coverage', assign_to: 'group' }
		]);
		store.seed('daily_assignments', [
			{
				id: 'saved-historical',
				organization_id: ORG,
				date: '2026-09-21',
				assignment_type_id: 'person-type',
				assignee_id: 'person-a',
				duty_roster_template_run_id: 'old-run',
				duty_roster_template_run_row_date: '2026-09-21'
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
			if (['duty_events', 'duty_event_slots', 'duty_event_runs'].includes(table)) {
				dutyReads.push(table);
				return Promise.reject(new Error('Duty event storage is unavailable'));
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
