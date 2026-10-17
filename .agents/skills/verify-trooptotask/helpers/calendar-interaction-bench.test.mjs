import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { median, runBlock, summarizeRun, table } from './calendar-interaction-bench.mjs';

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
	assert.match(markdown, /n\/a/);
	assert.doesNotMatch(markdown, /Infinity|null|undefined|NaN/);
});

async function popoverBlock({ opens, staleDialog = false }) {
	const window = new Window({ url: 'http://127.0.0.1:43210/org/synthetic-a/calendar' });
	const { document } = window;
	// happy-dom has no layout, so a connected element that is not hidden counts as rendered.
	window.Element.prototype.getClientRects = function () {
		return this.isConnected && !this.closest('[hidden]') ? [{}] : [];
	};
	document.body.innerHTML = `
		<span data-testid="calendar-month-label">October 2026</span>
		<button aria-label="Calendar group filter">Group: All</button>
		<div data-slot="bar-track"><button data-entry-id="entry-1" aria-expanded="false">Leave</button></div>`;
	const bar = document.querySelector('[data-entry-id]');
	const popover = (label) => {
		const element = document.createElement('div');
		element.dataset.slot = 'popover-content';
		element.setAttribute('role', 'dialog');
		element.setAttribute('aria-label', label);
		return element;
	};
	if (staleDialog) document.body.append(popover('Sick, SGT Okafor'));
	bar.addEventListener('click', () => {
		if (!opens) return;
		const own = popover('Leave, SGT Smith');
		own.addEventListener('keydown', (event) => {
			if (event.key !== 'Escape') return;
			own.remove();
			bar.setAttribute('aria-expanded', 'false');
		});
		document.body.append(own);
		bar.setAttribute('aria-expanded', 'true');
	});

	const globals = {
		window,
		document,
		requestAnimationFrame: (callback) => window.setTimeout(() => callback(performance.now()), 1),
		KeyboardEvent: window.KeyboardEvent,
		InputEvent: window.InputEvent,
		PointerEvent: window.PointerEvent,
		PerformanceObserver: class {
			observe() {}
			takeRecords() {
				return [];
			}
			disconnect() {}
		}
	};
	const previous = Object.fromEntries(Object.keys(globals).map((key) => [key, globalThis[key]]));
	Object.assign(globalThis, globals);
	try {
		const records = await runBlock({
			block: 'popover',
			warmup: 0,
			reps: 2,
			idleMs: 0,
			timeoutMs: 60,
			anchorLabel: 'October 2026'
		});
		return records.map(({ id, round, error, ms, detail }) => ({
			id,
			round,
			error,
			timed: typeof ms === 'number',
			title: detail?.title
		}));
	} finally {
		Object.assign(globalThis, previous);
		await window.happyDOM.close();
	}
}

test('the popover block times a bar whose own popover opens', async () => {
	assert.deepEqual(await popoverBlock({ opens: true }), [
		{ id: 'popover-open', round: 0, error: null, timed: true, title: 'Leave, SGT Smith' },
		{ id: 'popover-open', round: 1, error: null, timed: true, title: 'Leave, SGT Smith' }
	]);
});

test('the popover block records a click that opens nothing as a failure, even beside a stale dialog', async () => {
	const failed = [0, 1].map((round) => ({
		id: 'popover-open',
		round,
		error: 'expected change never rendered',
		timed: false,
		title: undefined
	}));

	assert.deepEqual(await popoverBlock({ opens: false }), failed);
	assert.deepEqual(await popoverBlock({ opens: false, staleDialog: true }), failed);
});
