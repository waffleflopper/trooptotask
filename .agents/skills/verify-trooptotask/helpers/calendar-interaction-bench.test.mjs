import assert from 'node:assert/strict';
import test from 'node:test';
import { median, summarizeRun, table } from './calendar-interaction-bench.mjs';

const record = (overrides) => ({
	id: 'next-within',
	warmup: false,
	ms: 50,
	domMs: 20,
	error: null,
	longTasks: { count: 0, totalMs: 0, maxMs: 0 },
	requests: { total: 0, dataJson: 0, calendarRange: 0, other: 0, failed: 0 },
	nodes: { total: 2000, grid: 1500, dateCells: 680, statusCells: 0, virtualRows: 23 },
	faults: { jsErrors: 0, unhandledRejections: 0, consoleErrors: 0 },
	...overrides
});

test('the median of an even count is the mean of the middle pair', () => {
	assert.equal(median([4, 1, 3, 2]), 2.5);
	assert.equal(median([9, 1, 5]), 5);
	assert.equal(median([]), null);
});

test('warm-up repetitions never reach the summary', () => {
	const rows = summarizeRun([record({ warmup: true, ms: 900 }), record({ ms: 40 }), record({ ms: 60 })]);
	assert.equal(rows['next-within'].n, 2);
	assert.equal(rows['next-within'].medianMs, 50);
	assert.equal(rows['next-within'].maxMs, 60);
});

test('a repetition whose change never rendered counts as an error and leaves the sample', () => {
	const rows = summarizeRun([
		record({ ms: 40 }),
		record({ ms: null, error: 'expected change never rendered' }),
		record({ ms: 60 })
	]);
	assert.equal(rows['next-within'].attempted, 3);
	assert.equal(rows['next-within'].errors, 1);
	assert.equal(rows['next-within'].n, 2);
	assert.equal(rows['next-within'].medianMs, 50);
});

test('failed requests and page faults are summed over the measured repetitions', () => {
	const rows = summarizeRun([
		record({ requests: { total: 1, dataJson: 0, calendarRange: 1, other: 0, failed: 1 } }),
		record({ faults: { jsErrors: 1, unhandledRejections: 0, consoleErrors: 2 } })
	]);
	assert.equal(rows['next-within'].failedRequests, 1);
	assert.equal(rows['next-within'].jsFaults, 3);
	assert.equal(rows['next-within'].rangeRequestsMedian, 0.5);
});

test('interactions with no records are omitted', () => {
	assert.deepEqual(Object.keys(summarizeRun([record({})])), ['next-within']);
});

test('an interaction whose repetitions all failed reports no extrema and prints n/a', () => {
	const rows = summarizeRun([
		record({ ms: null, error: 'expected change never rendered' }),
		record({ ms: null, error: 'expected change never rendered' })
	]);
	const row = rows['next-within'];
	assert.equal(row.n, 0);
	assert.equal(row.minMs, null);
	assert.equal(row.maxMs, null);
	assert.equal(row.longTaskMaxMs, null);
	const markdown = table(rows);
	assert.match(markdown, /\| n\/a–n\/a \|/);
	assert.doesNotMatch(markdown, /Infinity|null|undefined|NaN/);
});
