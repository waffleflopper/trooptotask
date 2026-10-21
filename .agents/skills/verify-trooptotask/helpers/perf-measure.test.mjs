import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { test } from 'node:test';
import {
	distribution,
	failedRequests,
	groupManifest,
	inFlight,
	installSettledObserver,
	readSettledSample,
	statementTotals,
	statementCategories,
	maintenanceDuring,
	statementCategory,
	parseServerTiming,
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
		plans: 0,
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
		{ role: 'authenticated', calls: 34, plannableCalls: 0, plans: 0, statements: 2, total_ms: 960 },
		{ role: 'supabase_auth_admin', calls: 4, plannableCalls: 0, plans: 0, statements: 1, total_ms: 2 }
	]);
});

test('planning counts are totalled per role, and utility statements are not plannable', () => {
	const window = [
		{ role: 'authenticated', queryid: '1', calls: 10, plans: 10, total_ms: 9, rows: 10, query: 'SELECT a FROM t' },
		{
			role: 'authenticated',
			queryid: '2',
			calls: 10,
			plans: 4,
			total_ms: 9,
			rows: 10,
			query: 'WITH x AS (SELECT 1) SELECT * FROM x'
		},
		{
			role: 'authenticated',
			queryid: '3',
			calls: 10,
			plans: 0,
			total_ms: 1,
			rows: 0,
			query: 'BEGIN ISOLATION LEVEL READ COMMITTED'
		},
		{
			role: 'authenticated',
			queryid: '4',
			calls: 20,
			plans: 0,
			total_ms: 1,
			rows: 0,
			query: 'SET LOCAL ROLE authenticated'
		}
	];
	assert.deepEqual(statementTotals([window]).byRole, [
		{ role: 'authenticated', calls: 50, plannableCalls: 20, plans: 14, statements: 4, total_ms: 20 }
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
		},
		MutationObserver: class {
			constructor(callback) {
				win.mutate = callback;
			}
			observe() {
				win.observing = true;
			}
			disconnect() {
				win.observing = false;
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

test('each request-path statement lands in its category', () => {
	const row = (role, query) => ({ role, query, calls: 1, total_ms: 1 });
	const categories = [
		row('supabase_auth_admin', 'SELECT users.aud FROM auth.users'),
		row('supabase_admin', 'SET statement_timeout = $1'),
		row('authenticator', 'BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY'),
		row('authenticated', "select set_config('search_path', $1, true)"),
		row('authenticated', 'SELECT "public"."get_current_session_started_at"() pgrst_scalar'),
		row('authenticated', 'LATERAL (SELECT "check_user_id" FROM json_to_record($1))'),
		row(
			'authenticated',
			'SELECT "public"."organizations"."id", "public"."organizations"."suspended_at" FROM "public"."organizations"'
		),
		row(
			'authenticated',
			'SELECT "public"."organizations"."id", "public"."organizations"."name", "public"."organizations"."url_slug"'
		),
		row('authenticated', 'SELECT "public"."organizations"."loss_warning_window_days" FROM "public"."organizations"'),
		row('authenticated', 'SELECT "public"."organization_memberships"."id" FROM "public"."organization_memberships"'),
		row('postgres', 'SELECT 1')
	].map(statementCategory);
	assert.deepEqual(categories, [
		'auth',
		'control',
		'postgrest',
		'postgrest',
		'session',
		'suspension',
		'organizations',
		'organizations',
		'page',
		'memberships',
		'other'
	]);
});

test('category totals are distributions over the sample windows', () => {
	const identity = {
		role: 'authenticated',
		query: 'SELECT "public"."organizations"."id", "public"."organizations"."name"'
	};
	const roster = { role: 'authenticated', query: 'SELECT "public"."personnel".* FROM "public"."personnel"' };
	const result = statementCategories([
		[
			{ ...identity, calls: 2, total_ms: 0.25 },
			{ ...roster, calls: 2, total_ms: 27.2 }
		],
		[{ ...identity, calls: 3, total_ms: 0.5 }]
	]);
	assert.deepEqual(result.organizations, {
		calls: { n: 2, min: 2, median: 2.5, max: 3, samples: [2, 3] },
		ms: { n: 2, min: 0.25, median: 0.375, max: 0.5, samples: [0.25, 0.5] }
	});
	assert.deepEqual(result.page.calls.samples, [2, 0]);
	assert.deepEqual(result.auth.calls.samples, [0, 0]);
});

// A page whose body text and matching elements the test sets per frame.
function livePage() {
	const page = pageWindow();
	const frames = [];
	page.document = {
		body: { textContent: '' },
		matches: {},
		querySelector: (selector) => page.document.matches[selector]?.[0] ?? null,
		querySelectorAll: (selector) => page.document.matches[selector] ?? []
	};
	page.clock = 0;
	page.performance.now = () => page.clock;
	page.performance.getEntriesByType = () => [];
	page.requestAnimationFrame = (callback) => frames.push(callback);
	page.URL = { createObjectURL: () => 'blob:1' };
	// The browser began the frame at `frameTime`; its callback runs at `clock`.
	page.step = (frameTime, clock = frameTime) => {
		page.clock = clock;
		frames.shift()(frameTime);
	};
	page.pending = () => frames.length;
	return page;
}

test('a milestone waits for its row text, exact row count and download', () => {
	const page = livePage();
	installSettledObserver(page, {
		name: 'export',
		start: 'navigation',
		download: true,
		milestones: [
			{ name: 'rows', inside: { 'tr[aria-label="Open SPC Able, Alex"]': ['42A'] }, count: { tr: 2 } },
			{ name: 'useful', download: true }
		]
	});
	const row = { textContent: 'SPC Able, Alex 68W' };
	page.document.matches = { 'tr[aria-label="Open SPC Able, Alex"]': [row], tr: [row, {}, {}] };
	page.document.body.textContent = 'roster';
	page.step(100);
	row.textContent = 'SPC Able, Alex 42A';
	page.step(200);
	page.document.matches.tr = [row, {}];
	page.step(300);
	page.clock = 350;
	page.URL.createObjectURL({ size: 2048, type: 'application/json' });
	page.step(400);
	const state = page.__t2tPerfSettled;
	assert.deepEqual(state.milestones, { rows: 300, useful: 400 });
	assert.deepEqual(state.download, { at: 350, bytes: 2048, type: 'application/json' });
	assert.equal(state.done, true);
});

test('an interaction milestone is measured on a clock that cannot precede the input', () => {
	const page = livePage();
	const listeners = {};
	page.addEventListener = (type, listener) => (listeners[type] = listener);
	installSettledObserver(page, {
		name: 'save',
		start: 'input',
		milestones: [{ name: 'useful', present: ['Saved'] }]
	});
	page.performance.now = () => 5012;
	listeners.pointerdown({ timeStamp: 5000, isTrusted: true });
	page.document.body.textContent = 'Saved';
	// This frame began 10 ms before the input it handles.
	page.step(4990);
	assert.deepEqual(page.__t2tPerfSettled.milestones, { useful: 12 });
	assert.equal(page.__t2tPerfSettled.startEvent.type, 'pointerdown');
});

test('a navigation milestone is the time its frame callback ran, not the frame start a long task delayed', () => {
	const page = livePage();
	installSettledObserver(page, {
		name: 'load',
		start: 'navigation',
		milestones: [{ name: 'useful', present: ['Saved'] }]
	});
	page.document.body.textContent = 'Saved';
	// D06 PR 2's large cold trace: the frame began at 195 ms, and a 233 ms task held its callback to 450 ms.
	page.step(195, 450);
	assert.deepEqual(page.__t2tPerfSettled.milestones, { useful: 450 });
});

test('the last frame after a DOM change is the rendered time, until a newer observer replaces this one', () => {
	const page = livePage();
	installSettledObserver(page, {
		name: 'load',
		start: 'navigation',
		milestones: [{ name: 'useful', present: ['Saved'] }]
	});
	page.clock = 120;
	page.mutate();
	page.document.body.textContent = 'Saved';
	page.step(130);
	page.clock = 231;
	page.mutate();
	page.step(240, 396);
	page.step(410);
	const state = page.__t2tPerfSettled;
	assert.deepEqual(state.milestones, { useful: 130 });
	assert.equal(state.renderedAt, 396);
	assert.equal(state.frames, 1);
	page.__t2tPerfSettled = {};
	page.step(426);
	assert.equal(page.pending(), 0);
});

test("the sample's final read ends the observer, so a later DOM change cannot move its rendered time", async () => {
	const page = livePage();
	installSettledObserver(page, {
		name: 'load',
		start: 'navigation',
		milestones: [{ name: 'useful', present: ['Saved'] }]
	});
	page.clock = 100;
	page.mutate();
	page.document.body.textContent = 'Saved';
	page.step(116);
	const sample = await readSettledSample(page, 0, true);
	assert.equal(sample.observer.renderedAt, 116);
	page.clock = 5000;
	page.mutate();
	page.step(5016);
	assert.equal(page.__t2tPerfSettled.renderedAt, 116);
	assert.equal(page.pending(), 0);
	assert.equal(page.observing, false);
});

test('an interaction ignores DOM changes from before its input', () => {
	const page = livePage();
	const listeners = {};
	page.addEventListener = (type, listener) => (listeners[type] = listener);
	installSettledObserver(page, {
		name: 'search',
		start: 'input',
		milestones: [{ name: 'useful', present: ['Saved'] }]
	});
	page.clock = 4990;
	page.mutate();
	listeners.keydown({ timeStamp: 5000, isTrusted: true });
	page.step(5016);
	assert.equal(page.__t2tPerfSettled.renderedAt, null);
	page.clock = 5020;
	page.mutate();
	page.document.body.textContent = 'Saved';
	page.step(5033);
	assert.deepEqual(page.__t2tPerfSettled.milestones, { useful: 33 });
	assert.equal(page.__t2tPerfSettled.renderedAt, 33);
});

test('milestone text matches across markup whitespace', () => {
	const page = livePage();
	installSettledObserver(page, {
		name: 'members',
		start: 'navigation',
		milestones: [{ name: 'useful', present: ['5 members'], inside: { dl: ['Saved 5', 'Failed 0'] } }]
	});
	page.document.matches = { dl: [{ textContent: 'Saved\n\t\t5Failed\n\t\t0' }] };
	page.document.body.textContent = '5\n\t\t\tmembers';
	page.step(100);
	assert.deepEqual(page.__t2tPerfSettled.milestones, { useful: 100 });
});

test('maintenanceDuring names only the tables a vacuum or analyze touched between reads', () => {
	const row = (table, autovacuum_count, autoanalyze_count) => ({
		table,
		dead: 3,
		vacuum_count: 1,
		autovacuum_count,
		analyze_count: 1,
		autoanalyze_count
	});
	const before = [row('public.personnel', 0, 0), row('public.personnel_trainings', 2, 1), row('public.groups', 0, 0)];
	const after = [row('public.personnel', 1, 2), row('public.personnel_trainings', 2, 1), row('public.groups', 0, 0)];
	assert.deepEqual(maintenanceDuring(before, after), [{ table: 'public.personnel', autovacuum: 1, autoanalyze: 2 }]);
	assert.deepEqual(maintenanceDuring(after, after), []);
});
