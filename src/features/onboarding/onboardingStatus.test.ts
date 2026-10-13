import { describe, expect, it } from 'vitest';
import type { OnboardingStepProgress, PersonnelOnboarding } from './onboarding.types';
import {
	clockLabel,
	comparePacketSummaries,
	daysAtStage,
	isStepStalled,
	summarizePacket,
	todayIn,
	tookLong,
	typicalDaysToFinish,
	waitingBySteps,
	type Today
} from './onboardingStatus';

const TODAY: Today = { date: '2026-10-13', timeZone: 'America/New_York' };

function step(overrides: Partial<OnboardingStepProgress> = {}): OnboardingStepProgress {
	return {
		id: 'step',
		onboardingId: 'packet',
		stepName: 'Orientation',
		stepType: 'checkbox',
		trainingTypeId: null,
		stages: null,
		sortOrder: 0,
		completed: false,
		currentStage: null,
		notes: [],
		templateStepId: null,
		active: true,
		progressChangedAt: '2026-10-13T12:00:00.000Z',
		...overrides
	};
}

function paperwork(overrides: Partial<OnboardingStepProgress> = {}): OnboardingStepProgress {
	return step({
		stepName: 'Finance',
		stepType: 'paperwork',
		stages: ['Submitted', 'At Finance', 'Confirmed'],
		currentStage: 'At Finance',
		...overrides
	});
}

function packet(id: string, startedAt: string, steps: OnboardingStepProgress[]): PersonnelOnboarding {
	return {
		id,
		personnelId: `person-${id}`,
		startedAt,
		completedAt: null,
		cancelledAt: null,
		status: 'in_progress',
		templateId: 'template',
		steps: steps.map((s, index) => ({ ...s, id: `${id}-${s.id}-${index}`, onboardingId: id }))
	};
}

describe('days at stage', () => {
	it('counts whole calendar days in the viewer time zone', () => {
		const lateEvening = paperwork({ progressChangedAt: '2026-10-07T02:00:00.000Z' });

		expect(daysAtStage(lateEvening, TODAY)).toBe(7);
		expect(daysAtStage(lateEvening, { date: '2026-10-13', timeZone: 'UTC' })).toBe(6);
	});

	it('reads today from the viewer time zone', () => {
		expect(todayIn('America/New_York', new Date('2026-10-14T02:00:00.000Z'))).toEqual({
			date: '2026-10-13',
			timeZone: 'America/New_York'
		});
	});

	it('never counts below zero for a change saved after the viewer day', () => {
		expect(daysAtStage(paperwork({ progressChangedAt: '2026-10-15T12:00:00.000Z' }), TODAY)).toBe(0);
	});
});

describe('stalled steps', () => {
	it('flags a paperwork step at exactly 7 days but not at 6', () => {
		expect(isStepStalled(paperwork({ progressChangedAt: '2026-10-07T12:00:00.000Z' }), TODAY)).toBe(false);
		expect(isStepStalled(paperwork({ progressChangedAt: '2026-10-06T12:00:00.000Z' }), TODAY)).toBe(true);
	});

	it('never stalls a checkbox or training step', () => {
		const monthOld = '2026-09-01T12:00:00.000Z';

		expect(isStepStalled(step({ progressChangedAt: monthOld }), TODAY)).toBe(false);
		expect(
			isStepStalled(step({ stepType: 'training', trainingTypeId: 'cpr', progressChangedAt: monthOld }), TODAY)
		).toBe(false);
	});

	it('does not stall a paperwork step that has reached no stage', () => {
		expect(isStepStalled(paperwork({ currentStage: null, progressChangedAt: '2026-09-01T12:00:00.000Z' }), TODAY)).toBe(
			false
		);
	});

	it('does not stall a done or removed paperwork step', () => {
		const monthOld = '2026-09-01T12:00:00.000Z';

		expect(isStepStalled(paperwork({ completed: true, progressChangedAt: monthOld }), TODAY)).toBe(false);
		expect(isStepStalled(paperwork({ active: false, progressChangedAt: monthOld }), TODAY)).toBe(false);
	});
});

