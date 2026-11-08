import { formatDayMonthYear } from '$lib/utils/dates';
import type { PersonnelBulkField, PersonnelFieldChange } from './contracts';
import type { Personnel } from './personnel.types';

export const PERSONNEL_BULK_FIELDS: ReadonlyArray<{ field: PersonnelBulkField; label: string }> = [
	{ field: 'rank', label: 'Rank' },
	{ field: 'mos', label: 'MOS' },
	{ field: 'clinicRole', label: 'Duty role' },
	{ field: 'ets', label: 'ETS' }
];

export function personnelBulkFieldLabel(field: PersonnelBulkField): string {
	return PERSONNEL_BULK_FIELDS.find((entry) => entry.field === field)?.label ?? field;
}

/** The Person's saved value, or '' when there is none. */
export function personnelFieldValue(person: Personnel, field: PersonnelBulkField): string {
	return (person[field] ?? '').trim();
}

export function personnelFieldDisplay(field: PersonnelBulkField, value: string): string {
	if (!value) return 'None';
	return field === 'ets' ? formatDayMonthYear(value) : value;
}

export function withFieldChange(person: Personnel, change: PersonnelFieldChange): Personnel {
	switch (change.field) {
		case 'rank':
			return { ...person, rank: change.value };
		case 'mos':
			return { ...person, mos: change.value };
		case 'clinicRole':
			return { ...person, clinicRole: change.value };
		case 'ets':
			return { ...person, ets: change.value };
	}
}

export interface PersonnelFieldPlan {
	/** People whose value differs, in the order given. */
	changing: Array<{ person: Personnel; from: string }>;
	alreadySet: number;
}

export function planPersonnelFieldChange(
	people: readonly Personnel[],
	change: PersonnelFieldChange
): PersonnelFieldPlan {
	const changing: PersonnelFieldPlan['changing'] = [];
	for (const person of people) {
		const from = personnelFieldValue(person, change.field);
		if (from !== change.value) changing.push({ person, from });
	}
	return { changing, alreadySet: people.length - changing.length };
}
