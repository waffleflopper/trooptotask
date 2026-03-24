import { describe, it, expect } from 'vitest';
import {
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestReadOnlyGuard,
	createTestSubscriptionPort,
	createTestNotificationPort,
	createTestBillingPort
} from '$lib/server/adapters/inMemory';
import type { UseCaseContext } from '$lib/server/core/ports';
import { fetchPersonnelPageData } from './personnelPageQuery';

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
		notifications: createTestNotificationPort(),
		billing: createTestBillingPort()
	};
}

describe('fetchPersonnelPageData', () => {
	it('returns pinned groups and rating scheme entries via ctx.store', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;

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

		const result = await fetchPersonnelPageData(ctx);

		expect(result.pinnedGroups).toHaveLength(1);
		expect(result.ratingSchemeEntries).toHaveLength(1);
		expect(result.ratingSchemeEntries[0].ratedPersonId).toBe('p1');
	});

	it('returns empty pinned groups when no userId', async () => {
		const ctx = buildCtx({ auth: { userId: null } });
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;

		store.seed('user_pinned_groups', [
			{ id: 'pg1', organization_id: ORG, user_id: 'other-user', group_name: 'Alpha', sort_order: 0 }
		]);

		const result = await fetchPersonnelPageData(ctx);

		expect(result.pinnedGroups).toEqual([]);
	});

	it('filters pinned groups to current user only', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;

		store.seed('user_pinned_groups', [
			{ id: 'pg1', organization_id: ORG, user_id: USER, group_name: 'Alpha', sort_order: 0 },
			{ id: 'pg2', organization_id: ORG, user_id: 'other-user', group_name: 'Bravo', sort_order: 1 }
		]);

		const result = await fetchPersonnelPageData(ctx);

		expect(result.pinnedGroups).toHaveLength(1);
	});
});
