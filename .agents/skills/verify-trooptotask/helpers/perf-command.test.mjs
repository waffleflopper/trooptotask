import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { test } from 'node:test';
import { assertPageBound, controlUid, count, journeyTerms, perfCommand, repeat, step } from './perf-command.mjs';

const perfPages = { 3: 'perfWide' };

test('a page signed in as the named actor is accepted', () => {
	assert.doesNotThrow(() => assertPageBound(perfPages, { pageId: 3, actor: 'perfWide' }));
});

test('a page signed in as the other actor is rejected, so a scoped label never records wide RLS', () => {
	assert.throws(
		() => assertPageBound(perfPages, { pageId: 3, actor: 'perfScoped' }),
		/Page 3 is signed in as perfWide, not perfScoped/
	);
});

test('a page the control never signed in is rejected', () => {
	assert.throws(() => assertPageBound(perfPages, { pageId: 9, actor: 'perfWide' }), /Page 9 was not signed in/);
	assert.throws(() => assertPageBound(undefined, { pageId: 3, actor: 'perfWide' }), /not signed in/);
});

test('repetitions need at least one sample while warm-up may be none', () => {
	assert.equal(count('0', 1, '--warmup'), 0);
	assert.equal(count(undefined, 5, '--reps', 1), 5);
	assert.throws(() => count('0', 5, '--reps', 1), /--reps must be 1 to 50/);
	assert.throws(() => count('51', 5, '--reps', 1), /--reps must be 1 to 50/);
});

const password = 'Synthetic-trace-password-1!';

const ledger = {
	organizationId: 'org',
	name: 'Performance Workload Small',
	anchor: '2026-10-16',
	sentinels: { wide: 'Able, Alex', scoped: 'Baker, Bo' },
	searchTerms: { wide: 'Able', scoped: 'Baker' },
	journeyTerms: {
		assignment: {
			control: 'CQ, Thu 1 Oct: ',
			original: { label: 'SPC Baker, Bo', search: 'Baker' },
			alternate: { label: '2LT Cole, Cy', search: 'Cole' }
		},
		edit: {
			wide: { row: 'Open SPC Able, Alex', original: '68W', alternate: '42A' },
			scoped: { row: 'Open SPC Baker, Bo', original: '11B', alternate: '42A' }
		},
		population: { wide: 20, scoped: 10 },
		members: 5,
		filter: { term: '68W', rows: { wide: 3, scoped: 1 } }
	}
};

async function traceScenario({ trace, failNavigation = false }) {
	const repository = await fs.mkdtemp(path.join(os.tmpdir(), 'perf-trace-'));
	const evidenceRoot = path.join(repository, '.verification', 'evidence');
	const session = path.join(repository, 'session');
	await fs.mkdir(session, { recursive: true });
	const calls = [];
	const ctx = {
		repository,
		evidenceRoot,
		session,
		doctor: { origin: 'http://127.0.0.1:4000', candidate: 'abc' },
		ownedState: {
			workloads: { small: ledger }
		},
		isUnderEvidence: async (file, root) => file.startsWith(root + path.sep),
		credentials: () => ({ email: 'wide@example.test', password }),
		text: (reply) => reply.text ?? '',
		evaluate: async (_pageId, source) => {
			if (source.includes('/auth/login?/login')) return 'redirect';
			if (source.startsWith("() => performance.getEntriesByType('resource')")) return [];
			if (source.includes('responseEnd ?? 0')) return { end: 9, now: 10 };
			return { observer: { done: true, milestones: { useful: 5 } }, resources: [], navigation: null, paint: {} };
		},
		tool: async (name, input) => {
			calls.push(name);
			if (name === 'new_page') return { text: '7: http://127.0.0.1:4000/og-image.png [selected]' };
			if (name === 'navigate_page' && failNavigation) throw new Error('navigation failed');
			if (name === 'list_network_requests') return { structuredContent: { networkRequests: [] } };
			if (name === 'performance_stop_trace') {
				await fs.writeFile(input.filePath, trace);
				return { text: 'insights' };
			}
			return {};
		}
	};
	const run = perfCommand(
		['trace', '7', 'small', 'personnel-list', 'perfWide', '--out', path.join(evidenceRoot, 'run')],
		ctx
	);
	const listing = async (directory) =>
		(await fs.readdir(directory, { recursive: true }).catch(() => [])).map((name) => path.join(directory, name));
	return {
		run,
		calls,
		evidenceRoot,
		session,
		listing,
		repository,
		rawFiles: () => listing(path.join(repository, '.verification', 'perf-raw'))
	};
}

