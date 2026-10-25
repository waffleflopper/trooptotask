import type { Personnel } from './personnel.types';
import type { PersonnelOpenFollowUps } from './personnelArtifact.types';
import type { PersonnelLeaderNote } from './personnelLeaderNote.types';
import type { PersonnelAttention } from './personnelReadiness.types';

export const ROSTER_PEEK_SECTIONS = ['identity', 'next7', 'attention', 'followUps', 'note'] as const;
export type RosterPeekSection = (typeof ROSTER_PEEK_SECTIONS)[number];

export const ROSTER_PEEK_DAYS = 7;
export const ROSTER_PEEK_FOLLOW_UPS = 5;

export interface RosterPeekValues {
	identity: { phone: string | null };
	next7: unknown;
	attention: PersonnelAttention;
	followUps: PersonnelOpenFollowUps;
	note: PersonnelLeaderNote | null;
}

export type RosterPeekRead<S extends RosterPeekSection = RosterPeekSection> =
	| { state: 'ready'; value: RosterPeekValues[S] }
	| { state: 'hidden' };

export function isRosterPeekSection(value: unknown): value is RosterPeekSection {
	return typeof value === 'string' && (ROSTER_PEEK_SECTIONS as readonly string[]).includes(value);
}

export type PeekChangeFields = Partial<Pick<Personnel, 'rank' | 'mos' | 'clinicRole' | 'groupId' | 'ets' | 'deros'>>;

const differs = (before: string | null | undefined, after: string | null | undefined) =>
	(before ?? null) !== (after ?? null);

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
