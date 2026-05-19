import { addTableSheet, createWorkbook, type Workbook, type WorkbookRow } from '$lib/export/workbook';
import type { CriticalTasksMatrix } from './criticalTasksMatrix';
import type { IctReportDashboard } from './ictReports';
import type { PersonnelIctCompletion } from '../criticalTasks.types';

function renderCell(completion: PersonnelIctCompletion | undefined, status: string): string {
	switch (status) {
		case 'current':
			return `Current${completion ? ` (${completion.completedAt})` : ''}`;
		case 'expiring-soon':
			return `Expiring Soon${completion ? ` (${completion.completedAt})` : ''}`;
		case 'expired':
			return `Expired${completion ? ` (${completion.completedAt})` : ''}`;
		default:
			return 'Not Recorded';
	}
}

function formatDelta(delta: number): string {
	if (delta > 0) return `+${delta} pts vs 30d`;
	if (delta < 0) return `${delta} pts vs 30d`;
	return '0 pts vs 30d';
}

function formatDaysSinceLastIctUpdate(days: number | null): string {
	if (days === null) return 'No ICT update';
	if (days === 1) return '1 day since update';
	return `${days} days since update`;
}

function formatApplicableSoldiers(count: number): string {
	return `${count} applicable ${count === 1 ? 'Soldier' : 'Soldiers'}`;
}

function criticalTasksReportRows(dashboard: IctReportDashboard): WorkbookRow[] {
	const { overallReadiness, soldiersBelow70, tasksExpiringSoon, tasksBelowThreshold } = dashboard.kpis;
	const expiringSoonWindowLabel = `<=${tasksExpiringSoon.windowDays}d`;
	const rows: WorkbookRow[] = [];

	for (const row of dashboard.atRiskSoldiers.rows) {
		rows.push({
			section: 'At-Risk Soldiers',
			metric: row.soldierName,
			value: `${row.readinessPercent}%`,
			subtitle: `${row.rank} ${row.mos}; ${row.groupName}; ${row.tasksExpiringSoonCount} expiring ${expiringSoonWindowLabel}; ${formatDaysSinceLastIctUpdate(row.daysSinceLastIctUpdate)}`
		});
	}

	for (const row of dashboard.tasksBelowThreshold.rows) {
		rows.push({
			section: 'Tasks Below Unit Threshold',
			metric: `${row.taskCode} ${row.taskName}`,
			value: `${row.percentComplete}%`,
			subtitle: `${row.soldierGapCount} Soldiers need it`
		});
	}

	rows.push(
		{
			section: 'Summary',
			metric: 'Overall Readiness',
			value: `${overallReadiness.percent}%`,
			subtitle: formatDelta(overallReadiness.deltaPercent)
		},
		{
			section: 'Summary',
			metric: `Soldiers Below ${soldiersBelow70.thresholdPercent}%`,
			value: soldiersBelow70.count,
			subtitle: formatApplicableSoldiers(soldiersBelow70.totalApplicable)
		},
		{
			section: 'Summary',
			metric: `Tasks Expiring ${expiringSoonWindowLabel}`,
			value: tasksExpiringSoon.count,
			subtitle: `${tasksExpiringSoon.affectedSoldiers} Soldiers affected`
		},
		{
			section: 'Summary',
			metric: 'Tasks Below Threshold',
			value: tasksBelowThreshold.count,
			subtitle: `Below ${tasksBelowThreshold.thresholdPercent}% unit completion`
		}
	);

	return rows;
}

export async function buildCriticalTasksReportWorkbook(dashboard: IctReportDashboard): Promise<Workbook> {
	const workbook = await createWorkbook();
	addTableSheet(workbook, {
		name: 'Critical Tasks Report',
		columns: [
			{ header: 'Section', key: 'section', width: 28 },
			{ header: 'Metric', key: 'metric', width: 36 },
			{ header: 'Value', key: 'value', width: 16 },
			{ header: 'Subtitle', key: 'subtitle', width: 64 }
		],
		rows: criticalTasksReportRows(dashboard)
	});
	return workbook;
}

export async function buildCriticalTasksMatrixWorkbook(matrix: CriticalTasksMatrix): Promise<Workbook> {
	const workbook = await createWorkbook();
	addTableSheet(workbook, {
		name: 'Critical Task Matrix',
		columns: [
			{ header: 'Name', key: 'name', width: 24 },
			{ header: 'Rank', key: 'rank', width: 12 },
			{ header: 'MOS', key: 'mos', width: 12 },
			{ header: 'Duty Role', key: 'dutyRole', width: 20 },
			{ header: 'Group', key: 'group', width: 18 },
			...matrix.tasks.map((task) => ({
				header: `${task.taskCode} ${task.title}`,
				key: `task_${task.id}`,
				width: 28
			}))
		],
		rows: matrix.alphabeticalRows.map((row) => {
			const workbookRow: WorkbookRow = {
				name: `${row.person.lastName}, ${row.person.firstName}`,
				rank: row.person.rank,
				mos: row.person.mos,
				dutyRole: row.person.clinicRole,
				group: row.person.groupName
			};

			for (const cell of row.cells) {
				workbookRow[`task_${cell.task.id}`] = cell.applicable
					? renderCell(cell.completion, cell.statusInfo.status)
					: '';
			}

			return workbookRow;
		})
	});
	return workbook;
}
