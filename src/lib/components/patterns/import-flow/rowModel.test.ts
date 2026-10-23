import { describe, expect, it } from 'vitest';
import { defineImportLane, questionKey, type LaneQuestion, type ImportReference } from './index';
import { applyEdits, buildSourceRows, ReviewMemo, reviewRows, sourceRowId, type SourceRow } from './rowModel';
import { personnelFile, personnelLane } from './importFlow.test-support';
import { detectLayout, type LoadedFile } from './workbookSource';

describe('row review', () => {
	it('splits Last, First and reports an unparseable name or invalid date inline', () => {
		const file: LoadedFile = {
			name: 'names',
			sheets: [
				{
					index: 0,
					name: 'HQ',
					hidden: false,
					rows: [
						['Last, First', 'Rank', 'ETS'],
						['Smith, Alex', 'SGT', '01MAY27'],
						['Jones', 'SGT', '31FEB27']
					]
				}
			]
		};
		const lane = personnelLane();
		const rows = buildSourceRows(file, detectLayout(file, lane), lane);
		const state = reviewRows(rows, lane, new Map(), new Set(), new ReviewMemo());
		expect(state.rows[0]).toMatchObject({ outcome: 'new', change: { name: 'Smith, Alex', ets: '2027-05-01' } });
		expect(state.rows[1].outcome).toBe('fix');
		if (state.rows[1].outcome !== 'fix') throw new Error('Expected fixes');
		expect([...new Set(state.rows[1].problems.map((problem) => problem.field))].sort()).toEqual([
			'ets',
			'firstName',
			'lastName'
		]);
		expect(state.commitBlocker).not.toBeNull();
	});
	it('shows a row the lane skips as Skipped with its reason and keeps it out of the commit', () => {
		const base = personnelLane();
		const lane = {
			...base,
			review: (input: Parameters<typeof base.review>[0]) =>
				input.values.lastName === 'Smith'
					? ({ outcome: 'skipped', reason: 'Nothing to import.' } as const)
					: base.review(input)
		};
		const file: LoadedFile = {
			name: 'names',
			sheets: [
				{
					index: 0,
					name: 'HQ',
					hidden: false,
					rows: [
						['Last name', 'First name', 'Rank'],
						['Smith', 'Alex', 'SGT'],
						['Jones', 'Pat', 'SGT']
					]
				}
			]
		};
		const rows = buildSourceRows(file, detectLayout(file, lane), lane);
		const state = reviewRows(rows, lane, new Map(), new Set(), new ReviewMemo());

		expect(state.rows[0]).toMatchObject({ outcome: 'skipped', reason: 'Nothing to import.' });
		expect(state.counts).toMatchObject({ new: 1, skipped: 1, fix: 0 });
		expect(state.commitBlocker).toBeNull();
	});
	it('groups repeated unknowns, resolves each distinct key once, and applies skip to every affected row', () => {
		const lookups: string[] = [];
		const reviews: string[] = [];
		const lane = personnelLane(
			(key) => lookups.push(key),
			(name) => reviews.push(name)
		);
		const file = personnelFile(42);
		const rows = buildSourceRows(file, detectLayout(file, lane), lane);
		const memo = new ReviewMemo();
		const initial = reviewRows(rows, lane, new Map(), new Set(), memo);
		expect(initial.counts).toEqual({ fix: 40, new: 2, update: 0, unchanged: 0, skipped: 0 });
		expect(initial.questions.map((question) => [question.subject, question.rowCount])).toEqual([['Sgt.', 40]]);
		expect(lookups).toEqual(['sgt.', 'sgt']);
		const skipped = reviewRows(
			rows,
			lane,
			new Map([[questionKey({ reference: 'rank', key: 'sgt.' }), { kind: 'skip' }]]),
			new Set(),
			memo
		);
		expect(skipped.counts).toEqual({ fix: 0, new: 2, update: 0, unchanged: 0, skipped: 40 });
		expect(skipped.changeCount).toBe(2);
		expect(skipped.commitBlocker).toBeNull();
		expect(skipped.questions[0].rowCount).toBe(40);
		expect(reviews).toEqual(['Person40, Alex', 'Person41, Alex']);
	});
	it('keeps untouched row identities across edits and only re-reviews rows whose inputs changed', () => {
		const reviewed: string[] = [];
		const lane = personnelLane(undefined, (name) => reviewed.push(name));
		const file = personnelFile(42);
		const rows = buildSourceRows(file, detectLayout(file, lane), lane);
		const memo = new ReviewMemo();
		reviewRows(rows, lane, new Map(), new Set(), memo);
		const edits = new Map([[rows[40].id, { mos: '68V' }]]);
		const edited = applyEdits(rows, edits);
		expect(edited[41]).toBe(rows[41]);
		expect(edited[40]).not.toBe(rows[40]);
		const first = reviewRows(edited, lane, new Map(), new Set(), memo);
		expect(first.rows[40]).toMatchObject({ outcome: 'new', change: { mos: '68V' } });
		expect(reviewed).toEqual(['Person40, Alex', 'Person41, Alex', 'Person40, Alex']);
		reviewed.length = 0;
		const second = reviewRows(
			applyEdits(rows, edits),
			lane,
			new Map([[questionKey({ reference: 'rank', key: 'sgt.' }), { kind: 'pick', optionId: 'SGT' }]]),
			new Set(),
			memo
		);
		expect(second.counts).toEqual({ fix: 0, new: 42, update: 0, unchanged: 0, skipped: 0 });
		expect(reviewed).toHaveLength(40);
		expect(reviewed[0]).toBe('Person0, Alex');
		expect(reviewed[39]).toBe('Person39, Alex');
		expect(second.rows[40]).toBe(first.rows[40]);
	});
	it('blocks all duplicate target keys until one row is skipped and includes every outcome in counts', () => {
		const file: LoadedFile = {
			name: 'duplicates',
			sheets: [
				{
					index: 0,
					name: 'HQ',
					hidden: false,
					rows: [
						['Last name', 'First name', 'Rank'],
						['Smith', 'Alex', 'SGT'],
						['Smith', 'Alex', 'SGT'],
						['Existing', 'Pat', 'CPL'],
						['Update', 'Sam', 'SGT']
					]
				}
			]
		};
		const lane = personnelLane();
		const rows = buildSourceRows(file, detectLayout(file, lane), lane);
		const memo = new ReviewMemo();
		expect(reviewRows(rows, lane, new Map(), new Set(), memo).counts).toEqual({
			fix: 2,
			new: 0,
			update: 1,
			unchanged: 1,
			skipped: 0
		});
		const resolved = reviewRows(rows, lane, new Map(), new Set([rows[1].id]), memo);
		expect(resolved.counts).toEqual({ fix: 0, new: 1, update: 1, unchanged: 1, skipped: 1 });
		expect(resolved.changeCount).toBe(2);
	});
	it('expands a wide sheet and asks once for a training column date; identity edits affect all its items', () => {
		const dateQuestion: LaneQuestion = {
			key: questionKey({ lane: 'date:cpr' }),
			title: 'Completion date',
			subject: 'CPR X marks',
			accepts: { kind: 'fill', valueKind: 'date' }
		};
		const columns = {
			person: { label: 'Person', kind: 'text', required: true, aliases: [] },
			training: { label: 'Training', kind: 'text', required: true, aliases: [] },
			result: { label: 'Result', kind: 'text', required: true, aliases: [] }
		} as const;
		const options = ['CPR', 'TCCC'].map((value) => ({ id: value, label: value, value }));
		const training: ImportReference<typeof columns, string> & { required: true; whenMissing: 'ask' } = {
			label: 'training',
			reads: ['training'],
			required: true,
			whenMissing: 'ask',
			options,
			key: (raw) => (raw.training ? { key: raw.training, display: raw.training } : null),
			find: (key) => {
				const option = options.find((item) => item.id === key);
				return option ? { kind: 'one', option } : { kind: 'none' };
			}
		};
		const lane = defineImportLane({
			id: 'training',
			noun: { one: 'record', other: 'records' },
			columns,
			pivot: { field: 'training', valueField: 'result', label: 'Training type' },
			references: { training },
			review({ values, ask, parseDate }) {
				const date = values.result === 'X' ? ask(dateQuestion) : undefined;
				const completion = parseDate(date?.kind === 'fill' ? date.value : values.result);
				if (!completion) return { outcome: 'fix', problems: [], questions: [dateQuestion] };
				return {
					outcome: 'new',
					key: `${values.person}:${values.training}`,
					change: { person: values.person, training: values.training, completion }
				};
			},
			commitChunk: async () => ({ kind: 'unconfirmed' }),
			exit: { href: '/', label: 'Back' }
		});
		const file: LoadedFile = {
			name: 'training',
			sheets: [
				{
					index: 0,
					name: 'HQ',
					hidden: false,
					rows: [
						['Person', 'CPR', 'TCCC'],
						['Smith', 'X', '01MAY27'],
						['Jones', 'X', '']
					]
				}
			]
		};
		const layout = detectLayout(file, lane);
		expect(layout.sheets[0].included).toBe(true);
		const rows = buildSourceRows(file, layout, lane);
		expect(rows.map((row) => [row.id, row.raw.training])).toEqual([
			['0:1:1', 'CPR'],
			['0:1:2', 'TCCC'],
			['0:2:1', 'CPR']
		]);
		expect(reviewRows(rows, lane, new Map(), new Set([sourceRowId(0, 1)]), new ReviewMemo()).counts).toEqual({
			fix: 1,
			new: 0,
			update: 0,
			unchanged: 0,
			skipped: 2
		});
		const memo = new ReviewMemo();
		const initial = reviewRows(rows, lane, new Map(), new Set(), memo);
		expect(initial.questions.map((question) => [question.key, question.rowCount])).toEqual([[dateQuestion.key, 2]]);
		const edits = applyEdits(rows, new Map([[rows[0].id, { person: 'Patel' }]]));
		expect(edits.map((row) => row.raw.person)).toEqual(['Patel', 'Patel', 'Jones']);
		const filled = reviewRows(
			edits,
			lane,
			new Map([[dateQuestion.key, { kind: 'fill', value: '2027-04-30' }]]),
			new Set(),
			memo
		);
		expect(filled.rows.map((row) => (row.outcome === 'new' ? row.change : null))).toEqual([
			{ person: 'Patel', training: 'CPR', completion: '2027-04-30' },
			{ person: 'Patel', training: 'TCCC', completion: '2027-05-01' },
			{ person: 'Jones', training: 'CPR', completion: '2027-04-30' }
		]);
		const rows1904 = buildSourceRows({ ...file, date1904: true }, layout, lane);
		const zeroDate = reviewRows(
			rows1904,
			lane,
			new Map([[dateQuestion.key, { kind: 'fill', value: '0' }]]),
			new Set(),
			new ReviewMemo()
		);
		expect(zeroDate.counts.fix).toBe(0);
		expect(zeroDate.rows[0]).toMatchObject({ outcome: 'new', change: { completion: '1904-01-01' } });
		const invalid = reviewRows(
			rows,
			lane,
			new Map([[dateQuestion.key, { kind: 'fill', value: 'bad' }]]),
			new Set(),
			memo
		);
		expect(invalid.counts.fix).toBe(2);
		const skipped = reviewRows(rows, lane, new Map([[dateQuestion.key, { kind: 'skip' }]]), new Set(), memo);
		expect(skipped.counts).toEqual({ fix: 0, new: 1, update: 0, unchanged: 0, skipped: 2 });
	});
	it('invalidates the reference cache for a new lane and refuses a missing picked option', () => {
		const file = personnelFile(1);
		const lane = personnelLane();
		const rows: readonly SourceRow[] = buildSourceRows(file, detectLayout(file, lane), lane);
		const memo = new ReviewMemo();
		const key = questionKey({ reference: 'rank', key: 'sgt.' });
		const state = reviewRows(rows, lane, new Map([[key, { kind: 'pick', optionId: 'deleted' }]]), new Set(), memo);
		expect(state.counts.fix).toBe(1);
		const replacement = {
			...lane,
			references: {
				rank: {
					...lane.references.rank,
					options: [...lane.references.rank.options, { id: 'deleted', label: 'Restored', value: 'CPL' }]
				}
			}
		};
		expect(
			reviewRows(rows, replacement, new Map([[key, { kind: 'pick', optionId: 'deleted' }]]), new Set(), memo).rows[0]
		).toMatchObject({ outcome: 'new', change: { rank: 'CPL' } });
	});
	it('requires a choice for ambiguous references and lets none-is-new resolve to a new record', () => {
		const base = personnelLane();
		const options = [
			{ id: 'a', label: 'Smith, Alex', hint: 'HQ', value: 'a' },
			{ id: 'b', label: 'Smith, Alex', hint: '1st PLT', value: 'b' }
		];
		const lane = defineImportLane({
			...base,
			commitChunk: async () => ({ kind: 'unconfirmed' }),
			references: {
				...base.references,
				person: {
					label: 'person',
					reads: ['lastName', 'firstName'],
					options: [{ id: 'c', label: 'Jones, Pat', hint: 'HQ', value: 'c' }],
					whenMissing: 'none-is-new',
					create: async () => ({ kind: 'created', option: { id: 'new', label: 'New person', value: 'new' } }),
					key: (raw) => (raw.lastName ? { key: raw.lastName, display: raw.lastName } : null),
					find: (key) => (key === 'Smith' ? { kind: 'many', candidates: options } : { kind: 'none' })
				}
			},
			review({ values, refs }) {
				return {
					outcome: 'new',
					key: refs.person?.id ?? values.lastName,
					change: { target: refs.person?.value ?? null }
				};
			}
		});
		const file: LoadedFile = {
			name: 'people.csv',
			sheets: [
				{
					index: 0,
					name: 'HQ',
					hidden: false,
					rows: [
						['Last name', 'First name', 'Rank'],
						['Smith', 'Alex', 'SGT'],
						['Jones', 'Pat', 'CPL']
					]
				}
			]
		};
		const rows = buildSourceRows(file, detectLayout(file, lane), lane);
		const memo = new ReviewMemo();
		const initial = reviewRows(rows, lane, new Map(), new Set(), memo);
		expect(initial.counts).toEqual({ fix: 1, new: 1, update: 0, unchanged: 0, skipped: 0 });
		expect(initial.questions[0].accepts).toEqual({ kind: 'pick', canCreate: false, options });
		expect(initial.rows[1]).toMatchObject({ outcome: 'new', change: { target: null } });
		const answered = reviewRows(
			rows,
			lane,
			new Map([[questionKey({ reference: 'person', key: 'Smith' }), { kind: 'pick', optionId: 'b' }]]),
			new Set(),
			memo
		);
		expect(answered.rows[0]).toMatchObject({ outcome: 'new', key: 'b', change: { target: 'b' } });
		const outsideCandidates = reviewRows(
			rows,
			lane,
			new Map([[questionKey({ reference: 'person', key: 'Smith' }), { kind: 'pick', optionId: 'c' }]]),
			new Set(),
			memo
		);
		expect(outsideCandidates.rows[0]).toMatchObject({ outcome: 'fix' });
	});
	it('lists a created option on every question for that reference', () => {
		const lane = personnelLane();
		const file: LoadedFile = {
			name: 'people.csv',
			sheets: [
				{
					index: 0,
					name: 'HQ',
					hidden: false,
					rows: [
						['Last name', 'First name', 'Rank'],
						['Smith', 'Alex', 'Sgt.'],
						['Jones', 'Pat', 'Serg']
					]
				}
			]
		};
		const rows = buildSourceRows(file, detectLayout(file, lane), lane);
		const memo = new ReviewMemo();
		reviewRows(rows, lane, new Map(), new Set(), memo);
		memo.addCreated('rank', { id: 'sergeant', label: 'Sergeant', value: 'SGT' });
		const answered = reviewRows(
			rows,
			lane,
			new Map([[questionKey({ reference: 'rank', key: 'sgt.' }), { kind: 'pick', optionId: 'sergeant' }]]),
			new Set(),
			memo
		);
		const serg = answered.questions.find(
			(question) => question.key === questionKey({ reference: 'rank', key: 'serg' })
		);
		expect(serg?.accepts).toEqual({
			kind: 'pick',
			canCreate: false,
			options: [
				{ id: 'SGT', label: 'SGT', value: 'SGT' },
				{ id: 'CPL', label: 'CPL', value: 'CPL' },
				{ id: 'sergeant', label: 'Sergeant', value: 'SGT' }
			]
		});
	});
});
