/** The roster fields one action can set for many People. The client form and the server both read this table. */
export const BULK_FIELDS = {
	rank: { label: 'Rank', input: 'catalog' },
	mos: { label: 'MOS', input: 'text' },
	clinicRole: { label: 'Duty role', input: 'text' },
	ets: { label: 'ETS', input: 'date' }
} as const satisfies Record<string, { label: string; input: 'catalog' | 'text' | 'date' }>;

export type BulkField = keyof typeof BULK_FIELDS;

export const BULK_FIELD_KEYS = Object.keys(BULK_FIELDS) as [BulkField, ...BulkField[]];

export const PERSONNEL_FIELD_BATCH_LIMIT = 500;
export const PERSONNEL_FIELD_VALUE_MAX_LENGTH = 255;

export const FIELD_BATCH_UNCONFIRMED_MESSAGE = "We couldn't confirm the change. Reload to see what saved.";

/** What happened to one Person: saved, refused by access, gone or archived, or failed on the way. */
export type PersonnelFieldOutcome = 'updated' | 'refused' | 'unavailable' | 'failed';

export interface PersonnelFieldResult {
	id: string;
	outcome: PersonnelFieldOutcome;
	message?: string;
}

/** One result per requested Person. `value` is the normalized value every saved Person now has. */
export interface PersonnelFieldBatchResult {
	field: BulkField;
	value: string;
	results: PersonnelFieldResult[];
}
