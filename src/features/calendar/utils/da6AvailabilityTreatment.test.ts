import { describe, expect, it } from 'vitest';
import { highestPriorityDa6Treatment } from './da6AvailabilityTreatment';
import type { StatusType } from '$lib/types';

const statusTypes: StatusType[] = [
	{
		id: 'appointment',
		name: 'Appointment',
		color: '#ed8936',
		textColor: '#fff',
		da6AvailabilityTreatment: null,
		da6TreatmentReviewed: true
	},
	{
		id: 'leave',
		name: 'Leave',
		color: '#48bb78',
		textColor: '#fff',
		da6AvailabilityTreatment: 'authorized-absence',
		da6TreatmentReviewed: true
	},
	{
		id: 'detail',
		name: 'Other Duty / Detail',
		color: '#a0522d',
		textColor: '#fff',
		da6AvailabilityTreatment: 'other-duty',
		da6TreatmentReviewed: true
	},
	{
		id: 'misconduct',
		name: 'Misconduct unavailable',
		color: '#991b1b',
		textColor: '#fff',
		da6AvailabilityTreatment: 'misconduct-unavailable',
		da6TreatmentReviewed: true
	}
];

describe('highestPriorityDa6Treatment', () => {
	it('ignores statuses without DA6 effect', () => {
		expect(highestPriorityDa6Treatment(statusTypes, ['appointment'])).toBeNull();
	});

	it('lets authorized absence take precedence over other duty', () => {
		expect(highestPriorityDa6Treatment(statusTypes, ['detail', 'leave'])).toBe('authorized-absence');
	});

	it('keeps future misconduct semantics highest priority when explicitly present', () => {
		expect(highestPriorityDa6Treatment(statusTypes, ['leave', 'misconduct'])).toBe('misconduct-unavailable');
	});
});
