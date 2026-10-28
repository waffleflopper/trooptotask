import type { PersonnelFollowUp, PersonnelArchivedArtifact } from './personnelArtifact.types';
import type { PersonnelLeaderNote } from './personnelLeaderNote.types';
import type { PersonnelExtendedInfo } from './personnelExtendedInfo.types';
import type { Personnel } from './personnel.types';
import type { PersonnelAttention } from './personnelReadiness.types';

export interface PersonnelDetailHeader {
	person: Personnel;
	dodId: string | null;
	basd: string | null;
	dateOfRank: string | null;
}

export interface PersonnelDetailTabCounts {
	log: number;
	archived: number;
}

export interface PersonnelDetailLayoutStreams {
	availabilityToday: Promise<PersonnelAvailabilityToday | null>;
	tabCounts: Promise<PersonnelDetailTabCounts | null>;
	readinessBadge: Promise<PersonnelAttention['readinessBadge'] | null>;
}

/** The newest notes and how many active notes the Soldier has in all. */
export interface PersonnelLogNotes {
	notes: PersonnelLeaderNote[];
	total: number;
}

export interface PersonnelLogPageData {
	followUps: Promise<PersonnelFollowUp[]>;
	notes: Promise<PersonnelLogNotes>;
}

export interface PersonnelDataSheetPageData {
	/** Null until the Soldier's sheet is first saved. */
	dataSheet: Promise<PersonnelExtendedInfo | null>;
}

export interface PersonnelArchivedPageData {
	archived: Promise<PersonnelArchivedArtifact[]>;
}

/** Today's Calendar status for the header pill: present, or the status the Person is away on. */
export interface PersonnelAvailabilityToday {
	value: string;
	detail: string;
	tone: 'good' | 'watch';
}
