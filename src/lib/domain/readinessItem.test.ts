import { describe, expect, it } from 'vitest';
import { compareReadinessItems, previewRenewal } from './readinessItem';

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

describe('previewRenewal', () => {
	it('previews the new expiry on the cycle, a lapsed backdate, and a record that never expires', () => {
		expect(previewRenewal('2028-10-05', 24, '2026-10-05')).toEqual({
			tone: 'current',
			text: expect.stringMatching(/5 Oct 2028.*24-month/)
		});
		expect(previewRenewal('2026-01-10', 12, '2026-10-05')).toEqual({
			tone: 'expired',
			text: expect.stringMatching(/10 Jan 2026.*12-month/)
		});
		expect(previewRenewal(null, null, '2026-10-05')).toEqual({
			tone: 'current',
			text: expect.not.stringMatching(/\d/)
		});
	});
});
