import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { test } from 'node:test';
import { assertPageBound, count, perfCommand } from './perf-command.mjs';

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

async function traceScenario({ trace, failNavigation = false }) {
	const repository = await fs.mkdtemp(path.join(os.tmpdir(), 'perf-trace-'));
	const evidenceRoot = path.join(repository, 'evidence');
	const session = path.join(repository, 'session');
	await fs.mkdir(session, { recursive: true });
	const calls = [];
	const ctx = {
		repository,
		evidenceRoot,
		session,
		doctor: { origin: 'http://127.0.0.1:4000', candidate: 'abc' },
		ownedState: {
			workloads: {
				small: {
					organizationId: 'org',
					sentinels: { wide: 'Able, Alex', scoped: 'Baker, Bo' },
					searchTerms: { wide: 'Able', scoped: 'Baker' }
				}
			}
		},
		isUnderEvidence: async (file, root) => file.startsWith(root + path.sep),
		credentials: () => ({ email: 'wide@example.test', password }),
		text: (reply) => reply.text ?? '',
		evaluate: async (_pageId, source) => {
			if (source.includes('/auth/login?/login')) return 'redirect';
			if (source.includes("getEntriesByType('resource')")) return [];
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
	return { run, calls, evidenceRoot, session, listing, repository };
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
	assert.deepEqual(
		await scenario.listing(scenario.session),
		[path.join(scenario.session, 'perf-pace.json'), path.join(scenario.session, 'perf-sign-ins.json')].sort()
	);
});

test('a trace whose redaction fails leaves nothing unredacted under the evidence root', async () => {
	const scenario = await traceScenario({ trace: Buffer.from(`not gzip ${password}`) });
	await assert.rejects(scenario.run);
	const files = (await scenario.listing(scenario.evidenceRoot)).filter((file) => path.extname(file));
	assert.deepEqual(files, []);
	assert.ok(!(await scenario.listing(scenario.session)).some((file) => file.includes('perf-trace-raw')));
});

test('a trace that fails after it started is stopped before the page closes', async () => {
	const scenario = await traceScenario({ trace: Buffer.alloc(0), failNavigation: true });
	await assert.rejects(scenario.run, /navigation failed/);
	assert.deepEqual(
		scenario.calls.filter((name) => ['performance_start_trace', 'performance_stop_trace', 'close_page'].includes(name)),
		['performance_start_trace', 'performance_stop_trace', 'close_page']
	);
	assert.ok(!(await scenario.listing(scenario.session)).some((file) => file.includes('perf-trace-raw')));
});

test('a run directory outside the evidence root is rejected before any sample', async () => {
	const ctx = {
		repository: '/repo',
		evidenceRoot: '/repo/evidence',
		isUnderEvidence: async () => false,
		ownedState: {
			workloads: { small: { organizationId: 'o', sentinels: {}, searchTerms: {} } },
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
