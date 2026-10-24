import type { PersonnelFollowUp } from './personnelArtifact.types';
import type { PersonnelLeaderNote } from './personnelLeaderNote.types';
import type { PersonnelAttention } from './personnelReadiness.types';

/** Each section is its own request, so a slow or failed source holds back only its section. */
export const ROSTER_PEEK_SECTIONS = ['identity', 'next7', 'attention', 'followUps', 'note'] as const;
export type RosterPeekSection = (typeof ROSTER_PEEK_SECTIONS)[number];

export const ROSTER_PEEK_DAYS = 7;

export interface RosterPeekValues {
	identity: { phone: string | null };
	/** The Calendar's window over the next seven days. Personnel cannot read Calendar types, so the route draws it. */
	next7: unknown;
	attention: PersonnelAttention;
	followUps: PersonnelFollowUp[];
	note: PersonnelLeaderNote | null;
}

/** A source the viewer may not read, or one the unit turned off, is hidden and its section is left out. */
export type RosterPeekRead<S extends RosterPeekSection = RosterPeekSection> =
	| { state: 'ready'; value: RosterPeekValues[S] }
	| { state: 'hidden' };

export function isRosterPeekSection(value: unknown): value is RosterPeekSection {
	return typeof value === 'string' && (ROSTER_PEEK_SECTIONS as readonly string[]).includes(value);
}
