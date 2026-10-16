import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
	profiles,
	protocol,
	journeys,
	installSettledObserver,
	readSettledSample,
	groupManifest,
	distribution,
	summarizeTrace,
	parseServerTiming
} from './perf-measure.mjs';
import { workloads } from './perf-workloads.mjs';

export const perfHelp = `Performance measurement on seeded workloads (recipe: features/performance.md)

$V seed workload small|typical|large       Seed one synthetic Organization; clean-seeds removes it
$V actor perfWide|perfScoped DESTINATION WORKLOAD   Sign in to that workload's Organization
$V perf workloads                          Print the workload table, profiles and protocol
$V perf load PAGE WORKLOAD JOURNEY ACTOR --out RUN [--mode cold|warm] [--profile NAME] [--warmup N] [--reps N]
                                           Repeated page loads to a settled milestone: request/byte manifest,
                                           navigation/paint/LCP/long tasks, server timing lines, query capture
$V perf interaction PAGE WORKLOAD JOURNEY ACTOR --out RUN [--profile NAME] [--warmup N] [--reps N]
                                           Repeated native input to a settled milestone (interaction journeys)
$V perf trace PAGE WORKLOAD JOURNEY ACTOR --out RUN [--profile NAME]
                                           One cold traced load; raw trace plus a main-thread summary
$V perf statements reset|read [--top N] [--out FILE]   pg_stat_statements on the owned database
$V perf explain NAME WORKLOAD wide|scoped [--out FILE] EXPLAIN (ANALYZE, BUFFERS) a named statement as the actor
$V perf summarize RUN                      Distribution table over every run file below RUN

JOURNEY: ${Object.entries(journeys)
	.map(([name, journey]) => `${name} (${journey.kind})`)
	.join(', ')}
ACTOR: perfWide (Organization owner) or perfScoped (operate, one Group)
Profiles: ${Object.keys(profiles).join(', ')}. Defaults: warm-up ${protocol.warmup}, repetitions ${protocol.repetitions}.
RUN and FILE must be under .verification/evidence/verify-trooptotask/.`;

const actors = { perfWide: 'wide', perfScoped: 'scoped' };

function parse(args) {
	const positional = [];
	const options = {};
	for (let index = 0; index < args.length; index++) {
		if (args[index].startsWith('--')) options[args[index].slice(2)] = args[++index];
		else positional.push(args[index]);
	}
	return { positional, options };
}

function count(value, fallback, label) {
	const number = value === undefined ? fallback : Number(value);
	if (!Number.isSafeInteger(number) || number < 0 || number > 50) throw new Error(`${label} must be 0 to 50.`);
	return number;
}

async function writeEvidence(ctx, file, value) {
	if (!(await ctx.isUnderEvidence(file, ctx.evidenceRoot)))
		throw new Error(
			'Performance output must be under .verification/evidence/verify-trooptotask/ without .. or symlinks.'
		);
	await fs.mkdir(path.dirname(file), { recursive: true });
	await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
	return path.relative(ctx.repository, file);
}

function target(ctx, positional, kind) {
	const [page, workload, journeyName, actor] = positional;
	const pageId = Number(page);
	const item = ctx.ownedState.workloads?.[workload];
	const journey = journeys[journeyName];
	if (!Number.isSafeInteger(pageId) || pageId < 1) throw new Error('Use the actual page ID.');
	if (!item) throw new Error(`Workload ${workload} is not seeded; run seed workload ${workload}.`);
	if (journey?.kind !== kind) throw new Error(`Use a ${kind} journey: ${Object.keys(journeys).join(', ')}.`);
	if (!actors[actor]) throw new Error('Use perfWide or perfScoped, the actor signed in on that page.');
	const scope = actors[actor];
	return {
		pageId,
		workload,
		item,
		journeyName,
		journey,
		actor,
		url: `${ctx.doctor.origin}/org/${item.organizationId}${journey.path ? `/${journey.path}` : ''}`,
		context: { sentinel: item.sentinels[scope], searchTerm: item.searchTerms[scope] }
	};
}

