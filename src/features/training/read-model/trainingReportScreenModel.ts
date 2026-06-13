import type { ColumnDef } from '$lib/components/ui/data-table';
import type { Group } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';
import type { TrainingReportData } from '$lib/server/core/useCases/trainingReportsQuery';
import type { PersonnelTraining, TrainingStatus, TrainingType } from '$features/training/training.types';
import { formatTrainingCellText } from '$features/training/utils/cellDisplayText';
import { TRAINING_STATUS_SORT_ORDER } from '$features/training/utils/trainingStatus';
import {
	buildPivotTableFromMatrix,
	buildTrainingReportMatrix,
	computeReadinessDashboardFromMatrix,
	filterPersonnel,
	type PivotCell,
	type PivotRow,
	type ReadinessDashboard,
	type ReportFilters,
	type TypeBreakdown
} from '$features/training/utils/reportCalculations';

export type TrainingReportDisplayType = Pick<TrainingType, 'id' | 'name'> & Partial<Pick<TrainingType, 'color'>>;
export type TrainingReportPivotRow = PivotRow;
export type TrainingReportColumn = ColumnDef<TrainingReportPivotRow>;

export interface TrainingReportFilterState {
	groupId: string;
	mos: string;
	role: string;
	rank: string;
	status: TrainingStatus | '';
	trainingTypeIds: string[];
}

export interface TrainingReportSortState {
	column: string;
	ascending: boolean;
}

export interface TrainingReportScreenModelInput {
	activeReport: TrainingReportData | null;
	serverReport: TrainingReportData | null;
	personnel: Personnel[];
	groups: Group[];
	trainingTypes: TrainingType[];
	localTrainingTypes: TrainingType[];
	trainings: PersonnelTraining[];
	filters: TrainingReportFilterState;
	sort: TrainingReportSortState;
}

export interface TrainingReportScreenModel {
	allPersonnel: Personnel[];
	allGroups: Group[];
	allTypes: TrainingReportDisplayType[];
	filteredLocalTrainingTypes: TrainingType[];
	typeFilterOptions: Array<{ value: string; label: string }>;
	dashboard: ReadinessDashboard;
	pivotRows: TrainingReportPivotRow[];
	sortedRows: TrainingReportPivotRow[];
	reportColumns: TrainingReportColumn[];
	rankFilterOptions: Array<{ value: string; label: string }>;
	mosFilterOptions: Array<{ value: string; label: string }>;
	roleFilterOptions: Array<{ value: string; label: string }>;
	statusFilterOptions: Array<{ value: TrainingStatus | ''; label: string }>;
	hasActiveFilters: boolean;
	personnelFilterCount: number;
	reportFilterCount: number;
	detailPersonnelCount: number;
	currentPage: number;
	totalPages: number;
	pageSize: number;
	typeBreakdown: TypeBreakdown[];
}

export interface TrainingReportUrlInput {
	orgId: string;
	filters: TrainingReportFilterState;
	sort: TrainingReportSortState;
}

export interface TrainingReportPageUrlInput extends TrainingReportUrlInput {
	page: number;
	pageSize: number;
}

const STATUS_OPTIONS: Array<{ value: TrainingStatus; label: string }> = [
	{ value: 'current', label: 'Current' },
	{ value: 'warning-yellow', label: 'Expiring 60d' },
	{ value: 'warning-orange', label: 'Expiring 30d' },
	{ value: 'expired', label: 'Expired' },
	{ value: 'not-completed', label: 'Not Done' }
];

export function createEmptyTrainingReportFilters(): TrainingReportFilterState {
	return {
		groupId: '',
		mos: '',
		role: '',
		rank: '',
		status: '',
		trainingTypeIds: []
	};
}

