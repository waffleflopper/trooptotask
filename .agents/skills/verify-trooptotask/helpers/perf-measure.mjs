import { gunzipSync } from 'node:zlib';

// Named emulation profiles. `networkConditions: null` disables network emulation.
export const profiles = {
	unthrottled: {
		cpuThrottlingRate: 1,
		networkConditions: null,
		meaning: 'This workstation and loopback network: the app cost with no emulation.'
	},
	// Chrome refuses network throttling while the daemon's owned-origin URL allowlist is set, so
	// the slow profile emulates the CPU only.
	'slow-cpu': {
		cpuThrottlingRate: 4,
		networkConditions: null,
		meaning: '4x CPU slowdown on loopback: the main-thread cost on a slower government laptop.'
	}
};

// A cold warm-up would warm nothing the next cold sample keeps.
export const protocol = {
	defaults: { warm: { warmup: 1, repetitions: 5 }, cold: { warmup: 0, repetitions: 3 } },
	modes: {
		cold: 'First app document in a new browser context signed in without running app code. Only the shared entry assets the sign-in page preloads are cached.',
		warm: 'Navigation to the journey URL in the signed-in page after the warm-up: new document, HTTP cache kept.'
	}
};

/** Runs inside the page (as a navigation init script or read-only evaluation). */
export function installSettledObserver(win, spec) {
	const key = '__t2tPerfSettled';
	win.performance.setResourceTimingBufferSize(2000);
	const state = {
		name: spec.name,
		startedAt: spec.start === 'navigation' ? 0 : null,
		startEvent: null,
		milestones: {},
		done: false,
		frames: 0,
		longTasks: [],
		lcp: null,
		download: null,
		renderedAt: null
	};
	win[key] = state;
	// An export hands its file to the browser as an object URL; the first one marks the download.
	if (spec.download) {
		const original = win.URL.createObjectURL;
		win.URL.createObjectURL = function (blob) {
			if (!state.download && state.startedAt !== null)
				state.download = {
					at: Math.round(win.performance.now() - state.startedAt),
					bytes: blob.size,
					type: blob.type
				};
			return original.call(win.URL, blob);
		};
	}
	try {
		new win.PerformanceObserver((list) => {
			for (const entry of list.getEntries())
				state.longTasks.push({ start: Math.round(entry.startTime), duration: Math.round(entry.duration) });
		}).observe({ type: 'longtask', buffered: true });
		// A buffered replay would report the navigation's LCP as if it were an input measurement.
		if (spec.start === 'navigation')
			new win.PerformanceObserver((list) => {
				const last = list.getEntries().at(-1);
				if (last) state.lcp = Math.round(last.startTime);
			}).observe({ type: 'largest-contentful-paint', buffered: true });
	} catch {
		state.observerUnavailable = true;
	}
	// Markup indentation survives in textContent ("5\n\t\tmembers"), so whitespace runs compare as one space.
	const flat = (value) => value.replace(/\s+/g, ' ');
	const reached = (milestone) => {
		const doc = win.document;
		if (!doc.body) return false;
		const text = flat(doc.body.textContent);
		return (
			(milestone.present ?? []).every((value) => text.includes(value)) &&
			(!milestone.anyPresent || milestone.anyPresent.some((value) => text.includes(value))) &&
			(milestone.absent ?? []).every((value) => !text.includes(value)) &&
			Object.entries(milestone.inside ?? {}).every(([selector, values]) => {
				const scope = doc.querySelector(selector)?.textContent;
				return scope !== undefined && values.every((value) => flat(scope).includes(value));
			}) &&
			(milestone.presentSelector ?? []).every((selector) => doc.querySelector(selector)) &&
			(milestone.absentSelector ?? []).every((selector) => !doc.querySelector(selector)) &&
			Object.entries(milestone.count ?? {}).every(([selector, n]) => doc.querySelectorAll(selector).length === n) &&
			(!milestone.download || state.download !== null)
		);
	};
	const final = spec.milestones.at(-1).name;
	// A re-render after the milestone, such as one an invalidated load's data drives, mutates the
	// DOM, and the next frame paints it. The loop keeps running after the final milestone until a
	// newer observer replaces this one, so a later read sees the last such frame.
	let mutatedAt = null;
	let paintedFor = null;
	new win.MutationObserver(() => (mutatedAt = win.performance.now())).observe(win.document, {
		subtree: true,
		childList: true,
		characterData: true,
		attributes: true
	});
	// A frame's timestamp is when the browser began that frame, which can be long before the
	// callback runs when a task held the main thread, and can precede the input event the frame
	// then handles. Every milestone therefore reads the clock inside the callback, on the
	// navigation's timeline (startedAt 0) or the input event's.
	const frame = () => {
		if (win[key] !== state) return;
		const now = win.performance.now();
		if (!state.done) {
			state.frames++;
			for (const milestone of spec.milestones)
				if (!(milestone.name in state.milestones) && reached(milestone)) {
					state.milestones[milestone.name] = Math.round(now - state.startedAt);
					win.performance.mark(`t2t-perf:${spec.name}:${milestone.name}`);
				}
			if (final in state.milestones) state.done = true;
		}
		if (mutatedAt !== null && mutatedAt >= state.startedAt && mutatedAt !== paintedFor) {
			paintedFor = mutatedAt;
			state.renderedAt = Math.round(now - state.startedAt);
		}
		win.requestAnimationFrame(frame);
	};
	if (spec.start === 'navigation') win.requestAnimationFrame(frame);
	else
		for (const type of ['pointerdown', 'keydown', 'beforeinput', 'input'])
			win.addEventListener(
				type,
				(event) => {
					if (state.startedAt !== null) return;
					state.startedAt = event.timeStamp;
					state.startEvent = { type, trusted: event.isTrusted };
					win.performance.mark(`t2t-perf:${spec.name}:start`);
					win.requestAnimationFrame(frame);
				},
				{ capture: true, passive: true }
			);
}

