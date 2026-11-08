import { describe, expect, it } from 'vitest';
import { reviewBulkField } from './bulkFieldReview';
import type { Personnel } from './personnel.types';

const person = (id: string, rank: string, lastName: string, extra: Partial<Personnel> = {}): Personnel => ({
	id,
	rank,
	lastName,
	firstName: 'Pat',
	mos: '68W',
	clinicRole: '',
	ets: null,
	groupId: null,
	groupName: '',
	...extra
});

describe('reviewBulkField', () => {
	it('lists only People whose value changes, with the value they have now and the new one', () => {
		const review = reviewBulkField(
			[
				person('a', 'SGT', 'Able', { mos: '68W' }),
				person('b', 'SPC', 'Baker', { mos: '68C' }),
				person('c', 'SPC', 'Cole', { mos: '' })
			],
			'mos',
			'68C'
		);

		expect(review).toEqual({
			changes: [
				{ id: 'a', name: 'SGT Able, Pat', from: '68W', to: '68C' },
				{ id: 'c', name: 'SPC Cole, Pat', from: 'None', to: '68C' }
			],
			unchanged: 1
		});
	});

	it('shows ETS as a date and a missing ETS as None', () => {
		const review = reviewBulkField(
			[person('a', 'SGT', 'Able', { ets: '2027-03-15' }), person('b', 'SPC', 'Baker', { ets: null })],
			'ets',
			'2027-03-15'
		);

		expect(review).toEqual({
			changes: [{ id: 'b', name: 'SPC Baker, Pat', from: 'None', to: 'Mar 15, 2027' }],
			unchanged: 1
		});
	});
});
