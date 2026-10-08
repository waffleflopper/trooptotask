import type { AvailabilityEntry } from '$features/calendar/contracts';
import type { Personnel } from '$features/personnel/contracts';

export interface TodayAvailability {
	entries: AvailabilityEntry[];
	byPersonnelId: ReadonlyMap<string, AvailabilityEntry>;
}

export function indexTodayAvailability(
	availability: readonly AvailabilityEntry[],
	today: string,
	rosterById: ReadonlyMap<string, Personnel>
): TodayAvailability {
	const entries: AvailabilityEntry[] = [];
	const byPersonnelId = new Map<string, AvailabilityEntry>();
	for (const entry of availability) {
		if (entry.startDate > today || entry.endDate < today || !rosterById.has(entry.personnelId)) continue;
		entries.push(entry);
		if (!byPersonnelId.has(entry.personnelId)) byPersonnelId.set(entry.personnelId, entry);
	}
	return { entries, byPersonnelId };
}

export function indexById<T extends { id: string }>(items: readonly T[]): ReadonlyMap<string, T> {
	return new Map(items.map((item) => [item.id, item]));
}

export function groupPersonnelByGroupId(personnel: readonly Personnel[]): ReadonlyMap<string | null, Personnel[]> {
	const byGroupId = new Map<string | null, Personnel[]>();
	for (const person of personnel) {
		const groupPersonnel = byGroupId.get(person.groupId);
		if (groupPersonnel) groupPersonnel.push(person);
		else byGroupId.set(person.groupId, [person]);
	}
	return byGroupId;
}
