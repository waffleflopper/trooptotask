import { describe, expect, it } from 'vitest';
import type { OrganizationExportPayload } from './organizationExport.server';
import {
	buildOrganizationDataExportWorkbook,
	buildOrganizationDataExportWorkbookPlan
} from './organizationExportWorkbook.server';

function payload(overrides: Partial<OrganizationExportPayload['sections']> = {}): OrganizationExportPayload {
	return {
		exportedAt: '2026-05-20T12:00:00.000Z',
		organizationId: 'org-1',
		sectionInventory: [],
		sections: {
			signInRosters: [],
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
					dod_id: '0123456789',
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
	it('plans the supplied source sections with readable and raw Training data', () => {
		const plan = buildOrganizationDataExportWorkbookPlan({
			payload: payload()
		});

		expect(plan.inventorySheet.rows).toContainEqual({
			key: 'personnelTrainings',
			title: 'Personnel Trainings',
			table: 'personnel_trainings',
			area: 'Training',
			areaKey: 'training',
			rowCount: 1
		});
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
			dod_id: '0123456789',
			group: 'Alpha',
			emergency_contact: 'Taylor Smith',
			phone: '555-0101'
		});
		expect(
			plan.rawArchiveSheets.find((sheet) => sheet.name === 'Raw - Personnel Extended Info')?.rows[0]
		).toMatchObject({ personnel_id: 'person-1', dod_id: '0123456789' });
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

	it('names an Event coordinator by email and falls back to the user id without one', () => {
		const plan = buildOrganizationDataExportWorkbookPlan({
			payload: payload({
				memberships: [
					{ user_id: 'user-kim', email: 'sgt.kim@example.mil' },
					{ user_id: 'user-lee', email: null }
				],
				calendarEvents: [
					{ id: 'event-1', title: 'Range Week', coordinator_user_id: 'user-kim', cancelled_by: null },
					{ id: 'event-2', title: 'Best Medic', coordinator_user_id: 'user-lee', cancelled_by: 'user-lee' }
				]
			})
		});
		const events = plan.readableSheets.find((sheet) => sheet.name === 'Events');

		expect(events?.rows.map((row) => [row.coordinator, row.cancelled_by])).toEqual([
			['sgt.kim@example.mil', ''],
			['user-lee', 'user-lee']
		]);
	});

	it('names a Tasking’s Event and responsible Group, and reads no Group as the organization itself', () => {
		const plan = buildOrganizationDataExportWorkbookPlan({
			payload: payload({
				calendarEvents: [{ id: 'event-1', title: 'Best Medic' }],
				calendarTaskings: [
					{ id: 'tasking-1', title: 'Provide medics', event_id: 'event-1', responsible_group_id: 'group-1' },
					{ id: 'tasking-2', title: 'Brief the commander', event_id: null, responsible_group_id: null }
				]
			})
		});
		const taskings = plan.readableSheets.find((sheet) => sheet.name === 'Taskings');

		expect(taskings?.rows.map((row) => [row.outcome, row.event, row.responsible])).toEqual([
			['Provide medics', 'Best Medic', 'Alpha'],
			['Brief the commander', 'Standalone', 'This organization']
		]);
	});

	it('names each picked person against the Tasking they are picked for, with any open review', () => {
		const plan = buildOrganizationDataExportWorkbookPlan({
			payload: payload({
				calendarTaskings: [{ id: 'tasking-1', title: 'Provide medics', event_id: null }],
				calendarTaskingParticipants: [
					{ tasking_id: 'tasking-1', personnel_id: 'person-1', review_since: '2026-05-02T00:00:00Z' }
				]
			})
		});
		const people = plan.readableSheets.find((sheet) => sheet.name === 'Tasking People');

		expect(people?.rows.map((row) => [row.tasking, row.person, row.needs_review_since])).toEqual([
			['Provide medics', expect.stringContaining('Smith'), '2026-05-02T00:00:00Z']
		]);
	});

	it('names the Tasking and the member behind each equipment and checklist row', () => {
		const plan = buildOrganizationDataExportWorkbookPlan({
			payload: payload({
				memberships: [{ user_id: 'user-kim', email: 'sgt.kim@example.mil' }],
				calendarTaskings: [{ id: 'tasking-1', title: 'Provide medics' }],
				calendarTaskingEquipment: [
					{ tasking_id: 'tasking-1', position: 1, name: 'Litters', quantity: 4, secured_quantity: 3 }
				],
				calendarTaskingChecklistItems: [
					{
						tasking_id: 'tasking-1',
						position: 1,
						label: 'Book the range',
						done: true,
						done_at: '2030-10-23T09:00:00Z',
						done_by: 'user-kim'
					},
					{ tasking_id: 'tasking-1', position: 2, label: 'Brief medics', done: false, done_at: null, done_by: null }
				]
			})
		});
		const sheet = (name: string) => plan.readableSheets.find((candidate) => candidate.name === name);

		expect(sheet('Tasking Equipment')?.rows).toEqual([
			{ tasking: 'Provide medics', position: 1, equipment: 'Litters', quantity: 4, secured_quantity: 3 }
		]);
		expect(sheet('Tasking Checklist')?.rows.map((row) => [row.tasking, row.item, row.done, row.done_by])).toEqual([
			['Provide medics', 'Book the range', true, 'sgt.kim@example.mil'],
			['Provide medics', 'Brief medics', false, '']
		]);
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