export function buildTrainingReportScreenModel(input: TrainingReportScreenModelInput): TrainingReportScreenModel {
	const { activeReport, serverReport, personnel, groups, trainingTypes, localTrainingTypes, trainings, filters, sort } =
		input;

	const allGroups = activeReport?.filterOptions.groups ?? groups;
	const allTypes: TrainingReportDisplayType[] = activeReport?.trainingTypes ?? trainingTypes;
	const availableTypeFilters: TrainingReportDisplayType[] = serverReport?.trainingTypes ?? allTypes;
	const availableMos = activeReport?.filterOptions.mos ?? uniqueSorted(personnel.map((person) => person.mos));
	const availableRoles =
		activeReport?.filterOptions.roles ?? uniqueSorted(personnel.map((person) => person.clinicRole));
	const availableRanks = activeReport?.filterOptions.ranks ?? uniqueSorted(personnel.map((person) => person.rank));
	const personnelFilters = toPersonnelFilters(filters);
	const filteredPersonnel = filterPersonnel(personnel, personnelFilters);
	const filteredTypes =
		filters.trainingTypeIds.length > 0
			? allTypes.filter((type) => filters.trainingTypeIds.includes(type.id))
			: allTypes;
	const filteredLocalTrainingTypes =
		filters.trainingTypeIds.length > 0
			? localTrainingTypes.filter((type) => filters.trainingTypeIds.includes(type.id))
			: localTrainingTypes;
	const typeFilterOptions = availableTypeFilters.map((type) => ({ value: type.id, label: type.name }));
	let dashboard: ReadinessDashboard;
	let pivotRows: TrainingReportPivotRow[];
	if (activeReport) {
		dashboard = activeReport.dashboard;
		pivotRows = buildTrainingReportPivotRows({ activeReport, status: filters.status });
	} else {
		const localMatrix = buildTrainingReportMatrix(filteredPersonnel, filteredLocalTrainingTypes, trainings);
		dashboard = computeReadinessDashboardFromMatrix(localMatrix);
		pivotRows = buildTrainingReportPivotRows({ activeReport: null, status: filters.status, matrix: localMatrix });
	}
	const sortedRows = activeReport ? pivotRows : sortTrainingReportRows(pivotRows, sort);
	const reportColumns = buildTrainingReportColumns(filteredTypes);
	const hasActiveFilters =
		!!filters.groupId ||
		!!filters.mos ||
		!!filters.role ||
		!!filters.rank ||
		!!filters.status ||
		filters.trainingTypeIds.length > 0;
	const personnelFilterCount = (filters.mos ? 1 : 0) + (filters.role ? 1 : 0) + (filters.rank ? 1 : 0);
	const reportFilterCount =
		(filters.groupId ? 1 : 0) + (filters.status ? 1 : 0) + (filters.trainingTypeIds.length > 0 ? 1 : 0);

	return {
		allPersonnel: personnel,
		allGroups,
		allTypes,
		filteredLocalTrainingTypes,
		typeFilterOptions,
		dashboard,
		pivotRows,
		sortedRows,
		reportColumns,
		rankFilterOptions: toFilterOptions('All Ranks', availableRanks),
		mosFilterOptions: toFilterOptions('All MOS', availableMos),
		roleFilterOptions: toFilterOptions('All Duty Roles', availableRoles),
		statusFilterOptions: [{ value: '', label: 'All Statuses' }, ...STATUS_OPTIONS],
		hasActiveFilters,
		personnelFilterCount,
		reportFilterCount,
		detailPersonnelCount: activeReport?.detail.totalRows ?? filteredPersonnel.length,
		currentPage: activeReport?.detail.page ?? 1,
		totalPages: activeReport?.detail.totalPages ?? 1,
		pageSize: activeReport?.detail.pageSize ?? 25,
		typeBreakdown: dashboard.typeBreakdown ?? []
	};
}

export function buildTrainingReportQueryString(input: {
	filters: TrainingReportFilterState;
	sort: TrainingReportSortState;
}): string {
	const params = new URLSearchParams();
	appendIfPresent(params, 'groupId', input.filters.groupId);
	appendIfPresent(params, 'mos', input.filters.mos);
	appendIfPresent(params, 'role', input.filters.role);
	appendIfPresent(params, 'rank', input.filters.rank);
	appendIfPresent(params, 'status', input.filters.status);
	for (const typeId of input.filters.trainingTypeIds) {
		params.append('trainingTypeId', typeId);
	}
	params.set('sortColumn', input.sort.column);
	params.set('sortDirection', input.sort.ascending ? 'asc' : 'desc');
	return params.toString();
}

export function buildTrainingReportUrl(input: TrainingReportPageUrlInput): string {
	const params = new URLSearchParams(buildTrainingReportQueryString(input));
	params.set('page', String(input.page));
	params.set('pageSize', String(input.pageSize));
	return `/org/${encodeURIComponent(input.orgId)}/api/training-reports?${params.toString()}`;
}

export function buildTrainingReportDetailUrl(input: TrainingReportPageUrlInput): string {
	const params = new URLSearchParams(buildTrainingReportQueryString(input));
	params.set('page', String(input.page));
	params.set('pageSize', String(input.pageSize));
	return `/org/${encodeURIComponent(input.orgId)}/api/training-reports/detail?${params.toString()}`;
}

