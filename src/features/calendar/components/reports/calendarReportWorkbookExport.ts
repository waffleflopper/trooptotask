import { buildGroupTree, groupExportPath, type Group } from '$features/personnel/contracts';
import type { StatusType } from '$features/calendar/contracts';
import { addTableSheet, createWorkbook, downloadWorkbook, type WorkbookRow } from '$lib/utils/workbook';
import type { AvailabilityBoard } from '../../utils/availabilityBoard';
import type { AssignmentLoadReport, PersonLoad } from '../../utils/assignmentLoad';
import type { ReadinessCell } from '../../utils/calendarReports';
import type { NextOut, TimeAwayReport } from '../../utils/timeAway';

export async function exportAssignmentLoadWorkbook(
	report: AssignmentLoadReport,
	startDate: string,
	endDate: string
): Promise<void> {
	const types = report.dutyTypes;
	const tenth = (value: number) => Math.round(value * 10) / 10;
	const count = (entry: PersonLoad, typeId: string) =>
		entry.byType.find((entry) => entry.assignmentTypeId === typeId)?.count ?? 0;
	const average = (values: number[]) => (values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0);
	const averageTotal = average(report.everyone.map((entry) => entry.total));

	const people: WorkbookRow[] = [...report.everyone]
		.sort((a, b) => b.difference - a.difference)
		.map((entry) => ({
			rank: entry.person.rank,
			lastName: entry.person.lastName,
			firstName: entry.person.firstName,
			group: entry.person.groupName,
			...Object.fromEntries(types.map((type) => [type.id, count(entry, type.id)])),
			total: entry.total,
			fairShare: tenth(entry.expected),
			vsFairShare: tenth(entry.difference),
			vsAverage: tenth(entry.total - averageTotal),
			presentDays: entry.presentDays,
			lastDuty: entry.lastDuty ?? ''
		}));
	people.push({
		rank: '',
		lastName: '',
		firstName: 'Average',
		group: '',
		...Object.fromEntries(
			types.map((type) => [type.id, tenth(average(report.everyone.map((entry) => count(entry, type.id))))])
		),
		total: tenth(averageTotal),
		fairShare: tenth(average(report.everyone.map((entry) => entry.expected))),
		vsFairShare: '',
		vsAverage: '',
		presentDays: '',
		lastDuty: ''
	});
	const typeName = (id: string) => types.find((type) => type.id === id)?.name ?? 'Unknown';

	const workbook = await createWorkbook();
	addTableSheet(workbook, {
		name: 'Assignment load by person',
		columns: [
			{ header: 'Rank', key: 'rank', width: 12 },
			{ header: 'Last Name', key: 'lastName', width: 18 },
			{ header: 'First Name', key: 'firstName', width: 18 },
			{ header: 'Group', key: 'group', width: 20 },
			...types.map((type) => ({ header: type.name, key: type.id, width: 16 })),
			{ header: 'Total', key: 'total', width: 12 },
			{ header: 'Fair share', key: 'fairShare', width: 12 },
			{ header: 'Difference from fair share', key: 'vsFairShare', width: 26 },
			{ header: 'Difference from average', key: 'vsAverage', width: 24 },
			{ header: 'Days present', key: 'presentDays', width: 14 },
			{ header: 'Last duty', key: 'lastDuty', width: 14 }
		],
		rows: people
	});
	addTableSheet(workbook, {
		name: 'Assignment load by duty',
		columns: [
			{ header: 'Duty', key: 'duty', width: 24 },
			{ header: 'Duties', key: 'duties', width: 10 },
			{ header: 'Eligible people', key: 'eligible', width: 16 },
			{ header: 'Never drew it', key: 'never', width: 14 },
			{ header: 'Over fair share', key: 'over', width: 16 },
			{ header: 'On share', key: 'onShare', width: 12 },
			{ header: 'Under fair share', key: 'under', width: 16 }
		],
		rows: report.duties.map((duty) => ({
			duty: typeName(duty.assignmentTypeId),
			duties: duty.duties,
			eligible: duty.eligible,
			never: duty.never,
			over: duty.over,
			onShare: duty.onShare,
			under: duty.under
		}))
	});
	await downloadWorkbook(workbook, `assignment-load_${startDate}_${endDate}.xlsx`);
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

function formatShortDate(dateStr: string): string {
	const d = new Date(dateStr + 'T00:00:00');
	const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	return `${dayNames[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
}
