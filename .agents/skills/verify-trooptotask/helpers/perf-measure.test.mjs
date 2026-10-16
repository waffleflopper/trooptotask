import assert from 'node:assert/strict';
import { gunzipSync, gzipSync } from 'node:zlib';
import { test } from 'node:test';
import {
	distribution,
	groupManifest,
	parseServerTiming,
	redactTrace,
	serverTimingPhases,
	summarizeTrace
} from './perf-measure.mjs';

const origin = 'http://127.0.0.1:4000';
const entry = (name, initiatorType, transferSize, encodedBodySize, decodedBodySize) => ({
	name,
	initiatorType,
	transferSize,
	encodedBodySize,
	decodedBodySize,
	startTime: 10,
	responseEnd: 20
});

test('the manifest groups requests by kind and keeps cache hits and invalidation bits', () => {
	const manifest = groupManifest(
		{
			navigation: entry(`${origin}/org/1/personnel`, 'navigation', 1300, 1000, 5000),
			resources: [
				entry(`${origin}/_app/immutable/chunks/a.js`, 'script', 0, 400, 1200),
				entry(`${origin}/_app/immutable/chunks/b.js`, 'script', 700, 600, 1800),
				entry(`${origin}/_app/immutable/assets/0.css`, 'link', 0, 300, 900),
				entry(`${origin}/org/1/__data.json?x-sveltekit-invalidated=0110`, 'fetch', 500, 200, 800),
				entry(`${origin}/org/1/api/app-shell-chrome`, 'fetch', 360, 60, 60),
				entry('http://127.0.0.1:5000/rest/v1/personnel?select=*', 'fetch', 900, 800, 3000),
				entry(`${origin}/_app/immutable/assets/font.woff2`, 'css', 0, 50, 50)
			]
		},
		origin
	);
	assert.equal(manifest.requests, 8);
	assert.equal(manifest.transferSize, 3760);
	assert.deepEqual(manifest.groups.js, {
		requests: 2,
		fromCache: 1,
		transferSize: 700,
		encodedBodySize: 1000,
		decodedBodySize: 3000
	});
	assert.deepEqual(Object.fromEntries(Object.entries(manifest.groups).map(([name, group]) => [name, group.requests])), {
		document: 1,
		js: 2,
		css: 1,
		data: 2,
		provider: 1,
		other: 1
	});
	const data = manifest.entries.find((request) => request.path === '/org/1/__data.json');
	assert.equal(data.invalidated, '0110');
	assert.equal(
		manifest.entries.find((request) => request.category === 'provider').path,
		'http://127.0.0.1:5000/rest/v1/personnel'
	);
});

test('the distribution reports every sample and an even-count median', () => {
	assert.deepEqual(distribution([30, 10, 20, 40]), { n: 4, min: 10, median: 25, max: 40, samples: [30, 10, 20, 40] });
	assert.deepEqual(distribution([5, null, undefined, Number.NaN, 7, 6]), {
		n: 3,
		min: 5,
		median: 6,
		max: 7,
		samples: [5, 7, 6]
	});
	assert.deepEqual(distribution([]), { n: 0, min: null, median: null, max: null, samples: [] });
});

test('server timing lines are read for one Organization, including wrapped inspect output', () => {
	const log = [
		"[dashboard-load] { orgId: 'org-a', phase: 'summary', durationMs: 3485, status: 'ok' }",
		"[calendar-load] {\n  orgId: 'org-a',\n  phase: 'availability',\n  durationMs: 41,\n  status: 'ok'\n}",
		"[training-load] { orgId: 'org-b', phase: 'records', durationMs: 9, status: 'ok' }",
		"[other-load] { orgId: 'org-a', phase: 'x', durationMs: 1, status: 'ok' }"
	].join('\n');
	assert.deepEqual(parseServerTiming(log, 'org-a'), [
		{ feature: 'dashboard', phase: 'summary', durationMs: 3485, status: 'ok' },
		{ feature: 'calendar', phase: 'availability', durationMs: 41, status: 'ok' }
	]);
});

test('concurrent loads of one phase are reported individually, not summed', () => {
	const summary = (durationMs) => ({ feature: 'dashboard', phase: 'summary', durationMs, status: 'ok' });
	const phases = serverTimingPhases([
		{ serverTiming: [summary(20500), summary(20700)] },
		{ serverTiming: [summary(20600)] },
		{ serverTiming: [] }
	]);
	assert.deepEqual(Object.keys(phases), ['dashboard:summary']);
	assert.deepEqual(phases['dashboard:summary'].durationMs, distribution([20500, 20700, 20600]));
	assert.deepEqual(phases['dashboard:summary'].loadsPerSample, distribution([2, 1, 0]));
});

test('the trace summary measures the last main-frame navigation only', () => {
	const pid = 7;
	const tid = 1;
	const navigationStart = (ts, url) => ({
		name: 'navigationStart',
		ph: 'R',
		pid,
		tid,
		ts,
		args: { data: { isLoadingMainFrame: true, documentLoaderURL: url } }
	});
	const task = (ts, dur, name = 'RunTask') => ({ name, ph: 'X', pid, tid, ts, dur });
	const events = [
		navigationStart(0, 'http://127.0.0.1:4000/auth/login'),
		task(100, 90_000),
		navigationStart(1_000_000, 'http://127.0.0.1:4000/org/1/personnel'),
		task(1_010_000, 120_000),
		task(1_010_000, 80_000, 'EvaluateScript'),
		task(1_020_000, 30_000, 'FunctionCall'),
		task(1_100_000, 10_000, 'Layout'),
		{ name: 'firstContentfulPaint', ph: 'R', pid, tid, ts: 1_200_000 },
		task(1_300_000, 70_000),
		task(1_400_000, 20_000),
		{ name: 'largestContentfulPaint::Candidate', ph: 'R', pid, tid, ts: 1_250_000 },
		{ name: 'largestContentfulPaint::Candidate', ph: 'R', pid, tid, ts: 1_450_000 },
		task(1_500_000, 60_000, 'RunTask'),
		{ ...task(1_300_000, 500_000), pid: 8 }
	];
	const summary = summarizeTrace(gzipSync(JSON.stringify({ traceEvents: events })));
	assert.equal(summary.url, '/org/1/personnel');
	assert.equal(summary.firstContentfulPaintMs, 200);
	assert.equal(summary.largestContentfulPaintMs, 450);
	assert.equal(summary.mainThreadBusyMs, 270);
	assert.equal(summary.scriptingMs, 80);
	assert.equal(summary.styleLayoutPaintMs, 10);
	assert.deepEqual(summary.longTasks, { count: 3, totalMs: 250, longestMs: 120 });
	assert.equal(summary.blockingAfterFirstPaintMs, 30);
	assert.equal(summary.windowMs, 560);
	assert.deepEqual(summarizeTrace(Buffer.from('[]')), {
		navigation: null,
		reason: 'No main-frame navigation in this trace.'
	});
});

test('trace redaction removes the sign-in password and keeps the events', () => {
	const password = 'Synthetic-"quoted"\\-1!';
	const source = `body.set('password', ${JSON.stringify(password)});`;
	const events = [{ name: 'ScriptSource', ph: 'X', args: { data: { sourceText: source } } }];
	const redacted = gunzipSync(redactTrace(gzipSync(JSON.stringify({ traceEvents: events })), [password])).toString();
	assert.ok(!redacted.includes('Synthetic-'));
	assert.deepEqual(JSON.parse(redacted).traceEvents[0].args.data.sourceText, `body.set('password', "<redacted>");`);
});