/** Runs inside the page; read-only. Resolves when the observer finished or the deadline passed. */
export function readSettledSample(win, deadlineMs) {
	return new Promise((resolve) => {
		const begun = Date.now();
		const tick = () => {
			const state = win.__t2tPerfSettled;
			if (!state?.done && Date.now() - begun < deadlineMs) return setTimeout(tick, 50);
			const navigation = win.performance.getEntriesByType('navigation')[0];
			const entry = (item) => ({
				name: item.name,
				initiatorType: item.initiatorType,
				responseStatus: item.responseStatus,
				transferSize: item.transferSize,
				encodedBodySize: item.encodedBodySize,
				decodedBodySize: item.decodedBodySize,
				startTime: Math.round(item.startTime),
				responseEnd: Math.round(item.responseEnd)
			});
			resolve({
				observer: state ? structuredClone(state) : null,
				navigation: navigation && {
					...entry(navigation),
					type: navigation.type,
					responseStart: Math.round(navigation.responseStart),
					domContentLoaded: Math.round(navigation.domContentLoadedEventEnd),
					load: Math.round(navigation.loadEventEnd)
				},
				paint: Object.fromEntries(
					win.performance.getEntriesByType('paint').map((item) => [item.name, Math.round(item.startTime)])
				),
				resources: win.performance.getEntriesByType('resource').map(entry)
			});
		};
		tick();
	});
}

const categories = ['document', 'js', 'css', 'data', 'provider', 'other'];

function category(entry, origin) {
	const url = new URL(entry.name);
	if (url.origin !== origin) return 'provider';
	if (entry.initiatorType === 'navigation') return 'document';
	if (/\.m?js$/.test(url.pathname)) return 'js';
	if (url.pathname.endsWith('.css')) return 'css';
	if (url.pathname.endsWith('/__data.json') || ['fetch', 'xmlhttprequest'].includes(entry.initiatorType)) return 'data';
	return 'other';
}

/**
 * Resource Timing entries and bytes for one sample, grouped JS/CSS/data/document (plus
 * provider/other). An entry is a network request only when it transferred bytes; the rest
 * are cache hits.
 */
