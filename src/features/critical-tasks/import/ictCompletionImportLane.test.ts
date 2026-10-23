import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lastFirstSplitter, rosterPersonReference } from '$features/personnel';
import type { Personnel } from '$features/personnel/contracts';
import { parseImportDate, type IsoDate } from '$lib/components/patterns/import-flow';
import type { IctTask, PersonnelIctCompletion } from '../criticalTasks.types';
import { personnelIctCompletionsStore } from '../stores/personnelIctCompletions.svelte';
import {
	createIctCompletionImportLane,
	type IctCompletionImportColumns,
	type IctCompletionImportSource
} from './ictCompletionImportLane';

function person(id: string, rank: string, lastName: string, firstName: string, groupName: string): Personnel {
	return { id, rank, lastName, firstName, mos: '68W', clinicRole: '', groupId: null, groupName };
}

function task(id: string, taskCode: string, archivedAt: string | null = null): IctTask {
	return {
		id,
		taskCode,
		title: `Title ${taskCode}`,
		description: null,
		mos: [],
		expirationMonths: 12,
		sortOrder: 1,
		archivedAt,
		createdAt: '2026-04-01T00:00:00Z'
	};
}

const saved: PersonnelIctCompletion = {
	id: 'saved-1',
	personnelId: 'p1',
	ictTaskId: 't1',
	completedAt: '2026-03-11',
	validationMethod: 'Lecture',
	validatedBy: 'SFC Lee',
	notes: 'Range day',
	loggedBy: 'user-1',
	createdAt: '2026-03-11T12:00:00Z'
};

function source(overrides: Partial<IctCompletionImportSource> = {}): IctCompletionImportSource {
	return {
		orgUrlSegment: 'unit',
		person: rosterPersonReference<IctCompletionImportColumns>([
			person('p1', 'SPC', 'Abernathy', 'Cole', '1st Platoon'),
			person('p2', 'SGT', 'Smith', 'Jane', '1st Platoon'),
			person('p3', 'SPC', 'Smith', 'Jane', '2nd Platoon'),
			person('p4', 'PFC', 'Banks', 'Tamara', 'HQ')
		]),
		nameSplitter: lastFirstSplitter<IctCompletionImportColumns>(),
		tasks: [task('t1', '081-833-0010'), task('t2', '081-833-0020'), task('t-old', '081-833-0099', '2026-05-01')],
		completions: [saved],
		...overrides
	};
}

type Lane = ReturnType<typeof createIctCompletionImportLane>;
type Raw = Partial<Record<keyof Lane['columns'], string>>;

function match(lane: Lane, name: keyof Lane['references'], raw: Raw) {
	const reference = lane.references[name];
	const lookup = reference.key(raw);
	return lookup ? { lookup, found: reference.find(lookup.key) } : null;
}

function review(raw: Raw, lane = createIctCompletionImportLane(source())) {
	const one = (name: keyof Lane['references']) => {
		const found = match(lane, name, raw)?.found;
		return found?.kind === 'one' ? found.option : null;
	};
	return lane.review({
		values: {
			rank: raw.rank ?? null,
			lastName: raw.lastName ?? '',
			firstName: raw.firstName ?? '',
			groupName: raw.groupName ?? null,
			taskCode: raw.taskCode ?? '',
			completedAt: (raw.completedAt ?? '') as IsoDate,
			validationMethod: raw.validationMethod ?? null,
			validatedBy: raw.validatedBy ?? null,
			notes: raw.notes ?? null
		},
		refs: { person: one('person'), task: one('task'), method: one('method') } as never,
		ask: () => undefined,
		parseDate: (value) => parseImportDate(value)
	});
}

const abernathy = { lastName: 'Abernathy', firstName: 'Cole' };

beforeEach(() => personnelIctCompletionsStore.load([structuredClone(saved)], 'org-1'));

afterEach(() => {
	vi.unstubAllGlobals();
	personnelIctCompletionsStore.load([], 'org-test-reset');
});

