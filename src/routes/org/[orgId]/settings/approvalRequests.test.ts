import { describe, expect, it } from 'vitest';
import { requestedAgo, waitingSummary } from './approvalRequests';

const now = new Date('2026-10-19T12:00:00Z');

describe('approval request ages', () => {
	it.each([
		['2026-10-19T11:59:50Z', '1 minute ago'],
		['2026-10-19T11:15:00Z', '45 minutes ago'],
		['2026-10-19T10:00:00Z', '2 hours ago'],
		['2026-10-18T11:00:00Z', 'yesterday'],
		['2026-10-16T12:00:00Z', '3 days ago']
	])('reads a request made at %s as %s', (createdAt, expected) => {
		expect(requestedAgo(createdAt, now)).toBe(expected);
	});

	it('names the count and the oldest wait in whole units', () => {
		expect(waitingSummary(['2026-10-19T11:30:00Z'], now)).toBe('1 waiting · oldest 30 minutes');
		expect(waitingSummary(['2026-10-19T11:30:00Z', '2026-10-19T11:00:00Z'], now)).toBe('2 waiting · oldest 1 hour');
		expect(waitingSummary(['2026-10-17T11:00:00Z', '2026-10-19T11:00:00Z'], now)).toBe('2 waiting · oldest 2 days');
		expect(waitingSummary([], now)).toBeNull();
	});
});
