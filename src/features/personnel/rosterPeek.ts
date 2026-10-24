import type { Personnel } from './personnel.types';
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

export type PeekChangeFields = Partial<Pick<Personnel, 'rank' | 'mos' | 'clinicRole' | 'groupId' | 'ets' | 'deros'>>;

const differs = (before: string | null | undefined, after: string | null | undefined) =>
	(before ?? null) !== (after ?? null);

/**
 * The sections a change to a Person leaves out of date. Group decides the Calendar assignments shown and the
 * requirements that apply; rank, MOS and duty role decide requirements; ETS and PCS/DEROS are loss items in Needs
 * attention. Fields absent from both sides count as unchanged.
 */
export function peekSectionsAffectedBy(before: PeekChangeFields, after: PeekChangeFields): RosterPeekSection[] {
	if (differs(before.groupId, after.groupId)) return ['next7', 'attention'];
	const attention =
		differs(before.rank, after.rank) ||
		differs(before.mos, after.mos) ||
		differs(before.clinicRole, after.clinicRole) ||
		differs(before.ets, after.ets) ||
		differs(before.deros, after.deros);
	return attention ? ['attention'] : [];
}
