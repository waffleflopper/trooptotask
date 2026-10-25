import { describe, expect, it } from 'vitest';
import { formatAge, formatWhen } from './inboxFormat';

const now = new Date(2026, 9, 23, 9, 30);
const at = (...parts: [number, number, number, number, number]) => new Date(...parts).toISOString();

describe('formatAge', () => {
	it.each([
		[at(2026, 9, 23, 9, 30), 'now'],
		[at(2026, 9, 23, 9, 5), '25m'],
		[at(2026, 9, 23, 7, 12), '2h'],
		[at(2026, 9, 20, 9, 30), '3d']
	])('shows %s as %s', (iso, expected) => {
		expect(formatAge(iso, now)).toBe(expected);
	});

	it('never shows a negative age for a clock a little ahead', () => {
		expect(formatAge(at(2026, 9, 23, 9, 31), now)).toBe('now');
	});
});

describe('formatWhen', () => {
	it('names today and yesterday, then the date, adding the year only when it differs', () => {
		expect(formatWhen(at(2026, 9, 23, 7, 12), now)).toBe('today at 07:12');
		expect(formatWhen(at(2026, 9, 22, 23, 5), now)).toBe('yesterday at 23:05');
		expect(formatWhen(at(2026, 9, 9, 14, 0), now)).toBe('9 Oct at 14:00');
		expect(formatWhen(at(2025, 11, 30, 8, 0), now)).toBe('30 Dec 2025 at 08:00');
	});
});
