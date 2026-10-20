import type { PersonnelLeaderNote } from './contracts';

/** The Log tab loads this many notes up front and this many more per "Show older notes" click. */
export const LEADER_NOTES_FIRST_PAGE = 5;
export const LEADER_NOTES_OLDER_PAGE = 20;

/** The query for the page of notes older than `oldest`. */
export function olderNotesQuery(oldest: Pick<PersonnelLeaderNote, 'createdAt' | 'id'>): string {
	return new URLSearchParams({
		limit: String(LEADER_NOTES_OLDER_PAGE),
		beforeCreatedAt: oldest.createdAt,
		beforeId: oldest.id
	}).toString();
}

const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?(?:Z|[+-](\d{2}):(\d{2}))?$/;

/** True for an ISO timestamp whose calendar date, clock time and UTC offset exist, which `Date.parse` alone does not check. Postgres refuses offsets past 15 hours. */
export function isCalendarTimestamp(value: string): boolean {
	const match = TIMESTAMP.exec(value);
	if (!match) return false;
	const [year, month, day, hour, minute, second = 0, offsetHour = 0, offsetMinute = 0] = match.slice(1).map(Number);
	if (hour > 23 || minute > 59 || second > 59 || offsetHour > 15 || offsetMinute > 59) return false;
	const date = new Date(Date.UTC(year, month - 1, day));
	return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