test('a trace is redacted into the evidence and no raw trace survives', async () => {
	const raw = gzipSync(JSON.stringify({ traceEvents: [], source: `password ${password}` }));
	const scenario = await traceScenario({ trace: raw });
	await scenario.run;
	const written = (await scenario.listing(scenario.evidenceRoot)).filter((file) => file.endsWith('.json.gz'));
	assert.equal(written.length, 1);
	assert.ok(
		!gunzipSync(await fs.readFile(written[0]))
			.toString()
			.includes(password)
	);
	assert.deepEqual(await scenario.rawFiles(), []);
});

test('a trace whose redaction fails leaves nothing unredacted under the evidence root', async () => {
	const scenario = await traceScenario({ trace: Buffer.from(`not gzip ${password}`) });
	await assert.rejects(scenario.run);
	const files = (await scenario.listing(scenario.evidenceRoot)).filter((file) => path.extname(file));
	assert.deepEqual(files, []);
	assert.deepEqual(await scenario.rawFiles(), []);
});

test('a trace that fails after it started is stopped before the page closes', async () => {
	const scenario = await traceScenario({ trace: Buffer.alloc(0), failNavigation: true });
	await assert.rejects(scenario.run, /navigation failed/);
	assert.deepEqual(
		scenario.calls.filter((name) => ['performance_start_trace', 'performance_stop_trace', 'close_page'].includes(name)),
		['performance_start_trace', 'performance_stop_trace', 'close_page']
	);
	assert.deepEqual(await scenario.rawFiles(), []);
});

test('a run directory outside the evidence root is rejected before any sample', async () => {
	const ctx = {
		repository: '/repo',
		evidenceRoot: '/repo/evidence',
		isUnderEvidence: async () => false,
		ownedState: {
			workloads: { small: ledger },
			perfPages: { 1: 'perfWide' }
		},
		doctor: { origin: 'http://127.0.0.1:4000' },
		tool: async () => assert.fail('no browser call before the output check')
	};
	for (const args of [
		['load', '1', 'small', 'personnel-list', 'perfWide', '--out', '/tmp'],
		['interaction', '1', 'small', 'personnel-search', 'perfWide', '--out', '/tmp']
	])
		await assert.rejects(perfCommand(args, ctx), /Performance output must be under/);
});

const runFile = (journey, usefulMedian, extra = {}) => ({
	kind: 't2t-perf-run',
	workload: 'large',
	actor: 'perfWide',
	journey,
	mode: 'warm',
	profile: { name: 'unthrottled' },
	repetitions: 5,
	summary: {
		firstUsefulRenderMs: { n: 5, min: usefulMedian, max: usefulMedian, median: usefulMedian },
		groups: {}
	},
	samples: [],
	statements: { byRole: [], byCalls: [] },
	...extra
});

test('a summary excludes superseded runs and its own output, and lists the superseded ones apart', async () => {
	const repository = await fs.mkdtemp(path.join(os.tmpdir(), 'perf-summary-'));
	const root = path.join(repository, '.verification', 'evidence', 'run');
	await fs.mkdir(path.join(root, 'superseded', 'large'), { recursive: true });
	await fs.mkdir(path.join(root, 'large'), { recursive: true });
	await fs.writeFile(path.join(root, 'large', 'workbook.json'), JSON.stringify(runFile('workbook-export', 3466)));
	await fs.writeFile(
		path.join(root, 'superseded', 'large', 'workbook.json'),
		JSON.stringify(runFile('workbook-export', 3615))
	);
	await fs.writeFile(path.join(root, 'summary.json'), JSON.stringify({ runs: [], traces: [], superseded: [] }));
	const ctx = {
		repository,
		evidenceRoot: path.join(repository, '.verification', 'evidence'),
		isUnderEvidence: async (file, evidence) => file.startsWith(evidence + path.sep)
	};
	const result = await perfCommand(['summarize', path.relative(repository, root)], ctx);
	assert.deepEqual(result, { runs: 1, traces: 0, superseded: 1, files: ['summary.json', 'summary.md'] });
	const summary = JSON.parse(await fs.readFile(path.join(root, 'summary.json'), 'utf8'));
	assert.deepEqual(
		summary.runs.map((row) => row.firstUsefulRenderMs.median),
		[3466]
	);
	assert.deepEqual(
		summary.superseded.map((row) => [row.file, row.firstUsefulRenderMs.median]),
		[[path.join('superseded', 'large', 'workbook.json'), 3615]]
	);
	const markdown = await fs.readFile(path.join(root, 'summary.md'), 'utf8');
	assert.ok(markdown.includes('Superseded runs (diagnostics only'));
	assert.ok(markdown.includes('3615 (3615–3615)'));
});

