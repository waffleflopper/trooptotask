import type { AvailabilityEntry, StatusType } from '$features/calendar/contracts';
import { comparePersonnelByRankThenName, type Group, type Personnel } from '$features/personnel/contracts';
import {
	computeAvailabilityForecast,
	computeGroupReadiness,
	readinessTone,
	type AwayPerson,
	type ForecastDay,
	type GroupReadinessResult,
	type ReadinessCell
} from './calendarReports';

export interface AvailabilityBoardInput {
	/** Everyone counted, already narrowed by the Group and MOS filters. */
	personnel: Personnel[];
	entries: AvailabilityEntry[];
	statusTypes: StatusType[];
	/** Only entries of these Status Types make a person away. */
	awayStatusTypeIds: ReadonlySet<string>;
	groups: readonly Group[];
	selectedRootIds: ReadonlySet<string>;
	/** People outside the Group tree get an Unassigned row. */
	includeUnassigned: boolean;
	startDate: string;
	endDate: string;
}

export interface AvailabilityBoard {
	days: ForecastDay[];
	readiness: GroupReadinessResult;
	/** The day with the smallest exact share here, the earliest on a tie; null for an empty selection. */
	lowest: ForecastDay | null;
	/** Days below 80% here, on the exact fraction. */
	daysUnderTarget: number;
	/** Top-level Group rows that fall below 50% on any day. */
	groupsUnderHalf: string[];
}

export function availableShare(cell: ReadinessCell): number {
	return cell.totalPersonnel > 0 ? cell.availableCount / cell.totalPersonnel : 1;
}

/** The smallest exact share, the earliest cell on a tie. */
export function lowestCell<T extends ReadinessCell>(cells: readonly T[]): T | null {
	return cells.reduce<T | null>(
		(lowest, cell) => (lowest === null || availableShare(cell) < availableShare(lowest) ? cell : lowest),
		null
	);
}

export function computeAvailabilityBoard(input: AvailabilityBoardInput): AvailabilityBoard {
	const { personnel, statusTypes, startDate, endDate } = input;
	const entries = input.entries.filter((entry) => input.awayStatusTypeIds.has(entry.statusTypeId));
	const { days } = computeAvailabilityForecast(personnel, entries, statusTypes, startDate, endDate);
	const readiness = computeGroupReadiness(
		personnel,
		entries,
		input.groups,
		input.selectedRootIds,
		startDate,
		endDate,
		input.includeUnassigned
	);
	return {
		days,
		readiness,
		lowest: personnel.length > 0 ? lowestCell(days) : null,
		daysUnderTarget: days.filter((day) => readinessTone(day) !== 'success').length,
		groupsUnderHalf: readiness.sets
			.filter((set) => set.top.cells.some((cell) => readinessTone(cell) === 'destructive'))
			.map((set) => set.top.groupName)
	};
}

/** The day dated `date`, or the first day when the range does not hold it. */
export function dayOnOrFirst(days: readonly ForecastDay[], date: string | null): ForecastDay | null {
	return days.find((day) => day.date === date) ?? days[0] ?? null;
}

export interface AwayCauses {
	/** The largest statuses by head count, ties in Status Type order. */
	top: { statusTypeId: string; count: number }[];
	/** Away people in the statuses left out of `top`. */
	otherCount: number;
}

export function dominantCauses(day: ForecastDay, limit = 2): AwayCauses {
	const ranked = [...day.awayByStatus].sort((a, b) => b.count - a.count);
	return {
		top: ranked.slice(0, limit),
		otherCount: ranked.slice(limit).reduce((sum, status) => sum + status.count, 0)
	};
}

export interface WhoIsOutGroup {
	statusTypeId: string;
	statusName: string;
	statusColor: string;
	statusTextColor: string;
	people: AwayPerson[];
	/** Earliest known return, or null when nobody's return falls inside the range. */
	earliestReturn: string | null;
	/** Latest return, or null when someone is still away at the range end. */
	latestReturn: string | null;
}

/** The people away on `day` grouped by status, the largest group first and ties in Status Type order. */
export function groupWhoIsOut(day: ForecastDay, statusTypes: readonly StatusType[]): WhoIsOutGroup[] {
	const byId = new Map(statusTypes.map((status) => [status.id, status]));
	return day.awayByStatus
		.map((away, order) => ({ ...away, order }))
		.sort((a, b) => b.count - a.count || a.order - b.order)
		.map(({ statusTypeId }): WhoIsOutGroup => {
			const people = day.unavailablePersonnel
				.filter((away) => away.statusTypeId === statusTypeId)
				.sort((a, b) => comparePersonnelByRankThenName(a.person, b.person));
			const returns = people.flatMap((away) => (away.returnDate === null ? [] : [away.returnDate])).sort();
			const status = byId.get(statusTypeId);
			return {
				statusTypeId,
				statusName: people[0]?.statusName ?? 'Unknown',
				statusColor: people[0]?.statusColor ?? '#999',
				statusTextColor: status?.textColor ?? '#ffffff',
				people,
				earliestReturn: returns[0] ?? null,
				latestReturn: returns.length === people.length ? returns[returns.length - 1] : null
			};
		});
}
