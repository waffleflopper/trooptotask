import { describe, it, expect } from 'vitest';
import {
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestReadOnlyGuard,
	createTestSubscriptionPort,
	createTestNotificationPort
} from '$lib/server/adapters/inMemory';
import type { UseCaseContext } from '$lib/server/core/ports';
import { fetchDashboardData } from './dashboardQuery';

const ORG = 'test-org';
const USER = 'user-1';

function buildCtx(overrides?: { auth?: Parameters<typeof createTestAuthContext>[0] }): UseCaseContext {
	const store = createInMemoryDataStore();
	return {
		store,
		rawStore: store,
		auth: createTestAuthContext({ orgId: ORG, userId: USER, ...overrides?.auth }),
		audit: createTestAuditPort(),
		readOnlyGuard: createTestReadOnlyGuard(),
		subscription: createTestSubscriptionPort(),
		notifications: createTestNotificationPort()
	};
}

describe('fetchDashboardData', () => {
	it('returns all dashboard data sections via ctx.store', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;

		store.seed('availability_entries', [
			{
				id: 'ae1',
				organization_id: ORG,
				personnel_id: 'p1',
				status_type_id: 'st1',
				start_date: '2026-03-20',
				end_date: '2026-03-25',
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
				date: '2026-03-23',
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

		const result = await fetchDashboardData(ctx);

		expect(result.activeOnboardings).toHaveLength(1);
		expect(result.activeOnboardings[0].personnelId).toBe('p1');
	});

	it('returns empty pinned groups when no userId', async () => {
		const ctx = buildCtx({ auth: { userId: null } });

		const result = await fetchDashboardData(ctx);

		expect(result.pinnedGroups).toEqual([]);
	});
});
