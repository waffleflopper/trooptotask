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
	const { personnel } = buildAvailabilityVolume(input());
	const census = Object.groupBy(personnel, (person) => person.group_id ?? 'unassigned');
	assert.deepEqual(Object.fromEntries(Object.entries(census).map(([group, people]) => [group, people.length])), {
		alpha: 201,
		bravo: 200,
		unassigned: 100
	});
});

test('every entry is a valid span inside the buffered window for a known person and status', () => {
	const { personnel, entries } = buildAvailabilityVolume(input());
	const ids = new Set(personnel.map((person) => person.id));
	assert.ok(entries.length > 0);
	for (const entry of entries) {
		assert.ok(ids.has(entry.personnel_id));
		assert.equal(entry.organization_id, 'org');
		assert.ok(['leave', 'training'].includes(entry.status_type_id), entry.status_type_id);
		assert.ok(entry.start_date <= entry.end_date, `${entry.start_date} ${entry.end_date}`);
		assert.ok(
			entry.start_date >= '2026-09-01' && entry.end_date <= '2026-11-30',
			`${entry.start_date} ${entry.end_date}`
		);
	}
});

test('the history has the documented mix of lengths, per-person counts and overlaps', () => {
	const { entries, personnel } = buildAvailabilityVolume(input());
	const days = (date) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;
	const lengths = entries.map((entry) => days(entry.end_date) - days(entry.start_date) + 1);
	assert.ok(entries.length > 500 && entries.length < 1100, `entries ${entries.length}`);
	assert.ok(lengths.filter((length) => length === 1).length > 30);
	assert.ok(lengths.filter((length) => length >= 7).length > 100);
	const byPerson = Object.groupBy(entries, (entry) => entry.personnel_id);
	assert.ok(Object.values(byPerson).every((own) => own.length <= 3));
	const overlapping = personnel.filter((person) => {
		const own = byPerson[person.id] ?? [];
		return own.some((a, i) => own.some((b, j) => i < j && a.start_date <= b.end_date && b.start_date <= a.end_date));
	});
	assert.ok(overlapping.length >= 10 && overlapping.length <= 45, `overlapping ${overlapping.length}`);
});

test('month-edge people have an entry that contains both sides of a month boundary', () => {
	const { entries } = buildAvailabilityVolume(input());
	const spanning = entries.filter((entry) => entry.start_date.slice(0, 7) !== entry.end_date.slice(0, 7));
	assert.ok(spanning.length >= 10);
});

test('fewer than two status types is rejected', () => {
	assert.throws(() => buildAvailabilityVolume({ ...input(), statusTypeIds: ['leave'] }), /two status types/);
});
