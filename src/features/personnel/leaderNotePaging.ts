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
