import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

describe('POST /api/personnel/[id]/award-tracking', () => {
	it('persists the award-tracking acknowledgment toggle for the targeted person', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('personnel', [
			{
				id: 'person-1',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: null,
				ets: '2026-08-01',
				deros: null,
				archived_at: null
			}
		]);

		const acknowledged = await handleUseCaseRequest(_postConfig, ctx, {
			personnelId: 'person-1',
			acknowledged: true
		});
		const cleared = await handleUseCaseRequest(_postConfig, ctx, {
			personnelId: 'person-1',
			acknowledged: false
		});

		expect(acknowledged).toEqual({
			personnelId: 'person-1',
			awardTrackingAcknowledged: true
		});
		expect(cleared).toEqual({
			personnelId: 'person-1',
			awardTrackingAcknowledged: false
		});

		const rows = await ctx.rawStore.findMany<Record<string, unknown>>('personnel_extended_info', ctx.auth.orgId, {
			personnel_id: 'person-1'
		});
		expect(rows).toHaveLength(1);
		expect(rows[0].award_tracking_acknowledged_at).toBeNull();
	});

	it('requires Personnel operate capability for award-tracking writes', async () => {
		const ctx = createTestContext({
			auth: {
				capabilityMap: {
					calendar: 'view',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});

		await expect(
			handleUseCaseRequest(_postConfig, ctx, {
				personnelId: 'person-1',
				acknowledged: true
			})
		).rejects.toMatchObject({ status: 403 });
	});
});
