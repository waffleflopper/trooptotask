import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
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

		await expect(handleUseCaseRequest(_getConfig, ctx, { asOf: '2026-05-23' })).rejects.toMatchObject({
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

		const result = await handleUseCaseRequest(_getConfig, ctx, { asOf: '2026-05-23' });

		expect(result.kpis.overallReadiness).toMatchObject({
			percent: 0,
			readyCount: 0,
			applicableCount: 0
		});
		expect(result.readinessTrend.months).not.toHaveLength(0);
		expect(result.readinessDistribution.bins).not.toHaveLength(0);
	});
});
