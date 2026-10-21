import type { DailyAssignment } from '$features/calendar/contracts';

export function assignmentSlotKey(date: string, assignmentTypeId: string): string {
	return `${date}::${assignmentTypeId}`;
}

export function indexByPersonId<T extends { readonly personId: string }>(
	records: readonly T[]
): ReadonlyMap<string, T> {
	return new Map(records.map((record) => [record.personId, record]));
}

export function indexAssignmentsBySlot(assignments: readonly DailyAssignment[]): ReadonlyMap<string, DailyAssignment> {
	const bySlot = new Map<string, DailyAssignment>();
	for (const assignment of assignments) {
		const slot = assignmentSlotKey(assignment.date, assignment.assignmentTypeId);
		if (!bySlot.has(slot)) bySlot.set(slot, assignment);
	}
	return bySlot;
}

export function duplicateAssignmentSlot<T extends { readonly date: string; readonly assignmentTypeId: string }>(
	assignments: readonly T[]
): T | null {
	const seen = new Set<string>();
	for (const assignment of assignments) {
		const slot = assignmentSlotKey(assignment.date, assignment.assignmentTypeId);
		if (seen.has(slot)) return assignment;
		seen.add(slot);
	}
	return null;
}