describe('packet summary', () => {
	it('orders Stalled, Ready, On track, New with the longest stall first and older starts first', () => {
		const packets = [
			packet('new', '2026-10-01', [step(), paperwork({ currentStage: null, sortOrder: 1 })]),
			packet('on-track-late', '2026-10-05', [step({ completed: true }), paperwork({ sortOrder: 1 })]),
			packet('ready', '2026-10-09', [step({ completed: true })]),
			packet('stalled-8', '2026-09-01', [paperwork({ progressChangedAt: '2026-10-05T12:00:00.000Z' })]),
			packet('on-track-early', '2026-10-02', [step({ completed: true }), paperwork({ sortOrder: 1 })]),
			packet('stalled-12', '2026-10-01', [paperwork({ progressChangedAt: '2026-10-01T12:00:00.000Z' })])
		];

		const ordered = packets.map((p) => summarizePacket(p, TODAY)).sort(comparePacketSummaries);

		expect(ordered.map((summary) => [summary.packet.id, summary.status])).toEqual([
			['stalled-12', 'stalled'],
			['stalled-8', 'stalled'],
			['ready', 'ready'],
			['on-track-early', 'on_track'],
			['on-track-late', 'on_track'],
			['new', 'new']
		]);
	});

	it('focuses the longest-stalled step ahead of earlier open steps', () => {
		const summary = summarizePacket(
			packet('p', '2026-09-01', [
				step({ sortOrder: 0 }),
				paperwork({ stepName: 'Finance', sortOrder: 1, progressChangedAt: '2026-10-05T12:00:00.000Z' }),
				paperwork({ stepName: 'Housing', sortOrder: 2, progressChangedAt: '2026-10-01T12:00:00.000Z' })
			]),
			TODAY
		);

		expect(summary).toMatchObject({
			status: 'stalled',
			stalledCount: 2,
			stallDays: 12,
			done: 0,
			total: 3,
			clock: { kind: 'day', day: 43 }
		});
		expect(summary.focus?.stepName).toBe('Housing');
		expect(summary.detail).toEqual({ kind: 'stage', stage: 'At Finance', days: 12, stalled: true });
	});

	it('focuses the first open step in step order when nothing is stalled', () => {
		const summary = summarizePacket(
			packet('p', '2026-10-10', [
				step({ stepName: 'Badge', sortOrder: 2 }),
				step({ stepName: 'Orientation', sortOrder: 0, completed: true }),
				step({ stepName: 'Keys', sortOrder: 1 }),
				step({ stepName: 'Old step', sortOrder: -1, active: false })
			]),
			TODAY
		);

		expect(summary).toMatchObject({ status: 'on_track', done: 1, total: 3, clock: { kind: 'day', day: 4 } });
		expect(summary.focus?.stepName).toBe('Keys');
		expect(summary.detail).toEqual({ kind: 'more_open', count: 1 });
	});

	it('marks a packet with every active step done as ready with no focus step', () => {
		const summary = summarizePacket(
			packet('p', '2026-10-01', [step({ completed: true }), paperwork({ active: false, completed: false })]),
			TODAY
		);

		expect(summary).toMatchObject({ status: 'ready', focus: null, detail: { kind: 'all_done' }, done: 1, total: 1 });
	});

	it('describes the focus step with the first matching detail rule', () => {
		const detail = (startedAt: string, steps: OnboardingStepProgress[]) =>
			summarizePacket(packet('p', startedAt, steps), TODAY).detail;

		expect(detail('2026-10-10', [paperwork({ progressChangedAt: '2026-10-11T12:00:00.000Z' })])).toEqual({
			kind: 'stage',
			stage: 'At Finance',
			days: 2,
			stalled: false
		});
		expect(
			detail('2026-10-13', [step({ stepType: 'training', trainingTypeId: 'cpr' }), step({ sortOrder: 1 })])
		).toEqual({ kind: 'training' });
		expect(detail('2026-10-13', [paperwork({ currentStage: null }), step({ sortOrder: 1 })])).toEqual({
			kind: 'started_today'
		});
		expect(detail('2026-10-10', [step()])).toEqual({ kind: 'none' });
	});
});

