import type { Personnel, AvailabilityEntry, StatusType, AssignmentType, DailyAssignment } from '$lib/types';

interface GroupData {
	group: string;
	personnel: Personnel[];
}

export interface StatusCount {
	statusType: StatusType;
	count: number;
}

export interface AssignmentCoverage {
	type: AssignmentType;
	assigneeName: string;
	isAssigned: boolean;
}

export interface GroupStrength {
	group: string;
	present: number;
	total: number;
}

export interface TodayBreakdownData {
	totalCount: number;
	presentCount: number;
	statusCounts: StatusCount[];
	assignmentCoverage: AssignmentCoverage[];
	gaps: string[];
	groupStrength: GroupStrength[];
}

export function computeTodayBreakdownData(
	today: string,
	personnelByGroup: GroupData[],
	availabilityEntries: AvailabilityEntry[],
	statusTypes: StatusType[],
	assignmentTypes: AssignmentType[],
	assignments: DailyAssignment[]
): TodayBreakdownData {
	const allPersonnel = personnelByGroup.flatMap((g) => g.personnel);

	// Personnel absent today (has at least one entry covering today)
	const absentIds = new Set(
		availabilityEntries.filter((e) => e.startDate <= today && e.endDate >= today).map((e) => e.personnelId)
	);

	const totalCount = allPersonnel.length;
	const presentCount = allPersonnel.filter((p) => !absentIds.has(p.id)).length;

	// Status counts for today
	const todayEntries = availabilityEntries.filter((e) => e.startDate <= today && e.endDate >= today);
	const statusCountMap = new Map<string, number>();
	for (const entry of todayEntries) {
		statusCountMap.set(entry.statusTypeId, (statusCountMap.get(entry.statusTypeId) ?? 0) + 1);
	}
	const statusCounts: StatusCount[] = statusTypes
		.filter((s) => (statusCountMap.get(s.id) ?? 0) > 0)
		.map((s) => ({ statusType: s, count: statusCountMap.get(s.id)! }));

	// Assignment coverage for today
	const todayAssignments = assignments.filter((a) => a.date === today);
	const assignmentCoverage: AssignmentCoverage[] = assignmentTypes.map((type) => {
		const assignment = todayAssignments.find((a) => a.assignmentTypeId === type.id);
		if (!assignment) {
			return { type, assigneeName: '', isAssigned: false };
		}
		let assigneeName: string;
		if (type.assignTo === 'personnel') {
			const person = allPersonnel.find((p) => p.id === assignment.assigneeId);
			assigneeName = person ? `${person.rank} ${person.lastName}` : assignment.assigneeId;
		} else {
			assigneeName = assignment.assigneeId;
		}
		return { type, assigneeName, isAssigned: true };
	});

	// Gaps: unassigned types + expiring statuses
	const gaps: string[] = [];
	for (const coverage of assignmentCoverage) {
		if (!coverage.isAssigned) {
			gaps.push(`No ${coverage.type.shortName} assigned today`);
		}
	}
	const expiringCount = availabilityEntries.filter((e) => e.endDate === today).length;
	if (expiringCount > 0) {
		gaps.push(expiringCount === 1 ? '1 status expires today' : `${expiringCount} statuses expire today`);
	}

	// Group strength
	const groupStrength: GroupStrength[] = personnelByGroup.map(({ group, personnel }) => ({
		group,
		total: personnel.length,
		present: personnel.filter((p) => !absentIds.has(p.id)).length
	}));

	return { totalCount, presentCount, statusCounts, assignmentCoverage, gaps, groupStrength };
}
