import { describe, expect, it } from 'vitest';
import { RosterSelection } from './rosterSelection.svelte';

const shown = ['a', 'b', 'c', 'd', 'e'];

describe('RosterSelection', () => {
	it('selects everyone between the last person set and a Shift-clicked one, in shown order', () => {
		const selection = new RosterSelection();

		selection.set('d', true);
		selection.set('b', true, shown);

		expect(shown.filter((id) => selection.has(id))).toEqual(['b', 'c', 'd']);
	});

	it('clears a range the same way and sets one person when there is no earlier one to range from', () => {
		const selection = new RosterSelection();
		selection.set('c', true, shown);
		expect(selection.size).toBe(1);

		selection.setAll(shown, true);
		selection.set('a', false);
		selection.set('c', false, shown);

		expect(shown.filter((id) => selection.has(id))).toEqual(['d', 'e']);
	});

	it('sets one person when the last one set is no longer shown', () => {
		const selection = new RosterSelection();
		selection.set('z', true);

		selection.set('c', true, shown);

		expect(selection.size).toBe(2);
		expect(selection.has('b')).toBe(false);
	});

	it('reports none, some or all of a list for its header checkbox', () => {
		const selection = new RosterSelection();
		expect(selection.state(['a', 'b'])).toBe('none');

		selection.toggle('a');
		expect(selection.state(['a', 'b'])).toBe('some');

		selection.toggle('b');
		expect(selection.state(['a', 'b'])).toBe('all');
	});

	it('keeps people a list leaves out when that list is cleared, and forgets everyone on clear', () => {
		const selection = new RosterSelection();
		selection.setAll(['a', 'b', 'x'], true);

		selection.setAll(['a', 'b'], false);
		expect(selection.has('x')).toBe(true);

		selection.remove(['x']);
		selection.setAll(['c'], true);
		selection.clear();
		expect(selection.size).toBe(0);
	});
});
