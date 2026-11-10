import { describe, expect, it } from 'vitest';
import { describeActivity } from './taskingLabels';

const returned = (extra: { securedQuantity?: number }) =>
	describeActivity(
		{ kind: 'equipment_returned', name: 'Litters', quantity: 5, from: 0, to: 3, ...extra },
		{},
		{},
		'Alpha Company'
	).summary;

describe('equipment return activity', () => {
	it('states a return against what was secured', () => {
		expect(returned({ securedQuantity: 4 })).toBe('Returned 3 of 4 Litters (was 0)');
	});

	it('falls back to the quantity for activity recorded before the secured count was kept', () => {
		expect(returned({})).toBe('Returned 3 of 5 Litters (was 0)');
	});
});
