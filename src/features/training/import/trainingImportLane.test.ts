import { afterEach, describe, expect, it, vi } from 'vitest';
import { lastFirstSplitter, rosterPersonReference } from '$features/personnel';
import type { Personnel } from '$features/personnel/contracts';
import { parseImportDate, type LaneQuestion } from '$lib/components/patterns/import-flow';
import { buildSourceRows, ReviewMemo, reviewRows } from '$lib/components/patterns/import-flow/rowModel';
import { detectLayout, type LoadedFile } from '$lib/components/patterns/import-flow/workbookSource';
import type { PersonnelTraining, TrainingType } from '../training.types';
import {
	createTrainingImportLane,
	type TrainingImportChange,
	type TrainingImportColumns,
	type TrainingImportSource
} from './trainingImportLane';

vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidate: vi.fn(async () => {}) }));

function person(id: string, rank: string, lastName: string, firstName: string, groupName: string): Personnel {
	return { id, rank, lastName, firstName, mos: '68W', clinicRole: '', groupId: null, groupName };
}

function type(id: string, name: string, overrides: Partial<TrainingType> = {}): TrainingType {
	return {
		id,
		name,
		description: null,
		expirationMonths: 24,
		warningDaysYellow: 60,
		warningDaysOrange: 30,
		appliesToRoles: [],
		appliesToMos: [],
		appliesToRanks: [],
		excludedRoles: [],
		excludedMos: [],
		excludedRanks: [],
		color: '#000000',
		sortOrder: 0,
		expirationDateOnly: false,
		canBeExempted: true,
		exemptPersonnelIds: [],
		isOptional: false,
		...overrides
	};
}

function completion(personnelId: string, trainingTypeId: string, completionDate: string, notes: string | null = null) {
	return {
		id: `${personnelId}-${trainingTypeId}`,
		personnelId,
		trainingTypeId,
		completionDate,
		expirationDate: null,
		notes,
		certificateUrl: null
	} satisfies PersonnelTraining;
}

function source(overrides: Partial<TrainingImportSource> = {}): TrainingImportSource {
	return {
		orgId: 'org-1',
		orgUrlSegment: 'unit',
		person: rosterPersonReference<TrainingImportColumns>([
			person('p1', 'SPC', 'Abernathy', 'Cole', '1st Platoon'),
			person('p2', 'SSG', 'Alvarez', 'Marisol', '2nd Platoon'),
			person('p3', 'PFC', 'Banks', 'Tamara', 'HQ')
		]),
		nameSplitter: lastFirstSplitter<TrainingImportColumns>(),
		trainingTypes: [
			type('t-cpr', 'CPR/BLS', { canBeExempted: false }),
			type('t-sharp', 'SHARP'),
			type('t-wq', 'Weapons Qual', { exemptPersonnelIds: ['p3'] })
		],
		trainings: [completion('p1', 't-cpr', '2026-03-11', 'Red Cross'), completion('p2', 't-sharp', '2026-01-14')],
		canConfigureRequirements: true,
		...overrides
	};
}

type Lane = ReturnType<typeof createTrainingImportLane>;
type Raw = Partial<Record<keyof Lane['columns'], string>>;

function match(lane: Lane, name: keyof Lane['references'], raw: Raw) {
	const reference = lane.references[name];
	const lookup = reference.key(raw);
	return lookup ? reference.find(lookup.key) : null;
}

function review(raw: Raw, { lane = createTrainingImportLane(source()), answers = {} as Record<string, string> } = {}) {
	const asked: LaneQuestion[] = [];
	const one = (name: keyof Lane['references']) => {
		const found = match(lane, name, raw);
		return found?.kind === 'one' ? found.option : null;
	};
	const result = lane.review({
		values: {
			rank: raw.rank ?? null,
			lastName: raw.lastName ?? '',
			firstName: raw.firstName ?? '',
			groupName: raw.groupName ?? null,
			training: raw.training ?? '',
			completed: raw.completed || null,
			note: raw.note ?? null
		},
		refs: { person: one('person'), training: one('training') } as never,
		ask: (question) => {
			asked.push(question);
			const value = answers[question.title];
			return value ? { kind: 'fill', value } : undefined;
		},
		parseDate: (value) => parseImportDate(value)
	});
	return { result, asked };
}

