import assert from 'node:assert/strict';
import { gunzipSync, gzipSync } from 'node:zlib';
import { test } from 'node:test';
import {
	distribution,
	failedRequests,
	groupManifest,
	inFlight,
	installSettledObserver,
	statementTotals,
	parseServerTiming,
	redactTrace,
	serverTimingPhases,
	summarizeTrace
} from './perf-measure.mjs';

const origin = 'http://127.0.0.1:4000';
const entry = (name, initiatorType, transferSize, encodedBodySize, decodedBodySize, responseStatus = 200) => ({
	name,
	initiatorType,
	responseStatus,
	transferSize,
	encodedBodySize,
	decodedBodySize,
	startTime: 10,
	responseEnd: 20
});

test('the manifest counts resource entries, network requests and cache hits per kind', () => {
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
				entry(`${origin}/_app/immutable/assets/font.woff2`, 'css', 0, 50, 50),
				entry(`${origin}/_vercel/insights/script.js`, 'script', 300, 9, 9, 404)
			]
		},
		origin
	);
	assert.equal(manifest.resourceEntries, 9);
	assert.equal(manifest.networkRequests, 6);
	assert.equal(manifest.cacheHits, 3);
	assert.equal(manifest.transferSize, 4060);
	assert.deepEqual(manifest.groups.js, {
		resourceEntries: 3,
		networkRequests: 2,
		cacheHits: 1,
		transferSize: 1000,
		encodedBodySize: 1009,
		decodedBodySize: 3009
	});
	assert.deepEqual(
		Object.fromEntries(Object.entries(manifest.groups).map(([name, group]) => [name, group.resourceEntries])),
		{ document: 1, js: 3, css: 1, data: 2, provider: 1, other: 1 }
	);
	const data = manifest.entries.find((request) => request.path === '/org/1/__data.json');
	assert.equal(data.invalidated, '0110');
	assert.equal(manifest.entries.find((request) => request.path === '/_vercel/insights/script.js').status, 404);
	assert.equal(
		manifest.entries.find((request) => request.category === 'provider').path,
		'http://127.0.0.1:5000/rest/v1/personnel'
	);
});

test('failed requests are HTTP errors and network errors, not redirects or pending requests', () => {
	const listed = [
		{ requestId: 1, url: `${origin}/org/1`, status: '200' },
		{ requestId: 2, url: `${origin}/favicon.png`, status: '303' },
		{ requestId: 3, url: `${origin}/_vercel/insights/script.js`, status: '404' },
		{ requestId: 4, url: `${origin}/org/1/__data.json?x-sveltekit-invalidated=11`, status: 'net::ERR_ABORTED' },
		{ requestId: 5, url: `${origin}/org/1/api/app-shell-chrome`, status: 'pending' },
		{ requestId: 6, url: 'http://127.0.0.1:5000/auth/v1/user', status: '503' }
	];
	assert.deepEqual(failedRequests(listed, origin), [
		{ path: '/_vercel/insights/script.js', status: '404' },
		{ path: '/org/1/__data.json', status: 'net::ERR_ABORTED' },
		{ path: 'http://127.0.0.1:5000/auth/v1/user', status: '503' }
	]);
});

test('an answered app fetch is still running until Resource Timing records its body end', () => {
	const data = `${origin}/org/1/__data.json?x-sveltekit-invalidated=11`;
	const chrome = `${origin}/org/1/api/app-shell-chrome`;
	const listed = [
		{ url: `${origin}/org/1`, status: '200' },
		{ url: data, status: '200' },
		{ url: data, status: '200' },
		{ url: chrome, status: 'pending' },
		{ url: 'http://127.0.0.1:5000/rest/v1/x', status: 'pending' }
	];
	const fetches = listed.filter((row) => row.url !== `${origin}/org/1` && !row.url.startsWith('http://127.0.0.1:5000'));
	assert.deepEqual(inFlight({ listed, fetches, resources: [{ name: data }] }, origin), [
		'/org/1/api/app-shell-chrome',
		'/org/1/__data.json'
	]);
	const finished = listed.map((row) => ({ ...row, status: '200' }));
	assert.deepEqual(
		inFlight(
			{
				listed: finished,
				fetches: finished.slice(1, 4),
				resources: [{ name: data }, { name: data }, { name: chrome }]
			},
			origin
		),
		[]
	);
	const aborted = [{ url: data, status: 'net::ERR_ABORTED' }];
	assert.deepEqual(inFlight({ listed: aborted, fetches: aborted, resources: [] }, origin), []);
});

test('statement totals add each window and keep calls per window', () => {
	const row = (role, queryid, calls, total_ms, rows) => ({
		role,
		queryid,
		calls,
		total_ms,
		rows,
		query: `q${queryid}`
	});
	const totals = statementTotals(
		[
			[
				row('authenticated', '1', 10, 50, 100),
				row('authenticated', '2', 1, 400, 1),
				row('supabase_auth_admin', '3', 4, 2, 4)
			],
			[row('authenticated', '1', 10, 70, 100)],
			[row('authenticated', '1', 12, 60, 120), row('authenticated', '2', 1, 380, 1)]
		],
		2
	);
	assert.equal(totals.windows, 3);
	assert.deepEqual(totals.byCalls[0], {
		role: 'authenticated',
		calls: 32,
		callsPerWindow: { n: 3, min: 10, median: 10, max: 12, samples: [10, 10, 12] },
		total_ms: 180,
		mean_ms: 5.625,
		rows: 320,
		query: 'q1'
	});
	assert.deepEqual(
		totals.byTotalTime.map((item) => [item.query, item.total_ms, item.callsPerWindow.samples]),
		[
			['q2', 780, [1, 0, 1]],
			['q1', 180, [10, 10, 12]]
		]
	);
	assert.deepEqual(totals.byRole, [
		{ role: 'authenticated', calls: 34, statements: 2, total_ms: 960 },
		{ role: 'supabase_auth_admin', calls: 4, statements: 1, total_ms: 2 }
	]);
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

function pageWindow() {
	const observed = [];
	const win = {
		observed,
		performance: { setResourceTimingBufferSize() {}, mark() {} },
		document: { body: null },
		requestAnimationFrame() {},
		addEventListener() {},
		PerformanceObserver: class {
			observe({ type }) {
				observed.push(type);
			}
		}
	};
	return win;
}

test('only a navigation observer measures LCP; an input observer would replay the navigation one', () => {
	const milestones = [{ name: 'useful' }];
	const loading = pageWindow();
	installSettledObserver(loading, { name: 'load', start: 'navigation', milestones });
	const typing = pageWindow();
	installSettledObserver(typing, { name: 'search', start: 'input', milestones });
	assert.deepEqual(loading.observed, ['longtask', 'largest-contentful-paint']);
	assert.deepEqual(typing.observed, ['longtask']);
	assert.equal(typing.__t2tPerfSettled.lcp, null);
});
