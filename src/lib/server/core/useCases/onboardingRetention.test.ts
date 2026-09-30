import { describe, it, expect, vi } from 'vitest';
import { createInMemoryDataStore } from '$lib/server/adapters/inMemory';
import { cleanupExpiredOnboardings } from './onboardingRetention';
import type { NotificationDeliveryPort } from '$features/notifications/contracts';

function buildPorts() {
	return {
		store: createInMemoryDataStore(),
		notifications: { notifyAdmins: vi.fn<NotificationDeliveryPort['notifyAdmins']>().mockResolvedValue(undefined) }
	};
}

function monthsAgo(months: number): string {
	const d = new Date();
	d.setMonth(d.getMonth() - months);
	return d.toISOString();
}

const org1Config = { id: 'org-1', retentionMonths: 12 };
const org2Config = { id: 'org-2', retentionMonths: 6 };

function makeCompletedOnboarding(id: string, completedAt: string, orgId = 'org-1') {
	return {
		id,
		organization_id: orgId,
		personnel_id: `person-${id}`,
		template_id: 'tmpl-1',
		status: 'completed',
		started_at: completedAt,
		completed_at: completedAt,
		cancelled_at: null
	};
}

function makeStepProgress(onboardingId: string, orgId = 'org-1') {
	return {
		id: `sp-${onboardingId}`,
		onboarding_id: onboardingId,
		step_name: 'Step A',
		step_type: 'checkbox',
		completed: true,
		active: true,
		organization_id: orgId
	};
}

