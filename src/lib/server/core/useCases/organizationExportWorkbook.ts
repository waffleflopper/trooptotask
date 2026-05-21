import {
	addTableSheet,
	createWorkbook,
	type Workbook,
	type WorkbookColumn,
	type WorkbookRow
} from '$lib/export/workbook';
import {
	ORGANIZATION_EXPORT_SECTIONS,
	type OrganizationExportPayload,
	type OrganizationExportSection
} from './organizationExport';

export const ORGANIZATION_DATA_EXPORT_AREA_KEYS = [
	'settings',
	'audit',
	'feedback',
	'personnel',
	'calendar',
	'training',
	'critical-tasks',
	'onboarding',
	'rating-scheme',
	'duty-rosters'
] as const;

export type OrganizationDataExportAreaKey = (typeof ORGANIZATION_DATA_EXPORT_AREA_KEYS)[number];

export type OrganizationDataExportSelection =
	| { mode: 'all' }
	| { mode: 'areas'; areas: OrganizationDataExportAreaKey[] };

export interface OrganizationDataExportWorkbookInput {
	payload: OrganizationExportPayload;
	selection?: OrganizationDataExportSelection;
}

export interface OrganizationDataExportWorkbookResult {
	workbook: Workbook;
	filename: string;
}

export interface OrganizationDataExportSheetPlan {
	name: string;
	columns: WorkbookColumn[];
	rows: WorkbookRow[];
}

export interface OrganizationDataExportWorkbookPlan {
	inventorySheet: OrganizationDataExportSheetPlan;
	readableSheets: OrganizationDataExportSheetPlan[];
	rawArchiveSheets: OrganizationDataExportSheetPlan[];
}

interface ReadableSheetDefinition {
	name: string;
	area: OrganizationDataExportAreaKey;
	rows: (
		sections: OrganizationExportPayload['sections'],
		labels: OrganizationDataExportLabels
	) => Record<string, unknown>[];
}

interface OrganizationDataExportLabels {
	personnel: Map<string, string>;
	groups: Map<string, string>;
	statusTypes: Map<string, string>;
	assignmentTypes: Map<string, string>;
	trainingTypes: Map<string, string>;
	criticalTasks: Map<string, string>;
	extendedInfoByPerson: Map<string, Record<string, unknown>>;
}

