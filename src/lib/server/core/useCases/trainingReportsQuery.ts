/**
 * Training reports query — fetches all personnel training records for report generation.
 *
 * Returns the raw `PersonnelTraining` rows without aggregation. The training reports feature
 * uses these to compute per-type and per-personnel completion metrics client-side.
 *
 * Unlike `trainingSummaryQuery.ts` (which pre-aggregates), this gives the full dataset so
 * the reports UI can filter and group dynamically.
 */
import type { QueryPorts } from '$lib/server/core/ports';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { PersonnelTraining, TrainingStatus, TrainingType } from '$features/training/training.types';
import { PersonnelTrainingEntity } from '$lib/server/entities/personnelTraining';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import { TrainingTypeEntity } from '$lib/server/entities/trainingType';
import { GroupEntity } from '$lib/server/entities/group';
import type { Personnel } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import {
	buildPivotTableFromMatrix,
	buildTrainingReportMatrix,
	computeReadinessDashboardFromMatrix,
	filterPersonnel,
	generatePivotCSV,
	type PivotCell,
	type PivotRow,
	type ReadinessDashboard,
	type ReportFilters
} from '$features/training/utils/reportCalculations';
import { requireFeaturePolicy } from './featurePolicy';

export interface TrainingReportsData {
	trainings: PersonnelTraining[];
}

export interface TrainingReportSort {
	column: 'name' | 'rank' | 'group' | string;
	direction: 'asc' | 'desc';
}

export interface TrainingReportPagination {
	page: number;
	pageSize: number;
}

export interface TrainingReportInput {
	filters?: ReportFilters;
	sort?: TrainingReportSort;
	pagination?: TrainingReportPagination;
}

export interface TrainingReportCell {
	trainingTypeId: string;
	status: TrainingStatus;
	label: string;
	date: string | null;
}

export interface TrainingReportRow {
	person: Personnel;
	cells: TrainingReportCell[];
}

export interface TrainingReportTrainingType {
	id: string;
	name: string;
	color: string;
}

export interface TrainingReportDetail {
	rows: TrainingReportRow[];
	totalRows: number;
	page: number;
	pageSize: number;
	totalPages: number;
	sort: TrainingReportSort;
}

export interface TrainingReportData {
	dashboard: ReadinessDashboard;
	detail: TrainingReportDetail;
	trainingTypes: TrainingReportTrainingType[];
	filterOptions: {
		groups: Group[];
		mos: string[];
		roles: string[];
		ranks: string[];
	};
}

const DEFAULT_REPORT_PAGE_SIZE = 25;
const MAX_REPORT_PAGE_SIZE = 100;

const statusOrder: Record<TrainingStatus, number> = {
	expired: 0,
	'warning-orange': 1,
	'warning-yellow': 2,
	'not-completed': 3,
	current: 4,
	'not-required': 5,
	exempt: 6
};

export async function fetchTrainingReportsData(ctx: QueryPorts): Promise<TrainingReportsData> {
	await requireTrainingRecordView(ctx);
	const rows = await ctx.store.findMany<Record<string, unknown>>('personnel_trainings', ctx.auth.orgId);
	const trainings = PersonnelTrainingEntity.fromDbArray(rows);
	return { trainings };
}

async function requireTrainingRecordView(ctx: QueryPorts): Promise<void> {
	await requireFeaturePolicy(ctx, POLICY_ACTION_CATALOG.training.viewRecords, { kind: 'unscoped' }, 'training_record');
}

function normalizePagination(pagination: TrainingReportInput['pagination']): TrainingReportPagination {
	const page = Math.max(1, Math.floor(pagination?.page ?? 1));
	const requestedPageSize = Math.floor(pagination?.pageSize ?? DEFAULT_REPORT_PAGE_SIZE);
	const pageSize = Math.min(MAX_REPORT_PAGE_SIZE, Math.max(1, requestedPageSize));
	return { page, pageSize };
}

function normalizeSort(sort: TrainingReportInput['sort']): TrainingReportSort {
	return {
		column: sort?.column ?? 'name',
		direction: sort?.direction === 'desc' ? 'desc' : 'asc'
	};
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
	return [...new Set(values.filter((value): value is string => !!value))].sort((a, b) => a.localeCompare(b));
}

function cellForSort(cells: Map<string, PivotCell>, trainingTypeId: string): PivotCell | undefined {
	return cells.get(trainingTypeId);
}

function toReportTrainingType(type: TrainingType): TrainingReportTrainingType {
	return {
		id: type.id,
		name: type.name,
		color: type.color
	};
}

interface BuiltTrainingReport {
	dashboard: ReadinessDashboard;
	pivotRows: PivotRow[];
	trainingTypes: TrainingType[];
	reportTrainingTypes: TrainingReportTrainingType[];
	filterOptions: TrainingReportData['filterOptions'];
	sort: TrainingReportSort;
}

