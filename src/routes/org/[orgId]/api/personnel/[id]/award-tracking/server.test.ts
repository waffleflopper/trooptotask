import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

const PERSON_ID = '00000000-0000-4000-8000-0000000000a1';
const FOREIGN_PERSON_ID = '00000000-0000-4000-8000-0000000000f1';

describe('POST /api/personnel/[id]/award-tracking', () => {
	it('persists the award-tracking acknowledgment toggle for the targeted person', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('personnel', [
			{
				id: PERSON_ID,
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

		const acknowledged = await handleUseCaseRequest(
			_postConfig,
			ctx,
			{
				personnelId: PERSON_ID,
				acknowledged: true
			},
			() => ctx
		);
		const cleared = await handleUseCaseRequest(
			_postConfig,
			ctx,
			{
				personnelId: PERSON_ID,
				acknowledged: false
			},
			() => ctx
		);

		expect(acknowledged).toEqual({
			personnelId: PERSON_ID,
			awardTrackingAcknowledged: true
		});
		expect(cleared).toEqual({
			personnelId: PERSON_ID,
			awardTrackingAcknowledged: false
		});

		const rows = await ctx.rawStore.findMany<Record<string, unknown>>('personnel_extended_info', ctx.auth.orgId, {
			personnel_id: PERSON_ID
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
			handleUseCaseRequest(
				_postConfig,
				ctx,
				{
					personnelId: PERSON_ID,
					acknowledged: true
				},
				() => ctx
			)
		).rejects.toMatchObject({ status: 403 });
	});

	it.each([
		{ value: true, expected: true },
		{ value: false, expected: false },
		{ value: 'true', expected: false },
		{ value: undefined, expected: false }
	])('uses only literal true and keeps the path Person authoritative ($value)', async ({ value, expected }) => {
		await expect(
			_postConfig.parseInput?.({
				params: { id: PERSON_ID },
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ acknowledged: value, personnelId: FOREIGN_PERSON_ID })
				})
			} as never)
		).resolves.toEqual({ personnelId: PERSON_ID, acknowledged: expected });
	});
});
