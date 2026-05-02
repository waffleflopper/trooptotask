import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _getConfig } from './+server';

describe('GET /api/calendar-reports/status-days', () => {
	it('uses Calendar report policy decisions instead of privileged route gates', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});

		const result = await handleUseCaseRequest(_getConfig, ctx, {
			startDate: '2026-03-01',
			endDate: '2026-03-31'
		});

		expect(result).toMatchObject({
			entries: [],
			assignments: [],
			assignmentTypes: []
		});
	});

	it('denies report reads without Calendar view capability', async () => {
		const ctx = createTestContext({
			auth: {
				capabilityMap: {
					calendar: 'none',
					personnel: 'configure',
					training: 'configure',
					criticalTasks: 'configure',
					onboarding: 'configure',
					ratingScheme: 'configure'
				}
			}
		});

		await expect(
			handleUseCaseRequest(_getConfig, ctx, {
				startDate: '2026-03-01',
				endDate: '2026-03-31'
			})
		).rejects.toMatchObject({
			status: 403,
			message: 'You do not have permission to view calendar data'
		});
		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'policy.denied',
			resourceType: 'calendar',
			details: {
				policyAction: 'calendar.viewReports',
				reasonCode: 'denied:missing-capability'
			}
		});
	});
});