const READABLE_SHEETS: ReadableSheetDefinition[] = [
	{
		name: 'Personnel',
		area: 'personnel',
		rows: (sections, labels) =>
			(sections.personnel ?? []).map((person) => {
				const ext = typeof person.id === 'string' ? labels.extendedInfoByPerson.get(person.id) : undefined;
				return {
					rank: person.rank,
					last_name: person.last_name,
					first_name: person.first_name,
					mos: person.mos,
					clinic_role: person.clinic_role,
					group: lookup(labels.groups, person.group_id),
					ets: person.ets ?? '',
					deros: person.deros ?? '',
					archived_at: person.archived_at ?? '',
					emergency_contact: ext?.emergency_contact_name ?? '',
					emergency_phone: ext?.emergency_contact_phone ?? '',
					phone: ext?.personal_phone ?? '',
					email: ext?.personal_email ?? '',
					address: ext
						? [ext.address_street, ext.address_city, ext.address_state, ext.address_zip].filter(Boolean).join(', ')
						: '',
					leader_notes: ext?.leader_notes ?? ''
				};
			})
	},
	{ name: 'Groups', area: 'personnel', rows: (sections) => sections.groups ?? [] },
	{
		name: 'Calendar',
		area: 'calendar',
		rows: (sections, labels) =>
			(sections.availabilityEntries ?? []).map((entry) => ({
				person: lookup(labels.personnel, entry.personnel_id),
				status: lookup(labels.statusTypes, entry.status_type_id),
				start_date: entry.start_date,
				end_date: entry.end_date,
				note: entry.note ?? ''
			}))
	},
	{ name: 'Training Types', area: 'training', rows: (sections) => sections.trainingTypes ?? [] },
	{
		name: 'Training Records',
		area: 'training',
		rows: (sections, labels) =>
			(sections.personnelTrainings ?? []).map((training) => ({
				person: lookup(labels.personnel, training.personnel_id),
				training_type: lookup(labels.trainingTypes, training.training_type_id),
				completion_date: training.completion_date,
				expiration_date: training.expiration_date,
				notes: training.notes,
				certificate_url: training.certificate_url
			}))
	},
	{ name: 'Status Types', area: 'calendar', rows: (sections) => sections.statusTypes ?? [] },
	{ name: 'Assignment Types', area: 'calendar', rows: (sections) => sections.assignmentTypes ?? [] },
	{
		name: 'Daily Assignments',
		area: 'calendar',
		rows: (sections, labels) =>
			(sections.dailyAssignments ?? []).map((assignment) => ({
				date: assignment.date,
				person: lookup(labels.personnel, assignment.assignee_id),
				assignment_type: lookup(labels.assignmentTypes, assignment.assignment_type_id)
			}))
	},
	{
		name: 'Counseling Records',
		area: 'personnel',
		rows: (sections, labels) =>
			(sections.counselingRecords ?? []).map((record) => ({
				person: lookup(labels.personnel, record.personnel_id),
				date_conducted: record.date_conducted,
				subject: record.subject,
				key_points: record.key_points,
				plan_of_action: record.plan_of_action,
				status: record.status,
				notes: record.notes
			}))
	},
	{
		name: 'Leader Notes',
		area: 'personnel',
		rows: (sections, labels) =>
			(sections.leaderNotes ?? []).map((note) => ({
				person: lookup(labels.personnel, note.personnel_id),
				author: note.author,
				text: note.text,
				created_at: note.created_at,
				archived_at: note.archived_at
			}))
	},
	{
		name: 'Personnel Follow-ups',
		area: 'personnel',
		rows: (sections, labels) =>
			(sections.personnelFollowUps ?? []).map((followUp) => ({
				person: lookup(labels.personnel, followUp.personnel_id),
				title: followUp.title,
				notes: followUp.notes,
				due_date: followUp.due_date,
				status: followUp.status,
				created_at: followUp.created_at,
				completed_at: followUp.completed_at,
				archived_at: followUp.archived_at
			}))
	},
	{
		name: 'Personnel Documents',
		area: 'personnel',
		rows: (sections, labels) =>
			(sections.personnelDocuments ?? []).map((document) => ({
				person: lookup(labels.personnel, document.personnel_id),
				title: document.title,
				file_name:
					String(document.file_path ?? '')
						.split(/[\\/]/)
						.pop() ?? '',
				file_size_bytes: document.file_size_bytes,
				content_type: document.content_type,
				uploaded_by: document.uploaded_by,
				created_at: document.created_at,
				archived_at: document.archived_at
			}))
	},
	{ name: 'Special Days', area: 'calendar', rows: (sections) => sections.specialDays ?? [] },
	{ name: 'Onboarding Templates', area: 'onboarding', rows: (sections) => sections.onboardingTemplates ?? [] },
	{
		name: 'Onboarding Progress',
		area: 'onboarding',
		rows: (sections, labels) =>
			(sections.personnelOnboardings ?? []).map((onboarding) => ({
				person: lookup(labels.personnel, onboarding.personnel_id),
				status: onboarding.status,
				started_at: onboarding.started_at,
				completed_at: onboarding.completed_at,
				cancelled_at: onboarding.cancelled_at
			}))
	},
	{
		name: 'Rating Scheme',
		area: 'rating-scheme',
		rows: (sections, labels) =>
			(sections.ratingSchemeEntries ?? []).map((entry) => ({
				person: lookup(labels.personnel, entry.rated_person_id),
				eval_type: entry.eval_type,
				report_type: entry.report_type,
				rater: lookup(labels.personnel, entry.rater_person_id) || entry.rater_name,
				senior_rater: lookup(labels.personnel, entry.senior_rater_person_id) || entry.senior_rater_name,
				intermediate_rater:
					lookup(labels.personnel, entry.intermediate_rater_person_id) || entry.intermediate_rater_name,
				reviewer: lookup(labels.personnel, entry.reviewer_person_id) || entry.reviewer_name,
				rating_period_start: entry.rating_period_start,
				rating_period_end: entry.rating_period_end,
				status: entry.status,
				workflow_status: entry.workflow_status,
				notes: entry.notes
			}))
	},
	{ name: 'Critical Tasks', area: 'critical-tasks', rows: (sections) => sections.ictTasks ?? [] },
	{
		name: 'Critical Task Completions',
		area: 'critical-tasks',
		rows: (sections, labels) =>
			(sections.personnelIctCompletions ?? []).map((completion) => ({
				person: lookup(labels.personnel, completion.personnel_id),
				task: lookup(labels.criticalTasks, completion.ict_task_id),
				completed_at: completion.completed_at,
				validation_method: completion.validation_method,
				validated_by: completion.validated_by,
				notes: completion.notes
			}))
	},
	{ name: 'Duty Roster Templates', area: 'duty-rosters', rows: (sections) => sections.dutyRosterTemplates ?? [] },
	{
		name: 'Duty Roster Template Runs',
		area: 'duty-rosters',
		rows: (sections) => sections.dutyRosterTemplateRuns ?? []
	},
	{
		name: 'Duty Roster Template Run Corrections',
		area: 'duty-rosters',
		rows: (sections) => sections.dutyRosterTemplateRunCorrections ?? []
	}
];

