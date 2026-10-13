import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';
import {
	checkSweep,
	parseSweepArguments,
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
const rules = { expect, pinned, search: true };
const checks = (trace) => checkSweep(trace, rules).failures.map((f) => f.check);

test('accepts a reversible one-at-a-time sweep and reports where each control folds and returns', () => {
	const verdict = checkSweep(sweep(), rules);
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

// [viewport width, folded count, search mode, row content width]. The sidebar docks at 768px, so the row
// is wider just below it than just above it.
function shellSweep(rows) {
	const steps = rows.map(([width, folded, search, contentWidth]) => step([width, folded, search], { contentWidth }));
	return { down: steps, up: [...steps].reverse().slice(1) };
}
const dockedRows = [
	[1440, 0, 'field', 1168],
	[1300, 1, 'field', 1028],
	[1200, 2, 'field', 928],
	[1100, 3, 'field', 828],
	[1000, 4, 'field', 728],
	[900, 5, 'field', 628],
	[800, 6, 'field', 528]
];

test('judges direction by row width, so controls returning where the shell docks its sidebar are accepted', () => {
	const rows = [
		...dockedRows,
		[700, 4, 'field', 658],
		[600, 5, 'field', 558],
		[500, 6, 'field', 458],
		[400, 7, 'icon', 358]
	];
	assert.deepEqual(checkSweep(shellSweep(rows), { expect }).failures, []);
});

test('still rejects a control coming back while the row narrows', () => {
	const rows = [...dockedRows, [700, 5, 'field', 428]];
	const failures = checkSweep(shellSweep(rows), { expect }).failures;
	assert.deepEqual(
		failures.map((f) => [f.check, f.width]),
		[['direction', 700]]
	);
	assert.match(failures[0].detail, /came back while the row narrowed going down/);
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
		checkSweep(trace, rules)
			.failures.filter((f) => f.check === 'pinned')
			.map((f) => f.width),
		[600]
	);
});

const everyRead = (trace) => [...trace.down, ...trace.up].flatMap((entry) => [entry.read, ...entry.holds]);

test('rejects a pinned primary control that is missing from every read', () => {
	const trace = sweep();
	for (const entry of everyRead(trace)) entry.ids = entry.ids.filter((id) => id !== 'record');
	const failures = checkSweep(trace, rules).failures.filter((f) => f.check === 'pinned');
	assert.equal(failures.length, trace.down.length + trace.up.length);
	assert.equal(failures[0].detail, 'record is not on the row.');
	assert.deepEqual(checkSweep(trace, { expect }).failures, [], 'nothing is pinned unless the run names it');
});

test('rejects a pinned control missing from a hold read alone', () => {
	const trace = sweep();
	trace.down[1].holds[2].ids = trace.down[1].holds[2].ids.filter((id) => id !== 'record');
	assert.deepEqual(
		checkSweep(trace, rules).failures.map((f) => [f.check, f.width]),
		[
			['pinned', 1300],
			['stable', 1300]
		]
	);
});

test('rejects a run that requires search when search reads none in every read', () => {
	const trace = sweep();
	for (const entry of everyRead(trace)) entry.search = 'none';
	const failures = checkSweep(trace, rules).failures.filter((f) => f.check === 'search-present');
	assert.equal(failures.length, trace.down.length + trace.up.length);
	assert.equal(failures[0].detail, 'Search reads none.');
	assert.deepEqual(checkSweep(trace, { expect, pinned }).failures, [], 'search is optional unless the run requires it');
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

test('with --more-always accepts More at every width and still rejects a read without it', () => {
	const trace = sweep();
	for (const s of [...trace.down, ...trace.up]) for (const r of [s.read, ...s.holds]) r.more = true;
	assert.deepEqual(
		checkSweep(trace, rules)
			.failures.filter((f) => f.check === 'more')
			.map((f) => f.width),
		[1440, 1440]
	);
	assert.deepEqual(checkSweep(trace, { ...rules, moreAlways: true }).failures, []);
	trace.up[2].read.more = false;
	assert.deepEqual(
		checkSweep(trace, { ...rules, moreAlways: true })
			.failures.filter((f) => f.check === 'more')
			.map((f) => [f.width, f.detail]),
		[[800, 'More is absent; --more-always requires it at every width.']]
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

const searchField = '<div data-search-field><input type="search" aria-label="Search"></div>';
function laidOut(window, place, { clientWidth = 500 } = {}) {
	const row = window.document.querySelector('[data-toolbar-row]');
	Object.defineProperty(row, 'clientWidth', { value: clientWidth });
	Object.defineProperty(row, 'scrollWidth', { value: clientWidth });
	const box = (left, right, top = 100) => ({ left, right, top, bottom: top + 32, width: right - left, height: 32 });
	row.getBoundingClientRect = () => box(0, clientWidth);
	for (const [selector, rect] of Object.entries(place)) row.querySelector(selector).getBoundingClientRect = () => rect;
	return box;
}

test('counts the search control as a row part, so a search field on a second row is two rows', async (t) => {
	const window = page(fitted(['export', 'record'], searchField));
	t.after(() => window.happyDOM.close());
	const box = laidOut(window, {});
	const row = window.document.querySelector('[data-toolbar-row]');
	row.querySelector('[data-toolbar-item="export"]').getBoundingClientRect = () => box(0, 100);
	row.querySelector('[data-toolbar-item="record"]').getBoundingClientRect = () => box(106, 266);
	row.querySelector('[data-search-field]').getBoundingClientRect = () => box(0, 320, 140);
	const result = readToolbar(window, 'Controls');
	assert.equal(result.rowCount, 2);
	assert.deepEqual(result.tops, [116, 156]);
	assert.ok(
		checkSweep(
			{ down: [{ width: 1440, read: { ...read(1440, 0, 'field'), ...result }, holds: [] }], up: [] },
			{ expect }
		).failures.some((f) => f.check === 'one-row')
	);
});

test('reports a control past either edge of the row content box, search included', async (t) => {
	const window = page(fitted(['export', 'record'], searchField));
	t.after(() => window.happyDOM.close());
	const box = laidOut(window, {});
	const row = window.document.querySelector('[data-toolbar-row]');
	row.querySelector('[data-toolbar-item="export"]').getBoundingClientRect = () => box(-50, 50);
	row.querySelector('[data-toolbar-item="record"]').getBoundingClientRect = () => box(56, 216);
	row.querySelector('[data-search-field]').getBoundingClientRect = () => box(222, 520);
	assert.deepEqual(readToolbar(window, 'Controls').clipped, ['export', 'search']);
	row.querySelector('[data-toolbar-item="export"]').getBoundingClientRect = () => box(0, 50);
	row.querySelector('[data-search-field]').getBoundingClientRect = () => box(222, 500);
	assert.deepEqual(readToolbar(window, 'Controls').clipped, []);
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

const runArgs = ['1', 'Critical Tasks controls', 'run', '--expect', 'export,reports'];

test('parses the pinned ids and the search requirement, which default to none', () => {
	const defaults = parseSweepArguments(runArgs);
	assert.deepEqual(defaults, {
		pageId: 1,
		label: 'Critical Tasks controls',
		runName: 'run',
		expectIds: ['export', 'reports'],
		pinnedIds: [],
		search: false,
		moreAlways: false,
		from: 1440,
		to: 390,
		step: 2,
		height: 900,
		recordName: undefined
	});
	const explicit = parseSweepArguments([
		...runArgs,
		'--pinned',
		'record,add',
		'--search',
		'--step',
		'1',
		'--record',
		'sweep'
	]);
	assert.deepEqual(
		[explicit.pinnedIds, explicit.search, explicit.step, explicit.recordName],
		[['record', 'add'], true, 1, 'sweep']
	);
	assert.equal(parseSweepArguments(['1', 'Controls', 'run', '--search', '--expect', 'export']).search, true);
	assert.equal(parseSweepArguments([...runArgs, '--more-always']).moreAlways, true);
});

test('rejects a pinned id that is also expected to fold, a value on --search, and repeated or unknown flags', () => {
	for (const flags of [
		['--pinned', 'export'],
		['--pinned', 'a,a'],
		['--search', 'yes'],
		['--search', '--search'],
		['--more-always', 'yes'],
		['--more-always', '--more-always'],
		['--pinned'],
		['--pinned', '--search'],
		['--unknown', 'x']
	])
		assert.throws(() => parseSweepArguments([...runArgs, ...flags]), /toolbar-sweep|distinct/, flags.join(' '));
});

test('carries the pinned ids, search and more-always requirements into the trace and the verdict', async () => {
	const rows = [
		[1440, 0, 'field'],
		[1340, 1, 'field']
	];
	const written = [];
	const result = await runSweep({
		page: fakePage(rows),
		expect: expect.slice(0, 1),
		pinned: ['record', 'missing-one'],
		search: true,
		moreAlways: true,
		from: 1440,
		to: 1340,
		step: 100,
		height: 900,
		write: async (r) => written.push(r),
		sleep: async () => {}
	});
	assert.deepEqual([result.pinned, result.search, result.moreAlways], [['record', 'missing-one'], true, true]);
	assert.deepEqual(
		result.verdict.failures.map((f) => [f.check, f.width, f.detail]),
		[
			['pinned', 1440, 'missing-one is not on the row.'],
			['more', 1440, 'More is absent; --more-always requires it at every width.'],
			['pinned', 1340, 'missing-one is not on the row.'],
			['pinned', 1440, 'missing-one is not on the row.'],
			['more', 1440, 'More is absent; --more-always requires it at every width.']
		]
	);
});

test('parses --no-fold as an expectation-free sweep that must pin something', () => {
	const parsed = parseSweepArguments(['1', 'Controls', 'run', '--no-fold', '--pinned', 'new-type']);
	assert.deepEqual([parsed.expectIds, parsed.pinnedIds], [[], ['new-type']]);
	for (const flags of [
		['--no-fold'],
		['--no-fold', '--expect', 'export', '--pinned', 'record'],
		['--no-fold', '--no-fold', '--pinned', 'record'],
		['--no-fold', 'yes', '--pinned', 'record'],
		['--pinned', 'record']
	])
		assert.throws(() => parseSweepArguments(['1', 'Controls', 'run', ...flags]), /toolbar-sweep/, flags.join(' '));
});

test('rejects --no-fold together with --more-always, which contradict each other', () => {
	for (const flags of [
		['--no-fold', '--more-always', '--pinned', 'record'],
		['--more-always', '--pinned', 'record', '--no-fold']
	])
		assert.throws(
			() => parseSweepArguments(['1', 'Controls', 'run', ...flags]),
			/--no-fold.*--more-always.*cannot be combined/,
			flags.join(' ')
		);
});

test('a no-fold sweep accepts a row that never folds and rejects More or a missing pinned id', () => {
	const rows = [1440, 1000, 700, 390].map((width) => [width, 0, 'none']);
	const none = { expect: [], pinned: ['record'] };
	const trace = () => ({
		down: rows.map((row) => ({ width: row[0], read: read(...row, { ids: ['record'] }), holds: [] })),
		up: [...rows]
			.reverse()
			.slice(1)
			.map((row) => ({ width: row[0], read: read(...row, { ids: ['record'] }), holds: [] }))
	});
	assert.deepEqual(checkSweep(trace(), none).failures, []);

	const withMore = trace();
	withMore.down[2].read.more = true;
	assert.deepEqual(
		checkSweep(withMore, none).failures.map((f) => [f.check, f.width]),
		[
			['more', 700],
			['same-width', 700]
		]
	);

	const lost = trace();
	lost.down[3].read.ids = [];
	assert.deepEqual(
		checkSweep(lost, none).failures.map((f) => [f.check, f.width]),
		[['pinned', 390]]
	);
});
