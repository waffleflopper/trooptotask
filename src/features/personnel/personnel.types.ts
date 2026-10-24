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

/** The fields a Training or Critical Tasks requirement reads to decide whether it applies. */
export type PersonnelRequirementPerson = Pick<Personnel, 'id' | 'rank' | 'mos' | 'clinicRole'>;

export interface PersonnelLookup {
	id: string;
	rank: string;
	lastName: string;
	firstName: string;
}