const snapshot = [
	'uid=1_0 RootWebArea "Personnel"',
	'  uid=1_1 searchbox "Search by name, rank, MOS, role, or group"',
	'  uid=1_2 row "Open SPC Able, Alex"',
	'    uid=1_3 button "Edit"',
	'    uid=1_4 button "Details"',
	'  uid=1_5 row "Open PVT Cole, Cy"',
	'    uid=1_6 button "Edit"',
	'  uid=1_7 menuitem "PW Performance Workload Typical Owner"'
].join('\n');

test('a control is found by its exact name, inside a named row, or by part of its name', () => {
	assert.equal(controlUid(snapshot, { role: 'button', name: 'Edit' }), '1_3');
	assert.equal(
		controlUid(snapshot, { role: 'button', name: 'Edit', within: { role: 'row', name: 'Open PVT Cole, Cy' } }),
		'1_6'
	);
	assert.equal(controlUid(snapshot, { role: 'menuitem', name: 'Performance Workload Typical', partial: true }), '1_7');
	assert.throws(() => controlUid(snapshot, { role: 'menuitem', name: 'Performance Workload Typical' }), {
		message: 'No menuitem "Performance Workload Typical" on the page.'
	});
	assert.throws(
		() => controlUid(snapshot, { role: 'button', name: 'Details', within: { role: 'row', name: 'Open PVT Cole, Cy' } }),
		{ message: 'No button "Details" on the page inside Open PVT Cole, Cy.' }
	);
});

test('journey terms carry the actor scope and switch from another seeded workload', () => {
	const seeded = {
		small: ledger,
		typical: { ...ledger, organizationId: 'typical-org', sentinels: { wide: 'Dunn, Di', scoped: 'Eve, Ed' } }
	};
	const scoped = journeyTerms(seeded, 'small', 'perfScoped');
	assert.equal(scoped.sentinel, 'Baker, Bo');
	assert.equal(scoped.population, 10);
	assert.deepEqual(scoped.filter, { term: '68W', rows: 1 });
	assert.equal(scoped.rosterPaused, false);
	assert.deepEqual(scoped.switchFrom, { organizationId: 'typical-org', sentinel: 'Eve, Ed' });
	assert.deepEqual(journeyTerms({ large: ledger }, 'large', 'perfWide').rosterPaused, true);
	assert.equal(journeyTerms(seeded, 'small', 'platformReviewer').sentinel, undefined);
	assert.deepEqual(journeyTerms(seeded, 'small', 'perfScopedLeader').edit, {
		row: 'Open SPC Baker, Bo',
		original: '11B',
		alternate: '42A'
	});
});

test('a journey outside the cold set is refused cold before any browser call', async () => {
	const ctx = {
		repository: '/repo',
		evidenceRoot: '/repo/.verification/evidence',
		isUnderEvidence: async () => true,
		ownedState: { workloads: { small: ledger } },
		doctor: { origin: 'http://127.0.0.1:4000' },
		tool: async () => assert.fail('no browser call for a refused cold run')
	};
	await assert.rejects(
		perfCommand(
			[
				'load',
				'1',
				'small',
				'training-report',
				'perfWide',
				'--mode',
				'cold',
				'--out',
				'/repo/.verification/evidence/run'
			],
			ctx
		),
		{ message: 'training-report is not measured cold: the app sign-in limit leaves it warm only.' }
	);
});

const pinnedTables = { tables: [], planCache: { mode: 'force_custom_plan', pinned: true } };
const quietHost = {
	clear: async () => 0,
	watch: async () => ({ stop: async () => ({ clean: true, load1Max: 1, otherCpuPercent: 0, reasons: [] }) })
};

function hostWith(verdicts) {
	return {
		clear: async () => 0,
		watch: async () => ({
			stop: async () => {
				const clean = verdicts.shift();
				return { clean, load1Max: clean ? 1 : 6, otherCpuPercent: 0, reasons: clean ? [] : ['load 6 above 4'] };
			}
		})
	};
}

test('a contaminated sample is rejected and measured again, and a toggling write ends on an even attempt', async () => {
	const calls = [];
	const result = await repeat(
		{ database: async () => pinnedTables, host: hostWith([false, false, true, true]) },
		{ warmup: '1', reps: '2' },
		'warm',
		async (measure, index) => {
			calls.push([measure, index]);
			return { firstUsefulRenderMs: 100 + index, statementRows: [] };
		},
		{ toggles: true }
	);
	assert.deepEqual(calls, [
		[false, 0],
		[true, 1],
		[true, 2],
		[true, 3],
		[true, 4],
		[false, 5]
	]);
	assert.deepEqual(
		result.samples.map((sample) => sample.firstUsefulRenderMs),
		[103, 104]
	);
	assert.deepEqual(
		result.rejected.map((item) => [item.attempt, item.firstUsefulRenderMs, item.host.reasons]),
		[
			[1, 101, ['load 6 above 4']],
			[2, 102, ['load 6 above 4']]
		]
	);
	assert.equal(result.attempts, 6);
});

