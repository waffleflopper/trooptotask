import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';
import {
	checkSweep,
	readToolbar,
	restoreViewport,
	runSweep,
	sweepWidths,
	toolbarReadSource
} from './toolbar-sweep.mjs';

const expect = ['export', 'import', 'library', 'reports', 'gaps', 'group', 'view'];
const pinned = ['record'];

// Literal accepted trace: [viewport width, folded count, search mode]. The ids are written out by the
// test, never derived from any fold rule.
const table = [
	[1440, 0, 'field'],
	[1300, 1, 'field'],
	[1200, 2, 'field'],
	[1100, 3, 'field'],
	[1000, 4, 'field'],
	[900, 5, 'field'],
	[800, 6, 'field'],
	[700, 7, 'field'],
	[600, 7, 'icon'],
	[390, 7, 'icon']
];

function read(width, folded, search, over = {}) {
	return {
		fitted: true,
		viewportWidth: width,
		ids: [...pinned, ...expect.slice(folded)],
		more: folded > 0,
		search,
		ready: 'true',
		contentWidth: width - 272,
		rowCount: 1,
		tops: [97],
		clipped: [],
		rowClientWidth: width - 300,
		rowScrollWidth: width - 300,
		rootClientWidth: width - 280,
		rootScrollWidth: width - 280,
		flips: {},
		remounted: false,
		...over
	};
}
const step = (row, over = {}) => ({ width: row[0], read: read(...row, over), holds: [] });
function sweep(rows = table) {
	const down = rows.map((row, i) => {
		const held = i > 0 && rows[i - 1][1] !== row[1];
		const flips = held ? { [expect[row[1] - 1]]: 1 } : {};
		return {
			width: row[0],
			read: read(...row, { flips }),
			holds: held ? [read(...row), read(...row), read(...row)] : []
		};
	});
	const up = [...rows]
		.reverse()
		.slice(1)
		.map((row) => step(row));
	return { down, up };
}
const checks = (trace) => checkSweep(trace, { expect }).failures.map((f) => f.check);

test('accepts a reversible one-at-a-time sweep and reports where each control folds and returns', () => {
	const verdict = checkSweep(sweep(), { expect });
	assert.deepEqual(verdict.failures, []);
	assert.equal(verdict.ok, true);
	assert.deepEqual(verdict.foldedAt, {
		export: 1300,
		import: 1200,
		library: 1100,
		reports: 1000,
		gaps: 900,
		group: 800,
		view: 700
	});
	assert.deepEqual(verdict.restoredAt, {
		view: 800,
		group: 900,
		gaps: 1000,
		reports: 1100,
		library: 1200,
		import: 1300,
		export: 1440
	});
});

test('rejects a control folding out of the approved order', () => {
	const trace = sweep();
	trace.down[1].read.ids = [...pinned, ...expect.filter((id) => id !== 'import')];
	assert.ok(checks(trace).includes('order'));
});

test('reports, without hiding it, a step that folds two controls at once', () => {
	const rows = table.filter((row) => row[0] !== 1300);
	const failures = checkSweep(sweep(rows), { expect }).failures;
	assert.deepEqual(
		failures.map((f) => [f.check, f.width]),
		[
			['one-at-a-time', 1200],
			['one-at-a-time', 1440]
		]
	);
	assert.match(failures[0].detail, /export, import folded in one step/);
	assert.match(failures[1].detail, /export, import restored in one step/);
});

test('rejects search collapsing to an icon while a listed control is still on the row', () => {
	const rows = table.map((row) => (row[0] === 900 ? [900, 5, 'icon'] : row));
	const failures = checkSweep(sweep(rows), { expect }).failures;
	assert.deepEqual(
		failures.filter((f) => f.check === 'search').map((f) => [f.width, f.detail]),
		[
			[900, 'Search is an icon while group, view still on the row.'],
			[900, 'Search is an icon while group, view still on the row.']
		]
	);
});

test('rejects a fixed-width oscillation through changed hold reads and repeated flips', () => {
	const trace = sweep();
	trace.down[3].holds[1] = read(1100, 4, 'field');
	trace.down[3].holds[2] = read(1100, 3, 'field', { flips: { reports: 1 } });
	trace.down[3].read.flips = { library: 1 };
	trace.down[3].holds[1].flips = { library: 1 };
	const failures = checkSweep(trace, { expect }).failures;
	assert.ok(failures.some((f) => f.check === 'stable' && f.width === 1100));
	assert.ok(failures.some((f) => f.check === 'flips' && /library changed membership 2 times/.test(f.detail)));
});

