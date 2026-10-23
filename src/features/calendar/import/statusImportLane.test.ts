import { afterEach, describe, expect, it, vi } from 'vitest';
import { lastFirstSplitter, rosterPersonReference } from '$features/personnel';
import type { Personnel } from '$features/personnel/contracts';
import { ImportSession, questionKey } from '$lib/components/patterns/import-flow';
import type { AvailabilityEntry, StatusType } from '../contracts';
import { createStatusImportLane, type StatusImportColumns, type StatusImportSource } from './statusImportLane';

function person(id: string, overrides: Partial<Personnel> = {}): Personnel {
	return {
		id,
		rank: 'SGT',
		lastName: 'Diaz',
		firstName: 'Renata',
		mos: '68W',
		clinicRole: '',
		groupId: 'g1',
		groupName: '1st Platoon',
		...overrides
	};
}

function status(id: string, name: string, shortLabel: string | null = null): StatusType {
	return { id, name, color: '#4a5568', textColor: '#ffffff', shortLabel, sortOrder: 0 };
}

const leave = status('leave', 'Leave', 'LV');
const appointment = status('appt', 'Appointment');
const tdy = status('tdy', 'TDY');
const OVERLAP = questionKey({ lane: 'overlap' });
const IN_FILE = questionKey({ lane: 'in-file-overlap' });

function entry(id: string, overrides: Partial<AvailabilityEntry> = {}): AvailabilityEntry {
	return {
		id,
		personnelId: 'diaz',
		statusTypeId: 'leave',
		startDate: '2026-11-05',
		endDate: '2026-11-12',
		note: null,
		...overrides
	};
}

const roster = [
	person('diaz'),
	person('castillo', { rank: 'SPC', lastName: 'Castillo', firstName: 'Mateo' }),
	person('banks-pfc', { rank: 'PFC', lastName: 'Banks', firstName: 'Tamara' }),
	person('banks-sgt', { rank: 'SGT', lastName: 'Banks', firstName: 'Tamara', groupName: '2nd Platoon' })
];

function source({
	personnel = roster,
	...overrides
}: Partial<StatusImportSource> & { personnel?: Personnel[] } = {}): StatusImportSource {
	return {
		orgId: 'org-1',
		orgUrlSegment: 'unit',
		person: rosterPersonReference<StatusImportColumns>(personnel),
		nameSplitter: lastFirstSplitter<StatusImportColumns>(),
		statusTypes: [leave, appointment, tdy],
		entries: [],
		loaded: [],
		reloadEntries: async () => {},
		...overrides
	};
}

async function reviewed(csv: string, from: StatusImportSource = source()) {
	const lane = createStatusImportLane(from);
	const session = new ImportSession(() => lane);
	await session.chooseFile([new File([csv], 'statuses.csv')]);
	session.goTo('review');
	await vi.waitFor(() => expect(session.phase.step).toBe('review'));
	return session;
}

function changes(session: Awaited<ReturnType<typeof reviewed>>) {
	return session.review.rows.map((row) =>
		row.outcome === 'new' || row.outcome === 'update'
			? { outcome: row.outcome, change: row.change }
			: row.outcome === 'fix'
				? { outcome: row.outcome, problems: row.problems.map((problem) => problem.message) }
				: { outcome: row.outcome }
	);
}

const HEADER = 'Name,Status,From,To,Note';

afterEach(() => vi.unstubAllGlobals());

