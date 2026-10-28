export interface PersonnelSheetEditableValues {
	dod_id: string | null;
	blood_type: string | null;
	basd: string | null;
	date_of_rank: string | null;
	marital_status: string | null;
	marital_status_date: string | null;
	number_of_dependents: number | null;
	children: unknown;
	civilian_education: string | null;
	military_education: unknown;
	emergency_contact_name: string | null;
	emergency_contact_relationship: string | null;
	emergency_contact_phone: string | null;
	spouse_name: string | null;
	spouse_phone: string | null;
	vehicle_make_model: string | null;
	vehicle_plate: string | null;
	vehicle_color: string | null;
	personal_email: string | null;
	personal_phone: string | null;
	address_street: string | null;
	address_city: string | null;
	address_state: string | null;
	address_zip: string | null;
	/** The saving member's user id; readers resolve it to a label. */
	updated_by: string | null;
}
export class PersonnelDodIdConflict extends Error {
	constructor() {
		super('Another Person in this Organization already has that DoD ID.');
	}
}
export interface SavedPersonnelSheet extends Partial<PersonnelSheetEditableValues> {
	id: string;
	personnel_id: string;
	organization_id?: string;
	created_at?: string | null;
	updated_at?: string | null;
}
export interface PersonnelSheetPersistence {
	listSheetsForPerson(personnelId: string): Promise<SavedPersonnelSheet[]>;
	findSheetForPerson(personnelId: string): Promise<SavedPersonnelSheet | null>;
	createSheet(
		personnelId: string,
		values: PersonnelSheetEditableValues | { award_tracking_acknowledged_at: string }
	): Promise<SavedPersonnelSheet>;
	replaceEditableSheetFields(id: string, values: PersonnelSheetEditableValues): Promise<SavedPersonnelSheet>;
	setAwardAcknowledgedAt(id: string, value: string | null): Promise<void>;
}
export interface PersonnelCounselingExportFacts {
	date_conducted?: string | null;
	subject?: string | null;
	key_points?: string | null;
	plan_of_action?: string | null;
	status?: string | null;
	follow_up_date?: string | null;
	notes?: string | null;
}
export type PersonnelSheetExportFacts = Partial<
	Pick<
		PersonnelSheetEditableValues,
		| 'emergency_contact_name'
		| 'emergency_contact_relationship'
		| 'emergency_contact_phone'
		| 'spouse_name'
		| 'spouse_phone'
		| 'vehicle_make_model'
		| 'vehicle_plate'
		| 'vehicle_color'
		| 'personal_email'
		| 'personal_phone'
		| 'address_street'
		| 'address_city'
		| 'address_state'
		| 'address_zip'
	>
>;
export interface PersonnelWorkbookHistoryReader {
	listCounselingExportFacts(personnelId: string): Promise<PersonnelCounselingExportFacts[]>;
	listExtendedInfoExportFacts(personnelId: string): Promise<PersonnelSheetExportFacts[]>;
}
