import { buildGroupTree, groupExportPath, type Group } from '$features/personnel/contracts';
import type { AssignmentType, StatusType } from '$features/calendar/contracts';
import { addTableSheet, createWorkbook, downloadWorkbook, type WorkbookRow } from '$lib/utils/workbook';
import type { AvailabilityBoard } from '../../utils/availabilityBoard';
import type { AssignmentCoverageResult, ReadinessCell } from '../../utils/calendarReports';
import type { NextOut, TimeAwayReport } from '../../utils/timeAway';

export async function exportAssignmentCoverageWorkbook(
	result: AssignmentCoverageResult,
	assignmentTypes: AssignmentType[],
	startDate: string,
	endDate: string
): Promise<void> {
	const columns = assignmentColumns(result.activeAssignmentTypeIds, assignmentTypes);
	const rows: WorkbookRow[] = result.rows.map((row) => ({
		rank: row.person.rank,
		lastName: row.person.lastName,
		firstName: row.person.firstName,
		...Object.fromEntries(
			columns.map((assignmentType) => [assignmentType.id, row.assignmentCounts.get(assignmentType.id) ?? 0])
		),
		total: row.totalAssignments,
		vsAverage: signedDelta(row.totalAssignments - result.averageTotal)
	}));
	rows.push({
		rank: '',
		lastName: '',
		firstName: 'Average',
		...Object.fromEntries(
			columns.map((assignmentType) => [assignmentType.id, averageAssignmentCount(result, assignmentType.id)])
		),
		total: result.averageTotal,
		vsAverage: ''
	});

	const workbook = await createWorkbook();
	addTableSheet(workbook, {
		name: 'Assignment Coverage',
		columns: [
			{ header: 'Rank', key: 'rank', width: 12 },
			{ header: 'Last Name', key: 'lastName', width: 18 },
			{ header: 'First Name', key: 'firstName', width: 18 },
			...columns.map((assignmentType) => ({ header: assignmentType.name, key: assignmentType.id, width: 16 })),
			{ header: 'Total', key: 'total', width: 12 },
			{ header: 'Difference from average', key: 'vsAverage', width: 24 }
		],
		rows
	});
	await downloadWorkbook(workbook, `assignment-coverage_${startDate}_${endDate}.xlsx`);
}

export async function exportAvailabilityWorkbook(
	board: AvailabilityBoard,
	statusTypes: readonly StatusType[],
	groups: readonly Group[],
	startDate: string,
	endDate: string
): Promise<void> {
	const away = statusTypes.filter((statusType) =>
		board.days.some((day) => day.awayByStatus.some((status) => status.statusTypeId === statusType.id))
	);
	const dailyRows = board.days.map((day) => ({
		date: day.date,
		here: day.availableCount,
		away: day.unavailableCount,
		total: day.totalPersonnel,
		herePercent: `${day.availablePercent}%`,
		...Object.fromEntries(
			away.map((statusType) => [
				statusType.id,
				day.awayByStatus.find((status) => status.statusTypeId === statusType.id)?.count ?? 0
			])
		),
		awayPersonnel: day.unavailablePersonnel.map((entry) => `${entry.person.rank} ${entry.person.lastName}`).join(', ')
	}));

	const tree = buildGroupTree(groups);
	const cellText = (cell: ReadinessCell) =>
		`${cell.availableCount}/${cell.totalPersonnel} (${cell.totalPersonnel > 0 ? cell.availablePercent : 100}%)`;
	const groupRows = [
		...board.readiness.groups.map((group) => ({
			group: groupExportPath(tree, group.groupId) || group.groupName,
			cells: group.cells
		})),
		{ group: 'Total', cells: board.days }
	].map((row) => ({ group: row.group, ...Object.fromEntries(row.cells.map((cell) => [cell.date, cellText(cell)])) }));

	const workbook = await createWorkbook();
	addTableSheet(workbook, {
		name: 'Availability by day',
		columns: [
			{ header: 'Date', key: 'date', width: 14 },
			{ header: 'Here', key: 'here', width: 10 },
			{ header: 'Away', key: 'away', width: 10 },
			{ header: 'Total', key: 'total', width: 10 },
			{ header: 'Here percent', key: 'herePercent', width: 14 },
			...away.map((statusType) => ({ header: statusType.name, key: statusType.id, width: 14 })),
			{ header: 'Away personnel', key: 'awayPersonnel', width: 40 }
		],
		rows: dailyRows
	});
	addTableSheet(workbook, {
		name: 'Group by day',
		columns: [
			{ header: 'Group', key: 'group', width: 22 },
			...board.readiness.dates.map((date) => ({ header: formatShortDate(date), key: date, width: 14 }))
		],
		rows: groupRows
	});
	await downloadWorkbook(workbook, `availability_${startDate}_${endDate}.xlsx`);
}

