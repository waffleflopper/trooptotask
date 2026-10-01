import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { readPersonnelExtendedInfo, updatePersonnelExtendedInfo } from './personnelExtendedInfo.server';

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

	it('rejects invalid personal email values before they reach the database', async () => {
		const ctx = createTestContext();

		await expect(
			updatePersonnelExtendedInfo(ctx, {
				personnelId: 'person-1',
				personalEmail: 'not-an-email'
			})
		).rejects.toMatchObject({ status: 400 });
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
	updated_at: '2025-01-02T00:00:00.000Z'
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

async function allSheets(ctx: ReturnType<typeof sheetContext>) {
	return structuredClone([
		...(await ctx.rawStore.findMany<Record<string, unknown>>('personnel_extended_info', 'test-org')),
		...(await ctx.rawStore.findMany<Record<string, unknown>>('personnel_extended_info', 'foreign-org'))
	]);
}

describe('Soldier Data Sheet replacement and access', () => {
	it('replaces every editable field but retains shared acknowledgement, row identity and creation time', async () => {
		const ctx = sheetContext(['alpha']);
		await updatePersonnelExtendedInfo(ctx, { personnelId: 'person-1', bloodType: '  AB+  ', numberOfDependents: '3' });
		await expect(
			ctx.rawStore.findOne('personnel_extended_info', ctx.auth.orgId, { personnel_id: 'person-1' })
		).resolves.toEqual({
			id: 'sheet-1',
			organization_id: 'test-org',
			personnel_id: 'person-1',
			blood_type: 'AB+',
			basd: null,
			date_of_rank: null,
			marital_status: null,
			number_of_dependents: 3,
			children: [],
			civilian_education: null,
			military_education: [],
			emergency_contact_name: null,
			emergency_contact_relationship: null,
			emergency_contact_phone: null,
			spouse_name: null,
			spouse_phone: null,
			vehicle_make_model: null,
			vehicle_plate: null,
			vehicle_color: null,
			personal_email: null,
			personal_phone: null,
			address_street: null,
			address_city: null,
			address_state: null,
			address_zip: null,
			award_tracking_acknowledged_at: '2026-04-14T12:00:00.000Z',
			created_at: '2025-01-01T00:00:00.000Z',
			updated_at: expect.any(String)
		});
		await expect(
			ctx.rawStore.findOne('personnel_extended_info', ctx.auth.orgId, { personnel_id: 'person-2' })
		).resolves.toEqual({ ...savedSheet, id: 'sheet-2', personnel_id: 'person-2' });
		await expect(
			ctx.rawStore.findOne('personnel_extended_info', 'foreign-org', { personnel_id: 'person-foreign' })
		).resolves.toEqual({
			...savedSheet,
			id: 'sheet-foreign',
			personnel_id: 'person-foreign',
			organization_id: 'foreign-org'
		});
		expect(ctx.auditPort.events).toContainEqual({
			action: 'personnel.extended_info.updated',
			resourceType: 'personnel',
			resourceId: 'person-1'
		});
	});

	it.each([
		{ label: 'another Group', groups: ['alpha'], personnelId: 'person-2' },
		{ label: 'empty Group scope', groups: [], personnelId: 'person-1' },
		{ label: 'foreign Organization', groups: undefined, personnelId: 'person-foreign' },
		{ label: 'missing Person', groups: undefined, personnelId: 'missing' }
	])('conceals $label on reads and writes without changing either Organization', async ({ groups, personnelId }) => {
		const ctx = sheetContext(groups);
		const before = await allSheets(ctx);
		await expect(readPersonnelExtendedInfo(ctx, personnelId)).rejects.toMatchObject({ status: 404 });
		await expect(updatePersonnelExtendedInfo(ctx, { personnelId, bloodType: 'A-' })).rejects.toMatchObject({
			status: 404
		});
		expect(await allSheets(ctx)).toEqual(before);
		expect(ctx.auditPort.events.some((event) => event.action === 'personnel.extended_info.updated')).toBe(false);
	});

	it('does not grant a roster viewer sensitive sheet reads or writes', async () => {
		const ctx = sheetContext(undefined, 'view');
		const before = await allSheets(ctx);
		await expect(readPersonnelExtendedInfo(ctx, 'person-1')).rejects.toMatchObject({ status: 403 });
		await expect(updatePersonnelExtendedInfo(ctx, { personnelId: 'person-1', bloodType: 'A-' })).rejects.toMatchObject({
			status: 403
		});
		expect(await allSheets(ctx)).toEqual(before);
		expect(ctx.auditPort.events.some((event) => event.action === 'personnel.extended_info.updated')).toBe(false);
	});

	it('rejects a failed save without success audit or lost sheet fields, then retries on the same row', async () => {
		const ctx = sheetContext();
		const before = await allSheets(ctx);
		const fault = vi.spyOn(ctx.store, 'update').mockRejectedValueOnce(new Error('controlled sheet write failure'));
		await expect(updatePersonnelExtendedInfo(ctx, { personnelId: 'person-1', bloodType: 'A-' })).rejects.toThrow(
			'controlled sheet write failure'
		);
		expect(await allSheets(ctx)).toEqual(before);
		expect(ctx.auditPort.events.some((event) => event.action === 'personnel.extended_info.updated')).toBe(false);
		fault.mockRestore();
		await expect(updatePersonnelExtendedInfo(ctx, { personnelId: 'person-1', bloodType: 'A-' })).resolves.toMatchObject(
			{ bloodType: 'A-' }
		);
		await expect(
			ctx.rawStore.findOne('personnel_extended_info', ctx.auth.orgId, { personnel_id: 'person-1' })
		).resolves.toMatchObject({
			id: 'sheet-1',
			blood_type: 'A-',
			award_tracking_acknowledged_at: '2026-04-14T12:00:00.000Z',
			created_at: '2025-01-01T00:00:00.000Z'
		});
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