async function emulate(ctx, pageId, profileName) {
	const profile = profiles[profileName];
	if (!profile) throw new Error(`Use a profile: ${Object.keys(profiles).join(', ')}.`);
	await ctx.tool('emulate', {
		pageId,
		cpuThrottlingRate: profile.cpuThrottlingRate,
		...(profile.networkConditions ? { networkConditions: profile.networkConditions } : {})
	});
	return profile;
}

const observerScript = (spec) => `(${installSettledObserver.toString()})(window, ${JSON.stringify(spec)});`;

async function settled(ctx, pageId) {
	return ctx.evaluate(pageId, `() => (${readSettledSample.toString()})(window, 30000)`);
}

// Chrome serves content-hashed /_app/immutable assets from cache on every reload, including a
// cache-ignoring one, so a cold sample is the first app document in a new browser context. It
// signs in by posting the login action from a static image, which loads no app code.
async function coldPage(ctx, run, profileName) {
	const created = ctx.text(
		await ctx.tool('new_page', {
			url: `${ctx.doctor.origin}/og-image.png`,
			isolatedContext: `perf-cold-${randomUUID()}`
		})
	);
	const pageId = Number(
		created
			.split('\n')
			.find((line) => line.includes('[selected]'))
			?.match(/^(\d+):/)?.[1]
	);
	if (!Number.isInteger(pageId)) throw new Error('New page ID was not returned.');
	const { email, password } = ctx.credentials(run.actor);
	const signedIn = await ctx.evaluate(
		pageId,
		`async () => {
			const body = new FormData();
			body.set('email', ${JSON.stringify(email)});
			body.set('password', ${JSON.stringify(password)});
			const response = await fetch('/auth/login?/login', {
				method: 'POST',
				body,
				headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
			});
			return (await response.json()).type;
		}`
	);
	if (signedIn !== 'redirect') {
		await ctx.tool('close_page', { pageId });
		throw new Error(`Cold sign-in returned ${signedIn}, not a redirect.`);
	}
	await emulate(ctx, pageId, profileName);
	return pageId;
}

async function appLogFrom(ctx, offset) {
	const handle = await fs.open(path.join(ctx.session, 'app.log'));
	try {
		const { size } = await handle.stat();
		const buffer = Buffer.alloc(Math.max(0, size - offset));
		await handle.read(buffer, 0, buffer.length, offset);
		return buffer.toString('utf8');
	} finally {
		await handle.close();
	}
}

async function appLogSize(ctx) {
	return (await fs.stat(path.join(ctx.session, 'app.log'))).size;
}

function measured(ctx, run, sample, serverText, since = 0) {
	const observer = sample.observer;
	const resources = sample.resources.filter((entry) => entry.startTime >= since);
	return {
		settledMs: observer?.milestones?.settled ?? null,
		milestones: observer?.milestones ?? {},
		startEvent: observer?.startEvent ?? null,
		observerFrames: observer?.frames ?? 0,
		navigation: sample.navigation && {
			type: sample.navigation.type,
			responseStartMs: sample.navigation.responseStart,
			domContentLoadedMs: sample.navigation.domContentLoaded,
			loadMs: sample.navigation.load
		},
		paint: sample.paint,
		largestContentfulPaintMs: observer?.lcp ?? null,
		longTasks: (observer?.longTasks ?? []).filter((task) => task.start >= since),
		manifest: groupManifest({ navigation: since ? null : sample.navigation, resources }, ctx.doctor.origin),
		serverTiming: parseServerTiming(serverText, run.item.organizationId)
	};
}

