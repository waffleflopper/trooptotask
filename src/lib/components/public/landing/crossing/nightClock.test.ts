import { describe, expect, it } from 'vitest';
import { clockReading, nightClockMinute } from './nightClock';

const readingAt = (progress: number) => {
	const { day, time } = clockReading(nightClockMinute(progress));
	return `${day} ${time}`;
};

describe('night clock', () => {
	it('reads Sunday 2214 until the hero leaves', () => {
		expect(readingAt(0)).toBe('Sun 2214');
		expect(readingAt(0.05)).toBe('Sun 2214');
	});

	it('reads Monday 0247 from the thesis on', () => {
		expect(readingAt(0.54)).toBe('Mon 0247');
		expect(readingAt(1)).toBe('Mon 0247');
	});

	it('advances one minute at a time, turning to Monday at midnight', () => {
		const shown = [...new Set(Array.from({ length: 10_001 }, (_, step) => readingAt(step / 10_000)))];
		expect(shown).toHaveLength(274);
		expect(shown.indexOf('Mon 0000')).toBe(shown.indexOf('Sun 2359') + 1);
	});
});