test('rejects a fold that flips and returns between two reads', () => {
	const trace = sweep();
	trace.down[2].read.flips = { export: 2 };
	assert.deepEqual(
		checkSweep(trace, { expect }).failures.map((f) => [f.check, f.width]),
		[['flips', 1200]]
	);
});

test('rejects the pinned primary control leaving the row', () => {
	const trace = sweep();
	trace.down[8].read.ids = trace.down[8].read.ids.filter((id) => id !== 'record');
	assert.deepEqual(
		checkSweep(trace, { expect })
			.failures.filter((f) => f.check === 'pinned')
			.map((f) => f.width),
		[600]
	);
});

test('rejects different state at the same content width going down and coming up', () => {
	const trace = sweep();
	const up = trace.up.find((s) => s.width === 900);
	up.read = read(900, 4, 'field');
	const failures = checkSweep(trace, { expect }).failures;
	assert.ok(failures.some((f) => f.check === 'same-width' && f.width === 900));
	assert.match(failures.find((f) => f.check === 'same-width').detail, /Content width 628px/);
});

test('treats equal content widths at different viewport widths as the same input', () => {
	const trace = sweep();
	trace.up[0].read = read(300, 7, 'icon', { contentWidth: 390 - 272 });
	trace.up[0].width = 300;
	const failures = checkSweep(trace, { expect }).failures.filter((f) => f.check === 'same-width');
	assert.deepEqual(failures, []);
	trace.up[0].read = read(300, 7, 'field', { contentWidth: 390 - 272 });
	assert.ok(checkSweep(trace, { expect }).failures.some((f) => f.check === 'same-width'));
});

test('rejects a second row, overflow, a clipped control and a missing or premature More', () => {
	const trace = sweep();
	trace.down[1].read.rowCount = 2;
	trace.down[1].read.tops = [97, 135];
	trace.down[2].read.rowScrollWidth = 1000;
	trace.down[2].read.rowClientWidth = 900;
	trace.down[3].read.clipped = ['reports'];
	trace.down[4].read.more = false;
	trace.down[0].read.more = true;
	assert.deepEqual(
		checkSweep(trace, { expect })
			.failures.filter((f) => ['more', 'one-row', 'no-overflow', 'inside-row'].includes(f.check))
			.map((f) => [f.width, f.check]),
		[
			[1440, 'more'],
			[1300, 'one-row'],
			[1200, 'no-overflow'],
			[1100, 'inside-row'],
			[1000, 'more']
		]
	);
});

test('tolerates half a pixel of browser rounding in scroll width', () => {
	const trace = sweep();
	trace.down[2].read.rowScrollWidth = trace.down[2].read.rowClientWidth + 0.5;
	assert.deepEqual(checks(trace), []);
});

test('requires the sweep to start with every listed control on the row and the viewport to apply', () => {
	const rows = table.map((row) => (row[0] === 1440 ? [1440, 1, 'field'] : row));
	assert.ok(checks(sweep(rows)).includes('start-all-fit'));
	const trace = sweep();
	trace.down[5].read.viewportWidth = 912;
	assert.ok(checks(trace).includes('resize'));
});

test('reports a toolbar that is not fitted instead of judging its geometry', () => {
	const trace = sweep();
	trace.down[0].read = {
		fitted: false,
		viewportWidth: 1440,
		reason: 'toolbar has no data-toolbar-row; not a fitted toolbar'
	};
	assert.deepEqual(checkSweep(trace, { expect }), {
		ok: false,
		failures: [{ check: 'fitted', width: 1440, detail: 'toolbar has no data-toolbar-row; not a fitted toolbar' }],
		foldedAt: {},
		restoredAt: {}
	});
});

function page(html) {
	const window = new Window({ width: 1000, height: 800 });
	window.document.body.innerHTML = html;
	return window;
}
const fitted = (items, extra = '') =>
	`<div role="toolbar" aria-label="Controls" data-toolbar-search="field" data-toolbar-ready="true">
		<div data-toolbar-row>${items
			.map((id) => `<div data-toolbar-item="${id}"><button>${id}</button></div>`)
			.join('')}${extra}</div>
		<div data-toolbar-measure aria-hidden="true"><div data-toolbar-item="ghost"></div><div data-toolbar-item="export"></div></div>
	</div>`;

