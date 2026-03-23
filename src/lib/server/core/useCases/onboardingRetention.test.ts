import { describe, it, expect } from 'vitest';
import { createInMemoryDataStore } from '$lib/server/adapters/inMemory';
import { cleanupExpiredOnboardings } from './onboardingRetention';

function buildStore() {
	const store = createInMemoryDataStore();
	// Seed admins for notifications
	store.seed('organization_memberships', [
		{ user_id: 'admin-1', organization_id: 'org-1', role: 'owner' },
		{ user_id: 'admin-2', organization_id: 'org-2', role: 'admin' }
	]);
	return store;
}

function monthsAgo(months: number): string {
	const d = new Date();
	d.setMonth(d.getMonth() - months);
	return d.toISOString();
}

const org1Config = { id: 'org-1', retentionMonths: 12 };
const org2Config = { id: 'org-2', retentionMonths: 6 };

describe('cleanupExpiredOnboardings', () => {
	it('deletes completed onboardings past retention period', async () => {
		const store = buildStore();
		store.seed('personnel_onboardings', [
			{
				id: 'ob-expired',
				organization_id: 'org-1',
				personnel_id: 'p-1',
				template_id: 'tmpl-1',
				status: 'completed',
				started_at: monthsAgo(18),
				completed_at: monthsAgo(13),
				cancelled_at: null
			}
		]);
		store.seed('onboarding_step_progress', [
			{
				id: 'sp-1',
				onboarding_id: 'ob-expired',
				step_name: 'Get ID',
				step_type: 'checkbox',
				completed: true,
				active: true,
				organization_id: 'org-1'
			}
		]);

		const result = await cleanupExpiredOnboardings(store, [org1Config]);

		expect(result.deletedCount).toBe(1);
		const remaining = await store.findMany('personnel_onboardings', 'org-1');
		expect(remaining).toHaveLength(0);
	});

	it('deletes cancelled onboardings past retention period', async () => {
		const store = buildStore();
		store.seed('personnel_onboardings', [
			{
				id: 'ob-cancelled',
				organization_id: 'org-1',
				personnel_id: 'p-1',
				template_id: 'tmpl-1',
				status: 'cancelled',
				started_at: monthsAgo(18),
				completed_at: null,
				cancelled_at: monthsAgo(13)
			}
		]);

		const result = await cleanupExpiredOnboardings(store, [org1Config]);

		expect(result.deletedCount).toBe(1);
	});

	it('does not delete onboardings within retention period', async () => {
		const store = buildStore();
		store.seed('personnel_onboardings', [
			{
				id: 'ob-recent',
				organization_id: 'org-1',
				personnel_id: 'p-1',
				template_id: 'tmpl-1',
				status: 'completed',
				started_at: monthsAgo(6),
				completed_at: monthsAgo(3),
				cancelled_at: null
			}
		]);

		const result = await cleanupExpiredOnboardings(store, [org1Config]);

		expect(result.deletedCount).toBe(0);
		const remaining = await store.findMany('personnel_onboardings', 'org-1');
		expect(remaining).toHaveLength(1);
	});

	it('does not delete in_progress onboardings', async () => {
		const store = buildStore();
		store.seed('personnel_onboardings', [
			{
				id: 'ob-active',
				organization_id: 'org-1',
				personnel_id: 'p-1',
				template_id: 'tmpl-1',
				status: 'in_progress',
				started_at: monthsAgo(18),
				completed_at: null,
				cancelled_at: null
			}
		]);

		const result = await cleanupExpiredOnboardings(store, [org1Config]);

		expect(result.deletedCount).toBe(0);
	});

	it('cascades deletion to step progress rows', async () => {
		const store = buildStore();
		store.seed('personnel_onboardings', [
			{
				id: 'ob-expired',
				organization_id: 'org-1',
				personnel_id: 'p-1',
				template_id: 'tmpl-1',
				status: 'completed',
				started_at: monthsAgo(18),
				completed_at: monthsAgo(13),
				cancelled_at: null
			}
		]);
		store.seed('onboarding_step_progress', [
			{
				id: 'sp-1',
				onboarding_id: 'ob-expired',
				step_name: 'Step A',
				step_type: 'checkbox',
				completed: true,
				active: true,
				organization_id: 'org-1'
			},
			{
				id: 'sp-2',
				onboarding_id: 'ob-expired',
				step_name: 'Step B',
				step_type: 'paperwork',
				completed: false,
				active: true,
				organization_id: 'org-1'
			}
		]);

		await cleanupExpiredOnboardings(store, [org1Config]);

		const steps = await store.findMany('onboarding_step_progress', 'org-1');
		expect(steps).toHaveLength(0);
	});

	it('respects per-org retention settings', async () => {
		const store = buildStore();
		// org-1 has 12-month retention, org-2 has 6-month retention
		store.seed('personnel_onboardings', [
			{
				id: 'ob-org1',
				organization_id: 'org-1',
				personnel_id: 'p-1',
				template_id: 'tmpl-1',
				status: 'completed',
				started_at: monthsAgo(12),
				completed_at: monthsAgo(8),
				cancelled_at: null
			},
			{
				id: 'ob-org2',
				organization_id: 'org-2',
				personnel_id: 'p-2',
				template_id: 'tmpl-2',
				status: 'completed',
				started_at: monthsAgo(12),
				completed_at: monthsAgo(8),
				cancelled_at: null
			}
		]);

		const result = await cleanupExpiredOnboardings(store, [org1Config, org2Config]);

		// org-2 (6-month retention) should delete, org-1 (12-month) should not
		expect(result.deletedCount).toBe(1);
		const org1Remaining = await store.findMany('personnel_onboardings', 'org-1');
		expect(org1Remaining).toHaveLength(1);
		const org2Remaining = await store.findMany('personnel_onboardings', 'org-2');
		expect(org2Remaining).toHaveLength(0);
	});

	it('notifies admins when records are cleaned up', async () => {
		const store = buildStore();
		store.seed('personnel_onboardings', [
			{
				id: 'ob-expired',
				organization_id: 'org-1',
				personnel_id: 'p-1',
				template_id: 'tmpl-1',
				status: 'completed',
				started_at: monthsAgo(18),
				completed_at: monthsAgo(13),
				cancelled_at: null
			}
		]);

		await cleanupExpiredOnboardings(store, [org1Config]);

		const notifications = await store.findMany<Record<string, unknown>>('notifications', 'org-1');
		expect(notifications).toHaveLength(1);
		expect(notifications[0]).toMatchObject({
			user_id: 'admin-1',
			type: 'onboarding_auto_deleted',
			title: 'Onboarding Records Auto-Deleted'
		});
	});

	it('returns summary with deletedCount and orgsAffected', async () => {
		const store = buildStore();
		store.seed('personnel_onboardings', [
			{
				id: 'ob-1',
				organization_id: 'org-1',
				personnel_id: 'p-1',
				template_id: 'tmpl-1',
				status: 'completed',
				started_at: monthsAgo(18),
				completed_at: monthsAgo(13),
				cancelled_at: null
			},
			{
				id: 'ob-2',
				organization_id: 'org-2',
				personnel_id: 'p-2',
				template_id: 'tmpl-2',
				status: 'cancelled',
				started_at: monthsAgo(12),
				completed_at: null,
				cancelled_at: monthsAgo(8)
			}
		]);

		const result = await cleanupExpiredOnboardings(store, [org1Config, org2Config]);

		expect(result.deletedCount).toBe(2);
		expect(result.orgsAffected).toBe(2);
	});

	it('returns zero counts when nothing to clean up', async () => {
		const store = buildStore();

		const result = await cleanupExpiredOnboardings(store, [org1Config]);

		expect(result.deletedCount).toBe(0);
		expect(result.orgsAffected).toBe(0);
	});

	it('returns zero counts when no org configs provided', async () => {
		const store = buildStore();

		const result = await cleanupExpiredOnboardings(store, []);

		expect(result.deletedCount).toBe(0);
		expect(result.orgsAffected).toBe(0);
	});
});