export function buildTrainingReportExportUrl(input: TrainingReportUrlInput): string {
	return `/org/${encodeURIComponent(input.orgId)}/api/training-reports/export?${buildTrainingReportQueryString(input)}`;
}

export function formatTrainingReportCell(cell: PivotCell): string {
	return formatTrainingCellText(cell.status, cell.label, cell.date);
}

export function getTrainingReportRowsForType(
	rows: TrainingReportPivotRow[],
	typeId: string,
	status: 'expired' | 'expiring'
): TrainingReportPivotRow[] {
	return rows.filter((row) => {
		const cell = row.cells.get(typeId);
		if (!cell) return false;
		if (status === 'expired') return cell.status === 'expired' || cell.status === 'not-completed';
		return cell.status === 'warning-yellow' || cell.status === 'warning-orange';
	});
}

function toPersonnelFilters(filters: TrainingReportFilterState): ReportFilters {
	return {
		groupId: filters.groupId || undefined,
		mos: filters.mos || undefined,
		role: filters.role || undefined,
		rank: filters.rank || undefined
	};
}

function buildTrainingReportPivotRows(
	input:
		| {
				activeReport: TrainingReportData;
				status: TrainingStatus | '';
		  }
		| {
				activeReport: null;
				status: TrainingStatus | '';
				matrix: ReturnType<typeof buildTrainingReportMatrix>;
		  }
): TrainingReportPivotRow[] {
	if (input.activeReport) {
		return input.activeReport.detail.rows.map((row) => ({
			person: row.person,
			cells: new Map<string, PivotCell>(
				row.cells.map((cell) => [
					cell.trainingTypeId,
					{
						status: cell.status,
						label: cell.label,
						date: cell.date
					}
				])
			)
		}));
	}

	const rows = buildPivotTableFromMatrix(input.matrix);
	if (!input.status) return rows;
	return rows.filter((row) => {
		for (const cell of row.cells.values()) {
			if (cell.status === input.status) return true;
		}
		return false;
	});
}

function sortTrainingReportRows(
	rows: TrainingReportPivotRow[],
	sort: TrainingReportSortState
): TrainingReportPivotRow[] {
	const sortedRows = [...rows];
	sortedRows.sort((a, b) => {
		let cmp = 0;
		if (sort.column === 'name') {
			cmp = a.person.lastName.localeCompare(b.person.lastName) || a.person.firstName.localeCompare(b.person.firstName);
		} else if (sort.column === 'rank') {
			cmp = a.person.rank.localeCompare(b.person.rank);
		} else if (sort.column === 'group') {
			cmp = a.person.groupName.localeCompare(b.person.groupName);
		} else {
			const aCell = a.cells.get(sort.column);
			const bCell = b.cells.get(sort.column);
			const aOrder = aCell ? (TRAINING_STATUS_SORT_ORDER[aCell.status] ?? 99) : 99;
			const bOrder = bCell ? (TRAINING_STATUS_SORT_ORDER[bCell.status] ?? 99) : 99;
			cmp = aOrder - bOrder;
		}
		return sort.ascending ? cmp : -cmp;
	});
	return sortedRows;
}

function buildTrainingReportColumns(types: TrainingReportDisplayType[]): TrainingReportColumn[] {
	return [
		{
			key: 'name',
			header: 'Name',
			value: (row) => `${row.person.lastName}, ${row.person.firstName}`,
			compare: (a, b) => a.person.lastName.localeCompare(b.person.lastName)
		},
		{ key: 'rank', header: 'Rank', value: (row) => row.person.rank },
		{ key: 'group', header: 'Group', value: (row) => row.person.groupName },
		...types.map((type) => ({
			key: type.id,
			header: type.name,
			value: (row: TrainingReportPivotRow) => {
				const cell = row.cells.get(type.id);
				return cell ? formatTrainingReportCell(cell) : '';
			},
			sortable: false
		}))
	];
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
	return [...new Set(values.filter((value): value is string => !!value))].sort((a, b) => a.localeCompare(b));
}

function toFilterOptions(emptyLabel: string, values: string[]): Array<{ value: string; label: string }> {
	return [{ value: '', label: emptyLabel }, ...values.map((value) => ({ value, label: value }))];
}

function appendIfPresent(params: URLSearchParams, key: string, value: string): void {
	if (value) params.append(key, value);
}
