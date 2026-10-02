import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { setPersonnelAwardTrackingAcknowledged } from './awardTracking.server';

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

const sharedSheet = {
	id: 'sheet-1',
	organization_id: 'test-org',
	personnel_id: 'person-1',
	blood_type: 'O+',
	basd: '2020-01-15',
	date_of_rank: '2024-06-01',
	marital_status: 'Married',
	number_of_dependents: 2,
	children: [{ name: 'Avery', age: 7 }],
	civilian_education: 'BSN',
	military_education: ['BLC'],
	emergency_contact_name: 'Jamie Rivera',
	emergency_contact_relationship: 'Spouse',
	emergency_contact_phone: '907-555-0100',
	spouse_name: 'Jamie Rivera',
	spouse_phone: '907-555-0101',
	vehicle_make_model: 'Toyota Tacoma',
	vehicle_plate: 'JBER482',
	vehicle_color: 'Gray',
	personal_email: 'rivera@example.test',
	personal_phone: '907-555-0102',
	address_street: '1128 Arctic Valley Rd',
	address_city: 'Anchorage',
	address_state: 'AK',
	address_zip: '99505',
	award_tracking_acknowledged_at: null,
	created_at: '2025-01-01T00:00:00.000Z',
	updated_at: '2025-01-02T00:00:00.000Z'
};
function awardContext(groups?: string[], personnel: 'view' | 'operate' = 'operate') {
	const ctx = createTestContext({
		auth: {
			role: 'member',
			isPrivileged: false,
			canManageMembers: false,
			capabilityMap: {
				calendar: 'none',
				personnel,
				training: 'none',
				criticalTasks: 'none',
				onboarding: 'none',
				ratingScheme: 'none'
			},
			scopeSet: groups ? { kind: 'groups', groupIds: groups } : { kind: 'organization' }
		}
	});
	ctx.rawStore.seed('personnel', [
		{ id: 'person-1', organization_id: ctx.auth.orgId, group_id: 'alpha' },
		{ id: 'person-2', organization_id: ctx.auth.orgId, group_id: 'bravo' },
		{ id: 'person-foreign', organization_id: 'foreign-org', group_id: 'alpha' }
	]);
	ctx.rawStore.seed('personnel_extended_info', [
		structuredClone(sharedSheet),
		{ ...structuredClone(sharedSheet), id: 'sheet-2', personnel_id: 'person-2' },
		{
			...structuredClone(sharedSheet),
			id: 'sheet-foreign',
			personnel_id: 'person-foreign',
			organization_id: 'foreign-org'
		}
	]);
	return ctx;
}
async function awardRows(ctx: ReturnType<typeof awardContext>) {
	return structuredClone([
		...(await ctx.rawStore.findMany<Record<string, unknown>>('personnel_extended_info', 'test-org')),
		...(await ctx.rawStore.findMany<Record<string, unknown>>('personnel_extended_info', 'foreign-org'))
	]);
}

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('award acknowledgement retained row behavior', () => {
	it('refreshes true replay timestamps and clears only the acknowledgement while preserving every SDS field', async () => {
		vi.useFakeTimers();
		vi.setSystemTime('2026-10-01T12:00:00.000Z');
		const ctx = awardContext(['alpha']);
		await setPersonnelAwardTrackingAcknowledged(ctx, { personnelId: 'person-1', acknowledged: true });
		await expect(
			ctx.rawStore.findOne('personnel_extended_info', ctx.auth.orgId, { personnel_id: 'person-1' })
		).resolves.toEqual({
			...sharedSheet,
			award_tracking_acknowledged_at: '2026-10-01T12:00:00.000Z',
			updated_at: expect.any(String)
		});
		vi.setSystemTime('2026-10-01T12:00:01.000Z');
		await setPersonnelAwardTrackingAcknowledged(ctx, { personnelId: 'person-1', acknowledged: true });
		await expect(
			ctx.rawStore.findOne('personnel_extended_info', ctx.auth.orgId, { personnel_id: 'person-1' })
		).resolves.toEqual({
			...sharedSheet,
			award_tracking_acknowledged_at: '2026-10-01T12:00:01.000Z',
			updated_at: expect.any(String)
		});
		await setPersonnelAwardTrackingAcknowledged(ctx, { personnelId: 'person-1', acknowledged: false });
		await expect(
			ctx.rawStore.findOne('personnel_extended_info', ctx.auth.orgId, { personnel_id: 'person-1' })
		).resolves.toEqual({ ...sharedSheet, updated_at: expect.any(String) });
		await expect(
			ctx.rawStore.findOne('personnel_extended_info', ctx.auth.orgId, { personnel_id: 'person-2' })
		).resolves.toEqual({ ...sharedSheet, id: 'sheet-2', personnel_id: 'person-2' });
		await expect(
			ctx.rawStore.findOne('personnel_extended_info', 'foreign-org', { personnel_id: 'person-foreign' })
		).resolves.toEqual({
			...sharedSheet,
			id: 'sheet-foreign',
			personnel_id: 'person-foreign',
			organization_id: 'foreign-org'
		});
		expect(ctx.auditPort.events).toContainEqual({
			action: 'personnel.award_tracking_acknowledged',
			resourceType: 'personnel',
			resourceId: 'person-1'
		});
		expect(ctx.auditPort.events).toContainEqual({
			action: 'personnel.award_tracking_cleared',
			resourceType: 'personnel',
			resourceId: 'person-1'
		});
	});

	it('clears a missing sheet without inserting one on initial request or replay', async () => {
		const ctx = awardContext();
		await ctx.rawStore.delete('personnel_extended_info', ctx.auth.orgId, 'sheet-1');
		const before = await awardRows(ctx);
		await expect(
			setPersonnelAwardTrackingAcknowledged(ctx, { personnelId: 'person-1', acknowledged: false })
		).resolves.toEqual({ personnelId: 'person-1', awardTrackingAcknowledged: false });
		await setPersonnelAwardTrackingAcknowledged(ctx, { personnelId: 'person-1', acknowledged: false });
		expect(await awardRows(ctx)).toEqual(before);
		expect(ctx.auditPort.events).toContainEqual({
			action: 'personnel.award_tracking_cleared',
			resourceType: 'personnel',
			resourceId: 'person-1'
		});
	});

	it.each([
		{ label: 'another Group', groups: ['alpha'], personnelId: 'person-2', status: 403 },
		{ label: 'empty Group scope', groups: [], personnelId: 'person-1', status: 403 },
		{ label: 'foreign Organization', groups: undefined, personnelId: 'person-foreign', status: 404 },
		{ label: 'missing Person', groups: undefined, personnelId: 'missing', status: 404 }
	])('rejects $label set and clear without changing any sheet', async ({ groups, personnelId, status }) => {
		const ctx = awardContext(groups);
		const before = await awardRows(ctx);
		await expect(setPersonnelAwardTrackingAcknowledged(ctx, { personnelId, acknowledged: true })).rejects.toMatchObject(
			{ status }
		);
		await expect(
			setPersonnelAwardTrackingAcknowledged(ctx, { personnelId, acknowledged: false })
		).rejects.toMatchObject({ status });
		expect(await awardRows(ctx)).toEqual(before);
		expect(ctx.auditPort.events.some((event) => event.action.startsWith('personnel.award_tracking_'))).toBe(false);
	});

	it('rejects a roster-only actor without creating or clearing an acknowledgement', async () => {
		const ctx = awardContext(undefined, 'view');
		const before = await awardRows(ctx);
		await expect(
			setPersonnelAwardTrackingAcknowledged(ctx, { personnelId: 'person-1', acknowledged: true })
		).rejects.toMatchObject({ status: 403 });
		await expect(
			setPersonnelAwardTrackingAcknowledged(ctx, { personnelId: 'person-1', acknowledged: false })
		).rejects.toMatchObject({ status: 403 });
		expect(await awardRows(ctx)).toEqual(before);
		expect(ctx.auditPort.events.some((event) => event.action.startsWith('personnel.award_tracking_'))).toBe(false);
	});

	it('does not audit success after a persistence failure and retry keeps the same sheet', async () => {
		vi.useFakeTimers();
		vi.setSystemTime('2026-10-01T12:00:00.000Z');
		const ctx = awardContext();
		const before = await awardRows(ctx);
		const fault = vi
			.spyOn(ctx.rawStore, 'update')
			.mockRejectedValueOnce(new Error('controlled acknowledgement write failure'));
		await expect(
			setPersonnelAwardTrackingAcknowledged(ctx, { personnelId: 'person-1', acknowledged: true })
		).rejects.toThrow('controlled acknowledgement write failure');
		expect(await awardRows(ctx)).toEqual(before);
		expect(ctx.auditPort.events.some((event) => event.action.startsWith('personnel.award_tracking_'))).toBe(false);
		fault.mockRestore();
		await expect(
			setPersonnelAwardTrackingAcknowledged(ctx, { personnelId: 'person-1', acknowledged: true })
		).resolves.toEqual({ personnelId: 'person-1', awardTrackingAcknowledged: true });
		await expect(
			ctx.rawStore.findOne('personnel_extended_info', ctx.auth.orgId, { personnel_id: 'person-1' })
		).resolves.toEqual({
			...sharedSheet,
			award_tracking_acknowledged_at: '2026-10-01T12:00:00.000Z',
			updated_at: expect.any(String)
		});
	});
});
