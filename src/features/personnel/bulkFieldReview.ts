import { formatDisplayDate } from '$lib/utils/dates';
import { BULK_FIELDS, type BulkField } from './personnelFieldBatch';
import type { Personnel } from './personnel.types';

export interface BulkFieldChange {
	id: string;
	name: string;
	from: string;
	to: string;
}

export interface BulkFieldReview {
	changes: BulkFieldChange[];
	/** People who already have the value. They are not sent. */
	unchanged: number;
}

const NONE = 'None';

export function bulkFieldValueOf(person: Personnel, field: BulkField): string {
	return person[field] ?? '';
}

export function displayBulkFieldValue(field: BulkField, value: string): string {
	if (!value) return NONE;
	return BULK_FIELDS[field].input === 'date' ? formatDisplayDate(value) : value;
}

/** The People whose value would change, with the value they have now and the one they would get. */
export function reviewBulkField(people: readonly Personnel[], field: BulkField, value: string): BulkFieldReview {
	const changes = people
		.filter((person) => bulkFieldValueOf(person, field) !== value)
		.map((person) => ({
			id: person.id,
			name: `${person.rank} ${person.lastName}, ${person.firstName}`,
			from: displayBulkFieldValue(field, bulkFieldValueOf(person, field)),
			to: displayBulkFieldValue(field, value)
		}));
	return { changes, unchanged: people.length - changes.length };
}
