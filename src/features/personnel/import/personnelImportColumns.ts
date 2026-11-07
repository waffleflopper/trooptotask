import type { ColumnSplitter, ImportColumn, ImportColumns } from '$lib/components/patterns/import-flow';
import type { RankCatalogEntry } from '../rankCatalog';

export type PersonNameColumns = ImportColumns & Record<'lastName' | 'firstName', ImportColumn>;

export const personnelImportColumns = {
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
	dodId: {
		label: 'DoD ID',
		kind: 'text',
		aliases: ['dod id', 'edipi', 'dodid', 'dod id number', 'dod', 'edipi number'],
		example: '0123456789'
	},
	mos: {
		label: 'MOS',
		kind: 'text',
		aliases: ['mos', 'pmos', 'military occupational specialty', 'job', 'afsc'],
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
		aliases: ['deros', 'pcs / deros', 'pcs/deros', 'pcs deros', 'pcs', 'pcs date'],
		example: '2027-08-15'
	}
} as const;

function splitLastFirst(raw: string): { lastName: string; firstName: string } | null {
	const text = raw.trim().replace(/\s+/g, ' ');
	const comma = text.indexOf(',');
	const [lastName, rest] =
		comma >= 0
			? [text.slice(0, comma).trim(), text.slice(comma + 1).trim()]
			: [text.split(' ')[0], text.split(' ').slice(1).join(' ')];
	const firstName = rest.replace(/ [A-Za-z]\.?$/, '').trim();
	return lastName && firstName ? { lastName, firstName } : null;
}

function leadingRankPattern(catalog: readonly Pick<RankCatalogEntry, 'code'>[]): RegExp | null {
	const codes = catalog
		.map((entry) => entry.code.trim().replace(/\s+/g, ' '))
		.filter(Boolean)
		.sort((a, b) => b.length - a.length)
		.map((code) => code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s'));
	return codes.length ? new RegExp(`^(${codes.join('|')})\\.?\\s+`, 'i') : null;
}

/** With a rank catalog, a leading rank in the name ("SGT Smith, John") is the row's rank, used when no Rank column fills it. */
export function lastFirstSplitter<C extends PersonNameColumns>(): ColumnSplitter<C>;
export function lastFirstSplitter<C extends PersonNameColumns & Record<'rank', ImportColumn>>(
	rankCatalog: readonly Pick<RankCatalogEntry, 'code'>[]
): ColumnSplitter<C>;
export function lastFirstSplitter<C extends PersonNameColumns>(
	rankCatalog?: readonly Pick<RankCatalogEntry, 'code'>[]
): ColumnSplitter<C> {
	const leadingRank = rankCatalog ? leadingRankPattern(rankCatalog) : null;
	return {
		label: 'Last, First',
		aliases: ['name', 'full name', 'last first', 'last, first', 'last name, first name', 'soldier', 'member'],
		fills: ['lastName', 'firstName'],
		...(leadingRank ? { fallbackFills: ['rank'] as unknown as readonly (keyof C & string)[] } : {}),
		split(raw) {
			const text = raw.trim().replace(/\s+/g, ' ');
			const rank = leadingRank?.exec(text);
			const withoutRank = rank ? splitLastFirst(text.slice(rank[0].length)) : null;
			const names = withoutRank ?? splitLastFirst(text);
			if (!names) return null;
			return (withoutRank && rank ? { ...names, rank: rank[1] } : names) as Partial<Record<keyof C & string, string>>;
		},
		join: (values) => {
			const { lastName, firstName }: Partial<Record<string, string>> = values;
			return `${lastName ?? ''}, ${firstName ?? ''}`;
		}
	};
}
