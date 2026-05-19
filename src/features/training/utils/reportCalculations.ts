import type { Personnel } from '$lib/types';
import type { TrainingType, PersonnelTraining, TrainingStatus } from '$features/training/training.types';
import { getTrainingStatus, type TrainingStatusInfo } from './trainingStatus';
import { addTableSheet, createWorkbook, downloadWorkbook, type Workbook, type WorkbookRow } from '$lib/export/workbook';

export interface ReportFilters {
	groupId?: string;
	mos?: string;
	role?: string;
	rank?: string;
	trainingTypeIds?: string[];
	status?: TrainingStatus;
}

export interface TypeBreakdown {
	typeId: string;
	typeName: string;
	complianceRate: number;
	current: number;
	warningYellow: number;
	warningOrange: number;
	expired: number;
	notCompleted: number;
	applicable: number;
}

export interface ReadinessDashboard {
	readinessPercent: number;
	statusCounts: {
		current: number;
		warningYellow: number;
		warningOrange: number;
		expired: number;
		notCompleted: number;
	};
	worstTypes: Array<{ typeId: string; typeName: string; nonComplianceRate: number }>;
	groupComparison: Array<{ groupId: string; groupName: string; readinessPercent: number }>;
	typeBreakdown: TypeBreakdown[];
}

export interface PivotCell {
	status: TrainingStatus;
	label: string;
	date: string | null;
}

export interface PivotRow {
	person: Personnel;
	cells: Map<string, PivotCell>;
}

export interface TrainingReportMatrixCell extends PivotCell {
	trainingTypeId: string;
	isOptional: boolean;
}

export interface TrainingReportMatrixRow {
	person: Personnel;
	cells: Map<string, TrainingReportMatrixCell>;
}

export interface TrainingReportMatrix {
	rows: TrainingReportMatrixRow[];
	trainingTypes: TrainingType[];
}

interface BuildTrainingReportMatrixOptions {
	getStatus?: (training: PersonnelTraining | undefined, type: TrainingType, person: Personnel) => TrainingStatusInfo;
}

function buildTrainingMap(trainings: PersonnelTraining[]): Map<string, PersonnelTraining> {
	const map = new Map<string, PersonnelTraining>();
	for (const t of trainings) {
		map.set(`${t.personnelId}-${t.trainingTypeId}`, t);
	}
	return map;
}

function computeReadinessFromStatuses(statuses: TrainingStatusInfo[]): number {
	let current = 0;
	let applicable = 0;
	for (const s of statuses) {
		if (s.status === 'not-required' || s.status === 'exempt') continue;
		applicable++;
		if (s.status === 'current') current++;
	}
	return applicable === 0 ? 0 : Math.round((current / applicable) * 100);
}

export function filterPersonnel(personnel: Personnel[], filters: ReportFilters): Personnel[] {
	return personnel.filter((p) => {
		if (filters.groupId && p.groupId !== filters.groupId) return false;
		if (filters.mos && p.mos !== filters.mos) return false;
		if (filters.role && p.clinicRole !== filters.role) return false;
		if (filters.rank && p.rank !== filters.rank) return false;
		return true;
	});
}

export function buildTrainingReportMatrix(
	personnel: Personnel[],
	types: TrainingType[],
	trainings: PersonnelTraining[],
	options: BuildTrainingReportMatrixOptions = {}
): TrainingReportMatrix {
	const trainingMap = buildTrainingMap(trainings);
	const getStatus = options.getStatus ?? getTrainingStatus;

	return {
		trainingTypes: types,
		rows: personnel.map((person) => {
			const cells = new Map<string, TrainingReportMatrixCell>();
			for (const type of types) {
				const training = trainingMap.get(`${person.id}-${type.id}`);
				const statusInfo = getStatus(training, type, person);
				cells.set(type.id, {
					trainingTypeId: type.id,
					isOptional: type.isOptional,
					status: statusInfo.status,
					label: statusInfo.label,
					date: training?.expirationDate ?? training?.completionDate ?? null
				});
			}
			return { person, cells };
		})
	};
}

