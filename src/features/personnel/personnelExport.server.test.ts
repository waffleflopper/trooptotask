import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { createTestContext } from '$features/training/server/trainingPersistence.test-support.server';
import { exportPersonnelWorkbook } from './personnelExport.server';
import type { PersonnelAvailabilityPeriod } from './contracts';
const listPersonnelTrainingExportRows =
	(ctx: TestContext): Parameters<typeof exportPersonnelWorkbook>[5] =>
	(personnelId) =>
		ctx.trainingCompletions.listPersonExportFacts(personnelId).then((rows) =>
			rows.map((row) => ({
				training_type_id: row.trainingTypeId,
				completion_date: row.completionDate,
				expiration_date: row.expirationDate,
				notes: row.notes
			}))
		);

const listStatusTypeLabels = async () => [{ id: 'status-type-1', name: 'TDY' }];

it('writes the nested Group path in the individual Personnel workbook', async () => {
	const ctx = createTestContext();
	seedPersonnelExportDataset(ctx);
	await ctx.rawStore.update('groups', ctx.auth.orgId, 'group-1', {
		name: 'Alpha Team',
		sort_order: 0,
		parent_id: 'squad',
		depth: 3
	});
	ctx.rawStore.seed('groups', [
		{ id: 'platoon', organization_id: ctx.auth.orgId, name: '1st Platoon', sort_order: 0, parent_id: null, depth: 1 },
		{ id: 'squad', organization_id: ctx.auth.orgId, name: '2nd Squad', sort_order: 0, parent_id: 'platoon', depth: 2 }
	]);
	const result = await exportPersonnelWorkbook(
		ctx,
		{ personnelId: PERSONNEL_ID, asOf: '2026-05-20' },
		listAvailabilityHistory,
		listStatusTypeLabels,
		listTrainingTypeLabels,
		listPersonnelTrainingExportRows(ctx)
	);
	const rows = worksheetRows(worksheetByName(await parseWorkbook(result._buffer), 'Personnel Info'));
	expect(rows.find((row) => row.Field === 'Group')).toEqual({
		Field: 'Group',
		Value: '1st Platoon / 2nd Squad / Alpha Team'
	});
});
const listTrainingTypeLabels = async () => [{ id: 'training-type-1', name: 'Weapons Qual' }];

type TestContext = ReturnType<typeof createTestContext>;
type WorkbookLoadBuffer = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];

const PERSONNEL_ID = '11111111-1111-4111-8111-111111111111';

async function listAvailabilityHistory(): Promise<PersonnelAvailabilityPeriod[]> {
	return [
		{
			statusTypeId: 'status-type-1',
			startDate: '2026-05-15',
			endDate: '2026-05-17'
		},
		{
			statusTypeId: 'status-type-1',
			startDate: '2025-12-01',
			endDate: '2025-12-03'
		}
	];
}

function toWorkbookBuffer(buffer: ArrayBuffer): WorkbookLoadBuffer {
	return Buffer.from(buffer) as unknown as WorkbookLoadBuffer;
}

async function parseWorkbook(buffer: ArrayBuffer): Promise<ExcelJS.Workbook> {
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(toWorkbookBuffer(buffer));
	return workbook;
}

function worksheetRows(sheet: ExcelJS.Worksheet): Array<Record<string, string>> {
	const headers = (sheet.getRow(1).values as unknown[]).slice(1).map((value) => String(value ?? ''));
	const rows: Array<Record<string, string>> = [];

	sheet.eachRow((row, rowNumber) => {
		if (rowNumber === 1) return;
		const record: Record<string, string> = {};
		for (const [index, header] of headers.entries()) {
			record[header] = String(row.getCell(index + 1).value ?? '');
		}
		rows.push(record);
	});

	return rows;
}

function worksheetByName(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
	const sheet = workbook.getWorksheet(name);
	if (!sheet) throw new Error(`${name} sheet missing`);
	return sheet;
}

