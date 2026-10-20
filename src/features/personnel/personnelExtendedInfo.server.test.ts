import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { readPersonnelExtendedInfo } from './personnelExtendedInfo.server';

describe('personnel extended info use case', () => {
	it('reads Soldier Data Sheet fields from personnel_extended_info', async () => {
		const ctx = createTestContext();
		ctx.store.seed('personnel', [
			{
				id: 'person-1',
				organization_id: ctx.auth.orgId,
				group_id: null,
				rank: 'SGT',
				last_name: 'Rivera',
				first_name: 'Monica'
			}
		]);
		ctx.store.seed('personnel_extended_info', [
			{
				id: 'info-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				blood_type: 'O+',
				basd: '2020-01-15',
				date_of_rank: '2024-06-01',
				marital_status: 'Married',
				number_of_dependents: 2,
				children: [{ name: 'Avery', age: 7 }],
				civilian_education: 'BSN',
				military_education: ['BLC', 'Air Assault'],
				emergency_contact_name: 'Jamie Rivera',
				emergency_contact_relationship: 'Spouse',
				emergency_contact_phone: '907-555-0100',
				spouse_name: 'Jamie Rivera',
				spouse_phone: '907-555-0101',
				vehicle_make_model: 'Toyota Tacoma',
				vehicle_plate: 'JBER482',
				vehicle_color: 'Gray',
				personal_email: 'rivera@example.com',
				personal_phone: '907-555-0102',
				address_street: '1128 Arctic Valley Rd',
				address_city: 'Anchorage',
				address_state: 'AK',
				address_zip: '99505'
			}
		]);

		await expect(readPersonnelExtendedInfo(ctx, 'person-1')).resolves.toMatchObject({
			bloodType: 'O+',
			basd: '2020-01-15',
			dateOfRank: '2024-06-01',
			maritalStatus: 'Married',
			numberOfDependents: 2,
			children: [{ name: 'Avery', age: 7 }],
			civilianEducation: 'BSN',
			militaryEducation: ['BLC', 'Air Assault'],
			emergencyContactName: 'Jamie Rivera',
			address: '1128 Arctic Valley Rd, Anchorage, AK, 99505'
		});
	});

	it('returns null when the in-scope Soldier has no extended info row yet', async () => {
		const ctx = createTestContext();
		ctx.store.seed('personnel', [
			{
				id: 'person-1',
				organization_id: ctx.auth.orgId,
				group_id: null,
				rank: 'SGT',
				last_name: 'Rivera',
				first_name: 'Monica'
			}
		]);

		await expect(readPersonnelExtendedInfo(ctx, 'person-1')).resolves.toBeNull();
	});
});

const savedSheet = {
	id: 'sheet-1',
	organization_id: 'test-org',
	personnel_id: 'person-1',
	blood_type: 'O+',
	basd: '2020-01-15',
	date_of_rank: '2024-06-01',
	marital_status: 'Married',
	marital_status_date: '2019-07-04',
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
	award_tracking_acknowledged_at: '2026-04-14T12:00:00.000Z',
	created_at: '2025-01-01T00:00:00.000Z',
	updated_at: '2025-01-02T00:00:00.000Z',
	updated_by: '00000000-0000-4000-8000-0000000000c1'
};

function sheetContext(groups?: string[], personnel: 'view' | 'operate' = 'operate') {
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
		structuredClone(savedSheet),
		{ ...structuredClone(savedSheet), id: 'sheet-2', personnel_id: 'person-2' },
		{
			...structuredClone(savedSheet),
			id: 'sheet-foreign',
			personnel_id: 'person-foreign',
			organization_id: 'foreign-org'
		}
	]);
	return ctx;
}

describe('Soldier Data Sheet read access', () => {
	it('reports when the sheet was last saved and by which member', async () => {
		const ctx = sheetContext();
		ctx.rawStore.seed('organization_memberships', [
			{
				id: 'membership-1',
				organization_id: ctx.auth.orgId,
				user_id: savedSheet.updated_by,
				first_name: 'Pat',
				last_name: 'Lee'
			}
		]);
		await expect(readPersonnelExtendedInfo(ctx, 'person-1')).resolves.toMatchObject({
			maritalStatusDate: '2019-07-04',
			updatedAt: '2025-01-02T00:00:00.000Z',
			updatedBy: 'Pat Lee'
		});
	});

	it("still reads the sheet when the saving member's name cannot be looked up", async () => {
		const ctx = sheetContext();
		const failingLookup = {
			...ctx,
			contributorLabels: async () => {
				throw new Error('membership lookup unavailable');
			}
		};
		await expect(readPersonnelExtendedInfo(failingLookup, 'person-1')).resolves.toMatchObject({
			maritalStatusDate: '2019-07-04',
			updatedBy: null
		});
	});

	it('leaves the saving member unnamed when they are no longer in the Organization', async () => {
		const ctx = sheetContext();
		await expect(readPersonnelExtendedInfo(ctx, 'person-1')).resolves.toMatchObject({ updatedBy: null });
	});

	it.each([
		{ label: 'another Group', groups: ['alpha'], personnelId: 'person-2' },
		{ label: 'empty Group scope', groups: [], personnelId: 'person-1' },
		{ label: 'foreign Organization', groups: undefined, personnelId: 'person-foreign' },
		{ label: 'missing Person', groups: undefined, personnelId: 'missing' }
	])('conceals $label on reads', async ({ groups, personnelId }) => {
		const ctx = sheetContext(groups);
		await expect(readPersonnelExtendedInfo(ctx, personnelId)).rejects.toMatchObject({ status: 404 });
	});

	it('does not grant a roster viewer sensitive sheet reads', async () => {
		const ctx = sheetContext(undefined, 'view');
		await expect(readPersonnelExtendedInfo(ctx, 'person-1')).rejects.toMatchObject({ status: 403 });
	});

	it('normalizes legacy JSON fields without exposing unknown or invalid child records', async () => {
		const ctx = sheetContext();
		await ctx.rawStore.update('personnel_extended_info', ctx.auth.orgId, 'sheet-1', {
			children: [{ name: ' Avery ', age: 7, internal: 'not part of the sheet' }],
			military_education: ['BLC', 42, 'Air Assault']
		});
		await expect(readPersonnelExtendedInfo(ctx, 'person-1')).resolves.toMatchObject({
			children: [{ name: 'Avery', age: 7 }],
			militaryEducation: ['BLC', 'Air Assault']
		});
		await ctx.rawStore.update('personnel_extended_info', ctx.auth.orgId, 'sheet-1', {
			children: [{ name: 'Invalid', age: -1 }],
			military_education: null
		});
		await expect(readPersonnelExtendedInfo(ctx, 'person-1')).resolves.toMatchObject({
			children: [],
			militaryEducation: []
		});
	});
});
