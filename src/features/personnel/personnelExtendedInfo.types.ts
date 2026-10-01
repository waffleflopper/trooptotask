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

interface PersonnelChild {
	name: string;
	age: number | null;
}
