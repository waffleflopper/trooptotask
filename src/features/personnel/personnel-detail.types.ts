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

export interface PersonnelDetailStreams {
	extendedInfo: Promise<PersonnelExtendedInfo | null>;
	counselingRecords: Promise<PersonnelCounselingRecord[]>;
	leaderNotes: Promise<PersonnelLeaderNote[]>;
	followUps: Promise<string[]>;
}