function summarize(samples) {
	const field = (read) => distribution(samples.map(read));
	const groups = Object.keys(samples[0]?.manifest.groups ?? {});
	const phases = [
		...new Set(samples.flatMap((sample) => sample.serverTiming.map((line) => `${line.feature}:${line.phase}`)))
	];
	return {
		settledMs: field((sample) => sample.settledMs),
		unsettled: samples.filter((sample) => sample.settledMs === null).length,
		responseStartMs: field((sample) => sample.navigation?.responseStartMs),
		domContentLoadedMs: field((sample) => sample.navigation?.domContentLoadedMs),
		firstContentfulPaintMs: field((sample) => sample.paint?.['first-contentful-paint']),
		largestContentfulPaintMs: field((sample) => sample.largestContentfulPaintMs),
		longTaskTotalMs: field((sample) => sample.longTasks.reduce((total, task) => total + task.duration, 0)),
		requests: field((sample) => sample.manifest.requests),
		transferBytes: field((sample) => sample.manifest.transferSize),
		groups: Object.fromEntries(
			groups.map((group) => [
				group,
				{
					requests: field((sample) => sample.manifest.groups[group].requests),
					transferBytes: field((sample) => sample.manifest.groups[group].transferSize),
					decodedBytes: field((sample) => sample.manifest.groups[group].decodedBodySize)
				}
			])
		),
		serverTimingMs: Object.fromEntries(
			phases.map((phase) => [
				phase,
				field(
					(sample) =>
						sample.serverTiming
							.filter((line) => `${line.feature}:${line.phase}` === phase)
							.reduce((total, line) => total + line.durationMs, 0) || undefined
				)
			])
		)
	};
}

async function repeat(ctx, run, options, once) {
	const warmup = count(options.warmup, protocol.warmup, '--warmup');
	const repetitions = count(options.reps, protocol.repetitions, '--reps');
	for (let index = 0; index < warmup; index++) await once();
	await ctx.database('perf-statements', 'reset');
	const samples = [];
	for (let index = 0; index < repetitions; index++) samples.push(await once());
	const statements = await ctx.database('perf-statements', 'read', '15');
	return { warmup, repetitions, samples, statements };
}

async function record(ctx, run, options, mode, result, profileName) {
	const out = path.resolve(ctx.repository, options.out ?? '');
	const file = path.join(out, run.workload, run.actor, `${run.journeyName}-${mode}-${profileName}.json`);
	const summary = summarize(result.samples);
	const saved = await writeEvidence(ctx, file, {
		kind: 't2t-perf-run',
		candidate: ctx.doctor.candidate,
		origin: ctx.doctor.origin,
		workload: run.workload,
		shape: workloads[run.workload],
		organizationId: run.item.organizationId,
		actor: run.actor,
		journey: run.journeyName,
		mode,
		profile: { name: profileName, ...profiles[profileName] },
		warmup: result.warmup,
		repetitions: result.repetitions,
		milestones: result.milestones,
		summary,
		samples: result.samples,
		statements: result.statements
	});
	return {
		file: saved,
		workload: run.workload,
		actor: run.actor,
		journey: run.journeyName,
		mode,
		profile: profileName,
		settledMs: summary.settledMs,
		unsettled: summary.unsettled,
		requests: summary.requests,
		transferBytes: summary.transferBytes
	};
}

async function load(ctx, positional, options) {
	const run = target(ctx, positional, 'load');
	const mode = options.mode ?? 'warm';
	if (!protocol.modes[mode]) throw new Error('Use --mode cold or --mode warm.');
	const profileName = options.profile ?? 'unthrottled';
	const milestones = run.journey.milestones(run.context);
	const initScript = observerScript({ name: run.journeyName, start: 'navigation', milestones });
	await ctx.tool('navigate_page', { pageId: run.pageId, type: 'url', url: run.url });
	await emulate(ctx, run.pageId, profileName);
	try {
		const once = async () => {
			const pageId = mode === 'cold' ? await coldPage(ctx, run, profileName) : run.pageId;
			try {
				const offset = await appLogSize(ctx);
				await ctx.tool('navigate_page', { pageId, type: 'url', url: run.url, initScript });
				const sample = await settled(ctx, pageId);
				return measured(ctx, run, sample, await appLogFrom(ctx, offset));
			} finally {
				if (pageId !== run.pageId) await ctx.tool('close_page', { pageId });
			}
		};
		const result = await repeat(ctx, run, options, once);
		return record(ctx, run, options, mode, { ...result, milestones }, profileName);
	} finally {
		await emulate(ctx, run.pageId, 'unthrottled');
	}
}

// The paused grouped roster repeats the toolbar search inside its notice; the toolbar one
// comes first in document order in both states.
function controlUid(snapshot, { role, name }) {
	const match = snapshot.split('\n').find((line) => line.includes(`${role} ${JSON.stringify(name)}`));
	if (!match) throw new Error(`No ${role} "${name}" on the page.`);
	return match.match(/uid=([^\s]+)/)[1];
}

