import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$features/critical-tasks/server/criticalTasksPersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _getConfig } from './+server';

const deniedCapabilities = {
	calendar: 'none',
	personnel: 'none',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'none',
	ratingScheme: 'none'
} as const;

describe('GET /api/critical-tasks/reports/summary', () => {
	it('denies readiness summary access through the policy decision', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				canManageMembers: false,
				capabilityMap: deniedCapabilities,
				scopeSet: { kind: 'organization' }
			}
		});

		await expect(
			handleUseCaseRequest(_getConfig, ctx, { asOf: '2026-05-23', timeZone: 'UTC' }, () => ctx)
		).rejects.toMatchObject({
			status: 403
		});
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'criticalTasks.viewReadiness'
			})
		]);
	});

	it('returns an authorized readiness summary dashboard', async () => {
		const ctx = createTestContext();

		const result = await handleUseCaseRequest(_getConfig, ctx, { asOf: '2026-05-23', timeZone: 'UTC' }, () => ctx);

		expect(result.kpis.overallReadiness).toMatchObject({
			percent: 0,
			readyCount: 0,
			applicableCount: 0
		});
		expect(result.readinessTrend.months).not.toHaveLength(0);
		expect(result.readinessDistribution.bins).not.toHaveLength(0);
	});

	describe('on the viewer day', () => {
		afterEach(() => vi.useRealTimers());

		it('counts an update as today in the time zone from the cookie', async () => {
			vi.useFakeTimers({ toFake: ['Date'] });
			vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
			const ctx = createTestContext();
			ctx.store.seed('personnel', [
				{
					id: 'p-smith',
					organization_id: ctx.auth.orgId,
					rank: 'SGT',
					last_name: 'Smith',
					first_name: 'Jane',
					mos: '68W',
					clinic_role: 'Medic',
					group_id: null,
					archived_at: null
				}
			]);
			ctx.store.seed('ict_tasks', [
				{
					id: 'task-common',
					organization_id: ctx.auth.orgId,
					task_code: '071-000-0001',
					title: 'Maintain communications',
					description: null,
					mos: [],
					expiration_months: 12,
					sort_order: 0,
					archived_at: null,
					created_at: '2026-01-01T00:00:00Z'
				}
			]);
			ctx.store.seed('personnel_ict_completions', [
				{
					id: 'completion-1',
					organization_id: ctx.auth.orgId,
					personnel_id: 'p-smith',
					ict_task_id: 'task-common',
					completed_at: '2026-10-01',
					validation_method: 'Demonstration',
					validated_by: null,
					notes: null,
					logged_by: 'user-1',
					created_at: '2026-10-15T11:00:00Z'
				}
			]);
			const input = _getConfig.parseInput!({
				url: new URL('https://trooptotask.test/reports'),
				cookies: { get: (name: string) => (name === 't2t_tz' ? 'Pacific/Kiritimati' : undefined) }
			} as never);

			const result = await handleUseCaseRequest(_getConfig, ctx, input, () => ctx);

			expect(result.atRiskSoldiers.rows).toEqual([
				expect.objectContaining({ personnelId: 'p-smith', daysSinceLastIctUpdate: 0 })
			]);
		});
	});
});