export function computeReadinessDashboardFromMatrix(matrix: TrainingReportMatrix): ReadinessDashboard {
	const requiredTypes = matrix.trainingTypes.filter((type) => !type.isOptional);

	const statusCounts = {
		current: 0,
		warningYellow: 0,
		warningOrange: 0,
		expired: 0,
		notCompleted: 0
	};

	const allStatuses: TrainingStatusInfo[] = [];
	for (const row of matrix.rows) {
		for (const cell of row.cells.values()) {
			if (cell.isOptional) continue;
			const statusInfo = cellToStatusInfo(cell);
			allStatuses.push(statusInfo);

			switch (statusInfo.status) {
				case 'current':
					statusCounts.current++;
					break;
				case 'warning-yellow':
					statusCounts.warningYellow++;
					break;
				case 'warning-orange':
					statusCounts.warningOrange++;
					break;
				case 'expired':
					statusCounts.expired++;
					break;
				case 'not-completed':
					statusCounts.notCompleted++;
					break;
			}
		}
	}

	const readinessPercent = computeReadinessFromStatuses(allStatuses);

	// Per-type breakdown and worst types (reuse cached statuses)
	const typeBreakdown: TypeBreakdown[] = [];
	const typeStats: Array<{ typeId: string; typeName: string; nonComplianceRate: number }> = [];
	for (const type of requiredTypes) {
		let applicable = 0;
		let nonCompliant = 0;
		let current = 0;
		let warningYellow = 0;
		let warningOrange = 0;
		let expired = 0;
		let notCompleted = 0;
		for (const row of matrix.rows) {
			const cell = row.cells.get(type.id);
			if (!cell) continue;
			const statusInfo = cellToStatusInfo(cell);
			if (statusInfo.status === 'not-required' || statusInfo.status === 'exempt') continue;
			applicable++;
			switch (statusInfo.status) {
				case 'current':
					current++;
					break;
				case 'warning-yellow':
					warningYellow++;
					nonCompliant++;
					break;
				case 'warning-orange':
					warningOrange++;
					nonCompliant++;
					break;
				case 'expired':
					expired++;
					nonCompliant++;
					break;
				case 'not-completed':
					notCompleted++;
					nonCompliant++;
					break;
			}
		}
		const nonComplianceRate = applicable === 0 ? 0 : Math.round((nonCompliant / applicable) * 100);
		const complianceRate = applicable === 0 ? 0 : Math.round((current / applicable) * 100);
		typeStats.push({ typeId: type.id, typeName: type.name, nonComplianceRate });
		typeBreakdown.push({
			typeId: type.id,
			typeName: type.name,
			complianceRate,
			current,
			warningYellow,
			warningOrange,
			expired,
			notCompleted,
			applicable
		});
	}

	typeStats.sort((a, b) => b.nonComplianceRate - a.nonComplianceRate);
	const worstTypes = typeStats.filter((t) => t.nonComplianceRate > 0).slice(0, 5);

	// Group comparison (reuse cached statuses)
	const groupMap = new Map<string, { groupName: string; statuses: TrainingStatusInfo[] }>();
	for (const row of matrix.rows) {
		const person = row.person;
		const gid = person.groupId ?? 'unassigned';
		const gname = person.groupName || 'Unassigned';
		if (!groupMap.has(gid)) {
			groupMap.set(gid, { groupName: gname, statuses: [] });
		}
		const group = groupMap.get(gid)!;
		for (const type of requiredTypes) {
			const cell = row.cells.get(type.id);
			if (cell) group.statuses.push(cellToStatusInfo(cell));
		}
	}

	const groupComparison = Array.from(groupMap.entries()).map(([groupId, { groupName, statuses }]) => ({
		groupId,
		groupName,
		readinessPercent: computeReadinessFromStatuses(statuses)
	}));

	return { readinessPercent, statusCounts, worstTypes, groupComparison, typeBreakdown };
}

export function computeReadinessDashboard(
	personnel: Personnel[],
	types: TrainingType[],
	trainings: PersonnelTraining[]
): ReadinessDashboard {
	return computeReadinessDashboardFromMatrix(buildTrainingReportMatrix(personnel, types, trainings));
}

export function buildPivotTableFromMatrix(matrix: TrainingReportMatrix): PivotRow[] {
	return matrix.rows.map((row) => {
		const cells = new Map<string, PivotCell>();
		for (const [typeId, cell] of row.cells) {
			cells.set(typeId, {
				status: cell.status,
				label: cell.label,
				date: cell.date
			});
		}
		return { person: row.person, cells };
	});
}

export function buildPivotTable(
	personnel: Personnel[],
	types: TrainingType[],
	trainings: PersonnelTraining[]
): PivotRow[] {
	return buildPivotTableFromMatrix(buildTrainingReportMatrix(personnel, types, trainings));
}

function cellToStatusInfo(cell: TrainingReportMatrixCell): TrainingStatusInfo {
	return {
		status: cell.status,
		color: '',
		label: cell.label,
		daysUntilExpiration: null
	};
}

function trainingReportWorkbookColumns(types: TrainingType[]) {
	return [
		{ header: 'Name', key: 'name', width: 24 },
		{ header: 'Rank', key: 'rank', width: 12 },
		{ header: 'MOS', key: 'mos', width: 12 },
		{ header: 'Duty Role', key: 'dutyRole', width: 20 },
		{ header: 'Group', key: 'group', width: 18 },
		...types.map((type) => ({ header: type.name, key: `training_${type.id}`, width: 20 }))
	];
}

function trainingReportWorkbookRows(rows: PivotRow[], types: TrainingType[]): WorkbookRow[] {
	return rows.map((row) => {
		const workbookRow: WorkbookRow = {
			name: `${row.person.lastName}, ${row.person.firstName}`,
			rank: row.person.rank,
			mos: row.person.mos,
			dutyRole: row.person.clinicRole,
			group: row.person.groupName
		};

		for (const type of types) {
			const cell = row.cells.get(type.id);
			const datePart = cell?.date ? ` (${cell.date})` : '';
			workbookRow[`training_${type.id}`] = cell ? `${cell.label}${datePart}` : '';
		}

		return workbookRow;
	});
}

export async function buildTrainingReportWorkbook(rows: PivotRow[], types: TrainingType[]): Promise<Workbook> {
	const workbook = await createWorkbook();
	addTableSheet(workbook, {
		name: 'Training Report',
		columns: trainingReportWorkbookColumns(types),
		rows: trainingReportWorkbookRows(rows, types)
	});
	return workbook;
}

export async function exportTrainingReportWorkbook(
	rows: PivotRow[],
	types: TrainingType[],
	filename = 'training-report.xlsx'
): Promise<void> {
	await downloadWorkbook(await buildTrainingReportWorkbook(rows, types), filename);
}
