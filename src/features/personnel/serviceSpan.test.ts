import { describe, expect, it } from 'vitest';
import { formatServiceSpan } from './serviceSpan';

describe('formatServiceSpan', () => {
	it.each([
		['2020-06-11', '2026-10-18', '6 yrs 4 mo'],
		['2024-02-01', '2026-10-18', '2 yrs 8 mo'],
		['2025-10-18', '2026-10-18', '1 yr'],
		['2025-10-19', '2026-10-18', '11 mo'],
		['2026-09-30', '2026-10-18', 'Under 1 mo'],
		['2026-10-18', '2026-10-18', 'Under 1 mo']
	])('counts completed months from %s to %s', (start, today, expected) => {
		expect(formatServiceSpan(start, today)).toBe(expected);
	});

	it.each([null, '', '2026-10-19', '06/11/2020'])(
		'shows nothing for a missing, future or malformed start %s',
		(start) => {
			expect(formatServiceSpan(start, '2026-10-18')).toBeNull();
		}
	);
});