describe('waiting by step', () => {
	it('groups open steps by name across templates and ranks stalled, then open, then step order', () => {
		const stalledFinance = paperwork({
			stepName: 'Finance',
			sortOrder: 3,
			progressChangedAt: '2026-10-01T12:00:00.000Z'
		});
		const packets = [
			packet('alpha-1', '2026-10-01', [
				step({ stepName: 'Orientation', sortOrder: 0 }),
				paperwork({ stepName: 'Finance', sortOrder: 3 })
			]),
			packet('alpha-2', '2026-10-01', [step({ stepName: 'Orientation', sortOrder: 0 }), stalledFinance]),
			packet('bravo-1', '2026-10-01', [
				paperwork({ stepName: 'Finance', sortOrder: 0 }),
				step({ stepName: 'Badge', sortOrder: 1 }),
				step({ stepName: 'Orientation', sortOrder: 2, completed: true })
			]),
			packet('bravo-2', '2026-10-01', [step({ stepName: 'Keys', sortOrder: 2, stepType: 'training' })])
		];

		expect(waitingBySteps(packets, TODAY)).toEqual([
			{ stepName: 'Finance', stepType: 'paperwork', open: 3, stalled: 1 },
			{ stepName: 'Orientation', stepType: 'checkbox', open: 2, stalled: 0 },
			{ stepName: 'Badge', stepType: 'checkbox', open: 1, stalled: 0 },
			{ stepName: 'Keys', stepType: 'training', open: 1, stalled: 0 }
		]);
	});
});

describe('packet clock', () => {
	const summary = (startedAt: string) => summarizePacket(packet('p', startedAt, [step()]), TODAY);

	it('counts the start date as day 1', () => {
		expect(summary('2026-10-13').clock).toEqual({ kind: 'day', day: 1 });
		expect(clockLabel(summary('2026-10-10').clock)).toBe('Day 4');
	});

	it('counts down to a start date in the future', () => {
		expect(summary('2026-10-14').clock).toEqual({ kind: 'starts_in', days: 1 });
		expect(clockLabel(summary('2026-10-14').clock)).toBe('Starts tomorrow');
		expect(summary('2026-10-20').clock).toEqual({ kind: 'starts_in', days: 7 });
		expect(clockLabel(summary('2026-10-20').clock)).toBe('Starts in 7 days');
	});

	it('does not call a packet that has not started started today', () => {
		expect(summary('2026-10-13').detail).toEqual({ kind: 'started_today' });
		expect(summary('2026-10-14').detail).toEqual({ kind: 'none' });
	});
});

describe('typical days to finish', () => {
	const completed = (startedAt: string, completedAt: string) => ({
		status: 'completed' as const,
		startedAt,
		completedAt
	});

	it('is null with fewer than three recent completions', () => {
		expect(
			typicalDaysToFinish(
				[
					completed('2026-09-01', '2026-09-11'),
					completed('2026-09-01', '2026-09-21'),
					{ status: 'cancelled', startedAt: '2026-09-01', completedAt: null }
				],
				'2026-10-13'
			)
		).toBeNull();
	});

	it('takes the median of completions inside the 90-day window', () => {
		expect(
			typicalDaysToFinish(
				[
					completed('2026-09-01', '2026-09-11'),
					completed('2026-09-01', '2026-09-21'),
					completed('2026-07-01', '2026-07-16'),
					completed('2026-07-01', '2026-07-15')
				],
				'2026-10-13'
			)
		).toBe(15);
	});

	it('averages the middle two exactly for an even count', () => {
		expect(
			typicalDaysToFinish(
				[
					completed('2026-10-01', '2026-10-11'),
					completed('2026-10-01', '2026-10-12'),
					completed('2026-09-01', '2026-09-21'),
					completed('2026-09-01', '2026-09-30')
				],
				'2026-10-13'
			)
		).toBe(15.5);
	});
});

describe('took long', () => {
	it('is true from the typical figure plus seven days', () => {
		expect(tookLong(18, 12)).toBe(false);
		expect(tookLong(19, 12)).toBe(true);
		expect(tookLong(400, null)).toBe(false);
	});
});
