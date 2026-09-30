import type { ColumnDef } from '$lib/utils/columnMapping';

export const PERSONNEL_COLUMNS: ColumnDef[] = [
	{
		key: 'rank',
		label: 'Rank',
		required: true,
		aliases: ['rank', 'grade', 'pay grade', 'paygrade']
	},
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
		key: 'mos',
		label: 'MOS',
		required: false,
		aliases: ['mos', 'military occupational specialty', 'job', 'afsc']
	},
	{
		key: 'clinicRole',
		label: 'Duty Role',
		required: false,
		aliases: ['duty role', 'role', 'clinic role', 'duty position', 'position', 'billet']
	},
	{
		key: 'groupName',
		label: 'Group',
		required: false,
		aliases: ['group', 'unit', 'section', 'team', 'platoon', 'squad']
	},
	{
		key: 'ets',
		label: 'ETS',
		required: false,
		aliases: ['ets']
	},
	{
		key: 'deros',
		label: 'PCS / DEROS',
		required: false,
		aliases: ['deros', 'pcs / deros', 'pcs/deros', 'pcs deros']
	}
];