export async function buildOrganizationDataExportWorkbook(
	input: OrganizationDataExportWorkbookInput
): Promise<OrganizationDataExportWorkbookResult> {
	const plan = buildOrganizationDataExportWorkbookPlan(input);
	const workbook = await createWorkbook();
	const sheetNames = new Set<string>();

	for (const sheet of [plan.inventorySheet, ...plan.readableSheets, ...plan.rawArchiveSheets]) {
		addTableSheet(workbook, {
			name: toWorksheetName(sheet.name, sheetNames),
			columns: sheet.columns,
			rows: sheet.rows
		});
	}

	const dateStr = input.payload.exportedAt.split('T')[0] || new Date().toISOString().split('T')[0];
	return {
		workbook,
		filename: `org-export-${input.payload.organizationId}-${dateStr}.xlsx`
	};
}

export function buildOrganizationDataExportWorkbookPlan(
	input: OrganizationDataExportWorkbookInput
): OrganizationDataExportWorkbookPlan {
	const selection = input.selection ?? { mode: 'all' };
	const rawSections = ORGANIZATION_EXPORT_SECTIONS.filter((section) =>
		selectionIncludesArea(selection, areaKeyForSection(section))
	);
	const labels = buildLabels(input.payload.sections);

	return {
		inventorySheet: {
			name: 'Export Inventory',
			columns: [
				{ header: 'Area', key: 'area', width: 22 },
				{ header: 'Section', key: 'title', width: 34 },
				{ header: 'Raw Table', key: 'table', width: 38 },
				{ header: 'JSON Key', key: 'key', width: 34 },
				{ header: 'Rows', key: 'rowCount', width: 10 }
			],
			rows: toWorkbookRows(
				rawSections.map((section) => ({
					...section,
					rowCount: input.payload.sections[section.key]?.length ?? 0
				}))
			)
		},
		readableSheets: READABLE_SHEETS.filter((sheet) => selectionIncludesArea(selection, sheet.area)).map((sheet) =>
			toSheetPlan(sheet.name, sheet.rows(input.payload.sections, labels))
		),
		rawArchiveSheets: rawSections.map((section) =>
			toSheetPlan(`Raw - ${section.title}`, input.payload.sections[section.key] ?? [])
		)
	};
}