async function buildTrainingReport(ctx: QueryPorts, input: TrainingReportInput = {}): Promise<BuiltTrainingReport> {
	await requireTrainingRecordView(ctx);
	const orgId = ctx.auth.orgId;
	const filters = input.filters ?? {};
	const sort = normalizeSort(input.sort);

	const [personnelRows, groupRows, typeRows, trainingRows] = await Promise.all([
		ctx.store.findMany<Record<string, unknown>>('personnel', orgId, undefined, {
			select: PersonnelEntity.select,
			isNull: { archived_at: true },
			orderBy: [{ column: 'last_name', ascending: true }]
		}),
		ctx.store.findMany<Record<string, unknown>>('groups', orgId, undefined, {
			orderBy: [{ column: 'sort_order', ascending: true }]
		}),
		ctx.store.findMany<Record<string, unknown>>('training_types', orgId, undefined, {
			orderBy: [{ column: 'sort_order', ascending: true }]
		}),
		ctx.store.findMany<Record<string, unknown>>('personnel_trainings', orgId)
	]);

	const personnel = PersonnelEntity.fromDbArray(personnelRows);
	const groups = GroupEntity.fromDbArray(groupRows);
	const trainingTypes = TrainingTypeEntity.fromDbArray(typeRows);
	const trainings = PersonnelTrainingEntity.fromDbArray(trainingRows);

	const filteredPersonnel = filterPersonnel(personnel, filters);
	const selectedTypes = filters.trainingTypeIds?.length
		? trainingTypes.filter((type) => filters.trainingTypeIds?.includes(type.id))
		: trainingTypes;
	const reportMatrix = buildTrainingReportMatrix(filteredPersonnel, selectedTypes, trainings);
	const dashboard = computeReadinessDashboardFromMatrix(reportMatrix);

	let pivotRows = buildPivotTableFromMatrix(reportMatrix);
	if (filters.status) {
		pivotRows = pivotRows.filter((row) => {
			for (const cell of row.cells.values()) {
				if (cell.status === filters.status) return true;
			}
			return false;
		});
	}

	pivotRows.sort((a, b) => {
		let cmp = 0;
		if (sort.column === 'name') {
			cmp = a.person.lastName.localeCompare(b.person.lastName) || a.person.firstName.localeCompare(b.person.firstName);
		} else if (sort.column === 'rank') {
			cmp = a.person.rank.localeCompare(b.person.rank);
		} else if (sort.column === 'group') {
			cmp = a.person.groupName.localeCompare(b.person.groupName);
		} else {
			const aCell = cellForSort(a.cells, sort.column);
			const bCell = cellForSort(b.cells, sort.column);
			cmp = (aCell ? (statusOrder[aCell.status] ?? 99) : 99) - (bCell ? (statusOrder[bCell.status] ?? 99) : 99);
		}
		return sort.direction === 'asc' ? cmp : -cmp;
	});

	return {
		dashboard,
		pivotRows,
		trainingTypes: selectedTypes,
		reportTrainingTypes: selectedTypes.map(toReportTrainingType),
		filterOptions: {
			groups,
			mos: uniqueSorted(personnel.map((person) => person.mos)),
			roles: uniqueSorted(personnel.map((person) => person.clinicRole)),
			ranks: uniqueSorted(personnel.map((person) => person.rank))
		},
		sort
	};
}

export async function fetchTrainingReportPage(
	ctx: QueryPorts,
	input: TrainingReportInput = {}
): Promise<TrainingReportData> {
	const { dashboard, pivotRows, trainingTypes, reportTrainingTypes, filterOptions, sort } = await buildTrainingReport(
		ctx,
		input
	);
	const pagination = normalizePagination(input.pagination);
	const totalRows = pivotRows.length;
	const totalPages = Math.max(1, Math.ceil(totalRows / pagination.pageSize));
	const page = Math.min(pagination.page, totalPages);
	const start = (page - 1) * pagination.pageSize;
	const rows = pivotRows.slice(start, start + pagination.pageSize).map((row) => ({
		person: row.person,
		cells: trainingTypes.map((type) => {
			const cell = row.cells.get(type.id);
			return {
				trainingTypeId: type.id,
				status: cell?.status ?? 'not-completed',
				label: cell?.label ?? 'Not Done',
				date: cell?.date ?? null
			};
		})
	}));

	return {
		dashboard,
		detail: {
			rows,
			totalRows,
			page,
			pageSize: pagination.pageSize,
			totalPages,
			sort
		},
		trainingTypes: reportTrainingTypes,
		filterOptions
	};
}

export async function generateTrainingReportCsv(ctx: QueryPorts, input: TrainingReportInput = {}): Promise<string> {
	const { pivotRows, trainingTypes } = await buildTrainingReport(ctx, input);
	return generatePivotCSV(pivotRows, trainingTypes);
}
