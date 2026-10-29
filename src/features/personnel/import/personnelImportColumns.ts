import type { ColumnSplitter, ImportColumn, ImportColumns } from '$lib/components/patterns/import-flow';

export type PersonNameColumns = ImportColumns & Record<'lastName' | 'firstName', ImportColumn>;

export const personnelImportColumns = {
	dodId: {
		label: 'DoD ID',
		kind: 'text',
		aliases: ['dod id', 'dodid', 'dod', 'dod id number', 'edipi', 'edipi number'],
		example: '0123456789'
	},
	rank: {
		label: 'Rank',
		kind: 'text',
		aliases: ['rank', 'grade', 'pay grade', 'paygrade', 'rnk'],
		example: 'SGT',
		hint: 'Needed for new people.'
	},
	lastName: {
		label: 'Last name',
		kind: 'text',
		required: true,
		aliases: ['last name', 'lastname', 'last', 'surname', 'family name'],
		example: 'Garcia'
	},
	firstName: {
		label: 'First name',
		kind: 'text',
		required: true,
		aliases: ['first name', 'firstname', 'first', 'given name'],
		example: 'Luis'
	},
	mos: {
		label: 'MOS',
		kind: 'text',
		aliases: ['mos', 'military occupational specialty', 'job', 'afsc'],
		example: '68W'
	},
	clinicRole: {
		label: 'Duty role',
		kind: 'text',
		aliases: ['duty role', 'role', 'clinic role', 'duty position', 'position', 'billet'],
		example: 'Team leader'
	},
	groupName: {
		label: 'Group',
		kind: 'text',
		aliases: ['group', 'unit', 'section', 'team', 'platoon', 'plt', 'squad'],
		example: '1st Platoon',
		hint: 'Matched to your Groups by name.'
	},
	ets: { label: 'ETS', kind: 'date', aliases: ['ets', 'ets date'], example: '2027-05-01' },
	deros: {
		label: 'PCS / DEROS',
		kind: 'date',
		aliases: ['deros', 'pcs / deros', 'pcs/deros', 'pcs deros', 'pcs'],
		example: '2027-08-15'
	}
} as const;

export const lastFirstSplitter = <C extends PersonNameColumns>(): ColumnSplitter<C> => ({
	label: 'Last, First',
	aliases: ['name', 'full name', 'last first', 'last, first', 'last name, first name', 'soldier', 'member'],
	fills: ['lastName', 'firstName'],
	split(raw) {
		const text = raw.trim().replace(/\s+/g, ' ');
		const comma = text.indexOf(',');
		const [lastName, rest] =
			comma >= 0
				? [text.slice(0, comma).trim(), text.slice(comma + 1).trim()]
				: [text.split(' ')[0], text.split(' ').slice(1).join(' ')];
		const firstName = rest.replace(/ [A-Za-z]\.?$/, '').trim();
		return lastName && firstName ? ({ lastName, firstName } as Partial<Record<keyof C & string, string>>) : null;
	},
	join: (values) => {
		const { lastName, firstName }: Partial<Record<string, string>> = values;
		return `${lastName ?? ''}, ${firstName ?? ''}`;
	}
});
