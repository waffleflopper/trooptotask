import { describe, expect, it } from 'vitest';
import { renewalTimeline } from './trainingRenewalTimeline';

describe('renewalTimeline', () => {
	it('dates each warning back from the expiration of a training done on the given day', () => {
		const timeline = renewalTimeline('2026-10-19', 36, 90, 30);

		expect(timeline).toMatchObject({
			done: '2026-10-19',
			expires: '2029-10-19',
			firstWarning: '2029-07-21',
			finalWarning: '2029-09-19'
		});
	});

	it('places the warnings along the bar by how late they start', () => {
		const timeline = renewalTimeline('2026-01-01', 12, 73, 0)!;

		expect(timeline.firstWarningShare).toBeCloseTo(0.8, 5);
		expect(timeline.finalWarningShare).toBe(1);
	});

	it('pins a warning longer than the whole span to the start of the bar', () => {
		expect(renewalTimeline('2026-01-01', 1, 400, 30)!.firstWarningShare).toBe(0);
	});

	it.each([
		['months below one', 0, 60, 30],
		['months that are not whole', 1.5, 60, 30],
		['a first warning that is not a number', 12, NaN, 30]
	])('draws nothing for %s', (_label, months, first, final) => {
		expect(renewalTimeline('2026-01-01', months, first, final)).toBeNull();
	});
});