function seedPersonnelExportDataset(ctx: TestContext): void {
	ctx.rawStore.seed('personnel', [
		{
			id: PERSONNEL_ID,
			organization_id: ctx.auth.orgId,
			rank: 'SGT',
			last_name: 'Smith',
			first_name: 'Jamie',
			mos: '68W',
			clinic_role: 'Medic',
			group_id: 'group-1',
			ets: '2027-05-01',
			deros: '2026-11-30',
			archived_at: '2026-05-19T21:00:00.000Z'
		}
	]);
	ctx.rawStore.seed('groups', [
		{
			id: 'group-1',
			organization_id: ctx.auth.orgId,
			name: 'Alpha'
		}
	]);
	ctx.rawStore.seed('personnel_extended_info', [
		{
			id: 'extended-1',
			dod_id: '0123456789',
			organization_id: ctx.auth.orgId,
			personnel_id: PERSONNEL_ID,
			emergency_contact_name: 'Taylor Smith',
			emergency_contact_relationship: 'Spouse',
			emergency_contact_phone: '555-0100',
			spouse_name: 'Taylor Smith',
			spouse_phone: '555-0101',
			vehicle_make_model: 'Ford Ranger',
			vehicle_plate: 'ARMY-1',
			vehicle_color: 'Green',
			personal_email: 'jamie@example.com',
			personal_phone: '555-0102',
			address_street: '123 Main St',
			address_city: 'Anchorage',
			address_state: 'AK',
			address_zip: '99501',
			leader_notes: 'Needs passport review'
		}
	]);
	ctx.rawStore.seed('leader_notes', [
		{
			id: 'sensitive-note',
			organization_id: ctx.auth.orgId,
			personnel_id: PERSONNEL_ID,
			author: 'leader',
			text: 'Separate sensitive note',
			created_at: '2026-05-01T00:00:00Z',
			archived_at: null
		}
	]);
	ctx.rawStore.seed('personnel_trainings', [
		{
			id: 'training-1',
			organization_id: ctx.auth.orgId,
			personnel_id: PERSONNEL_ID,
			training_type_id: 'training-type-1',
			completion_date: '2026-04-01',
			expiration_date: '2027-04-01',
			notes: 'Expert'
		}
	]);
	ctx.rawStore.seed('counseling_records', [
		{
			id: 'counseling-old',
			organization_id: ctx.auth.orgId,
			personnel_id: PERSONNEL_ID,
			date_conducted: '2026-04-10',
			subject: 'Initial counseling',
			key_points: 'Expectations',
			plan_of_action: 'Follow checklist',
			status: 'closed',
			follow_up_date: '2026-04-20',
			notes: 'Completed'
		},
		{
			id: 'counseling-new',
			organization_id: ctx.auth.orgId,
			personnel_id: PERSONNEL_ID,
			date_conducted: '2026-05-10',
			subject: 'Performance counseling',
			key_points: 'Sustain excellence',
			plan_of_action: 'Lead training',
			status: 'open',
			follow_up_date: '2026-05-20',
			notes: 'Follow up'
		}
	]);
	ctx.rawStore.seed('status_types', [
		{
			id: 'status-type-1',
			organization_id: ctx.auth.orgId,
			name: 'TDY'
		}
	]);
}

