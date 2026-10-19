import type {
	PersonnelCounselingRecord,
	PersonnelDocument,
	PersonnelFollowUp,
	PersonnelArchivedArtifact
} from './personnelArtifact.types';
import type { PersonnelLeaderNote } from './personnelLeaderNote.types';
import type { PersonnelExtendedInfo } from './personnelExtendedInfo.types';
import type { Personnel } from './personnel.types';

export interface PersonnelDetailHeader {
	person: Personnel;
	basd: string | null;
	dateOfRank: string | null;
}

/** Badge counts keyed by the detail tab that shows them. */
export interface PersonnelDetailTabCounts {
	log: number;
	archived: number;
}

/** Streamed into the detail layout so neither read delays the header. Null hides the item for the viewer. */
export interface PersonnelDetailLayoutStreams {
	availabilityToday: Promise<PersonnelReadinessLane | null>;
	tabCounts: Promise<PersonnelDetailTabCounts | null>;
}

export type PersonnelArtifactKind = 'follow-up' | 'counseling' | 'document' | 'note';

export interface PersonnelFollowUpsPageData {
	orgId: string;
	personnelId: string;
	title: string;
	emptyState: string;
	records: PersonnelFollowUp[];
}

export interface PersonnelNotesPageData {
	orgId: string;
	personnelId: string;
	title: string;
	emptyState: string;
	notes: PersonnelLeaderNote[];
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

export interface PersonnelLogPageData {
	followUps: PersonnelFollowUpsPageData;
	notes: PersonnelNotesPageData;
}

export interface PersonnelFilesPageData {
	counselings: PersonnelCounselingsPageData;
	documents: PersonnelDocumentsPageData;
}

export interface PersonnelArchivedArtifactsPageData {
	orgId: string;
	personnelId: string;
	title: string;
	emptyState: string;
	records: PersonnelArchivedArtifact[];
}

export type PersonnelReadinessLaneTone = 'good' | 'watch' | 'bad' | 'info' | 'neutral';

export type PersonnelReadinessLaneKey = 'availability' | 'training' | 'criticalTasks' | 'ratingScheme' | 'lossTracking';

export interface PersonnelReadinessLane {
	label: string;
	value: string;
	detail: string;
	tone: PersonnelReadinessLaneTone;
}

export type PersonnelReadinessLaneStreams = Record<PersonnelReadinessLaneKey, Promise<PersonnelReadinessLane>>;

export interface PersonnelDetailStreams {
	readinessLanes: PersonnelReadinessLaneStreams;
	extendedInfo: Promise<PersonnelExtendedInfo | null>;
	counselingRecords: Promise<PersonnelCounselingRecord[]>;
	documents: Promise<PersonnelDocument[]>;
	leaderNotes: Promise<PersonnelLeaderNote[]>;
	followUps: Promise<PersonnelFollowUp[]>;
}
