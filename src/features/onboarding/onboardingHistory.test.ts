import { describe, expect, it } from 'vitest';
import type { OnboardingStepProgress, PersonnelOnboarding } from './onboarding.types';
import {
	buildHistory,
	filterHistoryRows,
	finalSteps,
	formatHistoryDate,
	HISTORY_ALL,
	historySubtitleParts,
	packetNotes,
	type HistoryFilters,
	type HistoryPerson
} from './onboardingHistory';

const TODAY = '2026-10-13';

function step(overrides: Partial<OnboardingStepProgress> = {}): OnboardingStepProgress {
	return {
		id: 'step',
		onboardingId: 'packet',
		stepName: 'Orientation',
		stepType: 'checkbox',
		trainingTypeId: null,
		stages: null,
		sortOrder: 0,
		completed: true,
		currentStage: null,
		notes: [],
		templateStepId: null,
		active: true,
		progressChangedAt: '2026-09-01T12:00:00.000Z',
		...overrides
	};
}

function completed(id: string, startedAt: string, completedAt: string, steps: OnboardingStepProgress[] = []) {
	return packet(id, { status: 'completed', startedAt, completedAt, steps });
}

function cancelled(id: string, startedAt: string, cancelledAt: string, steps: OnboardingStepProgress[] = []) {
	return packet(id, { status: 'cancelled', startedAt, cancelledAt, steps });
}

function packet(id: string, overrides: Partial<PersonnelOnboarding>): PersonnelOnboarding {
	return {
		id,
		personnelId: `person-${id}`,
		startedAt: '2026-09-01',
		completedAt: null,
		cancelledAt: null,
		status: 'in_progress',
		steps: [],
		templateId: 'standard',
		...overrides
	};
}

describe('buildHistory', () => {
	it('lists finished packets by finish date, newest first, using the date that fits the outcome', () => {
		const { rows } = buildHistory(
			[
				completed('older', '2026-08-01', '2026-08-20'),
				cancelled('stopped', '2026-09-01', '2026-09-28T23:30:00+00:00'),
				packet('open', { startedAt: '2026-09-30' }),
				completed('newest', '2026-09-05', '2026-10-01')
			],
			TODAY
		);

		expect(rows.map((row) => [row.packet.id, row.outcome, row.finishedOn])).toEqual([
			['newest', 'completed', '2026-10-01'],
			['stopped', 'cancelled', '2026-09-28'],
			['older', 'completed', '2026-08-20']
		]);
	});

	it('counts days taken from start date to finish date, for cancelled packets too', () => {
		const { rows } = buildHistory(
			[completed('done', '2026-09-01', '2026-09-30'), cancelled('stopped', '2026-08-21', '2026-08-28T10:00:00Z')],
			TODAY
		);

		expect(rows.map((row) => [row.packet.id, row.days])).toEqual([
			['done', 29],
			['stopped', 7]
		]);
	});

	it('counts the steps still on the template as the final progress', () => {
		const { rows } = buildHistory(
			[
				cancelled('stopped', '2026-08-21', '2026-08-28T10:00:00Z', [
					step({ id: 'a', completed: true }),
					step({ id: 'b', completed: false }),
					step({ id: 'removed', completed: true, active: false })
				])
			],
			TODAY
		);

		expect([rows[0].done, rows[0].total]).toEqual([1, 2]);
	});

	it('flags a packet that took 7 days longer than typical, and not one day sooner', () => {
		const typicalFinishes = ['2026-09-10', '2026-09-11', '2026-09-12'].map((end, index) =>
			completed(`typical-${index}`, '2026-09-01', end)
		);
		expect(buildHistory(typicalFinishes, TODAY).overview.typicalDays).toBe(10);

		const { rows } = buildHistory(
			[
				...typicalFinishes,
				cancelled('six', '2026-09-01', '2026-09-17T12:00:00Z'),
				cancelled('seven', '2026-09-01', '2026-09-18T12:00:00Z')
			],
			TODAY
		);
		const tookLongById = Object.fromEntries(rows.map((row) => [row.packet.id, row.tookLong]));

		expect(tookLongById.six).toBe(false);
		expect(tookLongById.seven).toBe(true);
	});

	it('flags nothing without a typical figure', () => {
		const { rows, overview } = buildHistory(
			[completed('a', '2026-01-01', '2026-09-01'), completed('b', '2026-01-01', '2026-09-02')],
			TODAY
		);

		expect(overview.typicalDays).toBeNull();
		expect(rows.map((row) => row.tookLong)).toEqual([false, false]);
	});

	it('summarizes only the last 90 days: finished of either outcome, and cancelled among them', () => {
		const { overview } = buildHistory(
			[
				completed('in-window-1', '2026-07-01', '2026-07-16'),
				completed('in-window-2', '2026-09-01', '2026-09-20'),
				cancelled('in-window-3', '2026-09-01', '2026-09-05T12:00:00Z'),
				completed('first-day', '2026-06-01', '2026-07-16'),
				completed('too-old', '2026-05-01', '2026-07-14'),
				cancelled('too-old-cancelled', '2026-05-01', '2026-07-01T12:00:00Z')
			],
			TODAY
		);

		expect(overview).toMatchObject({ finished: 4, cancelled: 1 });
	});

	it('takes the typical figure from completed packets in the window, as the Active page does', () => {
		const { overview } = buildHistory(
			[
				completed('a', '2026-09-01', '2026-09-11'),
				completed('b', '2026-09-01', '2026-09-21'),
				completed('c', '2026-09-01', '2026-10-01'),
				cancelled('stopped', '2026-09-01', '2026-10-10T00:00:00Z')
			],
			TODAY
		);

		expect(overview.typicalDays).toBe(20);
	});
});