test('a host that keeps contaminating samples stops the run, names every rejection and leaves a toggled write as seeded', async () => {
	const calls = [];
	await assert.rejects(
		repeat(
			{ database: async () => pinnedTables, host: hostWith([false, false, false, false, false, false]) },
			{ warmup: '1', reps: '1' },
			'warm',
			async (measure, index) => {
				calls.push([measure, index]);
				return { firstUsefulRenderMs: 1, statementRows: [] };
			},
			{ toggles: true }
		),
		{
			message:
				'6 samples were contaminated: attempt 1 (load 6 above 4), attempt 2 (load 6 above 4), attempt 3 (load 6 above 4), attempt 4 (load 6 above 4), attempt 5 (load 6 above 4), attempt 6 (load 6 above 4).'
		}
	);
	assert.deepEqual(calls, [
		[false, 0],
		[true, 1],
		[true, 2],
		[true, 3],
		[true, 4],
		[true, 5],
		[true, 6],
		[false, 7]
	]);
});

test('a run on an unpinned plan regime does not start', async () => {
	await assert.rejects(
		repeat(
			{ database: async () => ({ tables: [], planCache: { mode: 'auto', pinned: false } }), host: quietHost },
			{},
			'warm',
			async () => assert.fail('no sample on an unpinned regime')
		),
		{ message: 'The plan regime is not pinned on every PostgREST connection; run perf prepare.' }
	);
});

test('a slow document keeps its observer and closes its query window only when it ends', async () => {
	const repository = await fs.mkdtemp(path.join(os.tmpdir(), 'perf-document-'));
	const evidenceRoot = path.join(repository, '.verification', 'evidence');
	const session = path.join(repository, 'session');
	await fs.mkdir(session, { recursive: true });
	await fs.writeFile(path.join(session, 'app.log'), '');
	const events = [];
	const navigations = [];
	let documentPolls = 0;
	const ctx = {
		repository,
		evidenceRoot,
		session,
		doctor: { origin: 'http://127.0.0.1:4000', candidate: 'abc' },
		ownedState: { workloads: { small: ledger }, perfPages: { 7: 'perfWide' } },
		isUnderEvidence: async (file, root) => file.startsWith(root + path.sep),
		text: (reply) => reply.text ?? '',
		database: async (name, action) => {
			if (name === 'perf-tables') return pinnedTables;
			events.push(`statements ${action}`);
			return { statements: [] };
		},
		host: quietHost,
		evaluate: async (_pageId, source) => {
			if (source.startsWith("() => performance.getEntriesByType('resource')")) return [];
			if (source.includes('responseEnd ?? 0')) {
				documentPolls++;
				const ended = documentPolls >= 3;
				if (ended) events.push('document ended');
				return { end: ended ? 45598 : 0, now: 2700 + documentPolls };
			}
			return {
				observer: { done: true, milestones: { useful: 2674 } },
				navigation: {
					name: 'http://127.0.0.1:4000/org/org/critical-tasks/reports',
					responseEnd: 0,
					transferSize: 300,
					encodedBodySize: 0,
					decodedBodySize: 0,
					startTime: 0,
					responseStart: 2633,
					domContentLoaded: 0,
					load: 0,
					type: 'navigate'
				},
				resources: [],
				paint: {}
			};
		},
		tool: async (name, input) => {
			if (name === 'navigate_page') navigations.push(input.timeout);
			return name === 'list_network_requests' ? { structuredContent: { networkRequests: [] } } : {};
		}
	};
	const out = path.join(evidenceRoot, 'run');
	const result = await perfCommand(
		['load', '7', 'small', 'critical-tasks-report', 'perfWide', '--warmup', '0', '--reps', '1', '--out', out],
		ctx
	);
	assert.deepEqual(navigations, [120000]);
	assert.deepEqual(events, ['statements reset', 'document ended', 'statements read']);
	const [sample] = JSON.parse(await fs.readFile(path.join(repository, result.file), 'utf8')).samples;
	assert.equal(sample.firstUsefulRenderMs, 2674);
	assert.equal(sample.documentCompleteMs, 45598);
	assert.equal(sample.documentOpen, false);
});

test('a preparation wait is one native wait that may take the whole cap', async () => {
	const calls = [];
	await step({ tool: async (name, input) => calls.push([name, input]) }, 7, { wait: ['Page 1 of'] });
	assert.deepEqual(calls, [['wait_for', { pageId: 7, text: ['Page 1 of'], timeout: 120000 }]]);
});
