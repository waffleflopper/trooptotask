/** Training report page, detail, and workbook projection. */
import type { QueryPorts } from '$lib/server/core/ports';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type {
	TrainingType,
	TrainingReportInput,
	TrainingReportData,
	TrainingReportDetail,
	TrainingReportSort,
	TrainingReportPagination,
	TrainingReportTrainingType,
	TrainingReportWorkbookExport
} from '../contracts';
import type { PersonnelTrainingRosterPort } from '$features/personnel/contracts';
import type { TrainingCompletionReadContext } from './trainingCompletionPorts.server';
import { listTrainingCompletions } from './trainingCompletionRead.server';
import { listTrainingTypes } from './trainingCatalogRead.server';
import { listGroupCatalog, loadOrganizationRankCatalog } from '$features/personnel/index.server';
import type { Personnel } from '$lib/types';
import type { RankCatalogEntry } from '$features/personnel/contracts';
import { observedRankCodesForOptions } from '$features/personnel/contracts';
import { comparePersonnelByCatalogRankThenName } from '$features/personnel/contracts';
import {
	buildPivotTableFromMatrix,
	buildTrainingReportMatrix,
	computeReadinessDashboardFromMatrix,
	filterPersonnel,
	type PivotRow,
	type ReadinessDashboard
} from '../utils/reportCalculations';
import { buildTrainingReportWorkbook } from '../utils/trainingReportWorkbook';
import { writeWorkbookBuffer } from '$lib/export/workbook';
import { TRAINING_STATUS_SORT_ORDER } from '../utils/trainingStatus';
import { requireFeaturePolicy } from '$lib/access/index.server';

type TrainingReportReadContext = Pick<QueryPorts, 'auth' | 'store'> & {
	readonly audit?: TrainingCompletionReadContext['audit'];
	readonly personnelTrainingRoster?: Pick<PersonnelTrainingRosterPort, 'listActiveForReports'>;
};

const DEFAULT_REPORT_PAGE_SIZE = 25;
const MAX_REPORT_PAGE_SIZE = 100;

async function requireTrainingRecordView(ctx: TrainingReportReadContext): Promise<void> {
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

interface BuiltTrainingReportRows {
	personnel: Personnel[];
	pivotRows: PivotRow[];
	trainingTypes: TrainingType[];
	reportMatrix: ReturnType<typeof buildTrainingReportMatrix>;
	rankCatalog: RankCatalogEntry[];
	sort: TrainingReportSort;
}

async function buildTrainingReportRows(
	ctx: TrainingReportReadContext,
	input: TrainingReportInput = {}
): Promise<BuiltTrainingReportRows> {
	await requireTrainingRecordView(ctx);
	const orgId = ctx.auth.orgId;
	const filters = input.filters ?? {};
	const sort = normalizeSort(input.sort);
	if (!ctx.personnelTrainingRoster) throw new Error('Personnel Training roster provider unavailable');

	const [personnel, trainingTypes, trainings, rankCatalog] = await Promise.all([
		ctx.personnelTrainingRoster.listActiveForReports(ctx.auth),
		listTrainingTypes(ctx.store, orgId),
		listTrainingCompletions(ctx),
		loadOrganizationRankCatalog({ auth: ctx.auth, store: ctx.store }, { authorization: 'training-records' })
	]);

	const filteredPersonnel = filterPersonnel(personnel, filters);
	const selectedTypes = filters.trainingTypeIds?.length
		? trainingTypes.filter((type) => filters.trainingTypeIds?.includes(type.id))
		: trainingTypes;
	const reportMatrix = buildTrainingReportMatrix(filteredPersonnel, selectedTypes, trainings);

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
			cmp = comparePersonnelByCatalogRankThenName(a.person, b.person, rankCatalog.length > 0 ? rankCatalog : undefined);
		} else if (sort.column === 'group') {
			cmp = a.person.groupName.localeCompare(b.person.groupName);
		} else {
			const aCell = a.cells.get(sort.column);
			const bCell = b.cells.get(sort.column);
			cmp =
				(aCell ? (TRAINING_STATUS_SORT_ORDER[aCell.status] ?? 99) : 99) -
				(bCell ? (TRAINING_STATUS_SORT_ORDER[bCell.status] ?? 99) : 99);
		}
		return sort.direction === 'asc' ? cmp : -cmp;
	});

	return {
		personnel,
		pivotRows,
		trainingTypes: selectedTypes,
		reportMatrix,
		rankCatalog,
		sort
	};
}

async function buildTrainingReport(
	ctx: TrainingReportReadContext,
	input: TrainingReportInput = {}
): Promise<BuiltTrainingReport> {
	const [{ personnel, pivotRows, trainingTypes, reportMatrix, rankCatalog, sort }, groups] = await Promise.all([
		buildTrainingReportRows(ctx, input),
		listGroupCatalog(ctx)
	]);

	return {
		dashboard: computeReadinessDashboardFromMatrix(reportMatrix),
		pivotRows,
		trainingTypes,
		reportTrainingTypes: trainingTypes.map(toReportTrainingType),
		filterOptions: {
			groups,
			mos: uniqueSorted(personnel.map((person) => person.mos)),
			roles: uniqueSorted(personnel.map((person) => person.clinicRole)),
			ranks: observedRankCodesForOptions({
				rankCatalog: rankCatalog.length > 0 ? rankCatalog : undefined,
				observedRanks: personnel.map((person) => person.rank)
			})
		},
		sort
	};
}

function buildTrainingReportDetail(
	pivotRows: PivotRow[],
	trainingTypes: TrainingType[],
	sort: TrainingReportSort,
	paginationInput: TrainingReportInput['pagination']
): TrainingReportDetail {
	const pagination = normalizePagination(paginationInput);
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
		rows,
		totalRows,
		page,
		pageSize: pagination.pageSize,
		totalPages,
		sort
	};
}

export async function fetchTrainingReportPage(
	ctx: TrainingReportReadContext,
	input: TrainingReportInput = {}
): Promise<TrainingReportData> {
	const { dashboard, pivotRows, trainingTypes, reportTrainingTypes, filterOptions, sort } = await buildTrainingReport(
		ctx,
		input
	);

	return {
		dashboard,
		detail: buildTrainingReportDetail(pivotRows, trainingTypes, sort, input.pagination),
		trainingTypes: reportTrainingTypes,
		filterOptions
	};
}

export async function fetchTrainingReportDetailPage(
	ctx: TrainingReportReadContext,
	input: TrainingReportInput = {}
): Promise<TrainingReportDetail> {
	const { pivotRows, trainingTypes, sort } = await buildTrainingReportRows(ctx, input);
	return buildTrainingReportDetail(pivotRows, trainingTypes, sort, input.pagination);
}

export async function generateTrainingReportWorkbookExport(
	ctx: TrainingReportReadContext,
	input: TrainingReportInput = {}
): Promise<TrainingReportWorkbookExport> {
	const { pivotRows, trainingTypes } = await buildTrainingReport(ctx, input);
	const workbook = await buildTrainingReportWorkbook(pivotRows, trainingTypes);
	const date = new Date().toISOString().split('T')[0];
	return {
		buffer: await writeWorkbookBuffer(workbook),
		filename: `training-report-${date}.xlsx`
	};
}
