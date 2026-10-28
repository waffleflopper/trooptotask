import type { Personnel } from './personnel.types';

export interface PersonnelExtendedInfo {
	dodId: string;
	bloodType: string;
	basd: string;
	dateOfRank: string;
	maritalStatus: string;
	maritalStatusDate: string;
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
	/** When the sheet was last saved; null before any save. */
	updatedAt: string | null;
	/** The saving member's label; null when unknown or the member has since left. */
	updatedBy: string | null;
}

export interface PersonnelChild {
	name: string;
	age: number | null;
}

/** What one Data sheet save answers. A rejected field is shown beside that field. */
export type PersonnelDataSheetSaveResult =
	| { saved: true; person: Personnel; extendedInfo: PersonnelExtendedInfo }
	| { saved: false; field: string; message: string };
