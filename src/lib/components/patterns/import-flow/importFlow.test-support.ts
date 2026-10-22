import { defineImportLane, type ChunkReply, type ColumnSplitter, type ImportReference, type RowReview } from './types';
import type { LoadedFile } from './workbookSource';

export const personnelColumns = {
	lastName: { label: 'Last name', kind: 'text', required: true, aliases: ['last', 'surname'] },
	firstName: { label: 'First name', kind: 'text', required: true, aliases: ['first'] },
	rank: { label: 'Rank', kind: 'text', required: true, aliases: ['grade'] },
	group: { label: 'Group', kind: 'text', aliases: ['platoon'] },
	mos: { label: 'MOS', kind: 'text', aliases: ['specialty'] },
	ets: { label: 'ETS', kind: 'date', aliases: ['ets date'] }
} as const;

export const nameSplitter: ColumnSplitter<typeof personnelColumns> = {
	label: 'Last, First',
	aliases: ['name', 'last, first'],
	fills: ['lastName', 'firstName'],
	split(raw) {
		const [lastName, firstName] = raw.split(',').map((value) => value.trim());
		return lastName && firstName ? { lastName, firstName } : null;
	}
};

export interface PersonnelChange {
	name: string;
	rank: string;
	group: string | null;
	mos: string | null;
	ets: string | null;
}
export function personnelLane(onFind: (key: string) => void = () => {}, onReview: (name: string) => void = () => {}) {
	const options = ['SGT', 'CPL'].map((rank) => ({ id: rank, label: rank, value: rank }));
	const rank: ImportReference<typeof personnelColumns, string> & { required: true; whenMissing: 'ask' } = {
		label: 'rank',
		reads: ['rank'],
		required: true,
		whenMissing: 'ask',
		options,
		key: (raw) => (raw.rank ? { key: raw.rank.trim().toLowerCase(), display: raw.rank } : null),
		find(key) {
			onFind(key);
			const option = options.find((item) => item.id.toLowerCase() === key);
			return option ? { kind: 'one', option } : { kind: 'none' };
		}
	};
	return defineImportLane({
		id: 'personnel-fixture',
		noun: { one: 'person', other: 'people' },
		identity: {
			fields: ['lastName', 'firstName'],
			label: (raw) => [raw.lastName, raw.firstName].filter(Boolean).join(', ')
		},
		columns: personnelColumns,
		splitters: [nameSplitter],
		references: { rank },
		review({ values, refs }): RowReview<PersonnelChange> {
			const name = `${values.lastName}, ${values.firstName}`;
			onReview(name);
			const change: PersonnelChange = {
				name,
				rank: refs.rank.value,
				group: values.group,
				mos: values.mos,
				ets: values.ets
			};
			if (values.lastName === 'Existing') return { outcome: 'unchanged', key: name };
			if (values.lastName === 'Update')
				return {
					outcome: 'update',
					key: name,
					change,
					diff: [{ label: 'Rank', before: 'PFC', after: refs.rank.value }]
				};
			return { outcome: 'new', key: name, change };
		},
		commitChunk: async (changes: readonly PersonnelChange[]): Promise<ChunkReply> => ({
			kind: 'saved',
			results: changes.map(() => ({ kind: 'added' }))
		}),
		exit: { href: '/', label: 'Back' }
	});
}

export function personnelFile(rows: number): LoadedFile {
	return {
		name: 'personnel.csv',
		sheets: [
			{
				index: 0,
				name: 'HQ',
				hidden: false,
				rows: [
					['Last name', 'First name', 'Rank', 'Group', 'MOS', 'ETS'],
					...Array.from({ length: rows }, (_, index) => [
						`Person${index}`,
						'Alex',
						index < 40 ? 'Sgt.' : 'SGT',
						`PLT ${index % 4}`,
						'68W',
						'01MAY27'
					])
				]
			}
		]
	};
}
