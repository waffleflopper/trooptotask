import type { RequestEvent } from '@sveltejs/kit';
import { handle } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import ExcelJS from 'exceljs';

export const GET = handle<{ personnelId: string }, unknown>({
	permission: 'privileged',
	parseInput: (event: RequestEvent) => ({ personnelId: event.params.id as string }),
	fn: async (ctx, input) => {
		const orgId = ctx.auth.orgId;
		const id = input.personnelId;

		const [person, trainings, counseling, goals, availability, trainingTypes, counselingTypes, statusTypes, groups] =
			await Promise.all([
				ctx.rawStore.findOne<Record<string, unknown>>('personnel', orgId, { id }),
				ctx.rawStore.findMany<Record<string, unknown>>('personnel_trainings', orgId, { personnel_id: id }),
				ctx.rawStore.findMany<Record<string, unknown>>(
					'counseling_records',
					orgId,
					{ personnel_id: id },
					{
						orderBy: [{ column: 'date_conducted', ascending: false }]
					}
				),
				ctx.rawStore.findMany<Record<string, unknown>>('development_goals', orgId, { personnel_id: id }),
				ctx.rawStore.findMany<Record<string, unknown>>(
					'availability_entries',
					orgId,
					{ personnel_id: id },
					{
						orderBy: [{ column: 'start_date', ascending: false }]
					}
				),
				ctx.rawStore.findMany<Record<string, unknown>>('training_types', orgId, {}, { select: 'id, name' }),
				ctx.rawStore.findMany<Record<string, unknown>>('counseling_types', orgId, {}, { select: 'id, name' }),
				ctx.rawStore.findMany<Record<string, unknown>>('status_types', orgId, {}, { select: 'id, name' }),
				ctx.rawStore.findMany<Record<string, unknown>>('groups', orgId, {}, { select: 'id, name' })
			]);

		if (!person) fail(404, 'Personnel not found');

		// Extended info is a separate table without org_id scoping — query by personnel_id
		const extResults = await ctx.rawStore.findMany<Record<string, unknown>>('personnel_extended_info', orgId, {
			personnel_id: id
		});
		const ext = extResults[0] ?? null;

		const trainingTypeMap = new Map<string, string>();
		for (const t of trainingTypes) trainingTypeMap.set(t.id as string, t.name as string);
		const counselingTypeMap = new Map<string, string>();
		for (const c of counselingTypes) counselingTypeMap.set(c.id as string, c.name as string);
		const statusTypeMap = new Map<string, string>();
		for (const s of statusTypes) statusTypeMap.set(s.id as string, s.name as string);
		const groupMap = new Map<string, string>();
		for (const g of groups) groupMap.set(g.id as string, g.name as string);

		const workbook = new ExcelJS.Workbook();

		const infoSheet = workbook.addWorksheet('Personnel Info');
		infoSheet.columns = [
			{ header: 'Field', key: 'field', width: 25 },
			{ header: 'Value', key: 'value', width: 40 }
		];
		const infoRows: { field: string; value: string }[] = [
			{ field: 'Rank', value: (person.rank as string) ?? '' },
			{ field: 'Last Name', value: (person.last_name as string) ?? '' },
			{ field: 'First Name', value: (person.first_name as string) ?? '' },
			{ field: 'MOS', value: (person.mos as string) ?? '' },
			{ field: 'Role', value: (person.clinic_role as string) ?? '' },
			{ field: 'Group', value: person.group_id ? (groupMap.get(person.group_id as string) ?? '') : '' },
			{ field: 'Archived At', value: (person.archived_at as string) ?? '' }
		];
		if (ext) {
			infoRows.push(
				{ field: 'Emergency Contact Name', value: (ext.emergency_contact_name as string) ?? '' },
				{ field: 'Emergency Contact Relationship', value: (ext.emergency_contact_relationship as string) ?? '' },
				{ field: 'Emergency Contact Phone', value: (ext.emergency_contact_phone as string) ?? '' },
				{ field: 'Spouse Name', value: (ext.spouse_name as string) ?? '' },
				{ field: 'Spouse Phone', value: (ext.spouse_phone as string) ?? '' },
				{ field: 'Vehicle Make/Model', value: (ext.vehicle_make_model as string) ?? '' },
				{ field: 'Vehicle Plate', value: (ext.vehicle_plate as string) ?? '' },
				{ field: 'Vehicle Color', value: (ext.vehicle_color as string) ?? '' },
				{ field: 'Personal Email', value: (ext.personal_email as string) ?? '' },
				{ field: 'Personal Phone', value: (ext.personal_phone as string) ?? '' },
				{
					field: 'Address',
					value: [ext.address_street, ext.address_city, ext.address_state, ext.address_zip].filter(Boolean).join(', ')
				},
				{ field: 'Leader Notes', value: (ext.leader_notes as string) ?? '' }
			);
		}
		for (const row of infoRows) infoSheet.addRow(row);
		styleHeaderRow(infoSheet);

		addMappedSheet(
			workbook,
			'Training Records',
			trainings,
			[
				{ header: 'Training Type', key: 'training_type', width: 25 },
				{ header: 'Completed Date', key: 'completion_date', width: 16 },
				{ header: 'Expiration Date', key: 'expiration_date', width: 16 },
				{ header: 'Notes', key: 'notes', width: 40 }
			],
			(t) => ({
				training_type: trainingTypeMap.get(t.training_type_id as string) ?? t.training_type_id,
				completion_date: t.completion_date,
				expiration_date: t.expiration_date,
				notes: t.notes ?? ''
			})
		);

		addMappedSheet(
			workbook,
			'Counseling Records',
			counseling,
			[
				{ header: 'Type', key: 'type', width: 20 },
				{ header: 'Date', key: 'date_conducted', width: 14 },
				{ header: 'Subject', key: 'subject', width: 35 },
				{ header: 'Key Points', key: 'key_points', width: 40 },
				{ header: 'Plan of Action', key: 'plan_of_action', width: 40 },
				{ header: 'Status', key: 'status', width: 14 },
				{ header: 'Follow-Up Date', key: 'follow_up_date', width: 14 },
				{ header: 'Notes', key: 'notes', width: 30 }
			],
			(c) => ({
				type: counselingTypeMap.get(c.counseling_type_id as string) ?? c.counseling_type_id,
				date_conducted: c.date_conducted,
				subject: c.subject ?? '',
				key_points: c.key_points ?? '',
				plan_of_action: c.plan_of_action ?? '',
				status: c.status ?? '',
				follow_up_date: c.follow_up_date ?? '',
				notes: c.notes ?? ''
			})
		);

		addMappedSheet(
			workbook,
			'Development Goals',
			goals,
			[
				{ header: 'Title', key: 'title', width: 30 },
				{ header: 'Description', key: 'description', width: 40 },
				{ header: 'Category', key: 'category', width: 14 },
				{ header: 'Priority', key: 'priority', width: 12 },
				{ header: 'Status', key: 'status', width: 14 },
				{ header: 'Target Date', key: 'target_date', width: 14 },
				{ header: 'Progress Notes', key: 'progress_notes', width: 40 }
			],
			(d) => ({
				title: d.title ?? '',
				description: d.description ?? '',
				category: d.category ?? '',
				priority: d.priority ?? '',
				status: d.status ?? '',
				target_date: d.target_date ?? '',
				progress_notes: d.progress_notes ?? ''
			})
		);

		addMappedSheet(
			workbook,
			'Availability History',
			availability,
			[
				{ header: 'Status', key: 'status', width: 20 },
				{ header: 'Start Date', key: 'start_date', width: 14 },
				{ header: 'End Date', key: 'end_date', width: 14 }
			],
			(a) => ({
				status: statusTypeMap.get(a.status_type_id as string) ?? a.status_type_id,
				start_date: a.start_date,
				end_date: a.end_date
			})
		);

		const buffer = await workbook.xlsx.writeBuffer();
		const personName =
			`${(person.rank as string) ?? ''} ${(person.last_name as string) ?? ''} ${(person.first_name as string) ?? ''}`
				.trim()
				.replace(/\s+/g, '_');
		const dateStr = new Date().toISOString().split('T')[0];

		ctx.audit.log({
			action: 'personnel.exported',
			resourceType: 'personnel',
			resourceId: id,
			details: {
				name: `${(person.rank as string) ?? ''} ${(person.last_name as string) ?? ''}, ${(person.first_name as string) ?? ''}`
			}
		});

		return { _buffer: buffer, _filename: `${personName}-export-${dateStr}.xlsx` };
	},
	formatOutput: (result) => {
		const r = result as Record<string, unknown>;
		return new Response(r._buffer as ArrayBuffer, {
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="${r._filename}"`
			}
		});
	}
});

function styleHeaderRow(sheet: ExcelJS.Worksheet) {
	const headerRow = sheet.getRow(1);
	headerRow.font = { bold: true };
	headerRow.eachCell((cell) => {
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
	});
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function addMappedSheet(
	workbook: ExcelJS.Workbook,
	name: string,
	data: any[],
	columns: any[],
	mapper: (row: any) => any
) {
	/* eslint-enable @typescript-eslint/no-explicit-any */
	const sheet = workbook.addWorksheet(name);
	sheet.columns = columns;
	for (const row of data) sheet.addRow(mapper(row));
	styleHeaderRow(sheet);
}
