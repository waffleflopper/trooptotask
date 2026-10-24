export interface Personnel {
	id: string;
	slug?: string;
	rank: string;
	lastName: string;
	firstName: string;
	mos: string;
	clinicRole: string;
	ets?: string | null;
	deros?: string | null;
	groupId: string | null;
	groupName: string;
	archivedAt?: string | null;
}

export type PersonnelRequirementPerson = Pick<Personnel, 'id' | 'rank' | 'mos' | 'clinicRole'>;

export interface PersonnelLookup {
	id: string;
	rank: string;
	lastName: string;
	firstName: string;
}