describe('filterHistoryRows', () => {
	const people: Record<string, HistoryPerson> = {
		'person-ortiz': { name: 'PV2 Ortiz, Lucas', rank: 'PV2', mos: '88M', groupId: 'third' },
		'person-kim': { name: 'SPC Kim, Grace', rank: 'SPC', mos: '68W', groupId: 'first' },
		'person-shah': { name: '1LT Shah, Priya', rank: '1LT', mos: '70B', groupId: 'hq' }
	};
	const { rows } = buildHistory(
		[
			{ ...completed('ortiz', '2026-09-01', '2026-09-30'), templateId: 'standard' },
			{ ...completed('kim', '2026-09-03', '2026-09-21'), templateId: 'standard' },
			{ ...completed('shah', '2026-08-25', '2026-09-10'), templateId: 'officer' },
			{ ...cancelled('stopped', '2026-08-21', '2026-08-28T10:00:00Z'), personnelId: 'person-kim', templateId: 'standard' }
		],
		TODAY
	);
	const all: HistoryFilters = { outcome: 'all', query: '', groupId: HISTORY_ALL, templateId: HISTORY_ALL };
	const ids = (filters: Partial<HistoryFilters>) =>
		filterHistoryRows(rows, { ...all, ...filters }, (id) => people[id]).map((row) => row.packet.id);

	it('keeps every row with no filter set', () => {
		expect(ids({})).toEqual(['ortiz', 'kim', 'shah', 'stopped']);
	});

	it('filters by outcome', () => {
		expect(ids({ outcome: 'cancelled' })).toEqual(['stopped']);
		expect(ids({ outcome: 'completed' })).toEqual(['ortiz', 'kim', 'shah']);
	});

	it('filters by group and by template', () => {
		expect(ids({ groupId: 'first' })).toEqual(['kim', 'stopped']);
		expect(ids({ templateId: 'officer' })).toEqual(['shah']);
		expect(ids({ groupId: 'first', templateId: 'officer' })).toEqual([]);
	});

	it('searches name, rank and MOS without regard to case', () => {
		expect(ids({ query: 'ortiz' })).toEqual(['ortiz']);
		expect(ids({ query: ' spc ' })).toEqual(['kim', 'stopped']);
		expect(ids({ query: '70b' })).toEqual(['shah']);
		expect(ids({ query: 'nobody' })).toEqual([]);
	});

	it('combines filters', () => {
		expect(ids({ outcome: 'completed', query: 'kim' })).toEqual(['kim']);
	});
});

describe('historySubtitleParts', () => {
	it('says what happened, how long it usually takes and how many were cancelled', () => {
		expect(historySubtitleParts({ finished: 18, typicalDays: 21, cancelled: 2 })).toEqual([
			'18 finished in the last 90 days',
			'Typically 21 days to finish',
			'2 cancelled'
		]);
	});

	it('hides each part with nothing to say', () => {
		expect(historySubtitleParts({ finished: 0, typicalDays: null, cancelled: 0 })).toEqual([]);
		expect(historySubtitleParts({ finished: 4, typicalDays: null, cancelled: 0 })).toEqual([
			'4 finished in the last 90 days'
		]);
	});

	it('rounds a half-day median like the Active page', () => {
		expect(historySubtitleParts({ finished: 4, typicalDays: 20.5, cancelled: 0 })).toContain(
			'Typically 21 days to finish'
		);
	});
});

describe('finalSteps', () => {
	it('lists active steps in order with the stage reached, then steps that left the template', () => {
		const steps = finalSteps(
			completed('done', '2026-09-01', '2026-09-30', [
				step({ id: 'late', stepName: 'Late', sortOrder: 2 }),
				step({ id: 'gone', stepName: 'Gone', sortOrder: 0, active: false }),
				step({
					id: 'pay',
					stepName: 'Finance',
					stepType: 'paperwork',
					stages: ['Submitted', 'Pay start confirmed'],
					currentStage: 'Pay start confirmed',
					sortOrder: 1
				}),
				step({ id: 'open', stepName: 'Open', stepType: 'training', completed: false, sortOrder: 3, currentStage: 'ignored' })
			])
		);

		expect(steps).toEqual([
			{ id: 'pay', name: 'Finance', done: true, removed: false, stage: 'Pay start confirmed' },
			{ id: 'late', name: 'Late', done: true, removed: false, stage: null },
			{ id: 'open', name: 'Open', done: false, removed: false, stage: null },
			{ id: 'gone', name: 'Gone', done: true, removed: true, stage: null }
		]);
	});
});

describe('packetNotes', () => {
	it('gathers every note across steps, oldest first, each with its step name', () => {
		const notes = packetNotes(
			completed('done', '2026-09-01', '2026-09-30', [
				step({
					id: 'finance',
					stepName: 'Finance in-processing',
					notes: [{ text: 'Pay start confirmed.', timestamp: '2026-09-30T14:00:00Z', userId: 'whitaker' }]
				}),
				step({
					id: 'removed',
					stepName: 'Old step',
					active: false,
					notes: [{ text: 'Lost packet.', timestamp: '2026-09-15T14:00:00Z', userId: 'alvarez' }]
				})
			])
		);

		expect(notes.map((note) => [note.stepName, note.userId, note.text])).toEqual([
			['Old step', 'alvarez', 'Lost packet.'],
			['Finance in-processing', 'whitaker', 'Pay start confirmed.']
		]);
	});
});

describe('formatHistoryDate', () => {
	it('writes day and month, adding the year only when it is not this year', () => {
		expect(formatHistoryDate('2026-09-01', TODAY)).toBe('1 Sep');
		expect(formatHistoryDate('2026-10-13', TODAY)).toBe('13 Oct');
		expect(formatHistoryDate('2025-12-31', TODAY)).toBe('31 Dec 2025');
	});
});