async function interaction(ctx, positional, options) {
	const run = target(ctx, positional, 'interaction');
	const profileName = options.profile ?? 'unthrottled';
	const milestones = run.journey.milestones(run.context);
	const ready = observerScript({
		name: `${run.journeyName}:ready`,
		start: 'navigation',
		milestones: run.journey.ready(run.context)
	});
	const armed = { name: run.journeyName, start: 'input', milestones };
	await ctx.tool('navigate_page', { pageId: run.pageId, type: 'url', url: run.url });
	await emulate(ctx, run.pageId, profileName);
	try {
		const once = async () => {
			await ctx.tool('navigate_page', { pageId: run.pageId, type: 'url', url: run.url, initScript: ready });
			const before = await settled(ctx, run.pageId);
			if (!before.observer?.done) throw new Error(`${run.journeyName} never reached its ready milestone.`);
			await ctx.evaluate(run.pageId, `() => { ${observerScript(armed)} return true; }`);
			const uid = controlUid(ctx.text(await ctx.tool('take_snapshot', { pageId: run.pageId })), run.journey.control);
			const offset = await appLogSize(ctx);
			await ctx.tool('fill', { pageId: run.pageId, uid, value: run.journey.input(run.context) });
			const sample = await settled(ctx, run.pageId);
			return measured(ctx, run, sample, await appLogFrom(ctx, offset), sample.observer?.startedAt ?? 0);
		};
		const result = await repeat(ctx, run, options, once);
		return record(ctx, run, options, 'interaction', { ...result, milestones }, profileName);
	} finally {
		await emulate(ctx, run.pageId, 'unthrottled');
	}
}

async function trace(ctx, positional, options) {
	const run = target(ctx, positional, 'load');
	const profileName = options.profile ?? 'unthrottled';
	const milestones = run.journey.milestones(run.context);
	const initScript = observerScript({ name: run.journeyName, start: 'navigation', milestones });
	const base = path.join(
		path.resolve(ctx.repository, options.out ?? ''),
		run.workload,
		run.actor,
		`${run.journeyName}-trace-${profileName}`
	);
	if (!(await ctx.isUnderEvidence(`${base}.json.gz`, ctx.evidenceRoot)))
		throw new Error(
			'Performance output must be under .verification/evidence/verify-trooptotask/ without .. or symlinks.'
		);
	await fs.mkdir(path.dirname(base), { recursive: true });
	const pageId = await coldPage(ctx, run, profileName);
	try {
		await ctx.tool('performance_start_trace', { pageId, reload: false, autoStop: false });
		await ctx.tool('navigate_page', { pageId, type: 'url', url: run.url, initScript });
		const sample = await settled(ctx, pageId);
		const insights = ctx.text(await ctx.tool('performance_stop_trace', { pageId, filePath: `${base}.json.gz` }));
		const summary = {
			kind: 't2t-perf-trace',
			candidate: ctx.doctor.candidate,
			workload: run.workload,
			actor: run.actor,
			journey: run.journeyName,
			mode: 'cold',
			profile: { name: profileName, ...profiles[profileName] },
			settledMs: sample.observer?.milestones?.settled ?? null,
			trace: summarizeTrace(await fs.readFile(`${base}.json.gz`))
		};
		await writeEvidence(ctx, `${base}.insights.txt`, insights.replaceAll(ctx.doctor.origin, '<origin>'));
		await writeEvidence(ctx, `${base}.summary.json`, summary);
		return {
			...summary,
			files: [`${base}.json.gz`, `${base}.summary.json`, `${base}.insights.txt`].map((file) =>
				path.relative(ctx.repository, file)
			)
		};
	} finally {
		await ctx.tool('close_page', { pageId });
	}
}

async function files(directory) {
	const entries = await fs.readdir(directory, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map((entry) => {
			const full = path.join(directory, entry.name);
			return entry.isDirectory() ? files(full) : entry.name.endsWith('.json') ? [full] : [];
		})
	);
	return nested.flat();
}

const range = (value) => (value?.n ? `${value.median} (${value.min}–${value.max})` : 'not measured');

