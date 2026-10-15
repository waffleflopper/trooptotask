import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAvailabilityVolume } from './availability-volume-fixture.mjs';

const input = () => {
	let next = 0;
	return {
		organizationId: 'org',
		groupIds: ['alpha', 'bravo', null],
		statusTypeIds: ['leave', 'training'],
		anchorDate: '2026-10-14',
		tag: 'abcd1234',
		newId: () => `id-${next++}`
	};
};

test('the same seed and anchor reproduce the same roster and history', () => {
	assert.deepEqual(buildAvailabilityVolume(input()), buildAvailabilityVolume(input()));
});

test('a different anchor moves the window to that month plus and minus one', () => {
	const { summary } = buildAvailabilityVolume({ ...input(), anchorDate: '2027-01-31' });
	assert.deepEqual(summary.window, { start: '2026-12-01', end: '2027-02-28' });
});

test('501 people are split across both groups and the unassigned bucket', () => {
	const { personnel, summary } = buildAvailabilityVolume(input());
	assert.equal(personnel.length, 501);
	assert.deepEqual(summary.groups, { alpha: 201, bravo: 200, unassigned: 100 });
});

test('every entry is a valid span inside the buffered window for a known person', () => {
	const { personnel, entries, summary } = buildAvailabilityVolume(input());
	const ids = new Set(personnel.map((person) => person.id));
	for (const entry of entries) {
		assert.ok(ids.has(entry.personnel_id));
		assert.ok(entry.start_date <= entry.end_date, `${entry.start_date} ${entry.end_date}`);
		assert.ok(entry.start_date >= summary.window.start && entry.end_date <= summary.window.end);
	}
});

test('the history has the intended mix of lengths, overlaps and month-edge spans', () => {
	const { entries, personnel, summary } = buildAvailabilityVolume(input());
	assert.ok(summary.entries > 500 && summary.entries < 1100, `entries ${summary.entries}`);
	assert.ok(summary.oneDayEntries > 30);
	assert.ok(summary.multiWeekEntries > 100);
	assert.ok(summary.overlappingPairPeople >= 10 && summary.overlappingPairPeople <= 45);
	assert.equal(summary.monthEdgeSpanningPeople, 10);
	const byPerson = Object.groupBy(entries, (entry) => entry.personnel_id);
	const overlapping = personnel.filter((person) => {
		const own = byPerson[person.id] ?? [];
		return own.some((a, i) => own.some((b, j) => i < j && a.start_date <= b.end_date && b.start_date <= a.end_date));
	});
	assert.equal(overlapping.length, summary.overlappingPairPeople);
	assert.ok(Object.keys(summary.entriesPerPerson).every((count) => Number(count) <= 3));
});

test('month-edge people have an entry that contains both sides of a month boundary', () => {
	const { entries } = buildAvailabilityVolume(input());
	const spanning = entries.filter((entry) => entry.start_date.slice(0, 7) !== entry.end_date.slice(0, 7));
	assert.ok(spanning.length >= 10);
});

test('fewer than two status types is rejected', () => {
	assert.throws(() => buildAvailabilityVolume({ ...input(), statusTypeIds: ['leave'] }), /two status types/);
});