describe('critical task completions import lane', () => {
	it('adds a completion for a matched person, task and date and leaves blank cells out of the record', () => {
		expect(review({ ...abernathy, taskCode: '081-833-0020', completedAt: '2026-04-02' })).toEqual({
			outcome: 'new',
			key: 'p1|t2|2026-04-02',
			change: { personnelId: 'p1', ictTaskId: 't2', completedAt: '2026-04-02' }
		});
		expect(
			review({
				...abernathy,
				taskCode: '081-833-0020',
				completedAt: '2026-04-02',
				validationMethod: 'demonstration',
				validatedBy: 'SSG Ortiz'
			})
		).toMatchObject({ change: { validationMethod: 'Demonstration', validatedBy: 'SSG Ortiz' } });
	});

	it('offers only the people who share an ambiguous name', () => {
		const found = match(createIctCompletionImportLane(source()), 'person', { lastName: 'Smith', firstName: 'Jane' });
		expect(found?.found.kind === 'many' ? found.found.candidates.map((option) => option.id) : found).toEqual([
			'p2',
			'p3'
		]);
	});

	it('matches a task by code, sends an archived or unknown code to the rail and never offers archived tasks', () => {
		const lane = createIctCompletionImportLane(source());
		expect(match(lane, 'task', { taskCode: ' 081-833-0010 ' })?.found).toMatchObject({
			kind: 'one',
			option: { id: 't1' }
		});
		expect(match(lane, 'task', { taskCode: '081-833-0099' })).toEqual({
			lookup: { key: '081-833-0099', display: '081-833-0099 (archived)' },
			found: { kind: 'none' }
		});
		expect(match(lane, 'task', { taskCode: '0818330020' })?.found).toMatchObject({
			kind: 'none',
			suggestion: { id: 't2' }
		});
		expect(match(lane, 'task', { taskCode: 'LAND-NAV' })?.found).toEqual({ kind: 'none' });
		expect(lane.references.task.options.map((option) => option.id)).toEqual(['t1', 't2']);
		expect(lane.references.task.create).toBeUndefined();
	});

	it('shows a saved completion with the same values as Unchanged and a changed note as an Update', () => {
		const row = { ...abernathy, taskCode: '081-833-0010', completedAt: '2026-03-11' };
		expect(review({ ...row, validationMethod: 'Lecture', notes: 'Range day' })).toEqual({
			outcome: 'unchanged',
			key: 'p1|t1|2026-03-11'
		});
		expect(review(row)).toEqual({ outcome: 'unchanged', key: 'p1|t1|2026-03-11' });
		expect(review({ ...row, notes: 'Night fire' })).toEqual({
			outcome: 'update',
			key: 'p1|t1|2026-03-11',
			change: { personnelId: 'p1', ictTaskId: 't1', completedAt: '2026-03-11', notes: 'Night fire' },
			diff: [{ label: 'Notes', before: 'Range day', after: 'Night fire' }]
		});
	});

	it('posts the chunk to the completions endpoint and maps server row errors back to rows', async () => {
		const added = { ...saved, id: 'saved-2', ictTaskId: 't2', completedAt: '2026-04-02' };
		const fetch = vi.fn(async () =>
			Response.json({
				results: [
					{ kind: 'added', record: added },
					{ kind: 'failed', message: 'This person is archived.' }
				]
			})
		);
		vi.stubGlobal('fetch', fetch);
		const records = [
			{ personnelId: 'p1', ictTaskId: 't2', completedAt: '2026-04-02' },
			{ personnelId: 'p4', ictTaskId: 't2', completedAt: '2026-04-02' }
		];

		const reply = await createIctCompletionImportLane(source()).commitChunk(records);

		expect(reply).toEqual({
			kind: 'saved',
			results: [{ kind: 'added' }, { kind: 'failed', reason: 'This person is archived.' }]
		});
		const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
		expect([url, JSON.parse(String(init.body))]).toEqual([
			'/org/org-1/api/personnel-ict-completions/batch',
			{ records }
		]);
		expect(personnelIctCompletionsStore.items.map((completion) => completion.id).sort()).toEqual([
			'saved-1',
			'saved-2'
		]);
	});
});
