import { describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { exportPersonnelWorkbook } from './personnelExport';

type TestContext = ReturnType<typeof createTestContext>;
type WorkbookLoadBuffer = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];

const PERSONNEL_ID = '11111111-1111-4111-8111-111111111111';

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
	ctx.rawStore.seed('training_types', [
		{
			id: 'training-type-1',
			organization_id: ctx.auth.orgId,
			name: 'Weapons Qual'
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
	ctx.rawStore.seed('availability_entries', [
		{
			id: 'availability-1',
			organization_id: ctx.auth.orgId,
			personnel_id: PERSONNEL_ID,
			status_type_id: 'status-type-1',
			start_date: '2026-05-15',
			end_date: '2026-05-17'
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
				scopeSet: { kind: 'groups', groupIds: ['allowed-group'] }
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

		await expect(exportPersonnelWorkbook(ctx, { personnelId: PERSONNEL_ID })).rejects.toMatchObject({
			status: 403
		});

		expect(findManySpy).not.toHaveBeenCalled();
	});

	it('rejects malformed personnel ids before querying storage', async () => {
		const ctx = createTestContext();
		const findOneSpy = vi.spyOn(ctx.rawStore, 'findOne');

		await expect(exportPersonnelWorkbook(ctx, { personnelId: 'person-1' })).rejects.toMatchObject({
			status: 400,
			message: 'Invalid personnel ID'
		});

		expect(findOneSpy).not.toHaveBeenCalled();
	});

	it('exports the existing personnel workbook content, filename, and audit event', async () => {
		const ctx = createTestContext();
		seedPersonnelExportDataset(ctx);

		const result = await exportPersonnelWorkbook(ctx, { personnelId: PERSONNEL_ID });
		const workbook = await parseWorkbook(result._buffer);
		const dateStr = new Date().toISOString().split('T')[0];

		expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
			'Personnel Info',
			'Training Records',
			'Counseling Records',
			'Availability History'
		]);
		expect(result._filename).toBe(`SGT_Smith_Jamie-export-${dateStr}.xlsx`);
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
				{ Field: 'Leader Notes', Value: 'Needs passport review' }
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
			}
		]);
	});
});