export async function exportTimeAwayWorkbook(
	report: TimeAwayReport,
	statusTypes: readonly StatusType[],
	flagDays: number,
	startDate: string,
	endDate: string
): Promise<void> {
	const statusById = new Map(statusTypes.map((statusType) => [statusType.id, statusType]));
	const columns = statusTypes.filter((statusType) => report.byStatus.some((s) => s.statusTypeId === statusType.id));
	const nextOutText = (nextOut: NextOut | null) =>
		nextOut === null
			? ''
			: `${statusById.get(nextOut.statusTypeId)?.name ?? 'Unknown'}${nextOut.ongoing ? ' (continues)' : ''}`;

	const people = [...report.people]
		.sort((a, b) => b.totalDays - a.totalDays)
		.map((entry) => ({
			rank: entry.person.rank,
			lastName: entry.person.lastName,
			firstName: entry.person.firstName,
			group: entry.person.groupName,
			...Object.fromEntries(
				columns.map((statusType) => [
					statusType.id,
					entry.byStatus.find((status) => status.statusTypeId === statusType.id)?.days ?? 0
				])
			),
			totalDays: entry.totalDays,
			percentOfSpan: Math.round((entry.totalDays / report.spanDays) * 100),
			flagged: entry.totalDays >= flagDays ? 'Yes' : '',
			nextOut: nextOutText(entry.nextOut),
			nextOutDay: entry.nextOut?.date ?? ''
		}));
	const groups = report.groups
		.flatMap((set) => [set.top, ...set.below])
		.map((group) => ({
			group: group.label,
			people: group.people,
			totalDays: group.totalDays,
			perPerson: Math.round(group.perPerson * 10) / 10
		}));

	const workbook = await createWorkbook();
	addTableSheet(workbook, {
		name: 'Time away by person',
		columns: [
			{ header: 'Rank', key: 'rank', width: 12 },
			{ header: 'Last Name', key: 'lastName', width: 18 },
			{ header: 'First Name', key: 'firstName', width: 18 },
			{ header: 'Group', key: 'group', width: 20 },
			...columns.map((statusType) => ({ header: statusType.name, key: statusType.id, width: 14 })),
			{ header: 'Total days away', key: 'totalDays', width: 18 },
			{ header: 'Percent of span', key: 'percentOfSpan', width: 16 },
			{ header: `Flagged (${flagDays}+ days)`, key: 'flagged', width: 18 },
			{ header: 'Next out', key: 'nextOut', width: 22 },
			{ header: 'Next out day', key: 'nextOutDay', width: 14 }
		],
		rows: people
	});
	addTableSheet(workbook, {
		name: 'Time away by group',
		columns: [
			{ header: 'Group', key: 'group', width: 24 },
			{ header: 'People', key: 'people', width: 10 },
			{ header: 'Total days away', key: 'totalDays', width: 18 },
			{ header: 'Days away per person', key: 'perPerson', width: 22 }
		],
		rows: groups
	});
	await downloadWorkbook(workbook, `time-away_${startDate}_${endDate}.xlsx`);
}

function assignmentColumns(ids: string[], assignmentTypes: AssignmentType[]): AssignmentType[] {
	const assignmentTypeMap = new Map(assignmentTypes.map((assignmentType) => [assignmentType.id, assignmentType]));
	return ids
		.map((id) => assignmentTypeMap.get(id))
		.filter((assignmentType): assignmentType is AssignmentType => !!assignmentType);
}

function averageAssignmentCount(result: AssignmentCoverageResult, assignmentTypeId: string): number {
	if (result.rows.length === 0) return 0;
	const total = result.rows.reduce((sum, row) => sum + (row.assignmentCounts.get(assignmentTypeId) ?? 0), 0);
	return Math.round((total / result.rows.length) * 10) / 10;
}

function signedDelta(value: number): string {
	const rounded = Math.round(value * 10) / 10;
	return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function formatShortDate(dateStr: string): string {
	const d = new Date(dateStr + 'T00:00:00');
	const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	return `${dayNames[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
}
