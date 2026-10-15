import type { AssignmentType } from '$features/calendar/contracts';

export function calendarLaneTypes(types: readonly AssignmentType[]): AssignmentType[] {
	return types
		.filter((type) => type.showOnCalendar && !type.archivedAt)
		.sort((a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function calendarLaneIds(types: readonly AssignmentType[]): string[] {
	return calendarLaneTypes(types).map((type) => type.id);
}

export function sameLaneIds(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((id, index) => id === b[index]);
}