async function summarizeRun(ctx, directory) {
	const root = path.resolve(ctx.repository, directory ?? '');
	if (!(await ctx.isUnderEvidence(path.join(root, 'summary.json'), ctx.evidenceRoot)))
		throw new Error('RUN must be under .verification/evidence/verify-trooptotask/.');
	const runs = [];
	const traces = [];
	for (const file of (await files(root)).toSorted()) {
		const value = JSON.parse(await fs.readFile(file, 'utf8'));
		if (value.kind === 't2t-perf-run') runs.push(value);
		if (value.kind === 't2t-perf-trace') traces.push(value);
	}
	const rows = runs.map((run) => ({
		workload: run.workload,
		actor: run.actor,
		journey: run.journey,
		mode: run.mode,
		profile: run.profile.name,
		n: run.summary.settledMs.n,
		unsettled: run.summary.unsettled,
		settledMs: run.summary.settledMs,
		responseStartMs: run.summary.responseStartMs,
		requests: run.summary.requests,
		transferBytes: run.summary.transferBytes,
		jsTransferBytes: run.summary.groups.js?.transferBytes,
		dataTransferBytes: run.summary.groups.data?.transferBytes,
		documentTransferBytes: run.summary.groups.document?.transferBytes,
		serverTimingMs: run.summary.serverTimingMs,
		topStatementsByCalls: run.statements?.byCalls?.slice(0, 3).map(({ role, calls, mean_ms, query }) => ({
			role,
			calls,
			mean_ms,
			query: query.slice(0, 120)
		}))
	}));
	const table = [
		'| Workload | Actor | Journey | Mode | Profile | n | Settled ms median (min–max) | TTFB ms | Requests | Transfer bytes | JS bytes | Data bytes | Document bytes |',
		'| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
		...rows
			.map((row) =>
				[
					row.workload,
					row.actor,
					row.journey,
					row.mode,
					row.profile,
					`${row.n}${row.unsettled ? ` (${row.unsettled} unsettled)` : ''}`,
					range(row.settledMs),
					range(row.responseStartMs),
					range(row.requests),
					range(row.transferBytes),
					range(row.jsTransferBytes),
					range(row.dataTransferBytes),
					range(row.documentTransferBytes)
				].join(' | ')
			)
			.map((line) => `| ${line} |`)
	].join('\n');
	const traceTable = [
		'| Workload | Actor | Journey | Profile | Settled ms | FCP ms | LCP ms | Main-thread busy ms | Scripting ms | Long tasks (total ms) |',
		'| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
		...traces.map(
			(item) =>
				`| ${item.workload} | ${item.actor} | ${item.journey} | ${item.profile.name} | ${item.settledMs} | ${item.trace.firstContentfulPaintMs} | ${item.trace.largestContentfulPaintMs} | ${item.trace.mainThreadBusyMs} | ${item.trace.scriptingMs} | ${item.trace.longTasks?.count} (${item.trace.longTasks?.totalMs}) |`
		)
	].join('\n');
	await writeEvidence(ctx, path.join(root, 'summary.json'), { runs: rows, traces });
	await writeEvidence(ctx, path.join(root, 'summary.md'), `${table}\n\n${traceTable}\n`);
	return { runs: rows.length, traces: traces.length, files: ['summary.json', 'summary.md'] };
}

export async function perfCommand(args, ctx) {
	const [action, ...rest] = args;
	const { positional, options } = parse(rest);
	if (!action || action === '--help' || action === 'help') return { help: perfHelp };
	if (action === 'workloads') return { workloads, profiles, protocol };
	if (action === 'load') return load(ctx, positional, options);
	if (action === 'interaction') return interaction(ctx, positional, options);
	if (action === 'trace') return trace(ctx, positional, options);
	if (action === 'summarize') return summarizeRun(ctx, positional[0]);
	if (action === 'statements') {
		const result = await ctx.database('perf-statements', positional[0], options.top ?? '20');
		if (options.out) result.file = await writeEvidence(ctx, path.resolve(ctx.repository, options.out), result);
		return result;
	}
	if (action === 'explain') {
		const result = await ctx.database('perf-explain', ...positional.slice(0, 3));
		if (options.out) result.file = await writeEvidence(ctx, path.resolve(ctx.repository, options.out), result);
		return result;
	}
	throw new Error(perfHelp);
}
