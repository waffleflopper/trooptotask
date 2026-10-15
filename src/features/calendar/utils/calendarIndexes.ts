import type { DailyAssignment } from '$features/calendar/contracts';

export function assignmentSlotKey(date: string, assignmentTypeId: string): string {
	return `${date}::${assignmentTypeId}`;
}

export function indexAssignmentsBySlot(assignments: readonly DailyAssignment[]): ReadonlyMap<string, DailyAssignment> {
	const bySlot = new Map<string, DailyAssignment>();
	for (const assignment of assignments) {
		const slot = assignmentSlotKey(assignment.date, assignment.assignmentTypeId);
		if (!bySlot.has(slot)) bySlot.set(slot, assignment);
	}
	return bySlot;
}