describe('calendar status import lane', () => {
	it('reads Last, First names and adds a status that touches nothing on the calendar', async () => {
		const session = await reviewed(`${HEADER}\n"Diaz, Renata",Leave,11/20/2026,2026-11-30,Thanksgiving`);
		expect(changes(session)).toEqual([
			{
				outcome: 'new',
				change: {
					personnelId: 'diaz',
					statusTypeId: 'leave',
					startDate: '2026-11-20',
					endDate: '2026-11-30',
					note: 'Thanksgiving',
					overlap: 'none'
				}
			}
		]);
	});

	it('asks once for an unknown status used by many rows and applies the answer to all of them', async () => {
		const session = await reviewed(
			`${HEADER}\n"Diaz, Renata",TDY - NTC,2026-11-14,2026-12-10,\n"Castillo, Mateo",TDY - NTC,2026-11-14,2026-12-10,\n"Banks, Tamara",TDY - NTC,2026-11-14,2026-12-10,`,
			source({
				personnel: [
					person('diaz'),
					person('castillo', { lastName: 'Castillo', firstName: 'Mateo' }),
					person('banks', { lastName: 'Banks', firstName: 'Tamara' })
				]
			})
		);
		const key = questionKey({ reference: 'status', key: 'tdy - ntc' });
		expect(session.review.questions).toEqual([
			expect.objectContaining({ key, title: 'Unknown status', subject: 'TDY - NTC', rowCount: 3 })
		]);
		session.answer(key, { kind: 'pick', optionId: 'tdy' });
		expect(session.review.counts).toMatchObject({ new: 3, fix: 0 });
		expect(changes(session).map((row) => row.change?.statusTypeId ?? null)).toEqual(['tdy', 'tdy', 'tdy']);
	});

	it('suggests the status a short code stands for', async () => {
		const session = await reviewed(
			`${HEADER}\n"Diaz, Renata",LV,2026-11-20,2026-11-21,\n"Diaz, Renata",APPT,2026-11-25,2026-11-25,`
		);
		expect(
			session.review.questions.map((question) => [
				question.subject,
				question.accepts.kind === 'pick' ? question.accepts.suggested : null
			])
		).toEqual([
			['LV', 'leave'],
			['APPT', 'appt']
		]);
	});

	it('asks which person for a shared name with only the namesakes, and Rank settles it', async () => {
		const session = await reviewed(
			`Rank,Last name,First name,Status,From,To\n,Banks,Tamara,Leave,2026-11-20,2026-11-21\nSGT,Banks,Tamara,Leave,2026-11-22,2026-11-23`
		);
		expect(session.review.questions).toEqual([
			expect.objectContaining({
				title: 'Which person?',
				subject: 'Banks, Tamara',
				rowCount: 1,
				accepts: expect.objectContaining({
					canCreate: false,
					options: [
						expect.objectContaining({ id: 'banks-pfc', label: 'PFC Banks, Tamara' }),
						expect.objectContaining({ id: 'banks-sgt', label: 'SGT Banks, Tamara' })
					]
				})
			})
		]);
		expect(changes(session)[1]).toMatchObject({ outcome: 'new', change: { personnelId: 'banks-sgt' } });
	});

	it('offers the whole roster for a name it cannot find', async () => {
		const session = await reviewed(`${HEADER}\n"Diaz, Renatta",Leave,2026-11-20,2026-11-21,`);
		const [question] = session.review.questions;
		expect(question.title).toBe('Unknown person');
		expect(question.accepts.kind === 'pick' && question.accepts.options.map((option) => option.id)).toEqual([
			'diaz',
			'castillo',
			'banks-pfc',
			'banks-sgt'
		]);
	});

	it('flags an end date before the start date on the To cell', async () => {
		const session = await reviewed(`${HEADER}\n"Diaz, Renata",Leave,2026-11-20,2026-11-02,`);
		expect(session.review.rows[0]).toMatchObject({ outcome: 'fix', problems: [{ field: 'endDate' }] });
		session.editCell(session.sourceRows[0].id, 'endDate', '2026-11-22');
		expect(session.review.rows[0].outcome).toBe('new');
	});

	it('leaves an entry already on the calendar unchanged, whatever its note', async () => {
		const session = await reviewed(
			`${HEADER}\n"Diaz, Renata",Leave,2026-11-05,2026-11-12,Block leave`,
			source({ entries: [entry('saved-leave', { note: 'Approved' })] })
		);
		expect(changes(session)).toEqual([{ outcome: 'unchanged' }]);
		expect(session.commitBlocker).toEqual(expect.any(String));
	});

	it('asks one file-level question for partial overlaps and applies skip, keep or replace', async () => {
		const session = await reviewed(
			`${HEADER}\n"Diaz, Renata",Leave,2026-11-03,2026-11-09,\n"Castillo, Mateo",Appointment,2026-11-14,2026-11-14,\n"Banks, Tamara",TDY,2026-11-01,2026-11-02,`,
			source({
				personnel: [
					person('diaz'),
					person('castillo', { lastName: 'Castillo', firstName: 'Mateo' }),
					person('banks', { lastName: 'Banks', firstName: 'Tamara' })
				],
				entries: [
					entry('diaz-leave'),
					entry('castillo-tdy', {
						personnelId: 'castillo',
						statusTypeId: 'tdy',
						startDate: '2026-11-10',
						endDate: '2026-11-20'
					}),
					entry('castillo-appt', {
						personnelId: 'castillo',
						statusTypeId: 'appt',
						startDate: '2026-11-14',
						endDate: '2026-11-14'
					}),
					entry('banks-later', { personnelId: 'banks', startDate: '2026-11-03', endDate: '2026-11-04' })
				]
			})
		);
		expect(session.review.questions).toEqual([
			expect.objectContaining({ key: OVERLAP, title: 'Rows overlap the calendar', rowCount: 1 })
		]);
		expect(changes(session)).toEqual([
			{
				outcome: 'fix',
				problems: [
					expect.stringContaining('2026-11-05 → 2026-11-12 Leave'),
					expect.stringContaining('2026-11-05 → 2026-11-12 Leave')
				]
			},
			{ outcome: 'unchanged' },
			{ outcome: 'new', change: expect.objectContaining({ personnelId: 'banks', overlap: 'none' }) }
		]);

		session.answer(OVERLAP, { kind: 'skip' });
		expect(session.review.rows[0]).toMatchObject({ outcome: 'skipped', question: OVERLAP });

		session.answer(OVERLAP, { kind: 'pick', optionId: 'keep' });
		expect(changes(session)[0]).toEqual({
			outcome: 'new',
			change: expect.objectContaining({ personnelId: 'diaz', overlap: 'keep' })
		});

		session.answer(OVERLAP, { kind: 'pick', optionId: 'replace' });
		expect(session.review.rows[0]).toMatchObject({
			outcome: 'update',
			change: {
				personnelId: 'diaz',
				overlap: 'replace',
				replaces: [{ id: 'diaz-leave', statusTypeId: 'leave', startDate: '2026-11-05', endDate: '2026-11-12' }]
			},
			diff: [{ label: 'Replaces', before: '2026-11-05 → 2026-11-12 Leave', after: '' }]
		});
	});

	it('lists each entry a replacement removes on its own line, dates first', async () => {
		const session = await reviewed(
			`${HEADER}\n"Diaz, Renata",TDY,2026-11-01,2026-11-30,`,
			source({
				entries: [
					entry('diaz-leave'),
					entry('diaz-appt', { statusTypeId: 'appt', startDate: '2026-11-20', endDate: '2026-11-20' })
				]
			})
		);
		session.answer(OVERLAP, { kind: 'pick', optionId: 'replace' });
		expect(session.review.rows[0]).toMatchObject({
			outcome: 'update',
			diff: [
				{ label: 'Replaces', before: '2026-11-05 → 2026-11-12 Leave', after: '' },
				{ label: 'Replaces', before: '2026-11-20 → 2026-11-20 Appointment', after: '' }
			]
		});
	});

	it('loads saved entries across every date in the file before Review opens', async () => {
		const reloadEntries = vi.fn(async () => {});
		await reviewed(
			`${HEADER}\n"Diaz, Renata",Leave,2026-11-20,2026-11-30,\n"Diaz, Renata",Leave,2027-01-02,2026-12-30,\n"Diaz, Renata",Leave,2026-10-01,bad,`,
			source({ reloadEntries })
		);
		expect(reloadEntries).toHaveBeenCalledWith({ rangeStart: '2026-10-01', rangeEnd: '2027-01-02' });
	});

	it('reads saved entries in windows the calendar allows, skipping years the file never mentions', async () => {
		const reloadEntries = vi.fn(async () => {});
		await reviewed(
			[
				HEADER,
				'"Diaz, Renata",Leave,2026-12-20,2027-01-05,',
				'"Diaz, Renata",Leave,2062-03-01,2062-03-01,',
				'"Diaz, Renata",Leave,2026-01-10,2026-01-12,',
				'"Castillo, Mateo",TDY,2063-01-01,2064-06-30,'
			].join('\n'),
			source({ reloadEntries })
		);
		expect(reloadEntries.mock.calls).toEqual([
			[{ rangeStart: '2026-01-10', rangeEnd: '2027-01-05' }],
			[{ rangeStart: '2062-03-01', rangeEnd: '2062-03-01' }],
			[{ rangeStart: '2063-01-01', rangeEnd: '2064-01-01' }],
			[{ rangeStart: '2064-01-02', rangeEnd: '2064-06-30' }]
		]);
	});

	it('holds two rows for one person that overlap each other until the user keeps both or skips one', async () => {
		const session = await reviewed(
			`${HEADER}\n"Diaz, Renata",Leave,2026-11-20,2026-11-25,\n"Diaz, Renata",TDY,2026-11-24,2026-11-30,\n"Castillo, Mateo",Leave,2026-11-20,2026-11-25,`
		);
		const outcomes = () => session.review.rows.map((row) => row.outcome);
		expect(outcomes()).toEqual(['fix', 'fix', 'new']);
		expect(session.review.questions).toEqual([expect.objectContaining({ key: IN_FILE, rowCount: 2 })]);

		session.answer(IN_FILE, { kind: 'pick', optionId: 'keep' });
		expect(outcomes()).toEqual(['new', 'new', 'new']);

		session.answer(IN_FILE, { kind: 'skip' });
		expect(outcomes()).toEqual(['new', 'skipped', 'new']);

		session.answer(IN_FILE, null);
		session.setRowSkipped(session.sourceRows[0].id, true);
		expect(outcomes()).toEqual(['skipped', 'new', 'new']);
	});

	it('holds a replacement of an entry another row keeps until the user skips one of the two rows', async () => {
		const session = await reviewed(
			`${HEADER}\n"Diaz, Renata",Leave,2026-11-05,2026-11-12,\n"Diaz, Renata",TDY,2026-11-10,2026-11-15,`,
			source({ entries: [entry('diaz-leave')] })
		);
		const outcomes = () => session.review.rows.map((row) => row.outcome);
		const [kept, replacing] = session.sourceRows.map((row) => row.id);

		session.answer(OVERLAP, { kind: 'pick', optionId: 'keep' });
		expect(outcomes()).toEqual(['unchanged', 'new']);

		session.answer(OVERLAP, { kind: 'pick', optionId: 'replace' });
		expect(outcomes()).toEqual(['fix', 'fix']);

		session.setRowSkipped(replacing, true);
		expect(outcomes()).toEqual(['unchanged', 'skipped']);

		session.setRowSkipped(replacing, false);
		session.setRowSkipped(kept, true);
		expect(session.review.rows[1]).toMatchObject({
			outcome: 'update',
			change: { replaces: [{ id: 'diaz-leave' }] }
		});
	});

	it('reads only the dates a correction adds, once', async () => {
		const reloadEntries = vi.fn(async () => {});
		const session = await reviewed(`${HEADER}\n"Diaz, Renata",Leave,2026-11-20,2026-11-21,`, source({ reloadEntries }));
		const row = session.sourceRows[0].id;

		session.editCell(row, 'endDate', '2026-12-10');
		await vi.waitFor(() => expect(session.commitBlocker).toBeNull());
		session.editCell(row, 'endDate', '2026-12-05');
		await vi.waitFor(() => expect(session.commitBlocker).toBeNull());

		expect(reloadEntries.mock.calls).toEqual([
			[{ rangeStart: '2026-11-20', rangeEnd: '2026-11-21' }],
			[{ rangeStart: '2026-11-22', rangeEnd: '2026-12-10' }]
		]);
	});

	it('tells the server which rows from earlier requests a row may overlap', async () => {
		const bodies: { entries: Record<string, unknown>[] }[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init: RequestInit) => {
				const body = JSON.parse(String(init.body));
				bodies.push(body);
				return Response.json({ added: body.entries.length, removed: 0, errors: [] });
			})
		);
		const lane = createStatusImportLane(source());
		const base = { statusTypeId: 'leave', note: null, overlap: 'none' as const };
		await lane.commitChunk([
			{ ...base, personnelId: 'diaz', startDate: '2026-11-20', endDate: '2026-11-25' },
			{ ...base, personnelId: 'castillo', startDate: '2026-11-20', endDate: '2026-11-25' }
		]);
		await lane.commitChunk([
			{ ...base, personnelId: 'diaz', statusTypeId: 'tdy', startDate: '2026-11-24', endDate: '2026-11-30' }
		]);

		expect(bodies.map((body) => body.entries.map((entry) => entry.alongside))).toEqual([
			[undefined, undefined],
			[[{ statusTypeId: 'leave', startDate: '2026-11-20', endDate: '2026-11-25' }]]
		]);
	});

	it('splits a chunk so no request replaces more than 500 entries', async () => {
		const sizes: number[] = [];
		let failSecond = false;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init: RequestInit) => {
				const { entries } = JSON.parse(String(init.body));
				sizes.push(entries.length);
				if (failSecond && sizes.length === 2) return new Response(null, { status: 503 });
				return Response.json({ added: entries.length, removed: entries.length * 2, errors: [] });
			})
		);
		const lane = createStatusImportLane(source());
		const replaced = (index: number, half: number) => ({
			id: `saved-${index}-${half}`,
			statusTypeId: 'leave',
			startDate: '2026-11-20',
			endDate: '2026-11-20'
		});
		const rows = Array.from({ length: 251 }, (_, index) => ({
			personnelId: `person-${index}`,
			statusTypeId: 'tdy',
			startDate: '2026-11-20',
			endDate: '2026-11-20',
			note: null,
			overlap: 'replace' as const,
			replaces: [replaced(index, 0), replaced(index, 1)]
		}));

		expect(await lane.commitChunk(rows)).toEqual({
			kind: 'saved',
			results: Array.from({ length: 251 }, () => ({ kind: 'updated' }))
		});
		expect(sizes).toEqual([250, 1]);

		sizes.length = 0;
		failSecond = true;
		expect(await lane.commitChunk(rows)).toEqual({ kind: 'unconfirmed' });
	});

	it('creates a missing status type from the rail only for someone who can configure them', async () => {
		const created = status('ntc', 'TDY - NTC');
		const createStatusType = vi.fn(async () => created);
		const csv = `${HEADER}\n"Diaz, Renata",TDY - NTC,2026-11-14,2026-12-10,`;
		const key = questionKey({ reference: 'status', key: 'tdy - ntc' });

		const viewer = await reviewed(csv);
		expect(viewer.review.questions[0].accepts).toMatchObject({ canCreate: false });

		const manager = await reviewed(csv, source({ createStatusType }));
		expect(manager.review.questions[0].accepts).toMatchObject({ canCreate: true });
		expect(await manager.createOption(key, ' TDY - NTC ')).toBeNull();
		expect(createStatusType).toHaveBeenCalledWith('TDY - NTC');
		expect(changes(manager)).toEqual([{ outcome: 'new', change: expect.objectContaining({ statusTypeId: 'ntc' }) }]);
	});

	it('reuses a status type with the same name instead of creating a second one', async () => {
		const createStatusType = vi.fn(async () => status('dup', 'Leave'));
		const session = await reviewed(
			`${HEADER}\n"Diaz, Renata",Lve,2026-11-14,2026-11-15,`,
			source({ createStatusType })
		);
		await session.createOption(session.review.questions[0].key, 'leave');
		expect(createStatusType).not.toHaveBeenCalled();
		expect(changes(session)[0]).toMatchObject({ change: { statusTypeId: 'leave' } });
	});

	it('maps server row errors back to their rows and counts a replace as an update', async () => {
		const fetch = vi.fn(async () =>
			Response.json({ added: 1, removed: 1, errors: [{ index: 1, message: 'The calendar changed for this person.' }] })
		);
		vi.stubGlobal('fetch', fetch);
		const lane = createStatusImportLane(source());
		const base = { personnelId: 'diaz', statusTypeId: 'leave', note: null };
		const reply = await lane.commitChunk([
			{
				...base,
				startDate: '2026-11-03',
				endDate: '2026-11-09',
				overlap: 'replace',
				replaces: [{ id: 'diaz-leave', statusTypeId: 'leave', startDate: '2026-11-05', endDate: '2026-11-12' }]
			},
			{ ...base, startDate: '2026-12-01', endDate: '2026-12-02', overlap: 'none' }
		]);
		expect(fetch).toHaveBeenCalledWith(
			'/org/org-1/api/availability/import',
			expect.objectContaining({ method: 'POST' })
		);
		expect(reply).toEqual({
			kind: 'saved',
			results: [{ kind: 'updated' }, { kind: 'failed', reason: 'The calendar changed for this person.' }]
		});
	});

	it('reads back every date it wrote after the import', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json({ added: 2, removed: 0, errors: [] }))
		);
		const reloadEntries = vi.fn(async () => {});
		const lane = createStatusImportLane(source({ reloadEntries }));
		const base = { personnelId: 'diaz', statusTypeId: 'leave', note: null, overlap: 'none' as const };
		await lane.commitChunk([{ ...base, startDate: '2026-11-03', endDate: '2026-11-09' }]);
		await lane.commitChunk([{ ...base, startDate: '2027-02-01', endDate: '2027-02-03' }]);
		await lane.commitChunk([{ ...base, startDate: '2029-05-01', endDate: '2029-05-01' }]);
		await lane.afterCommit?.();
		expect(reloadEntries.mock.calls).toEqual([
			[{ rangeStart: '2026-11-03', rangeEnd: '2027-02-03' }],
			[{ rangeStart: '2029-05-01', rangeEnd: '2029-05-01' }]
		]);
	});
});
