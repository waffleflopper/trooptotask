import type {
	RosterSignalSlices,
	RosterSourceQuery,
	RosterSourceRead,
	RosterStatusType,
	TodayStatus
} from '$features/personnel/contracts';
import { shownEntryByPerson } from './dayStatuses';

type EntryTuple = [id: string, personnelId: string, statusTypeId: string, startDate: string];

export interface RosterPresenceRead {
	statusTypes: RosterStatusType[];
	today: RosterSourceRead<TodayStatus>;
}

/** Who is present on the viewer's day and who shows which status, for the whole roster in one statement. */
export function createSupabaseRosterPresenceSignals(slices: RosterSignalSlices) {
	return async (query: RosterSourceQuery): Promise<RosterPresenceRead> => {
		const read = (await slices('availability', query)) as {
			cohort: string[];
			statusTypes: RosterStatusType[];
			entries: EntryTuple[];
		};
		const shown = shownEntryByPerson(
			read.entries.map(([id, personnelId, statusTypeId, startDate]) => ({ id, personnelId, statusTypeId, startDate })),
			read.statusTypes
		);
		return {
			statusTypes: read.statusTypes,
			today: new Map(
				read.cohort.map((id): [string, TodayStatus] => {
					const entry = shown.get(id);
					return [id, entry ? { kind: 'away', statusTypeId: entry.statusTypeId } : { kind: 'present' }];
				})
			)
		};
	};
}
