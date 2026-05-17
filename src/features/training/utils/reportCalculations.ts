import type { Personnel } from '$lib/types';
import type { TrainingType, PersonnelTraining, TrainingStatus } from '$features/training/training.types';
import { getTrainingStatus, type TrainingStatusInfo } from './trainingStatus';

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

function escapeCSV(value: string): string {
	if (value.includes(',') || value.includes('"') || value.includes('\n')) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

export function generatePivotCSV(rows: PivotRow[], types: TrainingType[]): string {
	const headers = ['Name', 'Rank', 'MOS', 'Duty Role', 'Group', ...types.map((t) => t.name)];
	const lines = [headers.map(escapeCSV).join(',')];

	for (const row of rows) {
		const personCols = [
			`${row.person.lastName}, ${row.person.firstName}`,
			row.person.rank,
			row.person.mos,
			row.person.clinicRole,
			row.person.groupName
		];
		const typeCols = types.map((type) => {
			const cell = row.cells.get(type.id);
			if (!cell) return '';
			const datePart = cell.date ? ` (${cell.date})` : '';
			return `${cell.label}${datePart}`;
		});
		lines.push([...personCols, ...typeCols].map(escapeCSV).join(','));
	}

	return lines.join('\n');
}
