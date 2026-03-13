import type { AvailabilityEntry, StatusType } from '../calendar.types';
import type { AssignmentType, DailyAssignment } from '../stores/dailyAssignments.svelte';
import type { Personnel } from '$lib/types';
import { RANK_ORDER } from '$features/personnel/utils/personnelGrouping';

// --- Shared helpers ---

function expandDateRange(entryStart: string, entryEnd: string, reportStart: string, reportEnd: string): string[] {
	const start = clampDate(entryStart, reportStart, reportEnd);
	const end = clampDate(entryEnd, reportStart, reportEnd);
	const dates: string[] = [];
	const current = new Date(start + 'T00:00:00');
	const endDate = new Date(end + 'T00:00:00');
	while (current <= endDate) {
		dates.push(
			`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
		);
		current.setDate(current.getDate() + 1);
	}
	return dates;
}

function clampDate(date: string, min: string, max: string): string {
	if (date < min) return min;
	if (date > max) return max;
	return date;
}

/** Generate all YYYY-MM-DD strings between start and end inclusive */
export function allDatesInRange(startDate: string, endDate: string): string[] {
	return expandDateRange(startDate, endDate, startDate, endDate);
}

function sortByRank(personnel: Personnel[]): Personnel[] {
	const rankIndex = new Map<string, number>(RANK_ORDER.map((r, i) => [r, i]));
	return [...personnel].sort((a, b) => {
		const ra = rankIndex.get(a.rank) ?? 999;
		const rb = rankIndex.get(b.rank) ?? 999;
		if (ra !== rb) return ra - rb;
		return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
	});
}

// =============================================================
// 1. Availability Forecast
// =============================================================

export interface ForecastDay {
	date: string;
	totalPersonnel: number;
	unavailableCount: number;
	availableCount: number;
	availablePercent: number;
	unavailablePersonnel: { person: Personnel; statusName: string; statusColor: string }[];
}

export interface AvailabilityForecastResult {
	days: ForecastDay[];
}

export function computeAvailabilityForecast(
	personnel: Personnel[],
	entries: AvailabilityEntry[],
	statusTypes: StatusType[],
	startDate: string,
	endDate: string
): AvailabilityForecastResult {
	const statusMap = new Map(statusTypes.map((s) => [s.id, s]));
	const dates = allDatesInRange(startDate, endDate);
	const total = personnel.length;

	// Index entries by personnelId
	const entriesByPerson = new Map<string, AvailabilityEntry[]>();
	for (const entry of entries) {
		let list = entriesByPerson.get(entry.personnelId);
		if (!list) {
			list = [];
			entriesByPerson.set(entry.personnelId, list);
		}
		list.push(entry);
	}

	const days: ForecastDay[] = dates.map((dateStr) => {
		const unavailablePersonnel: ForecastDay['unavailablePersonnel'] = [];

		for (const person of personnel) {
			const personEntries = entriesByPerson.get(person.id) ?? [];
			// Check if person has any status on this date
			const activeEntry = personEntries.find(
				(e) => dateStr >= e.startDate && dateStr <= e.endDate
			);
			if (activeEntry) {
				const st = statusMap.get(activeEntry.statusTypeId);
				unavailablePersonnel.push({
					person,
					statusName: st?.name ?? 'Unknown',
					statusColor: st?.color ?? '#999'
				});
			}
		}

		const unavailableCount = unavailablePersonnel.length;
		const availableCount = total - unavailableCount;

		return {
			date: dateStr,
			totalPersonnel: total,
			unavailableCount,
			availableCount,
			availablePercent: total > 0 ? Math.round((availableCount / total) * 100) : 100,
			unavailablePersonnel
		};
	});

	return { days };
}

// =============================================================
// 2. Personnel Tempo (OPTEMPO)
// =============================================================

export interface TempoRow {
	person: Personnel;
	totalAwayDays: number;
	awayByStatus: Map<string, number>;
	percentAway: number;
	flagged: boolean;
}

export interface PersonnelTempoResult {
	rows: TempoRow[];
	activeStatusTypeIds: string[];
	totalDaysInPeriod: number;
}

export function computePersonnelTempo(
	personnel: Personnel[],
	entries: AvailabilityEntry[],
	awayStatusTypeIds: Set<string>,
	startDate: string,
	endDate: string,
	flagThreshold: number
): PersonnelTempoResult {
	const totalDaysInPeriod = allDatesInRange(startDate, endDate).length;

	// Filter to only "away" entries
	const awayEntries = entries.filter((e) => awayStatusTypeIds.has(e.statusTypeId));

	// Index by person
	const entriesByPerson = new Map<string, AvailabilityEntry[]>();
	for (const entry of awayEntries) {
		let list = entriesByPerson.get(entry.personnelId);
		if (!list) {
			list = [];
			entriesByPerson.set(entry.personnelId, list);
		}
		list.push(entry);
	}

	const activeStatusTypeIds = new Set<string>();
	const sorted = sortByRank(personnel);
	const rows: TempoRow[] = [];

	for (const person of sorted) {
		const personEntries = entriesByPerson.get(person.id) ?? [];
		const awayByStatus = new Map<string, number>();
		const allAwayDates = new Set<string>();

		for (const entry of personEntries) {
			const dates = expandDateRange(entry.startDate, entry.endDate, startDate, endDate);
			for (const dateStr of dates) {
				allAwayDates.add(dateStr);
				awayByStatus.set(entry.statusTypeId, (awayByStatus.get(entry.statusTypeId) ?? 0) + 1);
				activeStatusTypeIds.add(entry.statusTypeId);
			}
		}

		const totalAwayDays = allAwayDates.size;
		rows.push({
			person,
			totalAwayDays,
			awayByStatus,
			percentAway: totalDaysInPeriod > 0 ? Math.round((totalAwayDays / totalDaysInPeriod) * 100) : 0,
			flagged: totalAwayDays >= flagThreshold
		});
	}

	// Sort by most days away descending
	rows.sort((a, b) => b.totalAwayDays - a.totalAwayDays);

	return { rows, activeStatusTypeIds: [...activeStatusTypeIds], totalDaysInPeriod };
}

// =============================================================
// 3. Assignment Coverage
// =============================================================

export interface CoverageRow {
	person: Personnel;
	assignmentCounts: Map<string, number>;
	totalAssignments: number;
}

export interface AssignmentCoverageResult {
	rows: CoverageRow[];
	activeAssignmentTypeIds: string[];
	averageTotal: number;
}

export function computeAssignmentCoverage(
	personnel: Personnel[],
	assignments: DailyAssignment[],
	assignmentTypes: AssignmentType[],
	selectedTypeIds: Set<string>,
	startDate: string,
	endDate: string
): AssignmentCoverageResult {
	// Filter assignments to date range and selected types, personnel-assigned only
	const personnelTypeIds = new Set(
		assignmentTypes.filter((t) => t.assignTo === 'personnel' && selectedTypeIds.has(t.id)).map((t) => t.id)
	);
	const personnelIds = new Set(personnel.map((p) => p.id));

	const filtered = assignments.filter(
		(a) =>
			personnelTypeIds.has(a.assignmentTypeId) &&
			personnelIds.has(a.assigneeId) &&
			a.date >= startDate &&
			a.date <= endDate
	);

	// Index by person
	const assignmentsByPerson = new Map<string, DailyAssignment[]>();
	for (const a of filtered) {
		let list = assignmentsByPerson.get(a.assigneeId);
		if (!list) {
			list = [];
			assignmentsByPerson.set(a.assigneeId, list);
		}
		list.push(a);
	}

	const activeAssignmentTypeIds = new Set<string>();
	const sorted = sortByRank(personnel);
	const rows: CoverageRow[] = [];

	for (const person of sorted) {
		const personAssignments = assignmentsByPerson.get(person.id) ?? [];
		const assignmentCounts = new Map<string, number>();
		let totalAssignments = 0;

		for (const a of personAssignments) {
			assignmentCounts.set(a.assignmentTypeId, (assignmentCounts.get(a.assignmentTypeId) ?? 0) + 1);
			totalAssignments++;
			activeAssignmentTypeIds.add(a.assignmentTypeId);
		}

		rows.push({ person, assignmentCounts, totalAssignments });
	}

	const averageTotal = rows.length > 0
		? Math.round((rows.reduce((sum, r) => sum + r.totalAssignments, 0) / rows.length) * 10) / 10
		: 0;

	return { rows, activeAssignmentTypeIds: [...activeAssignmentTypeIds], averageTotal };
}

// =============================================================
// 4. Group/Section Readiness
// =============================================================

export interface ReadinessCell {
	date: string;
	totalPersonnel: number;
	availableCount: number;
	availablePercent: number;
}

export interface ReadinessGroupRow {
	groupId: string;
	groupName: string;
	cells: ReadinessCell[];
}

export interface GroupReadinessResult {
	groups: ReadinessGroupRow[];
	dates: string[];
}

export function computeGroupReadiness(
	personnel: Personnel[],
	entries: AvailabilityEntry[],
	groups: { id: string; name: string }[],
	selectedGroupIds: Set<string>,
	startDate: string,
	endDate: string
): GroupReadinessResult {
	const dates = allDatesInRange(startDate, endDate);

	// Index entries by personnelId
	const entriesByPerson = new Map<string, AvailabilityEntry[]>();
	for (const entry of entries) {
		let list = entriesByPerson.get(entry.personnelId);
		if (!list) {
			list = [];
			entriesByPerson.set(entry.personnelId, list);
		}
		list.push(entry);
	}

	// Group personnel
	const selectedGroups = groups.filter((g) => selectedGroupIds.has(g.id));
	const groupRows: ReadinessGroupRow[] = selectedGroups.map((group) => {
		const groupPersonnel = personnel.filter((p) => p.groupId === group.id);
		const total = groupPersonnel.length;

		const cells: ReadinessCell[] = dates.map((dateStr) => {
			let unavailableCount = 0;
			for (const person of groupPersonnel) {
				const personEntries = entriesByPerson.get(person.id) ?? [];
				const hasStatus = personEntries.some(
					(e) => dateStr >= e.startDate && dateStr <= e.endDate
				);
				if (hasStatus) unavailableCount++;
			}

			const availableCount = total - unavailableCount;
			return {
				date: dateStr,
				totalPersonnel: total,
				availableCount,
				availablePercent: total > 0 ? Math.round((availableCount / total) * 100) : 100
			};
		});

		return { groupId: group.id, groupName: group.name, cells };
	});

	return { groups: groupRows, dates };
}