describe('cleanupExpiredOnboardings', () => {
	it('deletes completed onboardings past retention period', async () => {
		const ports = buildPorts();
		const { store } = ports;
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

		const result = await cleanupExpiredOnboardings(ports, [org1Config]);

		expect(result.deletedCount).toBe(1);
		const remaining = await store.findMany('personnel_onboardings', 'org-1');
		expect(remaining).toHaveLength(0);
	});

	it('deletes cancelled onboardings past retention period', async () => {
		const ports = buildPorts();
		const { store } = ports;
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

		const result = await cleanupExpiredOnboardings(ports, [org1Config]);

		expect(result.deletedCount).toBe(1);
	});

	it('does not delete onboardings within retention period', async () => {
		const ports = buildPorts();
		const { store } = ports;
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

		const result = await cleanupExpiredOnboardings(ports, [org1Config]);

		expect(result.deletedCount).toBe(0);
		const remaining = await store.findMany('personnel_onboardings', 'org-1');
		expect(remaining).toHaveLength(1);
	});

	it('does not delete in_progress onboardings', async () => {
		const ports = buildPorts();
		const { store } = ports;
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

		const result = await cleanupExpiredOnboardings(ports, [org1Config]);

		expect(result.deletedCount).toBe(0);
	});

	it('cascades deletion to step progress rows', async () => {
		const ports = buildPorts();
		const { store } = ports;
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

		await cleanupExpiredOnboardings(ports, [org1Config]);

		const steps = await store.findMany('onboarding_step_progress', 'org-1');
		expect(steps).toHaveLength(0);
	});

	it('removes expired onboardings and their step progress', async () => {
		const ports = buildPorts();
		const { store } = ports;
		store.seed('personnel_onboardings', [
			{
				id: 'ob-expired-completed',
				organization_id: 'org-1',
				personnel_id: 'p-1',
				template_id: 'tmpl-1',
				status: 'completed',
				started_at: monthsAgo(18),
				completed_at: monthsAgo(13),
				cancelled_at: null
			},
			{
				id: 'ob-expired-cancelled',
				organization_id: 'org-1',
				personnel_id: 'p-2',
				template_id: 'tmpl-1',
				status: 'cancelled',
				started_at: monthsAgo(18),
				completed_at: null,
				cancelled_at: monthsAgo(13)
			},
			{
				id: 'ob-recent',
				organization_id: 'org-1',
				personnel_id: 'p-3',
				template_id: 'tmpl-1',
				status: 'completed',
				started_at: monthsAgo(6),
				completed_at: monthsAgo(3),
				cancelled_at: null
			},
			{
				id: 'ob-active',
				organization_id: 'org-1',
				personnel_id: 'p-4',
				template_id: 'tmpl-1',
				status: 'in_progress',
				started_at: monthsAgo(18),
				completed_at: null,
				cancelled_at: null
			}
		]);
		store.seed('onboarding_step_progress', [
			{
				id: 'sp-completed-1',
				onboarding_id: 'ob-expired-completed',
				step_name: 'Step A',
				step_type: 'checkbox',
				completed: true,
				active: true,
				organization_id: 'org-1'
			},
			{
				id: 'sp-completed-2',
				onboarding_id: 'ob-expired-completed',
				step_name: 'Step B',
				step_type: 'paperwork',
				completed: false,
				active: true,
				organization_id: 'org-1'
			},
			{
				id: 'sp-cancelled-1',
				onboarding_id: 'ob-expired-cancelled',
				step_name: 'Step C',
				step_type: 'checkbox',
				completed: false,
				active: true,
				organization_id: 'org-1'
			},
			{
				id: 'sp-cancelled-2',
				onboarding_id: 'ob-expired-cancelled',
				step_name: 'Step D',
				step_type: 'paperwork',
				completed: false,
				active: true,
				organization_id: 'org-1'
			},
			{
				id: 'sp-recent',
				onboarding_id: 'ob-recent',
				step_name: 'Step E',
				step_type: 'checkbox',
				completed: false,
				active: true,
				organization_id: 'org-1'
			},
			{
				id: 'sp-active',
				onboarding_id: 'ob-active',
				step_name: 'Step F',
				step_type: 'checkbox',
				completed: false,
				active: true,
				organization_id: 'org-1'
			}
		]);

		const result = await cleanupExpiredOnboardings(ports, [org1Config]);

		expect(result).toEqual({ deletedCount: 2, orgsAffected: 1 });
		const remainingOnboardings = await store.findMany<{ id: string }>('personnel_onboardings', 'org-1');
		expect(remainingOnboardings.map((row) => row.id).sort()).toEqual(['ob-active', 'ob-recent']);
		const remainingSteps = await store.findMany<{ onboarding_id: string }>('onboarding_step_progress', 'org-1');
		expect(remainingSteps.map((row) => row.onboarding_id).sort()).toEqual(['ob-active', 'ob-recent']);
		expect(ports.notifications.notifyAdmins).toHaveBeenCalledWith(
			'org-1',
			null,
			expect.objectContaining({ message: '2 onboarding records auto-deleted after retention period' })
		);
	});

	it('cleans up large expired onboarding backlogs', async () => {
		const ports = buildPorts();
		const { store } = ports;
		const expiredOnboardings = Array.from({ length: 205 }, (_, index) =>
			makeCompletedOnboarding(`ob-expired-${index}`, monthsAgo(13))
		);
		store.seed('personnel_onboardings', expiredOnboardings);
		store.seed(
			'onboarding_step_progress',
			expiredOnboardings.map((row) => makeStepProgress(row.id))
		);
		const result = await cleanupExpiredOnboardings(ports, [org1Config]);

		expect(result).toEqual({ deletedCount: 205, orgsAffected: 1 });
		const remainingOnboardings = await store.findMany('personnel_onboardings', 'org-1');
		expect(remainingOnboardings).toHaveLength(0);
		const remainingSteps = await store.findMany('onboarding_step_progress', 'org-1');
		expect(remainingSteps).toHaveLength(0);
	});

	it('uses a UTC month-end clamp for retention cutoffs', async () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(new Date('2026-03-31T12:00:00.000Z'));
			const ports = buildPorts();
			const { store } = ports;
			store.seed('personnel_onboardings', [
				makeCompletedOnboarding('ob-before-feb-cutoff', '2026-02-28T11:59:59.999Z'),
				makeCompletedOnboarding('ob-at-feb-cutoff', '2026-02-28T12:00:00.000Z')
			]);

			const oneMonthResult = await cleanupExpiredOnboardings(ports, [{ id: 'org-1', retentionMonths: 1 }]);

			expect(oneMonthResult).toEqual({ deletedCount: 1, orgsAffected: 1 });
			let remaining = await store.findMany<{ id: string }>('personnel_onboardings', 'org-1');
			expect(remaining.map((row) => row.id).sort()).toEqual(['ob-at-feb-cutoff']);

			const secondPorts = buildPorts();
			const { store: secondStore } = secondPorts;
			secondStore.seed('personnel_onboardings', [
				makeCompletedOnboarding('ob-before-jan-cutoff', '2026-01-31T11:59:59.999Z'),
				makeCompletedOnboarding('ob-at-jan-cutoff', '2026-01-31T12:00:00.000Z')
			]);

			const twoMonthResult = await cleanupExpiredOnboardings(secondPorts, [{ id: 'org-1', retentionMonths: 2 }]);

			expect(twoMonthResult).toEqual({ deletedCount: 1, orgsAffected: 1 });
			remaining = await secondStore.findMany<{ id: string }>('personnel_onboardings', 'org-1');
			expect(remaining.map((row) => row.id)).toEqual(['ob-at-jan-cutoff']);

			vi.setSystemTime(new Date('2024-03-31T12:00:00.000Z'));
			const leapPorts = buildPorts();
			const { store: leapStore } = leapPorts;
			leapStore.seed('personnel_onboardings', [
				makeCompletedOnboarding('ob-before-leap-cutoff', '2024-02-29T11:59:59.999Z'),
				makeCompletedOnboarding('ob-at-leap-cutoff', '2024-02-29T12:00:00.000Z')
			]);

			const leapResult = await cleanupExpiredOnboardings(leapPorts, [{ id: 'org-1', retentionMonths: 1 }]);

			expect(leapResult).toEqual({ deletedCount: 1, orgsAffected: 1 });
			remaining = await leapStore.findMany<{ id: string }>('personnel_onboardings', 'org-1');
			expect(remaining.map((row) => row.id)).toEqual(['ob-at-leap-cutoff']);
		} finally {
			vi.useRealTimers();
		}
	});

	it('respects per-org retention settings', async () => {
		const ports = buildPorts();
		const { store } = ports;
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

		const result = await cleanupExpiredOnboardings(ports, [org1Config, org2Config]);

		// org-2 (6-month retention) should delete, org-1 (12-month) should not
		expect(result.deletedCount).toBe(1);
		const org1Remaining = await store.findMany('personnel_onboardings', 'org-1');
		expect(org1Remaining).toHaveLength(1);
		const org2Remaining = await store.findMany('personnel_onboardings', 'org-2');
		expect(org2Remaining).toHaveLength(0);
	});

	it('defaults missing archive_retention_months to 36 months inside the use case', async () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(new Date('2026-05-30T12:00:00.000Z'));
			const ports = buildPorts();
			const { store } = ports;
			store.seed('personnel_onboardings', [
				makeCompletedOnboarding('ob-expired-default', '2023-05-29T12:00:00.000Z'),
				makeCompletedOnboarding('ob-recent-default', '2023-06-01T12:00:00.000Z')
			]);

			const result = await cleanupExpiredOnboardings(ports, [{ id: 'org-1', retentionMonths: null }]);

			expect(result).toEqual({ deletedCount: 1, orgsAffected: 1 });
			const remaining = await store.findMany<{ id: string }>('personnel_onboardings', 'org-1');
			expect(remaining.map((row) => row.id)).toEqual(['ob-recent-default']);
		} finally {
			vi.useRealTimers();
		}
	});

	it('notifies admins when records are cleaned up', async () => {
		const ports = buildPorts();
		const { store } = ports;
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

		await cleanupExpiredOnboardings(ports, [org1Config]);

		expect(ports.notifications.notifyAdmins).toHaveBeenCalledExactlyOnceWith(
			'org-1',
			null,
			expect.objectContaining({ type: 'onboarding_auto_deleted' })
		);
	});

	it('returns summary with deletedCount and orgsAffected', async () => {
		const ports = buildPorts();
		const { store } = ports;
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

		const result = await cleanupExpiredOnboardings(ports, [org1Config, org2Config]);

		expect(result.deletedCount).toBe(2);
		expect(result.orgsAffected).toBe(2);
	});

	it('returns zero counts when nothing to clean up', async () => {
		const ports = buildPorts();

		const result = await cleanupExpiredOnboardings(ports, [org1Config]);

		expect(result.deletedCount).toBe(0);
		expect(result.orgsAffected).toBe(0);
		expect(ports.notifications.notifyAdmins).not.toHaveBeenCalled();
	});

	it('returns zero counts when no org configs provided', async () => {
		const ports = buildPorts();

		const result = await cleanupExpiredOnboardings(ports, []);

		expect(result.deletedCount).toBe(0);
		expect(result.orgsAffected).toBe(0);
		expect(ports.notifications.notifyAdmins).not.toHaveBeenCalled();
	});

	it('fails when required notification delivery fails after cleanup, without claiming a rollback or processing the next Organization', async () => {
		const ports = buildPorts();
		ports.store.seed('personnel_onboardings', [
			makeCompletedOnboarding('org-1-expired', monthsAgo(13)),
			makeCompletedOnboarding('org-2-expired', monthsAgo(13), 'org-2')
		]);
		ports.store.seed('onboarding_step_progress', [makeStepProgress('org-1-expired')]);
		ports.notifications.notifyAdmins.mockRejectedValue(new Error('notification insert unavailable'));

		await expect(cleanupExpiredOnboardings(ports, [org1Config, org2Config])).rejects.toThrow(
			'notification insert unavailable'
		);

		await expect(ports.store.findMany('personnel_onboardings', 'org-1')).resolves.toEqual([]);
		await expect(ports.store.findMany('onboarding_step_progress', 'org-1')).resolves.toEqual([]);
		await expect(ports.store.findMany('personnel_onboardings', 'org-2')).resolves.toEqual([
			expect.objectContaining({ id: 'org-2-expired' })
		]);
	});
});
