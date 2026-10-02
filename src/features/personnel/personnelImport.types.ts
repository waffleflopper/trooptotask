import type { Personnel } from './personnel.types';

export interface PersonnelImportRecord {
	rank: string;
	lastName: string;
	firstName: string;
	mos?: string | null;
	clinicRole?: string | null;
	groupName?: string | null;
	ets?: string | null;
	deros?: string | null;
}

export interface PersonnelImportInput {
	records: PersonnelImportRecord[];
}

export interface PersonnelBatchMessage {
	index: number;
	message: string;
}

export interface PersonnelImportResult {
	inserted: Personnel[];
	errors: PersonnelBatchMessage[];
}

export type PersonnelBackfillRecord = Omit<PersonnelImportRecord, 'mos' | 'clinicRole'>;

export interface PersonnelBackfillInput {
	records: PersonnelBackfillRecord[];
}

export interface PersonnelBackfillResult {
	matched: Array<{ index: number; personnelId: string }>;
	updated: Personnel[];
	skipped: PersonnelBatchMessage[];
	ambiguous: PersonnelBatchMessage[];
	errors: PersonnelBatchMessage[];
}
