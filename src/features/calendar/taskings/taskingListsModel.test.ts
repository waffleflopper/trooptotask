import { describe, expect, it } from 'vitest';
import {
	equipmentChangeSchema,
	equipmentDraftSchema,
	equipmentReadiness,
	equipmentState,
	movedIds,
	readinessOf
} from './taskingListsModel';

const item = (quantity: number, securedQuantity: number) => ({ quantity, securedQuantity });

describe('equipment readiness', () => {
	it('calls a requirement ready only when every unit is secured, and partial when some are', () => {
		expect(equipmentState(item(4, 4))).toBe('ready');
		expect(equipmentState(item(4, 3))).toBe('partial');
		expect(equipmentState(item(4, 1))).toBe('partial');
		expect(equipmentState(item(4, 0))).toBe('none');
	});

	it('counts ready and partial requirements apart from the ones nothing has been secured for', () => {
		expect(equipmentReadiness([item(4, 4), item(2, 1), item(3, 0), item(1, 1)])).toEqual({
			total: 4,
			ready: 2,
			partial: 1
		});
	});

	it('has no equipment readiness and no checklist progress when the Tasking has no items', () => {
		expect(readinessOf({ equipment: [], checklist: [] })).toEqual({ equipment: null, checklist: null });
	});

	it('reports checklist progress as done against total', () => {
		expect(
			readinessOf({ equipment: [], checklist: [{ done: true }, { done: false }, { done: true }] }).checklist
		).toEqual({
			total: 3,
			done: 2
		});
	});
});

describe('equipment input', () => {
	it.each([
		['a quantity of zero', { name: 'Litters', quantity: 0, securedQuantity: 0 }],
		['a fractional quantity', { name: 'Litters', quantity: 1.5, securedQuantity: 0 }],
		['a secured count above the quantity', { name: 'Litters', quantity: 4, securedQuantity: 5 }],
		['a negative secured count', { name: 'Litters', quantity: 4, securedQuantity: -1 }],
		['a blank name', { name: '   ', quantity: 4, securedQuantity: 0 }]
	])('refuses %s', (_why, draft) => {
		expect(equipmentDraftSchema.safeParse(draft).success).toBe(false);
	});

	it('accepts a fully secured requirement and trims the name', () => {
		expect(equipmentDraftSchema.parse({ name: ' Litters ', quantity: 4, securedQuantity: 4 })).toEqual({
			name: 'Litters',
			quantity: 4,
			securedQuantity: 4
		});
	});

	it('refuses a change that names nothing, or secures more than the quantity it states', () => {
		expect(equipmentChangeSchema.safeParse({}).success).toBe(false);
		expect(equipmentChangeSchema.safeParse({ quantity: 2, securedQuantity: 3 }).success).toBe(false);
		expect(equipmentChangeSchema.safeParse({ securedQuantity: 3 }).success).toBe(true);
	});
});

describe('movedIds', () => {
	it('swaps an item with its neighbour and refuses to move past either end', () => {
		expect(movedIds(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
		expect(movedIds(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
		expect(movedIds(['a', 'b', 'c'], 'a', -1)).toBeNull();
		expect(movedIds(['a', 'b', 'c'], 'c', 1)).toBeNull();
		expect(movedIds(['a', 'b', 'c'], 'missing', 1)).toBeNull();
	});
});
