import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImportSession, type IsoDate } from '$lib/components/patterns/import-flow';
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
		dodIds: [],
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

function resolve(source: Lane, raw: Raw, pickedPerson?: Personnel) {
	const one = (name: keyof Lane['references']) => {
		const found = match(source, name, raw);
		return found?.kind === 'one' ? found.option : null;
	};
	return source.review({
		values: {
			dodId: raw.dodId ?? null,
			rank: raw.rank ?? null,
			lastName: raw.lastName ?? '',
			firstName: raw.firstName ?? '',
			mos: raw.mos ?? null,
			clinicRole: raw.clinicRole ?? null,
			groupName: raw.groupName ?? null,
			ets: (raw.ets ?? null) as IsoDate | null,
			deros: (raw.deros ?? null) as IsoDate | null
		},
		refs: {
			person: pickedPerson ? { id: pickedPerson.id, label: pickedPerson.lastName, value: pickedPerson } : one('person'),
			rank: one('rank'),
			group: one('group')
		} as never,
		ask: () => undefined,
		parseDate: (value) => value as IsoDate
	});
}

afterEach(() => vi.unstubAllGlobals());

describe('personnel import lane', () => {
	it.each(['DoD ID', 'dodid', 'dod', 'DoD ID number', 'EDIPI', 'EDIPI number'])(
		'maps the %s header and keeps a leading zero',
		async (header) => {
			const session = new ImportSession(() => lane({ personnel: [] }));
			await session.chooseFile([
				new File([`Last name,First name,Rank,${header}\nSynthetic,New,SGT,0123456789`], 'ids.csv')
			]);
			session.goTo('review');
			expect(session.review.rows).toMatchObject([
				{ outcome: 'new', change: { op: 'create', dodId: '0123456789', lastName: 'Synthetic' } }
			]);
		}
	);

	it('uses the DoD ID before the name, group, or rank when matching an active Person', () => {
		const source = lane({ dodIds: [{ personnelId: 'p1', dodId: '0123456789' }] });
		expect(
			match(source, 'person', {
				lastName: 'Smith',
				firstName: 'Ana',
				groupName: 'HQ',
				rank: 'PFC',
				dodId: '012-345 6789'
			})
		).toMatchObject({ kind: 'one', option: { id: 'p1' } });
	});

	it('requires a valid free ID and rejects one held by an archived Person', () => {
		const source = lane({ dodIds: [{ personnelId: 'archived', dodId: '0123456789' }] });
		for (const dodId of ['short', '0123456789']) {
			expect(resolve(source, { lastName: 'Synthetic', firstName: 'New', rank: 'PFC', dodId })).toMatchObject({
				outcome: 'fix',
				problems: [{ field: 'dodId' }]
			});
		}
		const activeSource = lane({ dodIds: [{ personnelId: 'p1', dodId: '0123456789' }] });
		expect(
			resolve(activeSource, { lastName: 'Smith', firstName: 'Ana', dodId: '0123456789' }, person('p3'))
		).toMatchObject({ outcome: 'fix', problems: [{ field: 'dodId' }] });
	});

	it('shows an ID-only diff and leaves equal or blank IDs unchanged', () => {
		const source = lane({ dodIds: [{ personnelId: 'p3', dodId: '0000000001' }] });
		expect(resolve(source, { lastName: 'Smith', firstName: 'Ana', dodId: '012-3456789' })).toEqual({
			outcome: 'update',
			key: 'p3',
			change: { op: 'update', personnelId: 'p3', changes: { dodId: '0123456789' } },
			diff: [{ label: 'DoD ID', before: '0000000001', after: '0123456789' }]
		});
		for (const dodId of ['', ' - ', '0000000001']) {
			expect(resolve(source, { lastName: 'Smith', firstName: 'Ana', dodId })).toEqual({
				outcome: 'unchanged',
				key: 'p3'
			});
		}
	});
	it('splits a Last, First column and drops a middle initial', () => {
		expect(lastFirstSplitter().split('Garcia, Luis A.')).toEqual({ lastName: 'Garcia', firstName: 'Luis' });
		expect(lastFirstSplitter().split('Garcia')).toBeNull();
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

	it('asks which namesake each rank means, suggesting the person who holds that rank', async () => {
		const source = lane({ personnel: [person('p1'), person('p2', { rank: 'SPC' })] });
		const session = new ImportSession(() => source);
		const csv = [
			'Last name,First name,Group,Rank,MOS',
			'Garcia,Luis,1st Platoon,SGT,25B',
			'Garcia,Luis,1st Platoon,SPC,11B'
		].join('\n');

		await session.chooseFile([new File([csv], 'namesakes.csv')]);
		session.goTo('review');

		expect(session.review.questions).toMatchObject([
			{ reference: 'person', rowCount: 1, accepts: { suggested: 'p1' } },
			{ reference: 'person', rowCount: 1, accepts: { suggested: 'p2' } }
		]);
		expect(session.review.rows).toMatchObject([{ outcome: 'fix' }, { outcome: 'fix' }]);
		const [sergeant, specialist] = session.review.questions;
		session.answer(sergeant.key, { kind: 'pick', optionId: 'p1' });
		session.answer(specialist.key, { kind: 'pick', optionId: 'p2' });
		expect(session.review.rows).toMatchObject([
			{ outcome: 'update', key: 'p1', change: { personnelId: 'p1', changes: { mos: '25B' } } },
			{ outcome: 'update', key: 'p2', change: { personnelId: 'p2', changes: { mos: '11B' } } }
		]);
		expect(session.commitBlocker).toBeNull();
	});

	it('keeps ambiguous ranks in separate questions and applies each answer only to its rank', async () => {
		const source = lane({ personnel: [person('p1'), person('p2', { rank: 'SPC' })] });
		const session = new ImportSession(() => source);
		const csv = ['Last name,First name,Group,Rank', 'Garcia,Luis,1st Platoon,SSG', 'Garcia,Luis,1st Platoon,PFC'].join(
			'\n'
		);

		await session.chooseFile([new File([csv], 'promotions.csv')]);
		session.goTo('review');

		expect(session.review.questions).toMatchObject([
			{ reference: 'person', rowCount: 1 },
			{ reference: 'person', rowCount: 1 }
		]);
		const [sergeant, privateFirstClass] = session.review.questions;
		session.answer(sergeant.key, { kind: 'pick', optionId: 'p1' });
		expect(session.review.rows).toMatchObject([
			{ outcome: 'update', change: { personnelId: 'p1', changes: { rank: 'SSG' } } },
			{ outcome: 'fix' }
		]);
		session.answer(privateFirstClass.key, { kind: 'pick', optionId: 'p2' });
		expect(session.review.rows).toMatchObject([
			{ outcome: 'update', change: { personnelId: 'p1', changes: { rank: 'SSG' } } },
			{ outcome: 'update', change: { personnelId: 'p2', changes: { rank: 'PFC' } } }
		]);
		expect(session.commitBlocker).toBeNull();
	});

	it('shares a person question for rows with the same name, group and unresolved rank', async () => {
		const source = lane({ personnel: [person('p1'), person('p2', { rank: 'SPC' })] });
		const session = new ImportSession(() => source);
		const csv = ['Last name,First name,Group,Rank', 'Garcia,Luis,1st Platoon,SSG', 'Garcia,Luis,1st Platoon,SSG'].join(
			'\n'
		);

		await session.chooseFile([new File([csv], 'duplicates.csv')]);
		session.goTo('review');

		expect(session.review.questions).toMatchObject([{ reference: 'person', rowCount: 2 }]);
		session.answer(session.review.questions[0].key, { kind: 'pick', optionId: 'p1' });
		expect(session.review.rows).toMatchObject([{ outcome: 'fix' }, { outcome: 'fix' }]);
		expect(session.commitBlocker).not.toBeNull();
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

	it('keeps same-name new people with different DoD IDs apart', () => {
		const source = lane({ personnel: [] });
		const newKey = (dodId: string) => {
			const result = resolve(source, {
				rank: 'SGT',
				lastName: 'Garcia',
				firstName: 'Luis',
				groupName: '1st Platoon',
				dodId
			});
			return result.outcome === 'new' ? result.key : result.outcome;
		};
		expect(newKey('0000000001')).not.toBe(newKey('0000000002'));
		expect(newKey('0000000001')).toBe(newKey('000-000 0001'));
	});

	it('asks for a group on a new person when the user cannot add unassigned people', () => {
		const result = resolve(lane({ allowUnassigned: false }), { rank: 'PFC', lastName: 'Nguyen', firstName: 'Kim' });
		expect(result.outcome).toBe('fix');
	});

	it('maps server row errors back to the rows that sent them', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				Response.json({
					created: [{}],
					updated: [],
					errors: [{ kind: 'failed', index: 1, message: 'Not in your scope' }]
				})
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

	it('stops before row 501 and reports Not confirmed when the server cannot confirm a write', async () => {
		const source = lane({ personnel: [] });
		const session = new ImportSession(() => source);
		const csv = [
			'Last name,First name,Rank',
			...Array.from({ length: 501 }, (_, index) => `Person${index},Synthetic,SGT`)
		].join('\n');
		await session.chooseFile([new File([csv], 'roster.csv')]);
		session.goTo('review');
		const request = vi.fn(async () =>
			Response.json({
				created: [],
				updated: [],
				errors: Array.from({ length: 500 }, (_, index) => ({
					kind: 'unconfirmed',
					index,
					message: 'Review the roster before retrying.'
				}))
			})
		);
		vi.stubGlobal('fetch', request);
		await session.commit();
		expect(session.phase).toMatchObject({
			step: 'done',
			receipt: { added: 0, failed: 0, unconfirmed: 500, notAttempted: 1, stopped: { kind: 'unconfirmed' } }
		});
		expect(request).toHaveBeenCalledTimes(1);
	});

	it('keeps confirmed updates and known failures when a create in the same chunk is unconfirmed', async () => {
		const source = lane({ personnel: [person('p1')] });
		const session = new ImportSession(() => source);
		const csv = [
			'Last name,First name,Rank',
			'Garcia,Luis,SSG',
			...Array.from({ length: 500 }, (_, index) => `Person${index},Synthetic,SGT`)
		].join('\n');
		await session.chooseFile([new File([csv], 'mixed-roster.csv')]);
		session.goTo('review');
		const request = vi.fn(async () =>
			Response.json({
				created: [],
				updated: [{}],
				errors: [
					{ kind: 'unconfirmed', index: 1, message: 'Check this person before retrying.' },
					{ kind: 'failed', index: 2, message: 'Not in your scope' }
				]
			})
		);
		vi.stubGlobal('fetch', request);

		await session.commit();

		expect(session.phase).toMatchObject({
			step: 'done',
			receipt: {
				added: 497,
				updated: 1,
				unchanged: 0,
				skipped: 0,
				failed: 1,
				unconfirmed: 1,
				notAttempted: 1,
				stopped: { kind: 'unconfirmed' }
			}
		});
		if (session.phase.step !== 'done') throw new Error('Import did not finish');
		expect(session.phase.receipt.notImported.map(({ row, reason }) => [row.raw.lastName, reason])).toEqual([
			['Person0', 'Check this person before retrying.'],
			['Person1', 'Not in your scope'],
			['Person499', 'Not attempted because an earlier chunk stopped the import.']
		]);
		expect(request).toHaveBeenCalledTimes(1);
	});
	it('matches people it just saved as the same person when the file is imported again before the roster reloads', async () => {
		const source = lane({ personnel: [person('p1')] });
		const session = new ImportSession(() => source);
		const csv = 'Last name,First name,Rank,Group\nNguyen,Kim,PFC,1st Platoon\nGarcia,Luis,SSG,1st Platoon';
		const saved = [person('p9', { lastName: 'Nguyen', firstName: 'Kim', rank: 'PFC' }), person('p1', { rank: 'SSG' })];
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json({ created: [saved[0]], updated: [saved[1]], errors: [] }))
		);

		await session.chooseFile([new File([csv], 'roster.csv')]);
		session.goTo('review');
		expect(session.review.counts).toMatchObject({ new: 1, update: 1 });
		await session.commit();
		expect(session.phase.step).toBe('done');

		session.goTo('file');
		await session.chooseFile([new File([csv], 'roster.csv')]);
		session.goTo('review');
		expect(session.review.counts).toMatchObject({ new: 0, update: 0, unchanged: 2 });
	});
});
