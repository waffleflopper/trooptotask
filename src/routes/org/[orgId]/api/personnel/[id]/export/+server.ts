import { error } from '@sveltejs/kit';
import { apiRoute } from '$lib/server/apiRoute';
import ExcelJS from 'exceljs';
import { auditLog } from '$lib/server/auditLog';

export const GET = apiRoute(
	{ permission: { privileged: true }, readOnly: false, blockSandbox: true },
	async ({ supabase, orgId, userId }, event) => {
		const id = event.params.id;

		// Fetch all data in parallel
		const [
			personRes,
			trainingsRes,
			counselingRes,
			goalsRes,
			availabilityRes,
			extendedInfoRes,
			trainingTypesRes,
			counselingTypesRes,
			statusTypesRes,
			groupsRes
		] = await Promise.all([
			supabase.from('personnel').select('*').eq('id', id).eq('organization_id', orgId).single(),
			supabase.from('personnel_trainings').select('*').eq('personnel_id', id),
			supabase
				.from('counseling_records')
				.select('*')
				.eq('personnel_id', id)
				.eq('organization_id', orgId)
				.order('date_conducted', { ascending: false }),
			supabase.from('development_goals').select('*').eq('personnel_id', id).eq('organization_id', orgId),
			supabase
				.from('availability_entries')
				.select('*')
				.eq('personnel_id', id)
				.eq('organization_id', orgId)
				.order('start_date', { ascending: false }),
			supabase.from('personnel_extended_info').select('*').eq('personnel_id', id).maybeSingle(),
			supabase.from('training_types').select('id, name').eq('organization_id', orgId),
			supabase.from('counseling_types').select('id, name').eq('organization_id', orgId),
			supabase.from('status_types').select('id, name').eq('organization_id', orgId),
			supabase.from('groups').select('id, name').eq('organization_id', orgId)
		]);

		const person = personRes.data;
		if (!person) throw error(404, 'Personnel not found');

		// Build UUID -> name lookup maps
		const trainingTypeMap = new Map<string, string>();
		for (const t of trainingTypesRes.data ?? []) {
			trainingTypeMap.set(t.id, t.name);
		}

		const counselingTypeMap = new Map<string, string>();
		for (const c of counselingTypesRes.data ?? []) {
			counselingTypeMap.set(c.id, c.name);
		}

		const statusTypeMap = new Map<string, string>();
		for (const s of statusTypesRes.data ?? []) {
			statusTypeMap.set(s.id, s.name);
		}

		const groupMap = new Map<string, string>();
		for (const g of groupsRes.data ?? []) {
			groupMap.set(g.id, g.name);
		}

		const ext = extendedInfoRes.data;

		// Create workbook
		const workbook = new ExcelJS.Workbook();

		// -- Sheet 1: Personnel Info --
		const infoSheet = workbook.addWorksheet('Personnel Info');
		infoSheet.columns = [
			{ header: 'Field', key: 'field', width: 25 },
			{ header: 'Value', key: 'value', width: 40 }
		];

		const infoRows: { field: string; value: string }[] = [
			{ field: 'Rank', value: person.rank ?? '' },
			{ field: 'Last Name', value: person.last_name ?? '' },
			{ field: 'First Name', value: person.first_name ?? '' },
			{ field: 'MOS', value: person.mos ?? '' },
			{ field: 'Role', value: person.clinic_role ?? '' },
			{ field: 'Group', value: person.group_id ? (groupMap.get(person.group_id) ?? '') : '' },
			{ field: 'Archived At', value: person.archived_at ?? '' }
		];

		if (ext) {
			infoRows.push(
				{ field: 'Emergency Contact Name', value: ext.emergency_contact_name ?? '' },
				{ field: 'Emergency Contact Relationship', value: ext.emergency_contact_relationship ?? '' },
				{ field: 'Emergency Contact Phone', value: ext.emergency_contact_phone ?? '' },
				{ field: 'Spouse Name', value: ext.spouse_name ?? '' },
				{ field: 'Spouse Phone', value: ext.spouse_phone ?? '' },
				{ field: 'Vehicle Make/Model', value: ext.vehicle_make_model ?? '' },
				{ field: 'Vehicle Plate', value: ext.vehicle_plate ?? '' },
				{ field: 'Vehicle Color', value: ext.vehicle_color ?? '' },
				{ field: 'Personal Email', value: ext.personal_email ?? '' },
				{ field: 'Personal Phone', value: ext.personal_phone ?? '' },
				{
					field: 'Address',
					value: [ext.address_street, ext.address_city, ext.address_state, ext.address_zip].filter(Boolean).join(', ')
				},
				{ field: 'Leader Notes', value: ext.leader_notes ?? '' }
			);
		}

		for (const row of infoRows) {
			infoSheet.addRow(row);
		}
		styleHeaderRow(infoSheet);

		// -- Sheet 2: Training Records --
		const trainingSheet = workbook.addWorksheet('Training Records');
		trainingSheet.columns = [
			{ header: 'Training Type', key: 'training_type', width: 25 },
			{ header: 'Completed Date', key: 'completion_date', width: 16 },
			{ header: 'Expiration Date', key: 'expiration_date', width: 16 },
			{ header: 'Notes', key: 'notes', width: 40 }
		];
		for (const t of trainingsRes.data ?? []) {
			trainingSheet.addRow({
				training_type: trainingTypeMap.get(t.training_type_id) ?? t.training_type_id,
				completion_date: t.completion_date,
				expiration_date: t.expiration_date,
				notes: t.notes ?? ''
			});
		}
		styleHeaderRow(trainingSheet);

		// -- Sheet 3: Counseling Records --
		const counselingSheet = workbook.addWorksheet('Counseling Records');
		counselingSheet.columns = [
			{ header: 'Type', key: 'type', width: 20 },
			{ header: 'Date', key: 'date_conducted', width: 14 },
			{ header: 'Subject', key: 'subject', width: 35 },
			{ header: 'Key Points', key: 'key_points', width: 40 },
			{ header: 'Plan of Action', key: 'plan_of_action', width: 40 },
			{ header: 'Status', key: 'status', width: 14 },
			{ header: 'Follow-Up Date', key: 'follow_up_date', width: 14 },
			{ header: 'Notes', key: 'notes', width: 30 }
		];
		for (const c of counselingRes.data ?? []) {
			counselingSheet.addRow({
				type: counselingTypeMap.get(c.counseling_type_id) ?? c.counseling_type_id,
				date_conducted: c.date_conducted,
				subject: c.subject ?? '',
				key_points: c.key_points ?? '',
				plan_of_action: c.plan_of_action ?? '',
				status: c.status ?? '',
				follow_up_date: c.follow_up_date ?? '',
				notes: c.notes ?? ''
			});
		}
		styleHeaderRow(counselingSheet);

		// -- Sheet 4: Development Goals --
		const goalsSheet = workbook.addWorksheet('Development Goals');
		goalsSheet.columns = [
			{ header: 'Title', key: 'title', width: 30 },
			{ header: 'Description', key: 'description', width: 40 },
			{ header: 'Category', key: 'category', width: 14 },
			{ header: 'Priority', key: 'priority', width: 12 },
			{ header: 'Status', key: 'status', width: 14 },
			{ header: 'Target Date', key: 'target_date', width: 14 },
			{ header: 'Progress Notes', key: 'progress_notes', width: 40 }
		];
		for (const d of goalsRes.data ?? []) {
			goalsSheet.addRow({
				title: d.title ?? '',
				description: d.description ?? '',
				category: d.category ?? '',
				priority: d.priority ?? '',
				status: d.status ?? '',
				target_date: d.target_date ?? '',
				progress_notes: d.progress_notes ?? ''
			});
		}
		styleHeaderRow(goalsSheet);

		// -- Sheet 5: Availability History --
		const availabilitySheet = workbook.addWorksheet('Availability History');
		availabilitySheet.columns = [
			{ header: 'Status', key: 'status', width: 20 },
			{ header: 'Start Date', key: 'start_date', width: 14 },
			{ header: 'End Date', key: 'end_date', width: 14 }
		];
		for (const a of availabilityRes.data ?? []) {
			availabilitySheet.addRow({
				status: statusTypeMap.get(a.status_type_id) ?? a.status_type_id,
				start_date: a.start_date,
				end_date: a.end_date
			});
		}
		styleHeaderRow(availabilitySheet);

		// Write workbook to buffer
		const buffer = await workbook.xlsx.writeBuffer();

		const personName = `${person.rank ?? ''} ${person.last_name ?? ''} ${person.first_name ?? ''}`
			.trim()
			.replace(/\s+/g, '_');
		const dateStr = new Date().toISOString().split('T')[0];
		const filename = `${personName}-export-${dateStr}.xlsx`;

		auditLog(
			{
				action: 'personnel.exported',
				resourceType: 'personnel',
				resourceId: id,
				orgId,
				details: {
					actor: event.locals.user?.email ?? userId,
					name: `${person.rank ?? ''} ${person.last_name ?? ''}, ${person.first_name ?? ''}`
				}
			},
			{ userId }
		);

		return new Response(buffer as ArrayBuffer, {
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="${filename}"`
			}
		});
	}
);

function styleHeaderRow(sheet: ExcelJS.Worksheet) {
	const headerRow = sheet.getRow(1);
	headerRow.font = { bold: true };
	headerRow.eachCell((cell) => {
		cell.fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: 'FFE8E8E8' }
		};
	});
}
