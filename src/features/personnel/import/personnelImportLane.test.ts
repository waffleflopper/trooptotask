import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IsoDate } from '$lib/components/patterns/import-flow';
import type { Personnel } from '../personnel.types';
import { BUILT_IN_RANK_CATALOG } from '../rankCatalog';
import { lastFirstSplitter } from './personnelImportColumns';
import { createPersonnelImportLane, type PersonnelImportSource } from './personnelImportLane';

const groups = [
	{ id: 'g1', name: '1st Platoon', sortOrder: 0 },
	{ id: 'g2', name: '2nd Platoon', sortOrder: 1 }
];

function person(id: string, overrides: Partial<Personnel> = {}): Personnel {
	return {
		id,
		rank: 'SGT',
		lastName: 'Garcia',
		firstName: 'Luis',
		mos: '68W',
		clinicRole: '',
		ets: '2027-05-01',
		deros: null,
		groupId: 'g1',
		groupName: '1st Platoon',
		...overrides
	};
}

function lane(overrides: Partial<PersonnelImportSource> = {}) {
	return createPersonnelImportLane({
		orgId: 'org-1',
		orgUrlSegment: 'unit',
		personnel: [
			person('p1'),
			person('p2', { groupId: 'g2', groupName: '2nd Platoon', ets: null }),
			person('p3', { lastName: 'Smith', firstName: 'Ana', rank: 'SPC', groupId: null, groupName: '' })
		],
		groups,
		rankCatalog: BUILT_IN_RANK_CATALOG,
		canManageGroups: false,
		allowUnassigned: true,
		...overrides
	});
}

type Lane = ReturnType<typeof lane>;
type Raw = Partial<Record<keyof Lane['columns'], string>>;

function match(source: Lane, name: keyof Lane['references'], raw: Raw) {
	const reference = source.references[name];
	const lookup = reference.key(raw);
	return lookup ? reference.find(lookup.key) : null;
}

function resolve(source: Lane, raw: Raw) {
	const one = (name: keyof Lane['references']) => {
		const found = match(source, name, raw);
		return found?.kind === 'one' ? found.option : null;
	};
	return source.review({
		values: {
			rank: raw.rank ?? null,
			lastName: raw.lastName ?? '',
			firstName: raw.firstName ?? '',
			mos: raw.mos ?? null,
			clinicRole: raw.clinicRole ?? null,
			groupName: raw.groupName ?? null,
			ets: (raw.ets ?? null) as IsoDate | null,
			deros: (raw.deros ?? null) as IsoDate | null
		},
		refs: { person: one('person'), rank: one('rank'), group: one('group') } as never,
		ask: () => undefined,
		parseDate: (value) => value as IsoDate
	});
}

afterEach(() => vi.unstubAllGlobals());

describe('personnel import lane', () => {
	it('splits a Last, First column and drops a middle initial', () => {
		expect(lastFirstSplitter.split('Garcia, Luis A.')).toEqual({ lastName: 'Garcia', firstName: 'Luis' });
		expect(lastFirstSplitter.split('Garcia')).toBeNull();
	});

	it('matches people by name alone, uses the group to break a tie and asks when it cannot', () => {
		const source = lane();
		expect(match(source, 'person', { lastName: 'smith', firstName: 'ana' })).toMatchObject({
			kind: 'one',
			option: { id: 'p3' }
		});
		expect(match(source, 'person', { lastName: 'Garcia', firstName: 'Luis', groupName: '2nd PLT' })).toMatchObject({
			kind: 'one',
			option: { id: 'p2' }
		});
		const ambiguous = match(source, 'person', { lastName: 'Garcia', firstName: 'Luis' });
		expect(ambiguous?.kind === 'many' && ambiguous.candidates.map((option) => option.id)).toEqual(['p1', 'p2', 'new']);
		expect(match(source, 'person', { lastName: 'Nguyen', firstName: 'Kim' })).toEqual({ kind: 'none' });
	});

	it('reads ranks exactly and only suggests a lenient spelling', () => {
		const source = lane();
		expect(match(source, 'rank', { rank: 'sgt' })).toMatchObject({ kind: 'one', option: { id: 'SGT' } });
		expect(match(source, 'rank', { rank: 'Sgt.' })).toMatchObject({ kind: 'none', suggestion: { id: 'SGT' } });
		expect(match(source, 'rank', { rank: 'Captain-ish' })).toEqual({ kind: 'none' });
	});

	it('suggests an existing group for an abbreviation and offers creation only to group managers', () => {
		expect(match(lane(), 'group', { groupName: '2nd PLT' })).toMatchObject({
			kind: 'none',
			suggestion: { id: 'g2' }
		});
		expect(lane().references.group.create).toBeUndefined();
		expect(lane({ canManageGroups: true }).references.group.create).toBeTypeOf('function');
	});

	it('updates only the fields a row fills and differs on', () => {
		const result = resolve(lane(), { rank: 'SSG', lastName: 'Smith', firstName: 'Ana', mos: '', ets: '' });
		expect(result).toMatchObject({
			outcome: 'update',
			key: 'p3',
			change: { op: 'update', personnelId: 'p3', changes: { rank: 'SSG' } }
		});
		expect(resolve(lane(), { rank: 'SPC', lastName: 'Smith', firstName: 'Ana' }).outcome).toBe('unchanged');
	});

	it('requires a current rank for a new person but not for an update', () => {
		const source = lane();
		expect(resolve(source, { lastName: 'Nguyen', firstName: 'Kim' }).outcome).toBe('fix');
		expect(resolve(source, { rank: 'PFC', lastName: 'Nguyen', firstName: 'Kim' })).toMatchObject({
			outcome: 'new',
			change: { op: 'create', rank: 'PFC', lastName: 'Nguyen', firstName: 'Kim' }
		});
		expect(resolve(source, { lastName: 'Smith', firstName: 'Ana', mos: '25B' })).toMatchObject({
			outcome: 'update',
			change: { changes: { mos: '25B' } }
		});
	});

	it('keeps two new same-name people in different groups apart and pairs only a true in-file duplicate', () => {
		const source = lane({ personnel: [] });
		const newKey = (groupName: string, rank = 'SGT') => {
			const result = resolve(source, { rank, lastName: 'Garcia', firstName: 'Luis', groupName });
			return result.outcome === 'new' ? result.key : result.outcome;
		};
		expect(newKey('1st Platoon')).not.toBe(newKey('2nd Platoon'));
		expect(newKey('1st Platoon', 'SGT')).not.toBe(newKey('1st Platoon', 'SPC'));
		expect(newKey('1st Platoon')).toBe(newKey('1st Platoon'));
	});

	it('asks for a group on a new person when the user cannot add unassigned people', () => {
		const result = resolve(lane({ allowUnassigned: false }), { rank: 'PFC', lastName: 'Nguyen', firstName: 'Kim' });
		expect(result.outcome).toBe('fix');
	});

	it('maps server row errors back to the rows that sent them', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				Response.json({ created: [{}], updated: [], errors: [{ index: 1, message: 'Not in your scope' }] })
			)
		);
		const reply = await lane().commitChunk([
			{ op: 'create', rank: 'SGT', lastName: 'Nguyen', firstName: 'Kim' },
			{ op: 'update', personnelId: 'p3', changes: { mos: '68W' } },
			{ op: 'update', personnelId: 'p1', changes: { ets: '2028-01-01' } }
		]);
		expect(reply).toEqual({
			kind: 'saved',
			results: [{ kind: 'added' }, { kind: 'failed', reason: 'Not in your scope' }, { kind: 'updated' }]
		});
	});
});
