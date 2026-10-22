import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rulePicks } from './da6-fixtures.mjs';

test('the highest number pulls it, ties go higher on the form, away holds and other duty runs', () => {
	const picks = rulePicks({
		size: 3,
		days: 5,
		dutyDay: (day) => day !== 3,
		away: (slot, day) => slot === 1 && day === 1,
		otherDuty: (slot, day) => slot === 2 && day === 2
	});

	// Day 0 all tie at 1. Day 1 B is away, C pulls at 2. Day 2 C is on other duty, B (1) and A (2): A.
	// Day 3 has no duty. Day 4: A 2, B 3, C 3, so B is higher on the form.
	assert.deepEqual(picks, [0, 2, 0, null, 1]);
});
