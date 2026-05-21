import { describe, expect, it } from 'vitest';
import type { OrganizationExportPayload } from './organizationExport';
import {
	buildOrganizationDataExportWorkbook,
	buildOrganizationDataExportWorkbookPlan
} from './organizationExportWorkbook';

function payload(overrides: Partial<OrganizationExportPayload['sections']> = {}): OrganizationExportPayload {
	return {
		exportedAt: '2026-05-20T12:00:00.000Z',
		organizationId: 'org-1',
		sectionInventory: [],
		sections: {
			groups: [{ id: 'group-1', name: 'Alpha' }],
			personnel: [
				{
					id: 'person-1',
					rank: 'SGT',
					last_name: 'Smith',
					first_name: 'Jamie',
					clinic_role: 'Medic',
					group_id: 'group-1'
				}
			],
			personnelExtendedInfo: [
				{
					id: 'extended-1',
					personnel_id: 'person-1',
					emergency_contact_name: 'Taylor Smith',
					personal_phone: '555-0101'
				}
			],
			trainingTypes: [{ id: 'training-type-1', name: 'Weapons Qual' }],
			personnelTrainings: [
				{
					id: 'training-record-1',
					personnel_id: 'person-1',
					training_type_id: 'training-type-1',
					completion_date: '2026-05-01'
				}
			],
			statusTypes: [{ id: 'status-1', name: 'TDY' }],
			availabilityEntries: [
				{
					id: 'availability-1',
					personnel_id: 'person-1',
					status_type_id: 'status-1',
					start_date: '2026-05-20',
					end_date: '2026-05-21'
				}
			],
			...overrides
		}
	};
}

describe('Organization Data Export workbook', () => {
	it('plans all readable and raw sheets for the current full export path', () => {
		const plan = buildOrganizationDataExportWorkbookPlan({
			payload: payload(),
			selection: { mode: 'all' }
		});

		expect(plan.inventorySheet.rows.length).toBeGreaterThan(30);
		expect(plan.readableSheets.map((sheet) => sheet.name)).toContain('Personnel');
		expect(plan.readableSheets.map((sheet) => sheet.name)).toContain('Training Records');
		expect(plan.rawArchiveSheets.map((sheet) => sheet.name)).toContain('Raw - Personnel Trainings');
	});

	it('can narrow the workbook plan to a selected export area', () => {
		const plan = buildOrganizationDataExportWorkbookPlan({
			payload: payload(),
			selection: { mode: 'areas', areas: ['personnel'] }
		});
		const readableSheetNames = plan.readableSheets.map((sheet) => sheet.name);
		const rawSheetNames = plan.rawArchiveSheets.map((sheet) => sheet.name);
		const inventoryAreas = new Set(plan.inventorySheet.rows.map((row) => row.area));
		const personnel = plan.readableSheets.find((sheet) => sheet.name === 'Personnel');

		expect(readableSheetNames).toContain('Personnel');
		expect(readableSheetNames).toContain('Personnel Documents');
		expect(readableSheetNames).not.toContain('Training Records');
		expect(readableSheetNames).not.toContain('Calendar');
		expect(rawSheetNames).toContain('Raw - Personnel');
		expect(rawSheetNames).toContain('Raw - Sign-in Rosters');
		expect(rawSheetNames).not.toContain('Raw - Personnel Trainings');
		expect(rawSheetNames).not.toContain('Raw - Availability Entries');
		expect([...inventoryAreas]).toEqual(['Personnel']);
		expect(personnel?.columns.map((column) => column.header)).toContain('Duty Role');
		expect(personnel?.rows[0]).toMatchObject({
			group: 'Alpha',
			emergency_contact: 'Taylor Smith',
			phone: '555-0101'
		});
	});

	it('keeps empty readable sheets visible with the existing no-records column', () => {
		const plan = buildOrganizationDataExportWorkbookPlan({
			payload: payload({ leaderNotes: [] }),
			selection: { mode: 'areas', areas: ['personnel'] }
		});
		const leaderNotes = plan.readableSheets.find((sheet) => sheet.name === 'Leader Notes');

		expect(leaderNotes).toBeDefined();
		expect(leaderNotes?.columns).toEqual([{ header: 'No records', key: 'empty', width: 16 }]);
		expect(leaderNotes?.rows).toEqual([]);
	});

	it('returns a dated workbook filename owned by the export use case', async () => {
		const result = await buildOrganizationDataExportWorkbook({
			payload: payload(),
			selection: { mode: 'areas', areas: ['training'] }
		});

		expect(result.filename).toBe('org-export-org-1-2026-05-20.xlsx');
		expect(result.workbook.getWorksheet('Training Records')).toBeDefined();
		expect(result.workbook.getWorksheet('Personnel')).toBeUndefined();
	});
});
