import type { PersonnelLeaderNote } from './personnelLeaderNote.types';

/** Portable sensitive Personnel artifact responses; raw export rows remain separate. */
export interface PersonnelCounselingRecord {
	id: string;
	personnelId: string;
	dateConducted: string;
	title: string;
	summary?: string;
	status: 'uploaded' | 'needs-title' | 'archived';
	/** Free text naming the leader who held the session; null when the uploader gave none. */
	conductedBy: string | null;
	uploadedBy: string;
	fileName: string;
	createdAt: string;
	archivedAt?: string | null;
	/** Organization member label; null when archived before attribution or by a Person archive. */
	archivedBy?: string | null;
}

/** Counseling coverage and the first page of records; older records page in through the list route. */
export interface PersonnelCounselingsRead {
	records: PersonnelCounselingRecord[];
	/** Active records, whatever the page. */
	total: number;
	/** The viewer's uploader label, prefilled as the next record's conductor. */
	uploaderLabel: string | null;
	/** `YYYY-MM` of every month in the 12-month window ending at the viewer's day that has a counseling. */
	coveredMonths: string[];
}

export interface PersonnelDocumentsRead {
	records: PersonnelDocument[];
	/** Active documents, whatever the page. */
	total: number;
	usedBytes: number;
	capBytes: number;
}

export interface PersonnelDocument {
	id: string;
	personnelId: string;
	title: string;
	fileName: string;
	fileSizeBytes: number;
	contentType: string;
	uploadedBy: string;
	createdAt: string;
	archivedAt?: string | null;
	archivedBy?: string | null;
}

export type PersonnelFollowUpStatus = 'open' | 'completed' | 'archived';

export interface PersonnelFollowUp {
	id: string;
	personnelId: string;
	title: string;
	notes: string;
	dueDate: string | null;
	status: PersonnelFollowUpStatus;
	createdBy: string;
	createdAt: string;
	updatedAt: string;
	completedAt: string | null;
	/** Organization member label; null while open or completed before attribution. */
	completedBy: string | null;
	archivedAt?: string | null;
	archivedBy?: string | null;
}

/** Lifecycle writes return only what a manager without sensitive reads may know. */
export interface PersonnelArtifactArchiveState {
	id: string;
	archivedAt: string | null;
}

export interface PersonnelFollowUpLifecycleState extends PersonnelArtifactArchiveState {
	status: PersonnelFollowUpStatus;
}

export type PersonnelArchivedArtifact =
	| ({ kind: 'follow-up' } & PersonnelFollowUp)
	| ({ kind: 'counseling' } & PersonnelCounselingRecord & { archivedAt: string | null })
	| ({ kind: 'document' } & PersonnelDocument & { archivedAt: string | null })
	| ({ kind: 'note' } & PersonnelLeaderNote & { archivedAt: string | null });
