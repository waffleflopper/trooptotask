import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { savePersonnelDataSheet } from './personnelDataSheet.server';

const ALPHA = '00000000-0000-4000-8000-0000000000a1';
const BRAVO = '00000000-0000-4000-8000-0000000000b1';
const PERSON_1 = '00000000-0000-4000-8000-000000000001';
const PERSON_2 = '00000000-0000-4000-8000-000000000002';
const MEMBER = '00000000-0000-4000-8000-0000000000c1';

const savedSheet = {
	id: 'sheet-1',
	organization_id: 'test-org',
	personnel_id: PERSON_1,
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
	updated_by: null
};

const basicInfo = {
	rank: 'SGT',
	lastName: 'Rivera',
	firstName: 'Monica',
	mos: '68W',
	clinicRole: 'Medic',
	groupId: ALPHA,
	ets: '2027-03-14',
	deros: null
};

const extendedInfo = {
	dodId: ' 012-345 6789 ',
	bloodType: 'A-',
	basd: '2019-02-03',
	dateOfRank: '2023-08-01',
	maritalStatus: 'Single',
	maritalStatusDate: '',
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
};

function buildContext(
	options: { groups?: string[]; personnel?: 'view' | 'operate'; withSheet?: boolean; slug?: string } = {}
) {
	const ctx = createTestContext({
		auth: {
			userId: MEMBER,
			role: 'member',
			isPrivileged: false,
			canManageMembers: false,
			capabilityMap: {
				calendar: 'none',
				personnel: options.personnel ?? 'operate',
				training: 'none',
				criticalTasks: 'none',
				onboarding: 'none',
				ratingScheme: 'none'
			},
			scopeSet: options.groups ? { kind: 'groups', groupIds: options.groups } : { kind: 'organization' }
		}
	});
	const orgId = ctx.auth.orgId;
	ctx.rawStore.seed('groups', [
		{ id: ALPHA, organization_id: orgId, name: 'Alpha' },
		{ id: BRAVO, organization_id: orgId, name: 'Bravo' }
	]);
	ctx.rawStore.seed('organization_rank_catalog', [
		{
			organization_id: orgId,
			code: 'SGT',
			label: 'Sergeant',
			service: 'army',
			category: 'enlisted',
			pay_grade: 'E-5',
			state: 'active',
			source: 'built-in',
			sort_order: 1
		}
	]);
	ctx.rawStore.seed('organization_memberships', [
		{ id: 'membership-1', organization_id: orgId, user_id: MEMBER, first_name: 'Pat', last_name: 'Lee' }
	]);
	ctx.rawStore.seed('personnel', [
		{
			id: PERSON_1,
			organization_id: orgId,
			slug: options.slug ?? 'rivera-monica',
			rank: 'SGT',
			last_name: 'Rivera',
			first_name: 'Monica',
			mos: '68W',
			clinic_role: 'Medic',
			group_id: ALPHA,
			archived_at: null
		},
		{
			id: PERSON_2,
			organization_id: orgId,
			slug: 'kim-dana',
			rank: 'SGT',
			last_name: 'Kim',
			first_name: 'Dana',
			mos: '68W',
			clinic_role: 'Medic',
			group_id: BRAVO,
			archived_at: null
		}
	]);
	if (options.withSheet !== false) ctx.rawStore.seed('personnel_extended_info', [structuredClone(savedSheet)]);
	return ctx;
}

async function storedState(ctx: ReturnType<typeof buildContext>) {
	return structuredClone({
		people: await ctx.rawStore.findMany<Record<string, unknown>>('personnel', ctx.auth.orgId),
		sheets: await ctx.rawStore.findMany<Record<string, unknown>>('personnel_extended_info', ctx.auth.orgId)
	});
}

async function savedResult(ctx: ReturnType<typeof buildContext>, input: unknown) {
	const result = await savePersonnelDataSheet(ctx, PERSON_1, input);
	if (!result.saved) throw new Error(`Rejected ${result.field}: ${result.message}`);
	return result;
}

function savedEvents(ctx: ReturnType<typeof buildContext>) {
	return ctx.auditPort.events.filter((event) => event.action.endsWith('.updated'));
}

