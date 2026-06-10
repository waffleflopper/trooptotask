import type { Personnel } from '$lib/types';
import type { TrainingType, PersonnelTraining, TrainingStatus } from '$features/training/training.types';
import { getTrainingStatus, type TrainingStatusInfo } from './trainingStatus';
import {
	tallyReadiness,
	tallyReadinessBy,
	type ReadinessFact,
	type ReadinessTallyConfig
} from '$lib/domain/readinessRollup';
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

/**
 * Training's Readiness Rollup convention: ready = current ONLY (warning states
 * are applicable but not ready), exempt/not-required cells stay visible in
 * stateCounts without entering the denominator, and an empty denominator
 * reports 0% (the ICT matrix diverges to null — see CONTEXT.md).
 */
const TRAINING_ROLLUP: ReadinessTallyConfig<TrainingStatus, 0> = {
	readyStates: ['current'],
	inapplicableStates: ['not-required', 'exempt'],
	zeroApplicablePercent: 0
};

// Non-compliance is a second fold with the non-compliant states as numerator,
// never 100 − compliance: rounding makes the two figures non-complementary.
const TRAINING_NON_COMPLIANCE: ReadinessTallyConfig<TrainingStatus, 0> = {
	...TRAINING_ROLLUP,
	readyStates: ['warning-yellow', 'warning-orange', 'expired', 'not-completed']
};

/** Required (non-optional) Training Report Matrix cells as Readiness Rollup facts. */
function matrixToReadinessFacts(matrix: TrainingReportMatrix): ReadinessFact<TrainingStatus>[] {
	const facts: ReadinessFact<TrainingStatus>[] = [];
	for (const row of matrix.rows) {
		for (const cell of row.cells.values()) {
			if (cell.isOptional) continue;
			facts.push({ subjectKey: row.person.id, requirementKey: cell.trainingTypeId, state: cell.status });
		}
	}
	return facts;
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
	const requiredTypeIds = requiredTypes.map((type) => type.id);
	const facts = matrixToReadinessFacts(matrix);

	const overall = tallyReadiness(facts, TRAINING_ROLLUP);
	const statusCounts = {
		current: overall.stateCounts.get('current') ?? 0,
		warningYellow: overall.stateCounts.get('warning-yellow') ?? 0,
		warningOrange: overall.stateCounts.get('warning-orange') ?? 0,
		expired: overall.stateCounts.get('expired') ?? 0,
		notCompleted: overall.stateCounts.get('not-completed') ?? 0
	};

	// Per-type breakdown and worst types: two folds over the same facts.
	const byType = tallyReadinessBy(facts, TRAINING_ROLLUP, (fact) => fact.requirementKey, {
		seedKeys: requiredTypeIds
	});
	const byTypeNonCompliance = tallyReadinessBy(facts, TRAINING_NON_COMPLIANCE, (fact) => fact.requirementKey, {
		seedKeys: requiredTypeIds
	});

	const typeBreakdown: TypeBreakdown[] = requiredTypes.map((type) => {
		const tally = byType.get(type.id)!;
		return {
			typeId: type.id,
			typeName: type.name,
			complianceRate: tally.percent,
			current: tally.stateCounts.get('current') ?? 0,
			warningYellow: tally.stateCounts.get('warning-yellow') ?? 0,
			warningOrange: tally.stateCounts.get('warning-orange') ?? 0,
			expired: tally.stateCounts.get('expired') ?? 0,
			notCompleted: tally.stateCounts.get('not-completed') ?? 0,
			applicable: tally.applicable
		};
	});

	const worstTypes = requiredTypes
		.map((type) => ({
			typeId: type.id,
			typeName: type.name,
			nonComplianceRate: byTypeNonCompliance.get(type.id)!.percent
		}))
		.sort((a, b) => b.nonComplianceRate - a.nonComplianceRate)
		.filter((t) => t.nonComplianceRate > 0)
		.slice(0, 5);

	// Group comparison: subject-group fold. Seeds keep groups present even when
	// every cell for the group is optional (zero facts); first row's name wins.
	const groupIds: string[] = [];
	const groupOf = new Map<string, string>();
	const groupNames = new Map<string, string>();
	for (const row of matrix.rows) {
		const gid = row.person.groupId ?? 'unassigned';
		groupOf.set(row.person.id, gid);
		if (!groupNames.has(gid)) {
			groupNames.set(gid, row.person.groupName || 'Unassigned');
			groupIds.push(gid);
		}
	}
	const byGroup = tallyReadinessBy(facts, TRAINING_ROLLUP, (fact) => groupOf.get(fact.subjectKey)!, {
		seedKeys: groupIds
	});

	const groupComparison = Array.from(byGroup.entries()).map(([groupId, tally]) => ({
		groupId,
		groupName: groupNames.get(groupId)!,
		readinessPercent: tally.percent
	}));

	return { readinessPercent: overall.percent, statusCounts, worstTypes, groupComparison, typeBreakdown };
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