test('reads live item ids, More, search mode and readiness while ignoring the measuring copies', async (t) => {
	const window = page(fitted(['export', 'reports', 'record'], '<button data-toolbar-more>More</button>'));
	t.after(() => window.happyDOM.close());
	const result = readToolbar(window, 'Controls');
	assert.equal(result.fitted, true);
	assert.deepEqual(result.ids, ['export', 'reports', 'record']);
	assert.equal(result.more, true);
	assert.equal(result.search, 'field');
	assert.equal(result.ready, 'true');
	assert.deepEqual(result.flips, {});
});

test('reports a toolbar without a measured row as not fitted and lists what it found', async (t) => {
	const window = page(
		'<div role="toolbar" aria-label="Controls"><button aria-label="Export Excel">x</button><a href="/r">Reports</a></div>'
	);
	t.after(() => window.happyDOM.close());
	const result = readToolbar(window, 'Controls');
	assert.equal(result.fitted, false);
	assert.equal(result.reason, 'toolbar has no data-toolbar-row; not a fitted toolbar');
	assert.deepEqual(result.controls, ['Export Excel', 'Reports']);
});

test('requires exactly one toolbar with the name', async (t) => {
	const window = page(fitted(['a']) + fitted(['b']));
	t.after(() => window.happyDOM.close());
	assert.throws(() => readToolbar(window, 'Controls'), /Expected one toolbar named Controls, found 2/);
	assert.throws(() => readToolbar(window, 'Other'), /found 0/);
});

test('counts per-id membership changes between reads and resets after each read', async (t) => {
	const window = page(fitted(['export', 'reports', 'record']));
	t.after(() => window.happyDOM.close());
	const row = () => window.document.querySelector('[data-toolbar-row]');
	readToolbar(window, 'Controls');
	const reports = row().querySelector('[data-toolbar-item="reports"]');
	reports.remove();
	await new Promise((resolve) => setTimeout(resolve, 0));
	row().insertBefore(reports, row().lastElementChild);
	await new Promise((resolve) => setTimeout(resolve, 0));
	row().querySelector('[data-toolbar-item="export"]').remove();
	await new Promise((resolve) => setTimeout(resolve, 0));
	const result = readToolbar(window, 'Controls');
	assert.deepEqual(result.flips, { reports: 2, export: 1 });
	assert.deepEqual(readToolbar(window, 'Controls').flips, {});
});

test('does not count a change inside the measuring copies and flags a replaced toolbar root', async (t) => {
	const window = page(fitted(['export', 'record']));
	t.after(() => window.happyDOM.close());
	readToolbar(window, 'Controls');
	window.document.querySelector('[data-toolbar-measure]').append(window.document.createElement('div'));
	window.document.querySelector('[data-toolbar-measure] [data-toolbar-item="ghost"]').remove();
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.deepEqual(readToolbar(window, 'Controls').flips, {});
	window.document.body.innerHTML = fitted(['export', 'record']);
	assert.equal(readToolbar(window, 'Controls').remounted, true);
});

test('reads one row, the row content width and a control past the row edge from live geometry', async (t) => {
	const window = page(fitted(['export', 'reports', 'record']));
	t.after(() => window.happyDOM.close());
	const row = window.document.querySelector('[data-toolbar-row]');
	Object.defineProperty(row, 'clientWidth', { value: 500 });
	Object.defineProperty(row, 'scrollWidth', { value: 640 });
	row.style.paddingLeft = '10px';
	row.style.paddingRight = '10px';
	const box = (left, right, top = 100) => ({ left, right, top, bottom: top + 32, width: right - left, height: 32 });
	row.getBoundingClientRect = () => box(0, 500);
	const place = { export: box(10, 200), reports: box(206, 400), record: box(406, 520, 140) };
	for (const [id, rect] of Object.entries(place))
		row.querySelector(`[data-toolbar-item="${id}"]`).getBoundingClientRect = () => rect;
	const result = readToolbar(window, 'Controls');
	assert.equal(result.contentWidth, 480);
	assert.equal(result.rowCount, 2);
	assert.deepEqual(result.tops, [116, 156]);
	assert.deepEqual(result.clipped, ['record']);
	assert.equal(result.rowScrollWidth, 640);
});

test('the injected page source reads only on the owned origin after fonts and two frames', () => {
	const source = toolbarReadSource('Critical Tasks controls', 'http://127.0.0.1:4100');
	assert.match(source, /location\.origin !== "http:\/\/127\.0\.0\.1:4100"/);
	assert.match(source, /"Critical Tasks controls"/);
	assert.match(source, /fonts\?\.ready/);
	assert.equal(source.match(/requestAnimationFrame/g).length, 2);
});

