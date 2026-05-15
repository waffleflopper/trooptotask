import type { Personnel } from '$lib/types';

export interface PersonnelDetailHeader {
	person: Personnel;
}

export type PersonnelDetailSubpageKey = 'follow-ups' | 'counselings' | 'documents' | 'notes';

export interface PersonnelDetailSubpageData {
	personnelId: string;
	section: PersonnelDetailSubpageKey;
	title: string;
	emptyState: string;
	records: [];
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

export interface PersonnelExtendedInfo {
	bloodType: string;
	basd: string;
	dateOfRank: string;
	maritalStatus: string;
	numberOfDependents: number | null;
	children: PersonnelChild[];
	civilianEducation: string;
	militaryEducation: string[];
	emergencyContactName: string;
	emergencyContactRelationship: string;
	emergencyContactPhone: string;
	spouseName: string;
	spousePhone: string;
	vehicleMakeModel: string;
	vehiclePlate: string;
	vehicleColor: string;
	personalEmail: string;
	personalPhone: string;
	addressStreet: string;
	addressCity: string;
	addressState: string;
	addressZip: string;
	address: string;
}

export interface PersonnelChild {
	name: string;
	age: number | null;
}

export interface PersonnelCounselingRecord {
	id: string;
	personnelId: string;
	dateConducted: string;
	title: string;
	summary?: string;
	status: 'uploaded' | 'needs-title' | 'archived';
	uploadedBy: string;
	filePath: string;
	createdAt: string;
}

export interface PersonnelDocument {
	id: string;
	personnelId: string;
	title: string;
	filePath: string;
	fileSizeBytes: number;
	contentType: string;
	uploadedBy: string;
	createdAt: string;
}

export interface PersonnelLeaderNote {
	id: string;
	personnelId: string;
	author: string;
	date: string;
	text: string;
	createdAt: string;
}

export type PersonnelReadinessLaneTone = 'good' | 'watch' | 'bad' | 'info' | 'neutral';

export type PersonnelReadinessLaneKey =
	| 'availability'
	| 'training'
	| 'criticalTasks'
	| 'dutyRoster'
	| 'ratingScheme'
	| 'lossTracking';

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
	followUps: Promise<string[]>;
}
