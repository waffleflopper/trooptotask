import { describe, expect, it } from 'vitest';
import { compareReadinessItems, describeReadinessStanding, previewRenewal } from './readinessItem';

describe('compareReadinessItems', () => {
	it('ranks by status, then nearest expiry with never-expiring last, then name', () => {
		const items = [
			{ name: 'Never', status: 'current' as const, daysUntilExpiration: null },
			{ name: 'Later', status: 'current' as const, daysUntilExpiration: 300 },
			{ name: 'Soon', status: 'expiring' as const, daysUntilExpiration: 20 },
			{ name: 'Gone', status: 'missing' as const, daysUntilExpiration: null },
			{ name: 'Lapsed', status: 'expired' as const, daysUntilExpiration: -3 }
		];

		expect(items.sort(compareReadinessItems).map((item) => item.name)).toEqual([
			'Lapsed',
			'Gone',
			'Soon',
			'Later',
			'Never'
		]);
	});
});

describe('describeReadinessStanding', () => {
	it('names the status with the date and distance a leader acts on', () => {
		expect(
			[
				{ status: 'expired' as const, expirationDate: '2026-09-24', daysUntilExpiration: -12 },
				{ status: 'missing' as const, expirationDate: null, daysUntilExpiration: null },
				{ status: 'expiring' as const, expirationDate: '2026-10-27', daysUntilExpiration: 21 },
				{ status: 'current' as const, expirationDate: '2027-01-02', daysUntilExpiration: 88 },
				{ status: 'current' as const, expirationDate: null, daysUntilExpiration: null }
			].map(describeReadinessStanding)
		).toEqual([
			'Expired 24 Sep · 12 days ago',
			'Missing · never recorded',
			'Expiring 27 Oct · in 21 days',
			'Current until 2 Jan 2027',
			'Current · does not expire'
		]);
	});
});

describe('previewRenewal', () => {
	it('previews the new expiry on the cycle, a lapsed backdate, and a record that never expires', () => {
		expect(previewRenewal('2028-10-05', 24, '2026-10-05')).toEqual({
			tone: 'current',
			text: 'Becomes current. Expires 5 Oct 2028 on the 24-month cycle.'
		});
		expect(previewRenewal('2026-01-10', 12, '2026-10-05')).toEqual({
			tone: 'expired',
			text: 'Already lapsed. Expired 10 Jan 2026 on the 12-month cycle.'
		});
		expect(previewRenewal(null, null, '2026-10-05')).toEqual({
			tone: 'current',
			text: 'Becomes current. Does not expire.'
		});
	});
});
