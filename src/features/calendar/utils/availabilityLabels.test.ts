import { describe, expect, it } from 'vitest';
import { availabilityEntryLabel } from './availabilityLabels';

const statusNames = new Map([['leave', 'Leave']]);

function label(startDate: string, endDate: string, statusTypeId = 'leave') {
	return availabilityEntryLabel({ statusTypeId, startDate, endDate }, statusNames);
}

describe('availabilityEntryLabel', () => {
	it('names one day, a range within a month, and a range across months', () => {
		expect(label('2026-10-26', '2026-10-26')).toBe('Leave 26 Oct');
		expect(label('2026-10-20', '2026-10-23')).toBe('Leave 20–23 Oct');
		expect(label('2026-10-26', '2026-11-03')).toBe('Leave 26 Oct – 3 Nov');
	});

	it('keeps the month on both ends when the same month falls in different years', () => {
		expect(label('2026-10-26', '2027-10-03')).toBe('Leave 26 Oct – 3 Oct');
	});

	it('calls an entry with an unknown status Unavailable', () => {
		expect(label('2026-10-26', '2026-10-27', 'deleted-status')).toBe('Unavailable 26–27 Oct');
	});
});