function buildLabels(sections: OrganizationExportPayload['sections']): OrganizationDataExportLabels {
	const personnel = sections.personnel ?? [];
	const personnelExtendedInfo = sections.personnelExtendedInfo ?? [];

	return {
		personnel: buildPersonnelLabels(personnel),
		groups: buildLabelMap(sections.groups ?? [], 'name'),
		statusTypes: buildLabelMap(sections.statusTypes ?? [], 'name'),
		assignmentTypes: buildLabelMap(sections.assignmentTypes ?? [], 'name'),
		trainingTypes: buildLabelMap(sections.trainingTypes ?? [], 'name'),
		criticalTasks: buildLabelMap(sections.ictTasks ?? [], 'title'),
		extendedInfoByPerson: new Map(
			personnelExtendedInfo
				.filter((row) => typeof row.personnel_id === 'string')
				.map((row) => [row.personnel_id as string, row])
		)
	};
}

function toSheetPlan(name: string, rows: Record<string, unknown>[]): OrganizationDataExportSheetPlan {
	return {
		name,
		columns: buildColumns(rows),
		rows: rows.length > 0 ? toWorkbookRows(rows) : []
	};
}

function selectionIncludesArea(
	selection: OrganizationDataExportSelection,
	area: OrganizationDataExportAreaKey
): boolean {
	return selection.mode === 'all' || selection.areas.includes(area);
}

function areaKeyForSection(section: OrganizationExportSection): OrganizationDataExportAreaKey {
	switch (section.area) {
		case 'Settings':
			return 'settings';
		case 'Audit':
			return 'audit';
		case 'Feedback':
			return 'feedback';
		case 'Personnel':
			return 'personnel';
		case 'Calendar':
			return 'calendar';
		case 'Training':
			return 'training';
		case 'Critical Tasks':
			return 'critical-tasks';
		case 'Onboarding':
			return 'onboarding';
		case 'Evals':
			return 'rating-scheme';
		case 'Duty Rosters':
			return 'duty-rosters';
		default:
			throw new Error(`Unknown organization export area: ${section.area}`);
	}
}

function buildPersonnelLabels(rows: Record<string, unknown>[]): Map<string, string> {
	const labels = new Map<string, string>();
	for (const row of rows) {
		if (typeof row.id !== 'string') continue;
		const label = [row.rank, `${row.last_name ?? ''},`, row.first_name].filter(Boolean).join(' ').trim();
		labels.set(row.id, label || row.id);
	}
	return labels;
}

function buildLabelMap(rows: Record<string, unknown>[], labelKey: string): Map<string, string> {
	const labels = new Map<string, string>();
	for (const row of rows) {
		if (typeof row.id === 'string' && typeof row[labelKey] === 'string') {
			labels.set(row.id, row[labelKey]);
		}
	}
	return labels;
}

function lookup(labels: Map<string, string>, value: unknown): string {
	const key = typeof value === 'string' ? value : String(value ?? '');
	return labels.get(key) ?? key;
}

function buildColumns(rows: Record<string, unknown>[]): WorkbookColumn[] {
	const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
	if (keys.length === 0) return [{ header: 'No records', key: 'empty', width: 16 }];
	return keys.map((key) => ({
		header: toColumnHeader(key),
		key,
		width: Math.min(Math.max(key.length + 4, 12), 40)
	}));
}

function toColumnHeader(key: string): string {
	if (key === 'clinic_role') return 'Duty Role';
	if (key === 'deros') return 'PCS / DEROS';
	if (key === 'ets') return 'ETS';
	return key
		.replace(/_/g, ' ')
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

function toWorksheetName(name: string, sheetNames: Set<string>): string {
	const base = name.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Sheet';
	let candidate = base;
	let counter = 2;
	while (sheetNames.has(candidate)) {
		const suffix = ` ${counter}`;
		candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
		counter += 1;
	}
	sheetNames.add(candidate);
	return candidate;
}

function toWorkbookRows(rows: Record<string, unknown>[]): WorkbookRow[] {
	return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, toWorkbookCell(value)])));
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
