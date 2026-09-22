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
			payload: payload()
		});

		expect(plan.inventorySheet.rows.length).toBeGreaterThan(30);
		expect(plan.readableSheets.map((sheet) => sheet.name)).toContain('Personnel');
		expect(plan.readableSheets.map((sheet) => sheet.name)).toContain('Training Records');
		expect(plan.rawArchiveSheets.map((sheet) => sheet.name)).toContain('Raw - Personnel Trainings');
	});

	it('includes area keys in the workbook inventory sheet', () => {
		const plan = buildOrganizationDataExportWorkbookPlan({
			payload: payload()
		});

		expect(plan.inventorySheet.columns.map((column) => column.key)).toContain('areaKey');
		expect(new Set(plan.inventorySheet.rows.map((row) => row.areaKey))).toContain('personnel');
	});

	it('keeps retained personnel and Calendar sheets in the full plan', () => {
		const plan = buildOrganizationDataExportWorkbookPlan({ payload: payload() });
		const personnel = plan.readableSheets.find((sheet) => sheet.name === 'Personnel');

		expect(plan.readableSheets.map((sheet) => sheet.name)).toContain('Calendar');
		expect(plan.rawArchiveSheets.map((sheet) => sheet.name)).toContain('Raw - Sign-in Rosters');
		expect(plan.rawArchiveSheets.map((sheet) => sheet.name)).toContain('Raw - Availability Entries');
		expect(personnel?.columns.map((column) => column.header)).toContain('Duty Role');
		expect(personnel?.rows[0]).toMatchObject({
			group: 'Alpha',
			emergency_contact: 'Taylor Smith',
			phone: '555-0101'
		});
	});

	it('keeps empty readable sheets visible with the existing no-records column', () => {
		const plan = buildOrganizationDataExportWorkbookPlan({
			payload: payload({ leaderNotes: [] })
		});
		const leaderNotes = plan.readableSheets.find((sheet) => sheet.name === 'Leader Notes');

		expect(leaderNotes).toBeDefined();
		expect(leaderNotes?.columns).toEqual([{ header: 'No records', key: 'empty', width: 16 }]);
		expect(leaderNotes?.rows).toEqual([]);
	});

	it('preserves structured raw archive values as JSON strings', () => {
		const plan = buildOrganizationDataExportWorkbookPlan({
			payload: payload({
				auditLogs: [
					{
						id: 'audit-1',
						details: { changed: ['name', 'color'] }
					}
				]
			})
		});
		const rawAudits = plan.rawArchiveSheets.find((sheet) => sheet.name === 'Raw - Audit Logs');

		expect(rawAudits?.rows[0]?.details).toBe('{"changed":["name","color"]}');
	});

	it('falls back to personnel id when a malformed person has no label fields', () => {
		const plan = buildOrganizationDataExportWorkbookPlan({
			payload: payload({
				personnel: [{ id: 'person-without-name' }],
				availabilityEntries: [
					{
						id: 'availability-1',
						personnel_id: 'person-without-name',
						status_type_id: 'status-1'
					}
				]
			})
		});
		const calendar = plan.readableSheets.find((sheet) => sheet.name === 'Calendar');

		expect(calendar?.rows[0]?.person).toBe('person-without-name');
	});

	it('returns a dated workbook filename owned by the export use case', async () => {
		const result = await buildOrganizationDataExportWorkbook({
			payload: payload()
		});

		expect(result.filename).toBe('org-export-org-1-2026-05-20.xlsx');
		expect(result.workbook.getWorksheet('Training Records')).toBeDefined();
		expect(result.workbook.getWorksheet('Personnel')).toBeDefined();
	});
});
