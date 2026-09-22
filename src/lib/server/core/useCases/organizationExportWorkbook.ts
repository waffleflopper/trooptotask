import {
	addTableSheet,
	createWorkbook,
	type Workbook,
	type WorkbookColumn,
	type WorkbookRow
} from '$lib/export/workbook';
import {
	ORGANIZATION_DATA_EXPORT_READABLE_SHEETS,
	ORGANIZATION_DATA_EXPORT_SECTIONS,
	type OrganizationDataExportLabels
} from './organizationDataExportManifest';
import { type OrganizationExportPayload } from './organizationExport';

export interface OrganizationDataExportWorkbookInput {
	payload: OrganizationExportPayload;
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
	const rawSections = ORGANIZATION_DATA_EXPORT_SECTIONS;
	const readableSheets = ORGANIZATION_DATA_EXPORT_READABLE_SHEETS;
	const labels = buildLabels(input.payload.sections);

	return {
		inventorySheet: {
			name: 'Export Inventory',
			columns: [
				{ header: 'Area', key: 'area', width: 22 },
				{ header: 'Area Key', key: 'areaKey', width: 18 },
				{ header: 'Section', key: 'title', width: 34 },
				{ header: 'Raw Table', key: 'table', width: 38 },
				{ header: 'JSON Key', key: 'key', width: 34 },
				{ header: 'Rows', key: 'rowCount', width: 10 }
			],
			rows: toWorkbookRows(
				rawSections.map((section) => ({
					key: section.key,
					title: section.title,
					table: section.table,
					area: section.areaLabel,
					areaKey: section.areaKey,
					rowCount: input.payload.sections[section.key]?.length ?? 0
				}))
			)
		},
		readableSheets: readableSheets.map((sheet) => toSheetPlan(sheet.name, sheet.rows(input.payload.sections, labels))),
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
		assignmentTargets: new Map(
			(sections.assignmentTypes ?? [])
				.filter((row) => typeof row.id === 'string' && typeof row.assign_to === 'string')
				.map((row) => [row.id as string, row.assign_to as string])
		),
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

function buildPersonnelLabels(rows: Record<string, unknown>[]): Map<string, string> {
	const labels = new Map<string, string>();
	for (const row of rows) {
		if (typeof row.id !== 'string') continue;
		const label = [row.rank, row.last_name ? `${row.last_name},` : null, row.first_name]
			.filter(Boolean)
			.join(' ')
			.trim();
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
	return JSON.stringify(value);
}
