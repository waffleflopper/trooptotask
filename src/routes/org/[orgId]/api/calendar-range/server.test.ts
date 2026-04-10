import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _getConfig } from './+server';

describe('GET /api/calendar-range', () => {
	it('exports a calendar read RouteConfig', () => {
		expect(_getConfig.permission).toBe('calendar');
		expect(_getConfig.mutation).toBeUndefined();
	});

	it('returns only the ranged calendar payload for the requested window', async () => {
		const ctx = createTestContext();

		ctx.store.seed('availability_entries', [
			{
				id: 'a1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p1',
				status_type_id: 'st1',
				start_date: '2026-03-01',
				end_date: '2026-03-05',
				note: null
			}
		]);
		ctx.store.seed('special_days', [
			{ id: 'sd1', organization_id: ctx.auth.orgId, date: '2026-03-15', name: 'Training Holiday', type: 'org-closure' }
		]);
		ctx.store.seed('daily_assignments', [
			{ id: 'da1', organization_id: ctx.auth.orgId, date: '2026-03-10', assignment_type_id: 'at1', assignee_id: 'p1' }
		]);

		const result = await handleUseCaseRequest(_getConfig, ctx, {
			rangeStart: '2026-03-01',
			rangeEnd: '2026-03-31'
		});

		expect(result).toEqual({
			rangeStart: '2026-03-01',
			rangeEnd: '2026-03-31',
			availabilityEntries: [
				expect.objectContaining({
					id: 'a1',
					personnelId: 'p1'
				})
			],
			specialDays: [
				expect.objectContaining({
					id: 'sd1',
					name: 'Training Holiday'
				})
			],
			dailyAssignments: [
				expect.objectContaining({
					id: 'da1',
					assignmentTypeId: 'at1'
				})
			],
			advancedDutyEvents: []
		});
		expect((result as Record<string, unknown>).assignmentTypes).toBeUndefined();
		expect((result as Record<string, unknown>).pinnedGroups).toBeUndefined();
	});
});
