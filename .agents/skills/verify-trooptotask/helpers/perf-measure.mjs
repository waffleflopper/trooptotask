import { gunzipSync, gzipSync } from 'node:zlib';

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

// Every cold sample is a real sign-in under the app's per-IP limit, so cold takes fewer samples;
// a cold warm-up would warm nothing the next cold sample keeps.
export const protocol = {
	defaults: { warm: { warmup: 1, repetitions: 5 }, cold: { warmup: 0, repetitions: 3 } },
	modes: {
		cold: 'First app document in a new browser context signed in without loading app code: empty HTTP cache.',
		warm: 'Navigation to the journey URL in the signed-in page after the warm-up: new document, HTTP cache kept.'
	}
};

// A milestone is reached on the first animation frame where every `present` text is in
// the document, at least one `anyPresent` text is, every `absent` text is gone and no
// `absentSelector` matches.
const skeleton = '[data-slot="skeleton"]';
// Above 250 People the By Group roster renders a pause notice instead of rows, so for a
// large Organization-wide actor that notice is the settled roster.
const roster = ({ sentinel }) => ({
	anyPresent: [sentinel, 'personnel are loaded'],
	absentSelector: [skeleton]
});

export const journeys = {
	'personnel-list': {
		kind: 'load',
		path: 'personnel',
		milestones: (terms) => [{ name: 'settled', ...roster(terms) }]
	},
	dashboard: {
		kind: 'load',
		path: '',
		milestones: () => [
			{ name: 'pending', presentSelector: [skeleton] },
			{ name: 'settled', present: ['Upcoming Changes', 'Requires Attention'], absentSelector: [skeleton] }
		]
	},
	'personnel-search': {
		kind: 'interaction',
		path: 'personnel',
		ready: (terms) => [{ name: 'ready', ...roster(terms) }],
		control: { role: 'searchbox', name: 'Search by name, rank, MOS, role, or group' },
		input: ({ searchTerm }) => searchTerm,
		milestones: ({ sentinel, searchTerm }) => [{ name: 'settled', present: [searchTerm], absent: [sentinel] }]
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
		lcp: null
	};
	win[key] = state;
	try {
		new win.PerformanceObserver((list) => {
			for (const entry of list.getEntries())
				state.longTasks.push({ start: Math.round(entry.startTime), duration: Math.round(entry.duration) });
		}).observe({ type: 'longtask', buffered: true });
		new win.PerformanceObserver((list) => {
			const last = list.getEntries().at(-1);
			if (last) state.lcp = Math.round(last.startTime);
		}).observe({ type: 'largest-contentful-paint', buffered: true });
	} catch {
		state.observerUnavailable = true;
	}
	const reached = (milestone) => {
		const doc = win.document;
		if (!doc.body) return false;
		const text = doc.body.textContent;
		return (
			(milestone.present ?? []).every((value) => text.includes(value)) &&
			(!milestone.anyPresent || milestone.anyPresent.some((value) => text.includes(value))) &&
			(milestone.absent ?? []).every((value) => !text.includes(value)) &&
			(milestone.presentSelector ?? []).every((selector) => doc.querySelector(selector)) &&
			(milestone.absentSelector ?? []).every((selector) => !doc.querySelector(selector))
		);
	};
	const final = spec.milestones.at(-1).name;
	const frame = (now) => {
		state.frames++;
		for (const milestone of spec.milestones)
			if (!(milestone.name in state.milestones) && reached(milestone)) {
				state.milestones[milestone.name] = Math.round(now - state.startedAt);
				win.performance.mark(`t2t-perf:${spec.name}:${milestone.name}`);
			}
		if (final in state.milestones) state.done = true;
		else win.requestAnimationFrame(frame);
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

/** Requests and bytes for one sample, grouped JS/CSS/data/document (plus provider/other). */
export function groupManifest({ navigation, resources }, origin) {
	const requests = [...(navigation ? [{ ...navigation, initiatorType: 'navigation' }] : []), ...resources].map(
		(entry) => {
			const url = new URL(entry.name);
			return {
				category: category(entry, origin),
				path: url.origin === origin ? url.pathname : `${url.origin}${url.pathname}`,
				invalidated: url.searchParams.get('x-sveltekit-invalidated'),
				initiatorType: entry.initiatorType,
				transferSize: entry.transferSize,
				encodedBodySize: entry.encodedBodySize,
				decodedBodySize: entry.decodedBodySize,
				fromCache: entry.transferSize === 0 && entry.decodedBodySize > 0,
				startTime: entry.startTime,
				responseEnd: entry.responseEnd
			};
		}
	);
	const groups = Object.fromEntries(
		categories.map((name) => {
			const members = requests.filter((request) => request.category === name);
			const sum = (field) => members.reduce((total, request) => total + request[field], 0);
			return [
				name,
				{
					requests: members.length,
					fromCache: members.filter((request) => request.fromCache).length,
					transferSize: sum('transferSize'),
					encodedBodySize: sum('encodedBodySize'),
					decodedBodySize: sum('decodedBodySize')
				}
			];
		})
	);
	return {
		requests: requests.length,
		transferSize: requests.reduce((total, request) => total + request.transferSize, 0),
		groups,
		entries: requests
	};
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

// V8 keeps the source of every script evaluated in the page, so a trace taken after the cold
// sign-in carries the sign-in script with the actor's password in it. That source holds the
// password as a string literal, and the trace JSON escapes the source again.
export function redactTrace(gzipped, secrets) {
	const escape = (value) => JSON.stringify(value).slice(1, -1);
	let text = gunzipSync(gzipped).toString('utf8');
	for (const secret of secrets)
		for (const form of [escape(escape(secret)), escape(secret), secret]) text = text.replaceAll(form, '<redacted>');
	return gzipSync(text);
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
