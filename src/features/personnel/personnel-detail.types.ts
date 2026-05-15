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
	leaderNotes: string;
}

export interface PersonnelChild {
	name: string;
	age: number | null;
}

export interface PersonnelCounselingRecord {
	dateConducted: string;
	title: string;
	summary?: string;
	status: 'uploaded' | 'needs-title' | 'archived';
	uploadedBy: string;
	filePath: string;
}

export interface PersonnelLeaderNote {
	author: string;
	date: string;
	text: string;
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
	leaderNotes: Promise<PersonnelLeaderNote[]>;
	followUps: Promise<string[]>;
}
