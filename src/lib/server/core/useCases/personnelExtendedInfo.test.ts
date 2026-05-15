import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { readPersonnelExtendedInfo, updatePersonnelExtendedInfo } from './personnelExtendedInfo';

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

	it('upserts editable Soldier Data Sheet fields for an in-scope Soldier', async () => {
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

		const result = await updatePersonnelExtendedInfo(ctx, {
			personnelId: 'person-1',
			bloodType: 'A-',
			basd: '2019-02-03',
			dateOfRank: '2023-08-01',
			maritalStatus: 'Single',
			numberOfDependents: 0,
			children: [],
			civilianEducation: 'Associate degree',
			militaryEducation: ['BLC'],
			emergencyContactName: 'Taylor Rivera',
			emergencyContactRelationship: 'Sibling',
			emergencyContactPhone: '907-555-0200',
			spouseName: '',
			spousePhone: '',
			vehicleMakeModel: 'Ford F-150',
			vehiclePlate: 'ABC123',
			vehicleColor: 'Blue',
			personalEmail: 'monica.rivera@example.com',
			personalPhone: '907-555-0201',
			addressStreet: '100 Main St',
			addressCity: 'Anchorage',
			addressState: 'AK',
			addressZip: '99501'
		});

		expect(result).toMatchObject({
			bloodType: 'A-',
			militaryEducation: ['BLC'],
			emergencyContactName: 'Taylor Rivera',
			address: '100 Main St, Anchorage, AK, 99501'
		});
		await expect(
			ctx.store.findOne('personnel_extended_info', ctx.auth.orgId, { personnel_id: 'person-1' })
		).resolves.toMatchObject({
			blood_type: 'A-',
			military_education: ['BLC'],
			emergency_contact_name: 'Taylor Rivera'
		});
	});

	it('treats a cleared dependents field as empty instead of invalid', async () => {
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

		await expect(
			updatePersonnelExtendedInfo(ctx, {
				personnelId: 'person-1',
				numberOfDependents: ''
			})
		).resolves.toMatchObject({ numberOfDependents: null });
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

	it('rejects invalid child ages during update', async () => {
		const ctx = createTestContext();

		await expect(
			updatePersonnelExtendedInfo(ctx, {
				personnelId: 'person-1',
				children: [{ name: 'Avery', age: -1 }]
			})
		).rejects.toMatchObject({ status: 400 });
	});

	it('rejects invalid date strings before they reach the database', async () => {
		const ctx = createTestContext();

		await expect(
			updatePersonnelExtendedInfo(ctx, {
				personnelId: 'person-1',
				basd: 'not-date'
			})
		).rejects.toMatchObject({ status: 400 });
	});
});
