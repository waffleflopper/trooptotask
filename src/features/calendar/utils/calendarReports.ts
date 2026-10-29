import type { Group, GroupRow, Personnel } from '$features/personnel/contracts';
import type { AvailabilityEntry, StatusType, AssignmentType, DailyAssignment } from '$features/calendar/contracts';
import { buildGroupTree, comparePersonnelByRankThenName, groupRows } from '$features/personnel/contracts';

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

export function allDatesInRange(startDate: string, endDate: string): string[] {
	return expandDateRange(startDate, endDate, startDate, endDate);
}

function sortByRank(personnel: Personnel[]): Personnel[] {
	return [...personnel].sort(comparePersonnelByRankThenName);
}

function buildAvailabilityEntryDateIndex(
	entries: AvailabilityEntry[],
	startDate: string,
	endDate: string
): {
	getFirstEntry: (personnelId: string, date: string) => AvailabilityEntry | undefined;
	hasEntry: (personnelId: string, date: string) => boolean;
} {
	const entryByPersonnelDate = new Map<string, AvailabilityEntry>();

	for (const entry of entries) {
		if (entry.endDate < startDate || entry.startDate > endDate) {
			continue;
		}
		const dates = expandDateRange(entry.startDate, entry.endDate, startDate, endDate);
		for (const date of dates) {
			const key = `${entry.personnelId}:${date}`;
			if (!entryByPersonnelDate.has(key)) {
				entryByPersonnelDate.set(key, entry);
			}
		}
	}

	return {
		getFirstEntry: (personnelId, date) => entryByPersonnelDate.get(`${personnelId}:${date}`),
		hasEntry: (personnelId, date) => entryByPersonnelDate.has(`${personnelId}:${date}`)
	};
}

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
	const availabilityIndex = buildAvailabilityEntryDateIndex(entries, startDate, endDate);

	const days: ForecastDay[] = dates.map((dateStr) => {
		const unavailablePersonnel: ForecastDay['unavailablePersonnel'] = [];

		for (const person of personnel) {
			const activeEntry = availabilityIndex.getFirstEntry(person.id, dateStr);
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
	statusTypes: StatusType[],
	awayStatusTypeIds: Set<string>,
	startDate: string,
	endDate: string,
	flagThreshold: number
): PersonnelTempoResult {
	const totalDaysInPeriod = allDatesInRange(startDate, endDate).length;

	const awayEntries = entries.filter((e) => awayStatusTypeIds.has(e.statusTypeId));

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

	rows.sort((a, b) => b.totalAwayDays - a.totalAwayDays);

	return {
		rows,
		activeStatusTypeIds: statusTypes.filter((type) => activeStatusTypeIds.has(type.id)).map((type) => type.id),
		totalDaysInPeriod
	};
}

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

	const averageTotal =
		rows.length > 0 ? Math.round((rows.reduce((sum, r) => sum + r.totalAssignments, 0) / rows.length) * 10) / 10 : 0;

	return {
		rows,
		activeAssignmentTypeIds: assignmentTypes
			.filter((type) => activeAssignmentTypeIds.has(type.id))
			.map((type) => type.id),
		averageTotal
	};
}

export interface ReadinessCell {
	date: string;
	totalPersonnel: number;
	availableCount: number;
	availablePercent: number;
}

export interface ReadinessGroupRow {
	/** A Group id, or `hq:<id>` for a Group's direct people. */
	groupId: string;
	groupName: string;
	level: number;
	/** The row totals the rows below it. */
	subtotal: boolean;
	cells: ReadinessCell[];
}

/**
 * Green at 80% available, amber at 50%, red below, on the exact fraction: 159 of 200 shows as 80% but is amber.
 * An empty Group reads as fully available.
 */
export function readinessTone(cell: ReadinessCell): 'success' | 'warning' | 'destructive' {
	const atLeast = (percent: number) => cell.availableCount * 100 >= percent * cell.totalPersonnel;
	if (atLeast(80)) return 'success';
	if (atLeast(50)) return 'warning';
	return 'destructive';
}

export interface ReadinessGroupSet {
	top: ReadinessGroupRow;
	/** The top-level Group's HQ and sub-group rows in tree order. */
	below: ReadinessGroupRow[];
}

export interface GroupReadinessResult {
	/** One row per Group in the selected subtrees, counting its direct people, as the workbook writes them. */
	groups: ReadinessGroupRow[];
	/** One set per selected top-level Group, counting its whole subtree. */
	sets: ReadinessGroupSet[];
	dates: string[];
}

/** Availability per day for each selected top-level Group's subtree. */
export function computeGroupReadiness(
	personnel: Personnel[],
	entries: AvailabilityEntry[],
	groups: readonly Group[],
	selectedRootIds: ReadonlySet<string>,
	startDate: string,
	endDate: string
): GroupReadinessResult {
	const dates = allDatesInRange(startDate, endDate);
	const availabilityIndex = buildAvailabilityEntryDateIndex(entries, startDate, endDate);
	const tree = buildGroupTree(groups);
	const selected = (groupId: string | null) =>
		groupId !== null && [...selectedRootIds].some((rootId) => tree.contains(rootId, groupId));

	const readinessRow = (
		row: Omit<ReadinessGroupRow, 'cells'> & { items: readonly Personnel[] }
	): ReadinessGroupRow => ({
		groupId: row.groupId,
		groupName: row.groupName,
		level: row.level,
		subtotal: row.subtotal,
		cells: dates.map((date): ReadinessCell => {
			const total = row.items.length;
			const availableCount = row.items.filter((person) => !availabilityIndex.hasEntry(person.id, date)).length;
			return {
				date,
				totalPersonnel: total,
				availableCount,
				availablePercent: total > 0 ? Math.round((availableCount / total) * 100) : 100
			};
		})
	});
	const fromGroupRow = (row: GroupRow<Personnel>) => readinessRow({ ...row, groupId: row.key, groupName: row.label });

	const exact = groups
		.filter((group) => selected(group.id))
		.map((group) =>
			readinessRow({
				groupId: group.id,
				groupName: group.name,
				level: tree.node(group.id)?.level ?? 0,
				subtotal: false,
				items: personnel.filter((person) => person.groupId === group.id)
			})
		);

	const inSelection = personnel.filter((person) => selected(person.groupId));
	const setsByRoot = new Map(
		groupRows(tree, inSelection, (person) => person.groupId, true).map((set) => [set.top.key, set])
	);
	const sets = tree.roots
		.filter((root) => selectedRootIds.has(root.id))
		.map((root): ReadinessGroupSet => {
			const set = setsByRoot.get(root.id);
			return {
				top: set
					? fromGroupRow(set.top)
					: readinessRow({ groupId: root.id, groupName: tree.label(root.id), level: 0, subtotal: false, items: [] }),
				below: set?.below.map(fromGroupRow) ?? []
			};
		});

	return { groups: exact, sets, dates };
}
