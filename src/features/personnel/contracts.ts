import { z } from 'zod';

export {
	createRosterReadModel,
	formatRosterPersonDisplayName,
	matchesRosterSearch,
	rosterGroupFilterValue
} from './rosterReadModel';
export type {
	CreateRosterReadModelInput,
	PersonnelGroup,
	RosterGroupFilterOption,
	RosterReadModel,
	RosterReadModelView,
	RosterScopeSelection,
	RosterStatus,
	RosterViewOptions
} from './rosterReadModel';

/** JSON note returned by the current Personnel page, API and archive operations. */
export interface PersonnelLeaderNote {
	id: string;
	personnelId: string;
	/** Organization member label, stored author fallback, or Unknown leader. */
	author: string;
	/** YYYY-MM-DD, derived from createdAt. */
	date: string;
	text: string;
	/** Timestamp string. */
	createdAt: string;
	/** Timestamp string when archived; null when active. */
	archivedAt: string | null;
}

export const personnelLeaderNoteInputSchema = z.object({
	personnelId: z.string().min(1),
	text: z.string().trim().min(1, 'Leader note is required').max(4000)
});

export type PersonnelLeaderNoteInput = z.infer<typeof personnelLeaderNoteInputSchema>;
