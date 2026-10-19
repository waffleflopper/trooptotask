import type {
	PersonnelCounselingRecord,
	PersonnelDocument,
	PersonnelFollowUp,
	PersonnelArchivedArtifact
} from './personnelArtifact.types';
import type { PersonnelLeaderNote } from './personnelLeaderNote.types';
import type { PersonnelExtendedInfo } from './personnelExtendedInfo.types';
import type { Personnel } from './personnel.types';
import type { PersonnelAttention } from './personnelReadiness.types';

export interface PersonnelDetailHeader {
	person: Personnel;
	basd: string | null;
	dateOfRank: string | null;
}

export interface PersonnelDetailTabCounts {
	log: number;
	archived: number;
}

export interface PersonnelDetailLayoutStreams {
	availabilityToday: Promise<PersonnelReadinessLane | null>;
	tabCounts: Promise<PersonnelDetailTabCounts | null>;
	readinessBadge: Promise<PersonnelAttention['readinessBadge'] | null>;
}

export interface PersonnelCounselingsPageData {
	orgId: string;
	personnelId: string;
	title: string;
	emptyState: string;
	records: PersonnelCounselingRecord[];
}

export interface PersonnelDocumentsPageData {
	orgId: string;
	personnelId: string;
	title: string;
	emptyState: string;
	records: PersonnelDocument[];
}

/** The newest notes and how many active notes the Soldier has in all. */
export interface PersonnelLogNotes {
	notes: PersonnelLeaderNote[];
	total: number;
}

export interface PersonnelLogPageData {
	/** Open and completed follow-ups. */
	followUps: Promise<PersonnelFollowUp[]>;
	notes: Promise<PersonnelLogNotes>;
}

export interface PersonnelFilesPageData {
	counselings: PersonnelCounselingsPageData;
	documents: PersonnelDocumentsPageData;
}

export interface PersonnelDataSheetPageData {
	/** Null until the Soldier's sheet is first saved. */
	dataSheet: Promise<PersonnelExtendedInfo | null>;
}

export interface PersonnelArchivedPageData {
	archived: Promise<PersonnelArchivedArtifact[]>;
}

export type PersonnelReadinessLaneTone = 'good' | 'watch' | 'bad' | 'info' | 'neutral';

export interface PersonnelReadinessLane {
	label: string;
	value: string;
	detail: string;
	tone: PersonnelReadinessLaneTone;
}
