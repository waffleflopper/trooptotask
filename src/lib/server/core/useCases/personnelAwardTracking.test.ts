import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { setPersonnelAwardTrackingAcknowledged } from './personnelAwardTracking';

function seedPersonnel(ctx: ReturnType<typeof createTestContext>, groupId: string | null = null) {
	ctx.rawStore.seed('personnel', [
		{
			id: 'person-1',
			organization_id: ctx.auth.orgId,
			rank: 'SGT',
			last_name: 'Smith',
			first_name: 'Jamie',
			mos: '68W',
			clinic_role: 'Medic',
			group_id: groupId,
			ets: '2026-08-01',
			deros: null,
			archived_at: null
		}
	]);
}

describe('setPersonnelAwardTrackingAcknowledged', () => {
	it('persists an acknowledgment timestamp in personnel_extended_info for the person', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx);

		const result = await setPersonnelAwardTrackingAcknowledged(ctx, {
			personnelId: 'person-1',
			acknowledged: true
		});

		expect(result).toEqual({
			personnelId: 'person-1',
			awardTrackingAcknowledged: true
		});

		const rows = await ctx.rawStore.findMany<Record<string, unknown>>('personnel_extended_info', ctx.auth.orgId, {
			personnel_id: 'person-1'
		});

		expect(rows).toHaveLength(1);
		expect(rows[0].award_tracking_acknowledged_at).toEqual(expect.any(String));
	});

	it('clears the acknowledgment timestamp without deleting the extended-info row', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx);
		ctx.rawStore.seed('personnel_extended_info', [
			{
				id: 'ext-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				leader_notes: 'Keep this row',
				award_tracking_acknowledged_at: '2026-04-14T12:00:00.000Z'
			}
		]);

		const result = await setPersonnelAwardTrackingAcknowledged(ctx, {
			personnelId: 'person-1',
			acknowledged: false
		});

		expect(result).toEqual({
			personnelId: 'person-1',
			awardTrackingAcknowledged: false
		});

		const rows = await ctx.rawStore.findMany<Record<string, unknown>>('personnel_extended_info', ctx.auth.orgId, {
			personnel_id: 'person-1'
		});

		expect(rows).toHaveLength(1);
		expect(rows[0].leader_notes).toBe('Keep this row');
		expect(rows[0].award_tracking_acknowledged_at).toBeNull();
	});

	it('updates an existing extended-info row instead of inserting a duplicate', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx);
		ctx.rawStore.seed('personnel_extended_info', [
			{
				id: 'ext-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				leader_notes: 'Existing row',
				award_tracking_acknowledged_at: null
			}
		]);

		await setPersonnelAwardTrackingAcknowledged(ctx, {
			personnelId: 'person-1',
			acknowledged: true
		});

		const rows = await ctx.rawStore.findMany<Record<string, unknown>>('personnel_extended_info', ctx.auth.orgId, {
			personnel_id: 'person-1'
		});

		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe('ext-1');
		expect(rows[0].leader_notes).toBe('Existing row');
		expect(rows[0].award_tracking_acknowledged_at).toEqual(expect.any(String));
	});

	it('allows group-scoped users to acknowledge award tracking for in-scope Personnel', async () => {
		const requireGroupAccess = vi.fn(async () => {});
		const ctx = createTestContext({
			auth: {
				scopeSet: { kind: 'groups', groupIds: ['group-1'] }
			},
			scope: {
				requireGroupAccess
			}
		});
		seedPersonnel(ctx, 'group-1');

		await expect(
			setPersonnelAwardTrackingAcknowledged(ctx, {
				personnelId: 'person-1',
				acknowledged: true
			})
		).resolves.toEqual({
			personnelId: 'person-1',
			awardTrackingAcknowledged: true
		});

		expect(requireGroupAccess).toHaveBeenCalledWith('person-1');
	});

	it('rejects award tracking changes when the group-scope guard denies Personnel access', async () => {
		const groupAccessError = new Error('Group access denied');
		(groupAccessError as unknown as Record<string, unknown>).status = 403;
		const ctx = createTestContext({
			auth: {
				scopeSet: { kind: 'groups', groupIds: ['group-1'] }
			},
			scope: {
				async requireGroupAccess() {
					throw groupAccessError;
				}
			}
		});
		seedPersonnel(ctx, 'group-1');

		await expect(
			setPersonnelAwardTrackingAcknowledged(ctx, {
				personnelId: 'person-1',
				acknowledged: true
			})
		).rejects.toMatchObject({ status: 403 });
	});
});