export function groupManifest({ navigation, resources }, origin) {
	const entries = [...(navigation ? [{ ...navigation, initiatorType: 'navigation' }] : []), ...resources].map(
		(entry) => {
			const url = new URL(entry.name);
			return {
				category: category(entry, origin),
				path: url.origin === origin ? url.pathname : `${url.origin}${url.pathname}`,
				invalidated: url.searchParams.get('x-sveltekit-invalidated'),
				initiatorType: entry.initiatorType,
				status: entry.responseStatus ?? null,
				transferSize: entry.transferSize,
				encodedBodySize: entry.encodedBodySize,
				decodedBodySize: entry.decodedBodySize,
				fromCache: entry.transferSize === 0 && entry.decodedBodySize > 0,
				startTime: entry.startTime,
				responseEnd: entry.responseEnd
			};
		}
	);
	const totals = (members) => ({
		resourceEntries: members.length,
		networkRequests: members.filter((entry) => entry.transferSize > 0).length,
		cacheHits: members.filter((entry) => entry.fromCache).length,
		transferSize: members.reduce((total, entry) => total + entry.transferSize, 0),
		encodedBodySize: members.reduce((total, entry) => total + entry.encodedBodySize, 0),
		decodedBodySize: members.reduce((total, entry) => total + entry.decodedBodySize, 0)
	});
	return {
		...totals(entries),
		groups: Object.fromEntries(
			categories.map((name) => [name, totals(entries.filter((entry) => entry.category === name))])
		),
		entries
	};
}

/**
 * Native network list rows (`requestId`, `url`, `status`) that failed: an HTTP status of 400
 * or more, or a network error such as `net::ERR_ABORTED`. A row still `pending` has not failed.
 */
export function failedRequests(listed, origin) {
	return listed
		.filter(({ status }) => status !== 'pending' && !(/^\d+$/.test(status) && Number(status) < 400))
		.map(({ url, status }) => {
			const parsed = new URL(url);
			return { path: parsed.origin === origin ? parsed.pathname : `${parsed.origin}${parsed.pathname}`, status };
		});
}

/**
 * App-origin requests still running. The native list shows `pending` until response headers
 * arrive, but a streamed `__data.json` keeps its body open long after, and Resource Timing
 * records an entry only when the body ends. So a fetch with a 2xx/304 status and fewer
 * finished entries for its URL than listed requests is still running.
 */
export function inFlight({ listed, fetches, resources }, origin) {
	const same = (url) => new URL(url).origin === origin;
	const pending = listed.filter((row) => same(row.url) && row.status === 'pending').map((row) => row.url);
	const finished = Map.groupBy(resources, (entry) => entry.name);
	const answered = Map.groupBy(
		fetches.filter((row) => same(row.url) && /^(2\d\d|304)$/.test(row.status)),
		(row) => row.url
	);
	const streaming = [...answered].flatMap(([url, rows]) =>
		Array(Math.max(0, rows.length - (finished.get(url)?.length ?? 0))).fill(url)
	);
	return [...pending, ...streaming].map((url) => new URL(url).pathname);
}