const abernathy = { lastName: 'Abernathy', firstName: 'Cole' };
const alvarez = { lastName: 'Alvarez', firstName: 'Marisol' };
const banks = { lastName: 'Banks', firstName: 'Tamara' };

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('training import lane', () => {
	it('records a dated cell as a completion with the note from its row', () => {
		expect(review({ ...abernathy, training: 'SHARP', completed: '14 Jan 26' }).result).toEqual({
			outcome: 'new',
			key: 'p1:t-sharp',
			shown: { completed: '2026-01-14' },
			change: {
				op: 'add',
				personnelId: 'p1',
				trainingTypeId: 't-sharp',
				completionDate: '2026-01-14',
				status: 'completed'
			}
		});
		expect(review({ ...alvarez, training: 'CPR/BLS', completed: '2026-06-02', note: 'Moved up' }).result).toMatchObject(
			{
				outcome: 'new',
				change: { personnelId: 'p2', trainingTypeId: 't-cpr', completionDate: '2026-06-02', notes: 'Moved up' }
			}
		);
	});

	it('matches a training column by name and only suggests the type for a near spelling', () => {
		const lane = createTrainingImportLane(source());
		expect(match(lane, 'training', { training: 'cpr / bls' })).toMatchObject({ kind: 'one', option: { id: 't-cpr' } });
		expect(match(lane, 'training', { training: 'Weapons Q' })).toMatchObject({
			kind: 'none',
			suggestion: { id: 't-wq' }
		});
		expect(match(lane, 'training', { training: 'Land Nav' })).toEqual({ kind: 'none' });
	});

	it('asks once per training for the date of X marks and saves that date, never today', () => {
		vi.useFakeTimers({ now: new Date('2026-10-22T12:00:00Z') });
		const lane = createTrainingImportLane(source());
		const cells: Raw[] = [
			{ ...abernathy, training: 'CPR/BLS', completed: 'X' },
			{ ...alvarez, training: 'CPR/BLS', completed: 'x' },
			{ ...banks, training: 'CPR/BLS', completed: '✓' },
			{ ...abernathy, training: 'SHARP', completed: 'yes' }
		];
		const unanswered = cells.map((cell) => review(cell, { lane }));
		expect(unanswered.map(({ result }) => result.outcome)).toEqual(['fix', 'fix', 'fix', 'fix']);
		expect(new Set(unanswered.map(({ asked }) => asked[0].key)).size).toBe(2);
		expect(unanswered.map(({ asked }) => asked[0].title)).toEqual([
			'Date for CPR/BLS X marks',
			'Date for CPR/BLS X marks',
			'Date for CPR/BLS X marks',
			'Date for SHARP X marks'
		]);

		const answers = { 'Date for CPR/BLS X marks': '2026-05-04' };
		expect(review(cells[1], { lane, answers }).result).toMatchObject({
			outcome: 'new',
			shown: { completed: '2026-05-04' },
			change: { personnelId: 'p2', trainingTypeId: 't-cpr', completionDate: '2026-05-04' }
		});
		expect(review(cells[0], { lane, answers }).result).toMatchObject({
			outcome: 'update',
			change: { completionDate: '2026-05-04' }
		});
		expect(review(cells[3], { lane, answers }).result.outcome).toBe('fix');
	});

	it('marks Exempt or N/A as an exemption, and refuses one the training type does not allow', () => {
		expect(review({ ...abernathy, training: 'SHARP', completed: 'Exempt' }).result).toMatchObject({
			outcome: 'new',
			shown: { completed: 'Exempt' },
			change: { op: 'add', personnelId: 'p1', trainingTypeId: 't-sharp', completionDate: null, status: 'exempt' }
		});
		expect(review({ ...abernathy, training: 'CPR/BLS', completed: 'N/A' }).result).toEqual({
			outcome: 'fix',
			problems: [{ field: 'completed', message: "CPR/BLS can't be marked exempt." }]
		});
		expect(review({ ...banks, training: 'Weapons Qual', completed: 'n/a' }).result.outcome).toBe('unchanged');
	});

	it('holds exempt marks for someone without requirement access behind one question that only leaves them out', () => {
		const lane = createTrainingImportLane(source({ canConfigureRequirements: false }));
		const first = review({ ...abernathy, training: 'SHARP', completed: 'Exempt' }, { lane }).result;
		const second = review({ ...alvarez, training: 'SHARP', completed: 'Exempt' }, { lane }).result;

		expect(first.outcome === 'fix' && first.problems[0].message).toBe(
			'Marking someone exempt needs permission to configure training requirements.'
		);
		const [question] = first.outcome === 'fix' ? (first.questions ?? []) : [];
		expect(question).toMatchObject({ skipLabel: 'Leave exempt marks out', accepts: { kind: 'pick', options: [] } });
		expect(second.outcome === 'fix' && second.questions?.[0].key).toBe(question.key);
		expect(review({ ...banks, training: 'SHARP', completed: '2026-01-02' }, { lane }).result.outcome).toBe('new');
	});

	it('shows a saved completion with the same date as Unchanged and a different date as an Update', () => {
		expect(review({ ...abernathy, training: 'CPR/BLS', completed: '2026-03-11' }).result.outcome).toBe('unchanged');
		expect(review({ ...alvarez, training: 'SHARP', completed: '2026-09-30' }).result).toMatchObject({
			outcome: 'update',
			diff: [{ label: 'Completed', before: '2026-01-14', after: '2026-09-30' }],
			change: { op: 'update', personnelId: 'p2', trainingTypeId: 't-sharp', completionDate: '2026-09-30' }
		});
	});

	it('skips a long-format row with no completion instead of blocking the import on a fix', () => {
		const lane = createTrainingImportLane(source());
		const file: LoadedFile = {
			name: 'long.csv',
			sheets: [
				{
					index: 0,
					name: 'Completions',
					hidden: false,
					rows: [
						['Last name', 'First name', 'Training', 'Completed'],
						['Abernathy', 'Cole', 'SHARP', ''],
						['Alvarez', 'Marisol', 'CPR/BLS', '2026-06-02']
					]
				}
			]
		};
		const rows = buildSourceRows(file, detectLayout(file, lane), lane);
		const state = reviewRows(rows, lane, new Map(), new Set(), new ReviewMemo());

		expect(state.counts).toMatchObject({ skipped: 1, new: 1, fix: 0 });
		expect(state.commitBlocker).toBeNull();
	});

	it('names the changed date from what the training type dates', () => {
		const lane = createTrainingImportLane(
			source({
				trainingTypes: [type('t-lic', 'Driver License', { expirationDateOnly: true })],
				trainings: [{ ...completion('p1', 't-lic', ''), completionDate: null, expirationDate: '2026-12-01' }]
			})
		);
		expect(
			review({ ...abernathy, training: 'Driver License', completed: '2027-12-01' }, { lane }).result
		).toMatchObject({ outcome: 'update', diff: [{ label: 'Expires', before: '2026-12-01', after: '2027-12-01' }] });
	});

	it('keeps the saved note when the file leaves Notes blank on an update', () => {
		expect(review({ ...abernathy, training: 'CPR/BLS', completed: '2026-04-01' }).result).toMatchObject({
			outcome: 'update',
			change: { notes: 'Red Cross' }
		});
	});

	it('sends records without the planning field and maps server row errors back to their rows', async () => {
		const fetch = vi.fn(async () =>
			Response.json({
				inserted: [{}],
				updated: [],
				exempted: [],
				errors: [{ index: 1, message: 'Training type not found' }]
			})
		);
		vi.stubGlobal('fetch', fetch);
		const changes: TrainingImportChange[] = [
			{ op: 'add', personnelId: 'p3', trainingTypeId: 't-sharp', completionDate: '2026-01-02', status: 'completed' },
			{ op: 'update', personnelId: 'p3', trainingTypeId: 't-cpr', completionDate: '2026-01-03', status: 'completed' }
		];

		const reply = await createTrainingImportLane(source()).commitChunk(changes);

		expect(JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({
			records: [
				{ personnelId: 'p3', trainingTypeId: 't-sharp', completionDate: '2026-01-02', status: 'completed' },
				{ personnelId: 'p3', trainingTypeId: 't-cpr', completionDate: '2026-01-03', status: 'completed' }
			]
		});
		expect(reply).toEqual({
			kind: 'saved',
			results: [{ kind: 'added' }, { kind: 'failed', reason: 'Training type not found' }]
		});
	});
});
