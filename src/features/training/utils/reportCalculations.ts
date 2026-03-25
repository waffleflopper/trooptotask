import type { Personnel } from '$lib/types';
import type { TrainingType, PersonnelTraining, TrainingStatus } from '$features/training/training.types';
import { getTrainingStatus, type TrainingStatusInfo } from './trainingStatus';

export interface ReportFilters {
	groupId?: string;
	mos?: string;
	role?: string;
	rank?: string;
	clinicRole?: string;
	trainingTypeIds?: string[];
	status?: TrainingStatus;
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
		if (filters.clinicRole && p.clinicRole !== filters.clinicRole) return false;
		if (filters.rank && p.rank !== filters.rank) return false;
		return true;
	});
}

export function computeReadinessDashboard(
	personnel: Personnel[],
	types: TrainingType[],
	trainings: PersonnelTraining[]
): ReadinessDashboard {
	const trainingMap = buildTrainingMap(trainings);

	// Exclude optional types from all readiness calculations
	const requiredTypes = types.filter((type) => !type.isOptional);

	const statusCounts = {
		current: 0,
		warningYellow: 0,
		warningOrange: 0,
		expired: 0,
		notCompleted: 0
	};

	const allStatuses: TrainingStatusInfo[] = [];

	for (const person of personnel) {
		for (const type of requiredTypes) {
			const training = trainingMap.get(`${person.id}-${type.id}`);
			const statusInfo = getTrainingStatus(training, type, person);
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

	// Worst types by non-compliance rate
	const typeStats = requiredTypes.map((type) => {
		let applicable = 0;
		let nonCompliant = 0;
		for (const person of personnel) {
			const training = trainingMap.get(`${person.id}-${type.id}`);
			const statusInfo = getTrainingStatus(training, type, person);
			if (statusInfo.status === 'not-required' || statusInfo.status === 'exempt') continue;
			applicable++;
			if (statusInfo.status !== 'current') nonCompliant++;
		}
		const nonComplianceRate = applicable === 0 ? 0 : Math.round((nonCompliant / applicable) * 100);
		return { typeId: type.id, typeName: type.name, nonComplianceRate };
	});

	typeStats.sort((a, b) => b.nonComplianceRate - a.nonComplianceRate);
	const worstTypes = typeStats.filter((t) => t.nonComplianceRate > 0).slice(0, 5);

	// Group comparison
	const groupMap = new Map<string, { groupName: string; statuses: TrainingStatusInfo[] }>();
	for (const person of personnel) {
		const gid = person.groupId ?? 'unassigned';
		const gname = person.groupName || 'Unassigned';
		if (!groupMap.has(gid)) {
			groupMap.set(gid, { groupName: gname, statuses: [] });
		}
		const group = groupMap.get(gid)!;
		for (const type of requiredTypes) {
			const training = trainingMap.get(`${person.id}-${type.id}`);
			const statusInfo = getTrainingStatus(training, type, person);
			group.statuses.push(statusInfo);
		}
	}

	const groupComparison = Array.from(groupMap.entries()).map(([groupId, { groupName, statuses }]) => ({
		groupId,
		groupName,
		readinessPercent: computeReadinessFromStatuses(statuses)
	}));

	return { readinessPercent, statusCounts, worstTypes, groupComparison };
}

export function buildPivotTable(
	personnel: Personnel[],
	types: TrainingType[],
	trainings: PersonnelTraining[]
): PivotRow[] {
	const trainingMap = buildTrainingMap(trainings);

	return personnel.map((person) => {
		const cells = new Map<string, PivotCell>();
		for (const type of types) {
			const training = trainingMap.get(`${person.id}-${type.id}`);
			const statusInfo = getTrainingStatus(training, type, person);
			cells.set(type.id, {
				status: statusInfo.status,
				label: statusInfo.label,
				date: training?.expirationDate ?? training?.completionDate ?? null
			});
		}
		return { person, cells };
	});
}

function escapeCSV(value: string): string {
	if (value.includes(',') || value.includes('"') || value.includes('\n')) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

export function generatePivotCSV(rows: PivotRow[], types: TrainingType[]): string {
	const headers = ['Name', 'Rank', 'MOS', 'Role', 'Group', ...types.map((t) => t.name)];
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