describe('Data sheet save', () => {
	it.each([true, false])(
		"rejects an archived Person's duplicate DoD ID on save, existing sheet %s",
		async (withSheet) => {
			const ctx = buildContext({ withSheet, groups: [ALPHA] });
			await ctx.rawStore.insert('personnel_extended_info', ctx.auth.orgId, {
				id: 'sheet-2',
				personnel_id: PERSON_2,
				dod_id: '0123456789'
			});
			await ctx.rawStore.update('personnel', ctx.auth.orgId, PERSON_2, { archived_at: '2026-01-01' });
			const before = await storedState(ctx);
			await expect(
				savePersonnelDataSheet(ctx, PERSON_1, { basicInfo: { ...basicInfo, mos: '68X' }, extendedInfo })
			).resolves.toEqual({ saved: false, field: 'dodId', message: expect.any(String) });
			expect(await storedState(ctx)).toEqual(before);
		}
	);

	it('retains a normalized DoD ID on reload, permits saving it again, and clears it to null', async () => {
		const ctx = buildContext({ withSheet: false });
		await savedResult(ctx, { basicInfo, extendedInfo });
		await expect(ctx.personnelSheets.findSheetForPerson(PERSON_1)).resolves.toMatchObject({ dod_id: '0123456789' });
		const again = await savedResult(ctx, { basicInfo, extendedInfo });
		expect(again.extendedInfo.dodId).toBe('0123456789');
		const cleared = await savedResult(ctx, { basicInfo, extendedInfo: { ...extendedInfo, dodId: ' ' } });
		expect(cleared.extendedInfo.dodId).toBe('');
		await expect(ctx.personnelSheets.findSheetForPerson(PERSON_1)).resolves.toMatchObject({ dod_id: null });
	});
	it('writes basic info and extended info together and returns both', async () => {
		const ctx = buildContext();
		const result = await savedResult(ctx, {
			basicInfo: { ...basicInfo, mos: '68X', clinicRole: 'Senior Medic' },
			extendedInfo
		});

		expect(result.person).toMatchObject({ id: PERSON_1, mos: '68X', clinicRole: 'Senior Medic', ets: '2027-03-14' });
		expect(result.extendedInfo).toMatchObject({
			dodId: '0123456789',
			bloodType: 'A-',
			maritalStatus: 'Single',
			maritalStatusDate: '',
			address: '100 Main St, Anchorage, AK, 99501',
			updatedBy: 'Pat Lee'
		});
		expect(
			savedEvents(ctx)
				.map((event) => event.action)
				.sort()
		).toEqual(['personnel.extended_info.updated', 'personnel.updated']);
	});

	it('replaces every sheet field but keeps the acknowledgement, row identity and creation time', async () => {
		const ctx = buildContext();
		await savePersonnelDataSheet(ctx, PERSON_1, {
			basicInfo,
			extendedInfo: { bloodType: '  AB+  ', numberOfDependents: '3' }
		});
		await expect(
			ctx.rawStore.findOne('personnel_extended_info', ctx.auth.orgId, { personnel_id: PERSON_1 })
		).resolves.toEqual({
			id: 'sheet-1',
			organization_id: 'test-org',
			personnel_id: PERSON_1,
			dod_id: null,
			blood_type: 'AB+',
			basd: null,
			date_of_rank: null,
			marital_status: null,
			marital_status_date: null,
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
			updated_at: expect.any(String),
			updated_by: MEMBER
		});
	});

	it('creates the sheet on first save', async () => {
		const ctx = buildContext({ withSheet: false });
		const result = await savedResult(ctx, { basicInfo, extendedInfo });
		expect(result.extendedInfo).toMatchObject({ bloodType: 'A-', updatedBy: 'Pat Lee' });
	});

	it('treats a cleared dependents field as empty instead of invalid', async () => {
		const ctx = buildContext();
		const result = await savedResult(ctx, { basicInfo, extendedInfo: { numberOfDependents: '' } });
		expect(result.extendedInfo.numberOfDependents).toBeNull();
	});

	it('regenerates the slug when the name changes', async () => {
		const ctx = buildContext();
		const result = await savedResult(ctx, { basicInfo: { ...basicInfo, lastName: 'Rivera-Cruz' }, extendedInfo });
		expect(result.person.slug).toBe('rivera-cruz-monica');
	});

	it.each([
		{ label: 'a collision suffix', slug: 'rivera-monica-2' },
		{ label: 'a slug made by an earlier naming rule', slug: 'monica-rivera-old-rule' }
	])('keeps $label when a save leaves the name unchanged', async ({ slug }) => {
		const ctx = buildContext({ slug });
		const result = await savedResult(ctx, { basicInfo: { ...basicInfo, mos: '68X' }, extendedInfo });
		expect(result.person).toMatchObject({ slug, mos: '68X' });
	});

	it.each([
		{
			label: 'a malformed DoD ID',
			basic: basicInfo,
			extended: { ...extendedInfo, dodId: '123456789a' },
			field: 'dodId'
		},
		{
			label: 'a malformed sheet email',
			basic: basicInfo,
			extended: { ...extendedInfo, personalEmail: 'not-an-email' },
			field: 'personalEmail'
		},
		{
			label: 'a malformed sheet date',
			basic: basicInfo,
			extended: { ...extendedInfo, basd: 'not-date' },
			field: 'basd'
		},
		{
			label: 'a child with a negative age',
			basic: basicInfo,
			extended: { ...extendedInfo, children: [{ name: 'Avery', age: -1 }] },
			field: 'children'
		},
		{
			label: 'a blank last name',
			basic: { ...basicInfo, lastName: '  ', mos: '68X' },
			extended: { ...extendedInfo, bloodType: 'B+' },
			field: 'lastName'
		},
		{
			label: 'a rank outside the active catalog',
			basic: { ...basicInfo, rank: 'ZZZ', mos: '68X' },
			extended: { ...extendedInfo, bloodType: 'B+' },
			field: 'rank'
		},
		{
			label: 'a Group that does not exist',
			basic: { ...basicInfo, groupId: '00000000-0000-4000-8000-0000000000e1', mos: '68X' },
			extended: { ...extendedInfo, bloodType: 'B+' },
			field: 'groupId'
		}
	])('writes neither half when $label is submitted', async ({ basic, extended, field }) => {
		const ctx = buildContext();
		const before = await storedState(ctx);
		await expect(savePersonnelDataSheet(ctx, PERSON_1, { basicInfo: basic, extendedInfo: extended })).resolves.toEqual({
			saved: false,
			field,
			message: expect.any(String)
		});
		expect(await storedState(ctx)).toEqual(before);
		expect(savedEvents(ctx)).toEqual([]);
	});

	it.each([
		{ label: 'another Group', groups: [ALPHA], personnelId: PERSON_2 },
		{ label: 'an empty Group scope', groups: [], personnelId: PERSON_1 },
		{ label: 'a missing Person', groups: undefined, personnelId: '00000000-0000-4000-8000-0000000000e2' }
	])('conceals $label without changing either half', async ({ groups, personnelId }) => {
		const ctx = buildContext({ groups });
		const before = await storedState(ctx);
		await expect(
			savePersonnelDataSheet(ctx, personnelId, { basicInfo: { ...basicInfo, mos: '68X' }, extendedInfo })
		).rejects.toMatchObject({ status: 404 });
		expect(await storedState(ctx)).toEqual(before);
		expect(savedEvents(ctx)).toEqual([]);
	});

	it('does not let a roster viewer save', async () => {
		const ctx = buildContext({ personnel: 'view' });
		const before = await storedState(ctx);
		await expect(savePersonnelDataSheet(ctx, PERSON_1, { basicInfo, extendedInfo })).rejects.toMatchObject({
			status: 403
		});
		expect(await storedState(ctx)).toEqual(before);
	});

	it('does not move a Person into a Group outside the saver scope', async () => {
		const ctx = buildContext({ groups: [ALPHA] });
		const before = await storedState(ctx);
		await expect(
			savePersonnelDataSheet(ctx, PERSON_1, { basicInfo: { ...basicInfo, groupId: BRAVO }, extendedInfo })
		).rejects.toMatchObject({ status: 403 });
		expect(await storedState(ctx)).toEqual(before);
	});

	it('leaves the Person unchanged when the sheet write fails, then saves on retry', async () => {
		const ctx = buildContext();
		const before = await storedState(ctx);
		const fault = vi.spyOn(ctx.store, 'update').mockRejectedValueOnce(new Error('controlled sheet write failure'));
		await expect(
			savePersonnelDataSheet(ctx, PERSON_1, { basicInfo: { ...basicInfo, mos: '68X' }, extendedInfo })
		).rejects.toThrow('controlled sheet write failure');
		expect(await storedState(ctx)).toEqual(before);
		expect(savedEvents(ctx)).toEqual([]);
		fault.mockRestore();
		const retry = await savePersonnelDataSheet(ctx, PERSON_1, {
			basicInfo: { ...basicInfo, mos: '68X' },
			extendedInfo
		});
		expect(retry).toMatchObject({
			saved: true,
			person: { mos: '68X' },
			extendedInfo: { bloodType: 'A-' }
		});
	});

	it('converges on retry when the Person write fails after the sheet was written', async () => {
		const ctx = buildContext();
		const update = ctx.store.update.bind(ctx.store);
		const fault = vi
			.spyOn(ctx.store, 'update')
			.mockImplementationOnce(update)
			.mockRejectedValueOnce(new Error('controlled person write failure'));
		const submitted = { basicInfo: { ...basicInfo, mos: '68X' }, extendedInfo };
		await expect(savePersonnelDataSheet(ctx, PERSON_1, submitted)).rejects.toThrow('controlled person write failure');
		const afterFailure = await storedState(ctx);
		expect(afterFailure.sheets[0]).toMatchObject({ blood_type: 'A-' });
		expect(afterFailure.people[0]).toMatchObject({ mos: '68W' });
		fault.mockRestore();

		const retry = await savePersonnelDataSheet(ctx, PERSON_1, submitted);

		expect(retry).toMatchObject({ saved: true, person: { mos: '68X' }, extendedInfo: { bloodType: 'A-' } });
	});

	it('saves both halves when the saver name cannot be looked up', async () => {
		const ctx = buildContext();
		vi.spyOn(ctx, 'contributorLabels').mockRejectedValueOnce(new Error('controlled label lookup failure'));

		const result = await savedResult(ctx, { basicInfo: { ...basicInfo, mos: '68X' }, extendedInfo });

		expect(result).toMatchObject({ person: { mos: '68X' }, extendedInfo: { bloodType: 'A-', updatedBy: null } });
		const stored = await storedState(ctx);
		expect(stored.people[0]).toMatchObject({ mos: '68X' });
		expect(stored.sheets[0]).toMatchObject({ blood_type: 'A-', updated_by: MEMBER });
	});

	it('rejects a body without both halves', async () => {
		const ctx = buildContext();
		await expect(savePersonnelDataSheet(ctx, PERSON_1, { basicInfo })).rejects.toMatchObject({ status: 400 });
	});
});
