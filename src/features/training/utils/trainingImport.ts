import { formatToday } from '$lib/utils/dates';
import { parseDateString } from '$lib/utils/csvParser';
import type { ColumnDef } from '$lib/utils/columnMapping';

export function parseTrainingStatus(value: string): {
	type: 'date' | 'completed' | 'exempt' | 'skip' | 'invalid';
	date: string | null;
	raw: string;
} {
	const raw = value;
	const v = value.trim().toLowerCase();

	if (['exempt', 'exempted', 'e'].includes(v)) {
		return { type: 'exempt', date: null, raw };
	}

	if (['yes', 'y', 'true', '1', 'complete', 'completed', 'done', 'x'].includes(v)) {
		const today = formatToday();
		return { type: 'completed', date: today, raw };
	}

	if (['no', 'n', 'false', '0', 'incomplete', 'pending', ''].includes(v)) {
		return { type: 'skip', date: null, raw };
	}

	const date = parseDateString(value);
	if (date) {
		return { type: 'date', date, raw };
	}

	return { type: 'invalid', date: null, raw };
}

export const TRAINING_COLUMNS: ColumnDef[] = [
	{
		key: 'lastName',
		label: 'Last Name',
		required: true,
		aliases: ['last name', 'lastname', 'last', 'surname', 'family name']
	},
	{
		key: 'firstName',
		label: 'First Name',
		required: true,
		aliases: ['first name', 'firstname', 'first', 'given name']
	},
	{
		key: 'trainingType',
		label: 'Training Type',
		required: true,
		aliases: ['training', 'training type', 'type', 'course', 'certification']
	},
	{
		key: 'status',
		label: 'Date / Status',
		required: true,
		aliases: ['date', 'date / status', 'date/status', 'completion date', 'completed', 'date completed', 'status']
	},
	{
		key: 'notes',
		label: 'Notes',
		required: false,
		aliases: ['notes', 'comments', 'remarks']
	}
];
