import type { AssignmentType, StatusType } from '$lib/types';
import { addTableSheet, createWorkbook, downloadWorkbook, type WorkbookRow } from '$lib/export/workbook';
import type {
	AssignmentCoverageResult,
	AvailabilityForecastResult,
	GroupReadinessResult,
	PersonnelTempoResult
} from '../../utils/calendarReports';
import type { StatusDaysResult } from '../../utils/statusDaysReport';

export async function exportAvailabilityForecastWorkbook(
	result: AvailabilityForecastResult,
	startDate: string,
	endDate: string
): Promise<void> {
	const rows = result.days.map((day) => ({
		date: day.date,
		unavailable: day.unavailableCount,
		available: day.availableCount,
		availablePercent: `${day.availablePercent}%`,
		unavailablePersonnel: day.unavailablePersonnel.map((u) => `${u.person.rank} ${u.person.lastName}`).join(', ')
	}));
	const workbook = await createWorkbook();
	addTableSheet(workbook, {
		name: 'Availability Forecast',
		columns: [
			{ header: 'Date', key: 'date', width: 14 },
			{ header: 'Unavailable', key: 'unavailable', width: 14 },
			{ header: 'Available', key: 'available', width: 12 },
			{ header: 'Available %', key: 'availablePercent', width: 14 },
			{ header: 'Unavailable Personnel', key: 'unavailablePersonnel', width: 40 }
		],
		rows
	});
	await downloadWorkbook(workbook, `availability-forecast_${startDate}_${endDate}.xlsx`);
}

export async function exportPersonnelTempoWorkbook(
	result: PersonnelTempoResult,
	statusTypes: StatusType[],
	startDate: string,
	endDate: string
): Promise<void> {
	const columns = statusColumns(result.activeStatusTypeIds, statusTypes);
	const rows = result.rows.map((row) => ({
		rank: row.person.rank,
		lastName: row.person.lastName,
		firstName: row.person.firstName,
		...Object.fromEntries(columns.map((statusType) => [statusType.id, row.awayByStatus.get(statusType.id) ?? 0])),
		totalAway: row.totalAwayDays,
		percentAway: row.percentAway
	}));
	const workbook = await createWorkbook();
	addTableSheet(workbook, {
		name: 'Personnel Tempo',
		columns: [
			{ header: 'Rank', key: 'rank', width: 12 },
			{ header: 'Last Name', key: 'lastName', width: 18 },
			{ header: 'First Name', key: 'firstName', width: 18 },
			...columns.map((statusType) => ({ header: statusType.name, key: statusType.id, width: 14 })),
			{ header: 'Total Away', key: 'totalAway', width: 14 },
			{ header: '% Away', key: 'percentAway', width: 12 }
		],
		rows
	});
	await downloadWorkbook(workbook, `personnel-tempo_${startDate}_${endDate}.xlsx`);
}

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
			{ header: 'vs Avg', key: 'vsAverage', width: 12 }
		],
		rows
	});
	await downloadWorkbook(workbook, `assignment-coverage_${startDate}_${endDate}.xlsx`);
}

export async function exportGroupReadinessWorkbook(
	result: GroupReadinessResult,
	startDate: string,
	endDate: string
): Promise<void> {
	const rows = result.groups.map((group) => ({
		group: group.groupName,
		...Object.fromEntries(
			group.cells.map((cell) => [
				cell.date,
				`${cell.availableCount}/${cell.totalPersonnel} (${cell.totalPersonnel > 0 ? cell.availablePercent : 100}%)`
			])
		)
	}));
	const workbook = await createWorkbook();
	addTableSheet(workbook, {
		name: 'Group Readiness',
		columns: [
			{ header: 'Group', key: 'group', width: 22 },
			...result.dates.map((date) => ({ header: formatShortDate(date), key: date, width: 14 }))
		],
		rows
	});
	await downloadWorkbook(workbook, `group-readiness_${startDate}_${endDate}.xlsx`);
}

export async function exportStatusDaysWorkbook(
	result: StatusDaysResult,
	statusTypes: StatusType[],
	startDate: string,
	endDate: string
): Promise<void> {
	const columns = statusColumns(result.activeStatusTypeIds, statusTypes);
	const rows = result.rows.map((row) => ({
		rank: row.person.rank,
		lastName: row.person.lastName,
		firstName: row.person.firstName,
		...Object.fromEntries(columns.map((statusType) => [statusType.id, row.statusDays.get(statusType.id) ?? ''])),
		totalDays: row.totalDays || ''
	}));
	const workbook = await createWorkbook();
	addTableSheet(workbook, {
		name: 'Status Days',
		columns: [
			{ header: 'Rank', key: 'rank', width: 12 },
			{ header: 'Last Name', key: 'lastName', width: 18 },
			{ header: 'First Name', key: 'firstName', width: 18 },
			...columns.map((statusType) => ({ header: statusType.name, key: statusType.id, width: 14 })),
			{ header: 'Total Days', key: 'totalDays', width: 14 }
		],
		rows
	});
	await downloadWorkbook(workbook, `status-days-${startDate}-to-${endDate}.xlsx`);
}

function statusColumns(ids: string[], statusTypes: StatusType[]): StatusType[] {
	const statusTypeMap = new Map(statusTypes.map((statusType) => [statusType.id, statusType]));
	return ids.map((id) => statusTypeMap.get(id)).filter((statusType): statusType is StatusType => !!statusType);
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