test('sweeps widths downward in whole steps and always ends on the target', () => {
	assert.deepEqual(sweepWidths(10, 3, 3), [10, 7, 4, 3]);
	assert.deepEqual(sweepWidths(10, 4, 3), [10, 7, 4]);
});

function fakePage(rows, { failAt, stopError } = {}) {
	const log = [];
	let width = 0;
	let reads = 0;
	return {
		log,
		resize: async (w, h) => log.push(`resize ${w}x${h}`) && (width = w),
		read: async () => {
			reads++;
			if (failAt && width === failAt) throw new Error('page went away');
			const row = rows.find((r) => r[0] === width);
			return read(width, row[1], row[2]);
		},
		startRecording: async (file) => log.push(`start ${file}`),
		stopRecording: async () => {
			log.push('stop');
			if (stopError) throw new Error(stopError);
		},
		reads: () => reads
	};
}

test('runs the whole sweep, holds only where membership changed, and writes the verdict', async () => {
	const written = [];
	const waits = [];
	const rows = [
		[1440, 0, 'field'],
		[1340, 1, 'field'],
		[1240, 1, 'field'],
		[1140, 2, 'field'],
		[1100, 2, 'field']
	];
	const p = fakePage(rows);
	const result = await runSweep({
		page: p,
		expect: expect.slice(0, 2),
		from: 1440,
		to: 1100,
		step: 100,
		height: 900,
		recording: '/evidence/run/sweep.webm',
		write: async (r) => written.push(r),
		sleep: async (ms) => waits.push(ms)
	});
	assert.equal(result.error, null);
	assert.deepEqual(waits, [250, 250, 250, 250]);
	assert.deepEqual(
		result.down.map((s) => [s.width, s.holds.length]),
		[
			[1440, 0],
			[1340, 3],
			[1240, 0],
			[1140, 3],
			[1100, 0]
		]
	);
	assert.deepEqual(
		result.up.map((s) => [s.width, s.holds.length]),
		[
			[1140, 0],
			[1240, 3],
			[1340, 0],
			[1440, 3]
		]
	);
	assert.deepEqual(p.log.slice(0, 3), ['resize 1440x900', 'start /evidence/run/sweep.webm', 'resize 1440x900']);
	assert.deepEqual(p.log.slice(-2), ['stop', `resize ${restoreViewport.width}x${restoreViewport.height}`]);
	assert.equal(written.length, 1);
	assert.equal(written[0], result);
	assert.deepEqual(result.recording, { file: '/evidence/run/sweep.webm', stopped: true });
	assert.equal(result.verdict.ok, true);
});

test('stops the recording, restores the viewport and writes the trace when the page fails mid-sweep', async () => {
	const written = [];
	const rows = [
		[1440, 0, 'field'],
		[1320, 1, 'field'],
		[1200, 2, 'field']
	];
	const p = fakePage(rows, { failAt: 1200 });
	const result = await runSweep({
		page: p,
		expect: expect.slice(0, 2),
		from: 1440,
		to: 1200,
		step: 120,
		height: 900,
		recording: '/evidence/run/x.webm',
		write: async (r) => written.push(r),
		sleep: async () => {}
	});
	assert.equal(result.error, 'page went away');
	assert.equal(result.verdict.ok, false);
	assert.equal(result.verdict.failures[0].check, 'aborted');
	assert.deepEqual(p.log.slice(-2), ['stop', 'resize 1280x800']);
	assert.equal(written.length, 1);
});

test('fails the verdict when the recording cannot be stopped, yet still restores and writes', async () => {
	const written = [];
	const p = fakePage([[1440, 0, 'field']], { stopError: 'ffmpeg exited' });
	const result = await runSweep({
		page: p,
		expect: [],
		from: 1440,
		to: 1440,
		step: 10,
		height: 900,
		recording: '/evidence/run/y.webm',
		write: async (r) => written.push(r),
		sleep: async () => {}
	});
	assert.equal(result.recording.stopped, false);
	assert.equal(result.recording.stopError, 'ffmpeg exited');
	assert.equal(result.verdict.ok, false);
	assert.deepEqual(result.verdict.failures.at(-1), { check: 'recording', width: null, detail: 'ffmpeg exited' });
	assert.equal(p.log.at(-1), 'resize 1280x800');
	assert.equal(written.length, 1);
});
