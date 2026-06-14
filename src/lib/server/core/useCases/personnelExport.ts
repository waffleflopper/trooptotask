import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import {
	addTableSheet,
	createWorkbook,
	writeWorkbookBuffer,
	type Workbook,
	type WorkbookColumn,
	type WorkbookRow
} from '$lib/export/workbook';
import { fail } from '$lib/server/core/errors';
import type { UseCaseContext } from '$lib/server/core/ports';
import { policyResourceForGroup, requireFeaturePolicy } from './featurePolicy';

export interface PersonnelExportInput {
	personnelId: string;
}

export interface PersonnelExportOutput {
	_buffer: ArrayBuffer;
	_filename: string;
}

export async function exportPersonnelWorkbook(
	ctx: UseCaseContext,
	input: PersonnelExportInput
): Promise<PersonnelExportOutput> {
	const orgId = ctx.auth.orgId;
	const id = input.personnelId;

	const person = await ctx.rawStore.findOne<Record<string, unknown>>('personnel', orgId, { id });

	if (!person) fail(404, 'Personnel not found');

	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.personnel.exportRecords,
		policyResourceForGroup(person.group_id),
		'personnel',
		id
	);

	const [trainings, counseling, availability, trainingTypes, statusTypes, groups] = await Promise.all([
		ctx.rawStore.findMany<Record<string, unknown>>('personnel_trainings', orgId, { personnel_id: id }),
		ctx.rawStore.findMany<Record<string, unknown>>(
			'counseling_records',
			orgId,
			{ personnel_id: id },
			{
				orderBy: [{ column: 'date_conducted', ascending: false }]
			}
		),
		ctx.rawStore.findMany<Record<string, unknown>>(
			'availability_entries',
			orgId,
			{ personnel_id: id },
			{
				orderBy: [{ column: 'start_date', ascending: false }]
			}
		),
		ctx.rawStore.findMany<Record<string, unknown>>('training_types', orgId, {}, { select: 'id, name' }),
		ctx.rawStore.findMany<Record<string, unknown>>('status_types', orgId, {}, { select: 'id, name' }),
		ctx.rawStore.findMany<Record<string, unknown>>('groups', orgId, {}, { select: 'id, name' })
	]);

	// Extended info is a separate table without org_id scoping - query by personnel_id.
	const extResults = await ctx.rawStore.findMany<Record<string, unknown>>('personnel_extended_info', orgId, {
		personnel_id: id
	});
	const ext = extResults[0] ?? null;

	const trainingTypeMap = new Map<string, string>();
	for (const t of trainingTypes) trainingTypeMap.set(t.id as string, t.name as string);
	const statusTypeMap = new Map<string, string>();
	for (const s of statusTypes) statusTypeMap.set(s.id as string, s.name as string);
	const groupMap = new Map<string, string>();
	for (const g of groups) groupMap.set(g.id as string, g.name as string);

	const workbook = await createWorkbook();

	const infoRows: { field: string; value: string }[] = [
		{ field: 'Rank', value: (person.rank as string) ?? '' },
		{ field: 'Last Name', value: (person.last_name as string) ?? '' },
		{ field: 'First Name', value: (person.first_name as string) ?? '' },
		{ field: 'MOS', value: (person.mos as string) ?? '' },
		{ field: 'Duty Role', value: (person.clinic_role as string) ?? '' },
		{ field: 'Group', value: person.group_id ? (groupMap.get(person.group_id as string) ?? '') : '' },
		{ field: 'ETS', value: (person.ets as string) ?? '' },
		{ field: 'PCS / DEROS', value: (person.deros as string) ?? '' },
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
	addTableSheet(workbook, {
		name: 'Personnel Info',
		columns: [
			{ header: 'Field', key: 'field', width: 25 },
			{ header: 'Value', key: 'value', width: 40 }
		],
		rows: infoRows
	});

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
			training_type: lookup(trainingTypeMap, t.training_type_id),
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
			{ header: 'Date', key: 'date_conducted', width: 14 },
			{ header: 'Subject', key: 'subject', width: 35 },
			{ header: 'Key Points', key: 'key_points', width: 40 },
			{ header: 'Plan of Action', key: 'plan_of_action', width: 40 },
			{ header: 'Status', key: 'status', width: 14 },
			{ header: 'Follow-Up Date', key: 'follow_up_date', width: 14 },
			{ header: 'Notes', key: 'notes', width: 30 }
		],
		(c) => ({
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
		'Availability History',
		availability,
		[
			{ header: 'Status', key: 'status', width: 20 },
			{ header: 'Start Date', key: 'start_date', width: 14 },
			{ header: 'End Date', key: 'end_date', width: 14 }
		],
		(a) => ({
			status: lookup(statusTypeMap, a.status_type_id),
			start_date: a.start_date,
			end_date: a.end_date
		})
	);

	const buffer = await writeWorkbookBuffer(workbook);
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
}

function addMappedSheet(
	workbook: Workbook,
	name: string,
	data: Record<string, unknown>[],
	columns: WorkbookColumn[],
	mapper: (row: Record<string, unknown>) => Record<string, unknown>
) {
	addTableSheet(workbook, { name, columns, rows: toWorkbookRows(data.map(mapper)) });
}

function toWorkbookRows(rows: Record<string, unknown>[]): WorkbookRow[] {
	return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, toWorkbookCell(value)])));
}

function lookup(labels: Map<string, string>, value: unknown): string {
	const key = typeof value === 'string' ? value : String(value ?? '');
	return labels.get(key) ?? key;
}

function toWorkbookCell(value: unknown): WorkbookRow[string] {
	if (
		value === null ||
		value === undefined ||
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean' ||
		value instanceof Date
	) {
		return value;
	}
	return String(value);
}