/** Full distribution of a few samples; no percentile beyond the median is claimed. */
export function distribution(values) {
	const samples = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
	if (samples.length === 0) return { n: 0, min: null, median: null, max: null, samples: [] };
	const sorted = samples.toSorted((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
	return { n: samples.length, min: sorted[0], median, max: sorted.at(-1), samples };
}

const scripting = new Set([
	'EvaluateScript',
	'v8.compile',
	'v8.compileModule',
	'v8.evaluateModule',
	'FunctionCall',
	'TimerFire',
	'EventDispatch',
	'FireAnimationFrame',
	'RunMicrotasks',
	'v8.run'
]);
const rendering = new Set(['UpdateLayoutTree', 'Layout', 'Paint', 'PrePaint', 'Layerize']);

function outermost(events, names) {
	let end = -Infinity;
	let total = 0;
	for (const event of events) {
		if (!names.has(event.name) || event.ts < end) continue;
		total += event.dur;
		end = event.ts + event.dur;
	}
	return total;
}

/** Compact main-thread summary of a Chrome trace (raw JSON or gzip bytes). Times in ms. */
export function summarizeTrace(input) {
	const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
	const raw = JSON.parse((bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes).toString('utf8'));
	const events = Array.isArray(raw) ? raw : raw.traceEvents;
	const navigation = events
		.filter(
			(event) =>
				event.name === 'navigationStart' &&
				event.args?.data?.isLoadingMainFrame &&
				/^https?:/.test(event.args.data.documentLoaderURL ?? '')
		)
		.at(-1);
	if (!navigation) return { navigation: null, reason: 'No main-frame navigation in this trace.' };
	const { pid, tid, ts: start } = navigation;
	const main = events
		.filter((event) => event.pid === pid && event.tid === tid && event.ph === 'X' && event.ts >= start)
		.toSorted((a, b) => a.ts - b.ts);
	const mark = (name) => {
		const found = events.filter((event) => event.pid === pid && event.name === name && event.ts >= start);
		return found.length ? (found.at(-1).ts - start) / 1000 : null;
	};
	const firstContentfulPaint = (() => {
		const found = events.find(
			(event) => event.pid === pid && event.name === 'firstContentfulPaint' && event.ts >= start
		);
		return found ? (found.ts - start) / 1000 : null;
	})();
	const tasks = main.filter((event) => event.name === 'RunTask');
	const long = tasks.filter((event) => event.dur > 50000);
	const ms = (micros) => Math.round(micros / 100) / 10;
	const end = Math.max(...main.map((event) => event.ts + event.dur), start);
	return {
		url: navigation.args.data.documentLoaderURL.replace(/^https?:\/\/[^/]+/, ''),
		windowMs: ms(end - start),
		firstContentfulPaintMs: firstContentfulPaint === null ? null : Math.round(firstContentfulPaint * 10) / 10,
		largestContentfulPaintMs: (() => {
			const value = mark('largestContentfulPaint::Candidate');
			return value === null ? null : Math.round(value * 10) / 10;
		})(),
		mainThreadBusyMs: ms(tasks.reduce((total, event) => total + event.dur, 0)),
		scriptingMs: ms(outermost(main, scripting)),
		styleLayoutPaintMs: ms(outermost(main, rendering)),
		longTasks: {
			count: long.length,
			totalMs: ms(long.reduce((total, event) => total + event.dur, 0)),
			longestMs: ms(Math.max(0, ...long.map((event) => event.dur)))
		},
		blockingAfterFirstPaintMs:
			firstContentfulPaint === null
				? null
				: ms(
						long
							.filter((event) => event.ts - start >= firstContentfulPaint * 1000)
							.reduce((total, event) => total + event.dur - 50000, 0)
					),
		hydration: 'not identifiable: the app emits no hydration mark'
	};
}

/** The existing `[calendar-load]`/`[dashboard-load]`/`[training-load]` lines for one Organization. */
export function parseServerTiming(text, organizationId) {
	const lines = [];
	for (const match of text.matchAll(/\[(calendar|dashboard|training)-load\]\s*\{([^}]*)\}/g)) {
		const fields = Object.fromEntries(
			[...match[2].matchAll(/(\w+):\s*'?([^',\n]*?)'?\s*(?:,|$)/gm)].map(([, field, value]) => [field, value.trim()])
		);
		if (fields.orgId !== organizationId) continue;
		lines.push({
			feature: match[1],
			phase: fields.phase,
			durationMs: Number(fields.durationMs),
			status: fields.status
		});
	}
	return lines;
}

// One page can run the same load more than once at a time, such as the document load and the
// post-hydration invalidation, so each phase reports its individual loads and the loads per
// sample, never a per-sample sum.
export function serverTimingPhases(samples) {
	const phases = Map.groupBy(
		samples.flatMap((sample, index) => sample.serverTiming.map((line) => ({ ...line, index }))),
		(line) => `${line.feature}:${line.phase}`
	);
	return Object.fromEntries(
		[...phases].map(([phase, lines]) => [
			phase,
			{
				durationMs: distribution(lines.map((line) => line.durationMs)),
				loadsPerSample: distribution(samples.map((_, index) => lines.filter((line) => line.index === index).length))
			}
		])
	);
}

// Utility statements (BEGIN, SET, COMMIT) are never planned. Every other execution is planned
// when a custom plan is used and not when a cached generic plan is. PostgREST plans its
// `set_config` preamble while the session is still `authenticator` and runs it as the request
// role, so those plans count on an `authenticator` row with no calls. Compare the totals across
// the request roles and `authenticator`: fewer plans than plannable calls there means some
// executions reused a generic plan.
const plannable = (row) => /^\s*(select|with|insert|update|delete)\b/i.test(row.query);

/**
 * Totals per normalized statement over measured windows, one pg_stat_statements read per
 * sample taken between a reset just before the sample and the end of its network work.
 */
export function statementTotals(windows, top = 15) {
	const statements = new Map();
	windows.forEach((rows, index) => {
		for (const row of rows) {
			const key = `${row.role}:${row.queryid}`;
			const item = statements.get(key) ?? {
				role: row.role,
				query: row.query,
				calls: 0,
				plans: 0,
				total_ms: 0,
				rows: 0,
				perWindow: windows.map(() => 0)
			};
			item.calls += row.calls;
			item.plans += row.plans ?? 0;
			item.total_ms += row.total_ms;
			item.rows += row.rows;
			item.perWindow[index] += row.calls;
			statements.set(key, item);
		}
	});
	const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;
	const list = [...statements.values()].map(({ perWindow, ...item }) => ({
		role: item.role,
		calls: item.calls,
		callsPerWindow: distribution(perWindow),
		plans: item.plans,
		total_ms: round(item.total_ms, 2),
		mean_ms: round(item.total_ms / item.calls, 3),
		rows: item.rows,
		query: item.query
	}));
	const byRole = [...Map.groupBy(list, (item) => item.role)]
		.map(([role, items]) => ({
			role,
			calls: items.reduce((total, item) => total + item.calls, 0),
			plannableCalls: items.filter(plannable).reduce((total, item) => total + item.calls, 0),
			plans: items.reduce((total, item) => total + item.plans, 0),
			statements: items.length,
			total_ms: round(
				items.reduce((total, item) => total + item.total_ms, 0),
				2
			)
		}))
		.toSorted((a, b) => b.total_ms - a.total_ms);
	return {
		windows: windows.length,
		byRole,
		byTotalTime: list.toSorted((a, b) => b.total_ms - a.total_ms).slice(0, top),
		byCalls: list.toSorted((a, b) => b.calls - a.calls).slice(0, top)
	};
}

// Request-path categories for one pg_stat_statements row. Auth reads run as the Auth server's
// role. PostgREST opens every request with a transaction and a role switch. The session and
// suspension RPCs, the `organizations` identity and admission reads (both select the ID first)
// and memberships are the work each request repeats; everything else the app's roles run,
// including Organization settings columns, is the page's own reads.
const categoryRules = [
	['auth', (row) => row.role === 'supabase_auth_admin'],
	['control', (row) => row.role === 'supabase_admin'],
	['postgrest', (row) => /^(BEGIN|COMMIT|SET |RESET|select set_config)/i.test(row.query)],
	['session', (row) => row.query.includes('get_current_session_started_at')],
	['suspension', (row) => /is_user_suspended|"check_user_id"/.test(row.query)],
	[
		'organizations',
		(row) => /SELECT "public"\."organizations"\."id", "public"\."organizations"\."(suspended_at|name)"/.test(row.query)
	],
	['memberships', (row) => row.query.includes('"public"."organization_memberships"')],
	['page', (row) => ['authenticated', 'authenticator', 'anon', 'service_role'].includes(row.role)]
];

export function statementCategory(row) {
	return categoryRules.find(([, matches]) => matches(row))?.[0] ?? 'other';
}

/** Calls and time per request-path category in each window, as distributions over the windows. */
export function statementCategories(windows) {
	const names = [...categoryRules.map(([name]) => name), 'other'];
	const totals = windows.map((rows) => {
		const window = Object.fromEntries(names.map((name) => [name, { calls: 0, ms: 0 }]));
		for (const row of rows) {
			const bucket = window[statementCategory(row)];
			bucket.calls += row.calls;
			bucket.ms += row.total_ms;
		}
		return window;
	});
	return Object.fromEntries(
		names.map((name) => [
			name,
			{
				calls: distribution(totals.map((window) => window[name].calls)),
				ms: distribution(totals.map((window) => Math.round(window[name].ms * 100) / 100))
			}
		])
	);
}

const maintenanceCounters = ['vacuum_count', 'autovacuum_count', 'analyze_count', 'autoanalyze_count'];

/**
 * Tables that a vacuum or analyze touched between two `perf-tables` reads, with how many times.
 * Planner statistics and visibility change when one does, so a run that spans one is not
 * comparable sample for sample.
 */
export function maintenanceDuring(before, after) {
	const earlier = new Map(before.map((row) => [row.table, row]));
	return after.flatMap((row) => {
		const changed = Object.fromEntries(
			maintenanceCounters
				.map((counter) => [counter.replace('_count', ''), row[counter] - (earlier.get(row.table)?.[counter] ?? 0)])
				.filter(([, delta]) => delta > 0)
		);
		return Object.keys(changed).length ? [{ table: row.table, ...changed }] : [];
	});
}