describe('Personnel export use case', () => {
	it('checks scoped Personnel export access before loading related record sets', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['allowed-group'] })
			}
		});
		ctx.rawStore.seed('personnel', [
			{
				id: PERSONNEL_ID,
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				group_id: 'other-group',
				archived_at: null
			}
		]);
		const findManySpy = vi.spyOn(ctx.rawStore, 'findMany');
		const trainingRead = vi.fn(listPersonnelTrainingExportRows(ctx));

		await expect(
			exportPersonnelWorkbook(
				ctx,
				{ personnelId: PERSONNEL_ID, asOf: '2026-05-20' },
				listAvailabilityHistory,
				listStatusTypeLabels,
				listTrainingTypeLabels,
				trainingRead
			)
		).rejects.toMatchObject({
			status: 403
		});

		expect(findManySpy).not.toHaveBeenCalled();
		expect(trainingRead).not.toHaveBeenCalled();
	});

	it('rejects malformed personnel ids before querying storage', async () => {
		const ctx = createTestContext();
		const findOneSpy = vi.spyOn(ctx.rawStore, 'findOne');

		await expect(
			exportPersonnelWorkbook(
				ctx,
				{ personnelId: 'person-1', asOf: '2026-05-20' },
				listAvailabilityHistory,
				listStatusTypeLabels,
				listTrainingTypeLabels,
				listPersonnelTrainingExportRows(ctx)
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Invalid personnel ID'
		});

		expect(findOneSpy).not.toHaveBeenCalled();
	});

	it('exports the existing personnel workbook content, filename, and audit event', async () => {
		const ctx = createTestContext();
		seedPersonnelExportDataset(ctx);

		const result = await exportPersonnelWorkbook(
			ctx,
			{ personnelId: PERSONNEL_ID, asOf: '2026-05-20' },
			listAvailabilityHistory,
			listStatusTypeLabels,
			listTrainingTypeLabels,
			listPersonnelTrainingExportRows(ctx)
		);
		const workbook = await parseWorkbook(result._buffer);

		expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
			'Personnel Info',
			'Training Records',
			'Counseling Records',
			'Availability History'
		]);
		expect(result._filename).toBe('SGT_Smith_Jamie-export-2026-05-20.xlsx');
		expect(ctx.auditPort.events.at(-1)).toMatchObject({
			action: 'personnel.exported',
			resourceType: 'personnel',
			resourceId: PERSONNEL_ID,
			details: {
				name: 'SGT Smith, Jamie'
			}
		});

		const infoRows = worksheetRows(worksheetByName(workbook, 'Personnel Info'));
		expect(infoRows).toEqual(
			expect.arrayContaining([
				{ Field: 'Rank', Value: 'SGT' },
				{ Field: 'Duty Role', Value: 'Medic' },
				{ Field: 'Group', Value: 'Alpha' },
				{ Field: 'ETS', Value: '2027-05-01' },
				{ Field: 'PCS / DEROS', Value: '2026-11-30' },
				{ Field: 'Archived At', Value: '2026-05-19T21:00:00.000Z' },
				{ Field: 'DoD ID', Value: '0123456789' },
				{ Field: 'Emergency Contact Name', Value: 'Taylor Smith' },
				{ Field: 'Emergency Contact Relationship', Value: 'Spouse' },
				{ Field: 'Emergency Contact Phone', Value: '555-0100' },
				{ Field: 'Spouse Name', Value: 'Taylor Smith' },
				{ Field: 'Spouse Phone', Value: '555-0101' },
				{ Field: 'Vehicle Make/Model', Value: 'Ford Ranger' },
				{ Field: 'Vehicle Plate', Value: 'ARMY-1' },
				{ Field: 'Vehicle Color', Value: 'Green' },
				{ Field: 'Personal Email', Value: 'jamie@example.com' },
				{ Field: 'Personal Phone', Value: '555-0102' },
				{ Field: 'Address', Value: '123 Main St, Anchorage, AK, 99501' },
				{ Field: 'Leader Notes', Value: '' }
			])
		);

		expect(worksheetRows(worksheetByName(workbook, 'Training Records'))).toEqual([
			{
				'Training Type': 'Weapons Qual',
				'Completed Date': '2026-04-01',
				'Expiration Date': '2027-04-01',
				Notes: 'Expert'
			}
		]);
		expect(worksheetRows(worksheetByName(workbook, 'Counseling Records')).map((row) => row.Date)).toEqual([
			'2026-05-10',
			'2026-04-10'
		]);
		expect(worksheetRows(worksheetByName(workbook, 'Availability History'))).toEqual([
			{
				Status: 'TDY',
				'Start Date': '2026-05-15',
				'End Date': '2026-05-17'
			},
			{
				Status: 'TDY',
				'Start Date': '2025-12-01',
				'End Date': '2025-12-03'
			}
		]);
	});
	it('keeps the Training sheet empty when the request store denies Training rows, while exporting Personnel records', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'configure',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['group-1'] })
			}
		});
		seedPersonnelExportDataset(ctx);
		const requestRead = ctx.rawStore.findMany.bind(ctx.rawStore);
		// The in-memory store has no RLS. Model the verified request-client result explicitly.
		ctx.rawStore.findMany = async (...args) => (args[0] === 'personnel_trainings' ? [] : requestRead(...args));

		const result = await exportPersonnelWorkbook(
			ctx,
			{ personnelId: PERSONNEL_ID, asOf: '2026-05-20' },
			listAvailabilityHistory,
			listStatusTypeLabels,
			listTrainingTypeLabels,
			listPersonnelTrainingExportRows(ctx)
		);
		const workbook = await parseWorkbook(result._buffer);

		expect(worksheetRows(worksheetByName(workbook, 'Personnel Info'))).toContainEqual({
			Field: 'Emergency Contact Name',
			Value: 'Taylor Smith'
		});
		expect(worksheetRows(worksheetByName(workbook, 'Counseling Records'))).toHaveLength(2);
		const training = worksheetByName(workbook, 'Training Records');
		expect((training.getRow(1).values as unknown[]).slice(1)).toEqual([
			'Training Type',
			'Completed Date',
			'Expiration Date',
			'Notes'
		]);
		expect(worksheetRows(training)).toEqual([]);
	});
	it('omits the legacy Leader Notes row when the person has no extended-info record', async () => {
		const ctx = createTestContext();
		seedPersonnelExportDataset(ctx);
		await ctx.rawStore.deleteManyByIds('personnel_extended_info', ctx.auth.orgId, ['extended-1']);
		const result = await exportPersonnelWorkbook(
			ctx,
			{ personnelId: PERSONNEL_ID, asOf: '2026-05-20' },
			listAvailabilityHistory,
			listStatusTypeLabels,
			listTrainingTypeLabels,
			listPersonnelTrainingExportRows(ctx)
		);
		const workbook = await parseWorkbook(result._buffer);
		expect(worksheetRows(worksheetByName(workbook, 'Personnel Info')).some((row) => row.Field === 'Leader Notes')).toBe(
			false
		);
	});
	it('fails the workbook when the owned Training read fails, without auditing a successful export', async () => {
		const ctx = createTestContext();
		seedPersonnelExportDataset(ctx);
		const failure = new Error('Training export read unavailable');

		await expect(
			exportPersonnelWorkbook(
				ctx,
				{ personnelId: PERSONNEL_ID, asOf: '2026-05-20' },
				listAvailabilityHistory,
				listStatusTypeLabels,
				listTrainingTypeLabels,
				async () => {
					throw failure;
				}
			)
		).rejects.toThrow(failure);
		expect(ctx.auditPort.events.filter((event) => event.action === 'personnel.exported')).toEqual([]);
	});
});

it('omits the Training sheet and explains its omission when Training is off', async () => {
	const ctx = createTestContext({ disabledFeatures: ['training'] });
	seedPersonnelExportDataset(ctx);
	const trainingRecords = vi.fn(async () => {
		throw new Error('Training must not be read');
	});
	const trainingLabels = vi.fn(async () => {
		throw new Error('Training must not be read');
	});
	const result = await exportPersonnelWorkbook(
		ctx,
		{ personnelId: PERSONNEL_ID, asOf: '2026-05-20' },
		listAvailabilityHistory,
		listStatusTypeLabels,
		trainingLabels,
		trainingRecords
	);
	const workbook = await parseWorkbook(result._buffer);
	expect(workbook.getWorksheet('Training Records')).toBeUndefined();
	expect(worksheetRows(worksheetByName(workbook, 'Export Notes'))).toEqual([
		{ Notes: 'Training is turned off; its records are not included.' }
	]);
	expect(worksheetRows(worksheetByName(workbook, 'Personnel Info'))).toContainEqual({
		Field: 'Last Name',
		Value: 'Smith'
	});
	expect(trainingRecords).not.toHaveBeenCalled();
	expect(trainingLabels).not.toHaveBeenCalled();
});
