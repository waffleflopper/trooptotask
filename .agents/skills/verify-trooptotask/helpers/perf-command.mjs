import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
	profiles,
	protocol,
	installSettledObserver,
	readSettledSample,
	groupManifest,
	distribution,
	serverTimingPhases,
	summarizeTrace,
	redactTrace,
	parseServerTiming,
	failedRequests,
	inFlight,
	statementTotals,
	statementCategories,
	maintenanceDuring
} from './perf-measure.mjs';
import { journeys, journeyFor, monthLabels } from './perf-journeys.mjs';
import { workloads, importCsv, removeImported } from './perf-workloads.mjs';

export const perfHelp = `Performance measurement on seeded workloads (recipe: features/performance.md)

$V seed workload small|typical|large       Seed one synthetic Organization, then perf prepare; clean-seeds removes it
$V actor perfWide|perfScoped|perfScopedLeader DESTINATION WORKLOAD   Sign in to that workload's Organization
$V actor platformReviewer admin/users      Sign in the platform super-admin for admin-users
$V perf workloads                          Print the workload table, profiles and protocol
$V perf load PAGE WORKLOAD JOURNEY ACTOR --out RUN [--mode cold|warm] [--profile NAME] [--warmup N] [--reps N]
                                           Repeated page loads to the first useful render, then to app-origin
                                           network idle (settled including reloads): resource-entry, network
                                           request and failure manifest, navigation/paint/LCP (loads only), long tasks,
                                           server timing lines, and a query window per sample
$V perf interaction PAGE WORKLOAD JOURNEY ACTOR --out RUN [--profile NAME] [--warmup N] [--reps N]
                                           Repeated native input to the same two milestones; the query window
                                           opens after the page is ready and idle, just before the input
$V perf trace PAGE WORKLOAD JOURNEY ACTOR --out RUN [--profile NAME]
                                           One cold traced load to network idle; raw trace plus a summary
$V perf statements reset|read [--top N] [--out FILE]   pg_stat_statements on the owned database
$V perf explain NAME WORKLOAD wide|scoped [--out FILE] EXPLAIN (ANALYZE, BUFFERS) a named statement as the actor
$V perf prepare                            VACUUM (ANALYZE) every table a workload seed writes; seed workload runs it
$V perf tables [--out FILE]                Vacuum, analyze and visibility state of those tables; every run records
                                           it before its warm-up and after its last sample
$V perf summarize RUN                      Distribution table over every run file below RUN

JOURNEY (kind, effect, actors; cold only where marked): ${Object.entries(journeys)
	.map(
		([name, journey]) =>
			`${name} (${journey.kind}, ${journey.effect}, ${Object.keys(journey.actors)
				.filter((actor) => !journey.actors[actor])
				.join('/')}${journey.cold ? ', cold' : ''})`
	)
	.join(', ')}
ACTOR: perfWide (Organization owner), perfScoped (operator, one Group), perfScopedLeader (editor, the
same Group) or platformReviewer (platform super-admin). A journey refuses an actor it does not apply to, with the reason. A warm load and an
interaction require PAGE to be one that the actor command signed in as that ACTOR; a mismatch is rejected.
Cold loads run only for journeys marked cold; the sign-in limit leaves the rest warm only.
Profiles: ${Object.keys(profiles).join(', ')}. Defaults: warm and interaction warm-up ${protocol.defaults.warm.warmup}, repetitions ${protocol.defaults.warm.repetitions}; cold warm-up ${protocol.defaults.cold.warmup}, repetitions ${protocol.defaults.cold.repetitions}.
RUN and FILE must be under .verification/evidence/verify-trooptotask/.`;

function parse(args) {
	const positional = [];
	const options = {};
	for (let index = 0; index < args.length; index++) {
		if (args[index].startsWith('--')) options[args[index].slice(2)] = args[++index];
		else positional.push(args[index]);
	}
	return { positional, options };
}

export function count(value, fallback, label, minimum = 0) {
	const number = value === undefined ? fallback : Number(value);
	if (!Number.isSafeInteger(number) || number < minimum || number > 50)
		throw new Error(`${label} must be ${minimum} to 50.`);
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

async function runDirectory(ctx, options) {
	const out = path.resolve(ctx.repository, options.out ?? '');
	if (!(await ctx.isUnderEvidence(path.join(out, 'run.json'), ctx.evidenceRoot)))
		throw new Error(
			'Performance output must be under .verification/evidence/verify-trooptotask/ without .. or symlinks.'
		);
	return out;
}

const scopes = { perfWide: 'wide', perfScoped: 'scoped', perfScopedLeader: 'scoped', platformReviewer: null };

/** What a journey needs to know about one seeded workload as one actor, all from the seed ledger. */
export function journeyTerms(seeded, workload, actor) {
	const item = seeded[workload];
	const scope = scopes[actor];
	const shape = workloads[workload];
	const terms = {
		organizationId: item.organizationId,
		organizationName: item.name,
		month: monthLabels(item.anchor),
		assignment: item.journeyTerms.assignment,
		members: item.journeyTerms.members
	};
	if (!scope) return terms;
	const from = Object.entries(seeded).find(([name]) => name !== workload)?.[1];
	return {
		...terms,
		sentinel: item.sentinels[scope],
		searchTerm: item.searchTerms[scope],
		rosterPaused: scope === 'wide' && shape.groups * shape.personnelPerGroup > 250,
		edit: item.journeyTerms.edit[scope],
		population: item.journeyTerms.population[scope],
		filter: { term: item.journeyTerms.filter.term, rows: item.journeyTerms.filter.rows[scope] },
		switchFrom: from && { organizationId: from.organizationId, sentinel: from.sentinels[scope] }
	};
}

function target(ctx, positional, kind) {
	const [page, workload, journeyName, actor] = positional;
	const pageId = Number(page);
	const item = ctx.ownedState.workloads?.[workload];
	if (!Number.isSafeInteger(pageId) || pageId < 1) throw new Error('Use the actual page ID.');
	if (!item) throw new Error(`Workload ${workload} is not seeded; run seed workload ${workload}.`);
	if (!(actor in scopes)) throw new Error(`Use ${Object.keys(scopes).join(', ')}, the actor signed in on that page.`);
	const journey = journeyFor(journeyName, actor, kind);
	const terms = journeyTerms(ctx.ownedState.workloads, workload, actor);
	if (journey.area === 'organization' && !terms.switchFrom)
		throw new Error('Organization switching needs a second seeded workload to switch from.');
	return {
		pageId,
		workload,
		item,
		journeyName,
		journey,
		actor,
		terms,
		url: () => `${ctx.doctor.origin}${journey.path(terms)}`
	};
}

/**
 * A warm load or interaction reuses an existing page, so the actor argument alone could label a
 * sample with an identity the page does not hold. `actor perfWide|perfScoped` journals the actor of
 * each page it signs in; an actor is a member of every workload, so one page serves them all. Cold
 * samples create their own page for the named actor and need no entry.
 */
export function assertPageBound(perfPages, { pageId, actor }) {
	const bound = perfPages?.[pageId];
	if (!bound) throw new Error(`Page ${pageId} was not signed in by the actor command; open it with actor ${actor}.`);
	if (bound !== actor) throw new Error(`Page ${pageId} is signed in as ${bound}, not ${actor}.`);
}

async function emulate(ctx, pageId, profileName, extra = {}) {
	const profile = profiles[profileName];
	if (!profile) throw new Error(`Use a profile: ${Object.keys(profiles).join(', ')}.`);
	await ctx.tool('emulate', {
		pageId,
		cpuThrottlingRate: profile.cpuThrottlingRate,
		...(profile.networkConditions ? { networkConditions: profile.networkConditions } : {}),
		...extra
	});
	return profile;
}

const observerScript = (spec) => `(${installSettledObserver.toString()})(window, ${JSON.stringify(spec)});`;

// One cap for every wait in a sample: the useful render, network idle, the document's end and a
// preparation step. The daemon allows a DevTools call 45 s unless the call names a longer timeout;
// page evaluations cannot, so the settled reads poll shorter calls.
export const capMs = 120_000;
const pollMs = 20_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// navigate_page registers the observer for the next document only until the call returns, and
// its default 10 s timeout returns before a slower document commits, which then loads without
// the observer. One navigation may therefore wait the whole cap; the daemon extends that call.
const navigate = (ctx, pageId, url, initScript) =>
	ctx.tool('navigate_page', { pageId, type: 'url', url, initScript, timeout: capMs });

async function sampleOf(ctx, pageId, cap = capMs) {
	const begun = Date.now();
	for (;;) {
		const wait = Math.max(0, Math.min(pollMs, cap - (Date.now() - begun)));
		const sample = await ctx.evaluate(pageId, `() => (${readSettledSample.toString()})(window, ${wait})`);
		if (sample.observer?.done || wait === 0) return sample;
	}
}

/**
 * When the page's own document response ended, in ms from its navigation. A streamed document
 * can stay open long after the render, and its server work runs until it ends, so a sample
 * waits for it within the cap and otherwise reports it open at the elapsed time.
 */
async function documentEnd(ctx, pageId) {
	const begun = Date.now();
	for (;;) {
		const at = await ctx.evaluate(
			pageId,
			`() => ({ end: Math.round(performance.getEntriesByType('navigation')[0]?.responseEnd ?? 0), now: Math.round(performance.now()) })`
		);
		if (at.end > 0) return { documentCompleteMs: at.end, documentOpen: false, documentOpenMs: null };
		if (Date.now() - begun >= capMs) return { documentCompleteMs: null, documentOpen: true, documentOpenMs: at.now };
		await sleep(200);
	}
}

// The server keeps streaming after the browser leaves a document, so the next query window
// opens only once this one has ended.
async function documentClosed(ctx, pageId, document) {
	if (document.documentOpen && (await documentEnd(ctx, pageId)).documentOpen)
		throw new Error(
			`The document stayed open past ${(2 * capMs) / 1000} s; a later window would include its statements.`
		);
}

async function networkRequests(ctx, pageId, resourceTypes) {
	const reply = await ctx.tool('list_network_requests', { pageId, ...(resourceTypes ? { resourceTypes } : {}) });
	return reply.structuredContent?.networkRequests ?? [];
}

// Idle means no app-origin request is running and the request and entry counts held still for
// a quiet window, so a reload started by the first render is waited for and recorded.
const idleQuietMs = 500;

async function drain(ctx, pageId) {
	const begun = Date.now();
	let signature = null;
	let quietSince = begun;
	for (;;) {
		const listed = await networkRequests(ctx, pageId);
		const fetches = await networkRequests(ctx, pageId, ['fetch', 'xhr']);
		const resources = await ctx.evaluate(
			pageId,
			`() => performance.getEntriesByType('resource').map((entry) => ({ name: entry.name }))`
		);
		const running = inFlight({ listed, fetches, resources }, ctx.doctor.origin);
		const next = `${listed.length}:${resources.length}:${running.length}`;
		if (running.length || next !== signature) quietSince = Date.now();
		signature = next;
		const waitedMs = Date.now() - begun;
		if (!running.length && Date.now() - quietSince >= idleQuietMs) return { idle: true, waitedMs, listed };
		if (waitedMs > capMs) return { idle: false, waitedMs, running, listed };
		await sleep(200);
	}
}

/**
 * First useful render, then app-origin network idle; the sample is read after both. A perf
 * navigation returns at the load event, so a load's streamed document has ended by then and its
 * end counts toward settled. The document's own end is waited for last, for interactions and for
 * a document still open at the cap.
 */
async function settle(ctx, pageId) {
	const first = await sampleOf(ctx, pageId);
	const network = await drain(ctx, pageId);
	const sample = await sampleOf(ctx, pageId, 0);
	return { ...sample, useful: first.observer?.done ?? false, network, document: await documentEnd(ctx, pageId) };
}

// The app admits 10 sign-in POSTs per IP in a fixed 15-minute window and 60 other requests
// per minute (hooks.server.ts), and every sample comes from loopback. Samples start at least
// 6 s apart, and cold sign-ins stay at 8 in any 15 minutes, leaving room for actor sign-ins.
const sampleSpacingMs = 6000;
// Organization exports share a separate fixed 10-per-hour window.
const limits = {
	signIn: { file: 'perf-sign-ins.json', windowMs: 15 * 60_000, budget: 8 },
	export: { file: 'perf-exports.json', windowMs: 60 * 60_000, budget: 10 }
};

async function waitUntil(at) {
	const wait = at - Date.now();
	if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

async function paceSample(ctx) {
	const file = path.join(ctx.session, 'perf-pace.json');
	await waitUntil(Number(await fs.readFile(file, 'utf8').catch(() => '0')) + sampleSpacingMs);
	await fs.writeFile(file, String(Date.now()), { mode: 0o600 });
}

/** Waits until one more request fits a limit within any window, which also fits a fixed window. */
async function limitSlot(ctx, name) {
	const { file, windowMs, budget } = limits[name];
	const journal = path.join(ctx.session, file);
	const recent = JSON.parse(await fs.readFile(journal, 'utf8').catch(() => '[]')).filter(
		(at) => Date.now() - at < windowMs
	);
	if (recent.length >= budget) await waitUntil(recent[recent.length - budget] + windowMs + 1000);
	await fs.writeFile(journal, JSON.stringify([...recent, Date.now()].slice(-budget)), { mode: 0o600 });
}

// Chrome serves content-hashed /_app/immutable assets from cache on every reload, including a
// cache-ignoring one, so a cold sample is the first app document in a new browser context. It
// signs in by posting the login form action from a static image, which runs no app code. The
// image page's automatic /favicon.ico request is redirected to /auth/login, whose Link headers
// preload the shared entry CSS and JS, as for any visitor arriving through sign-in.
async function coldPage(ctx, run, profileName) {
	await limitSlot(ctx, 'signIn');
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
		throw new Error(`Cold sign-in returned ${signedIn}, not a redirect; check the app sign-in limit.`);
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

function measured(
	ctx,
	run,
	sample,
	serverText,
	statements,
	{ interaction = false, since = 0, afterRequestId = 0, document = sample.document } = {}
) {
	const observer = sample.observer;
	const resources = sample.resources.filter((entry) => entry.startTime >= since);
	const manifest = groupManifest({ navigation: interaction ? null : sample.navigation, resources }, ctx.doctor.origin);
	const firstUsefulRenderMs = observer?.milestones?.useful ?? null;
	const lastData = Math.max(
		...manifest.entries
			.filter((entry) => ['data', 'document'].includes(entry.category))
			.map((entry) => entry.responseEnd - since)
	);
	return {
		firstUsefulRenderMs,
		settledIncludingReloadsMs:
			firstUsefulRenderMs === null || !sample.network.idle ? null : Math.max(firstUsefulRenderMs, lastData),
		...document,
		networkIdle: sample.network.idle,
		idleWaitMs: sample.network.waitedMs,
		stillRunning: sample.network.running ?? [],
		failedRequests: failedRequests(
			sample.network.listed.filter((row) => row.requestId > afterRequestId),
			ctx.doctor.origin
		),
		milestones: observer?.milestones ?? {},
		download: observer?.download ?? null,
		startEvent: observer?.startEvent ?? null,
		observerFrames: observer?.frames ?? 0,
		navigation:
			interaction || !sample.navigation
				? null
				: {
						type: sample.navigation.type,
						responseStartMs: sample.navigation.responseStart,
						domContentLoadedMs: sample.navigation.domContentLoaded,
						loadMs: sample.navigation.load
					},
		paint: interaction ? null : sample.paint,
		largestContentfulPaintMs: interaction ? null : (observer?.lcp ?? null),
		longTasks: (observer?.longTasks ?? []).filter((task) => task.start >= since),
		manifest,
		serverTiming: parseServerTiming(serverText, run.item.organizationId),
		statementRows: statements
	};
}

function summarize(samples, interaction) {
	const field = (read) => distribution(samples.map(read));
	const groups = Object.keys(samples[0]?.manifest.groups ?? {});
	return {
		firstUsefulRenderMs: field((sample) => sample.firstUsefulRenderMs),
		settledIncludingReloadsMs: field((sample) => sample.settledIncludingReloadsMs),
		notUseful: samples.filter((sample) => sample.firstUsefulRenderMs === null).length,
		notIdle: samples.filter((sample) => !sample.networkIdle).length,
		documentCompleteMs: field((sample) => sample.documentCompleteMs),
		documentOpen: samples.filter((sample) => sample.documentOpen).length,
		...(interaction
			? {}
			: {
					responseStartMs: field((sample) => sample.navigation?.responseStartMs),
					domContentLoadedMs: field((sample) => sample.navigation?.domContentLoadedMs),
					firstContentfulPaintMs: field((sample) => sample.paint?.['first-contentful-paint']),
					largestContentfulPaintMs: field((sample) => sample.largestContentfulPaintMs)
				}),
		milestones: Object.fromEntries(
			[...new Set(samples.flatMap((sample) => Object.keys(sample.milestones)))].map((name) => [
				name,
				field((sample) => sample.milestones[name])
			])
		),
		downloadBytes: field((sample) => sample.download?.bytes),
		longTaskTotalMs: field((sample) => sample.longTasks.reduce((total, task) => total + task.duration, 0)),
		resourceEntries: field((sample) => sample.manifest.resourceEntries),
		networkRequests: field((sample) => sample.manifest.networkRequests),
		cacheHits: field((sample) => sample.manifest.cacheHits),
		failedRequests: field((sample) => sample.failedRequests.length),
		transferBytes: field((sample) => sample.manifest.transferSize),
		groups: Object.fromEntries(
			groups.map((group) => [
				group,
				{
					resourceEntries: field((sample) => sample.manifest.groups[group].resourceEntries),
					networkRequests: field((sample) => sample.manifest.groups[group].networkRequests),
					transferBytes: field((sample) => sample.manifest.groups[group].transferSize),
					decodedBytes: field((sample) => sample.manifest.groups[group].decodedBodySize)
				}
			])
		),
		serverTiming: serverTimingPhases(samples)
	};
}

// A warm-up sample prepares the page and server; only measured samples open a query window.
// The workload tables' vacuum and analyze state is read before the warm-up and after the last
// sample, so a run that autovacuum or autoanalyze crossed says so.
async function repeat(ctx, options, mode, once) {
	const defaults = protocol.defaults[mode] ?? protocol.defaults.warm;
	const warmup = count(options.warmup, defaults.warmup, '--warmup');
	const repetitions = count(options.reps, defaults.repetitions, '--reps', 1);
	const before = (await ctx.database('perf-tables')).tables;
	for (let index = 0; index < warmup; index++) await once(false, index);
	const samples = [];
	for (let index = 0; index < repetitions; index++) samples.push(await once(true, warmup + index));
	const after = (await ctx.database('perf-tables')).tables;
	const windows = samples.map((sample) => sample.statementRows);
	const statements = { ...statementTotals(windows), byCategory: statementCategories(windows) };
	return {
		warmup,
		repetitions,
		tables: { before, after, maintenance: maintenanceDuring(before, after) },
		samples: samples.map(({ statementRows, ...sample }) => ({
			...sample,
			statementsByRole: statementTotals([statementRows], 0).byRole
		})),
		statements
	};
}

async function openStatements(ctx, measure) {
	if (measure) await ctx.database('perf-statements', 'reset');
}

async function closeStatements(ctx, measure) {
	return measure ? (await ctx.database('perf-statements', 'read')).statements : [];
}

async function record(ctx, run, out, mode, result, profileName) {
	const file = path.join(out, run.workload, run.actor, `${run.journeyName}-${mode}-${profileName}.json`);
	const summary = summarize(result.samples, mode === 'interaction');
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
		...(result.resets ? { resets: result.resets } : {}),
		summary,
		samples: result.samples,
		statements: result.statements,
		tables: result.tables
	});
	return {
		file: saved,
		workload: run.workload,
		actor: run.actor,
		journey: run.journeyName,
		mode,
		profile: profileName,
		firstUsefulRenderMs: summary.firstUsefulRenderMs,
		settledIncludingReloadsMs: summary.settledIncludingReloadsMs,
		notUseful: summary.notUseful,
		notIdle: summary.notIdle,
		documentCompleteMs: summary.documentCompleteMs,
		documentOpen: summary.documentOpen,
		networkRequests: summary.networkRequests,
		failedRequests: summary.failedRequests,
		transferBytes: summary.transferBytes,
		maintenance: result.tables.maintenance
	};
}

async function load(ctx, positional, options) {
	const run = target(ctx, positional, 'load');
	const out = await runDirectory(ctx, options);
	const mode = options.mode ?? 'warm';
	if (!protocol.modes[mode]) throw new Error('Use --mode cold or --mode warm.');
	if (mode === 'cold' && !run.journey.cold)
		throw new Error(`${run.journeyName} is not measured cold: the app sign-in limit leaves it warm only.`);
	if (mode === 'warm') assertPageBound(ctx.ownedState.perfPages, run);
	const profileName = options.profile ?? 'unthrottled';
	const milestones = run.journey.milestones(run.terms);
	const initScript = observerScript({ name: run.journeyName, start: 'navigation', milestones });
	if (mode === 'warm') await emulate(ctx, run.pageId, profileName);
	try {
		const once = async (measure) => {
			await paceSample(ctx);
			const pageId = mode === 'cold' ? await coldPage(ctx, run, profileName) : run.pageId;
			try {
				await openStatements(ctx, measure);
				const offset = await appLogSize(ctx);
				await navigate(ctx, pageId, run.url(), initScript);
				const sample = await settle(ctx, pageId);
				const statements = await closeStatements(ctx, measure);
				await documentClosed(ctx, pageId, sample.document);
				return measured(ctx, run, sample, await appLogFrom(ctx, offset), statements);
			} finally {
				if (pageId !== run.pageId) await ctx.tool('close_page', { pageId });
			}
		};
		const result = await repeat(ctx, options, mode, once);
		return record(ctx, run, out, mode, { ...result, milestones }, profileName);
	} finally {
		if (mode === 'warm') await emulate(ctx, run.pageId, 'unthrottled');
	}
}

// The paused grouped roster repeats the toolbar search inside its notice; the toolbar one
// comes first in document order in both states. A control `within` a row is the first match
// nested below that row's line; a `partial` name matches an accessible name that contains it.
export function controlUid(snapshot, { role, name, within, partial }) {
	let lines = snapshot.split('\n');
	const depth = (line) => line.length - line.trimStart().length;
	if (within) {
		const start = lines.findIndex((line) => line.includes(`${within.role} ${JSON.stringify(within.name)}`));
		if (start < 0) throw new Error(`No ${within.role} "${within.name}" on the page.`);
		const end = lines.findIndex((line, index) => index > start && depth(line) <= depth(lines[start]));
		lines = lines.slice(start + 1, end < 0 ? undefined : end);
	}
	const exact = `${role} ${JSON.stringify(name)}`;
	const match = lines.find((line) =>
		partial ? line.includes(`${role} "`) && line.split(`${role} "`)[1].includes(name) : line.includes(exact)
	);
	if (!match) throw new Error(`No ${role} "${name}" on the page${within ? ` inside ${within.name}` : ''}.`);
	return match.match(/uid=([^\s]+)/)[1];
}

/** Runs one native step from the registry on the page. A wait may take the whole cap. */
export async function step(ctx, pageId, action) {
	if (action.wait) return ctx.tool('wait_for', { pageId, text: action.wait, timeout: capMs });
	if (action.type !== undefined) return ctx.tool('type_text', { pageId, text: action.type });
	if (action.press) return ctx.tool('press_key', { pageId, key: action.press });
	const control = action.click ?? action.fill ?? action.upload;
	const uid = controlUid(ctx.text(await ctx.tool('take_snapshot', { pageId })), control);
	if (action.click) return ctx.tool('click', { pageId, uid });
	if (action.fill) return ctx.tool('fill', { pageId, uid, value: action.value });
	return ctx.tool('upload_file', { pageId, uid, filePaths: [action.file] });
}

const resetActions = {
	// The import adds new People every time, so each sample removes them and reads back their absence.
	'imported-personnel': async (ctx, run) =>
		removeImported({ client: await ctx.provider(), ownedState: ctx.ownedState, save: ctx.save, workload: run.workload })
};

async function interaction(ctx, positional, options) {
	const run = target(ctx, positional, 'interaction');
	const out = await runDirectory(ctx, options);
	assertPageBound(ctx.ownedState.perfPages, run);
	const profileName = options.profile ?? 'unthrottled';
	if (run.journey.reset === 'imported-personnel') {
		const csv = importCsv(run.workload, run.item.anchor);
		const file = path.join(out, 'inputs', `import-${run.workload}.csv`);
		await writeEvidence(ctx, file, csv.text);
		run.terms.importFile = { path: file, rows: csv.rows };
	}
	const ready = observerScript({
		name: `${run.journeyName}:ready`,
		start: 'navigation',
		milestones: run.journey.ready(run.terms)
	});
	const resets = [];
	await emulate(ctx, run.pageId, profileName);
	try {
		const once = async (measure, index) => {
			const milestones = run.journey.milestones(run.terms, index);
			await paceSample(ctx);
			await navigate(ctx, run.pageId, run.url(), ready);
			const before = await settle(ctx, run.pageId);
			if (!before.useful) throw new Error(`${run.journeyName} never reached its ready milestone.`);
			if (!before.network.idle) throw new Error(`${run.journeyName} never reached network idle before input.`);
			await documentClosed(ctx, run.pageId, before.document);
			for (const action of run.journey.prepare?.(run.terms, index) ?? []) await step(ctx, run.pageId, action);
			const prepared = await drain(ctx, run.pageId);
			if (!prepared.idle) throw new Error(`${run.journeyName} never reached network idle after its preparation.`);
			await ctx.evaluate(
				run.pageId,
				`() => { ${observerScript({ name: run.journeyName, start: 'input', milestones, download: milestones.some((milestone) => milestone.download) })} return true; }`
			);
			const afterRequestId = Math.max(0, ...prepared.listed.map((row) => row.requestId));
			if (run.journey.limit) await limitSlot(ctx, run.journey.limit);
			await openStatements(ctx, measure);
			const offset = await appLogSize(ctx);
			await step(ctx, run.pageId, run.journey.trigger(run.terms, index));
			const sample = await settle(ctx, run.pageId);
			const statements = await closeStatements(ctx, measure);
			if (run.journey.reset) resets.push(await resetActions[run.journey.reset](ctx, run));
			return measured(ctx, run, sample, await appLogFrom(ctx, offset), statements, {
				interaction: true,
				since: sample.observer?.startedAt ?? 0,
				afterRequestId,
				document: before.document
			});
		};
		const result = await repeat(ctx, options, 'warm', once);
		return record(
			ctx,
			run,
			out,
			'interaction',
			{ ...result, milestones: run.journey.milestones(run.terms, 0), resets },
			profileName
		);
	} finally {
		await emulate(ctx, run.pageId, 'unthrottled');
	}
}

async function trace(ctx, positional, options) {
	const run = target(ctx, positional, 'load');
	const profileName = options.profile ?? 'unthrottled';
	const milestones = run.journey.milestones(run.terms);
	const initScript = observerScript({ name: run.journeyName, start: 'navigation', milestones });
	const base = path.join(
		await runDirectory(ctx, options),
		run.workload,
		run.actor,
		`${run.journeyName}-trace-${profileName}`
	);
	await fs.mkdir(path.dirname(base), { recursive: true });
	await paceSample(ctx);
	const pageId = await coldPage(ctx, run, profileName);
	// V8 keeps the cold sign-in script's source, password included, so the tool writes the raw
	// trace beside the evidence root, inside the only directory it may write to, and only the
	// redacted copy reaches the evidence.
	const rawDirectory = path.join(ctx.repository, '.verification', 'perf-raw');
	await fs.mkdir(rawDirectory, { recursive: true, mode: 0o700 });
	const raw = path.join(rawDirectory, `${randomUUID()}.json.gz`);
	let tracing = false;
	try {
		await ctx.tool('performance_start_trace', { pageId, reload: false, autoStop: false });
		tracing = true;
		await navigate(ctx, pageId, run.url(), initScript);
		const sample = await settle(ctx, pageId);
		const insights = ctx.text(await ctx.tool('performance_stop_trace', { pageId, filePath: raw }));
		tracing = false;
		const trace = redactTrace(await fs.readFile(raw), [ctx.credentials(run.actor).password]);
		await fs.writeFile(`${base}.json.gz`, trace, { mode: 0o600 });
		const summary = {
			kind: 't2t-perf-trace',
			candidate: ctx.doctor.candidate,
			workload: run.workload,
			actor: run.actor,
			journey: run.journeyName,
			mode: 'cold',
			profile: { name: profileName, ...profiles[profileName] },
			firstUsefulRenderMs: sample.observer?.milestones?.useful ?? null,
			networkIdle: sample.network.idle,
			failedRequests: failedRequests(sample.network.listed, ctx.doctor.origin),
			trace: summarizeTrace(trace)
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
		// A trace left running would block the next one; stopping also leaves a raw file to remove.
		if (tracing) await ctx.tool('performance_stop_trace', { pageId, filePath: raw }).catch(() => {});
		await fs.rm(raw, { force: true });
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

// Browser times carry sub-millisecond float noise; the table reports whole milliseconds and bytes.
const range = (value) =>
	value?.n ? `${Math.round(value.median)} (${Math.round(value.min)}–${Math.round(value.max)})` : 'not measured';

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
		n: run.repetitions,
		notUseful: run.summary.notUseful,
		notIdle: run.summary.notIdle,
		firstUsefulRenderMs: run.summary.firstUsefulRenderMs,
		settledIncludingReloadsMs: run.summary.settledIncludingReloadsMs,
		documentCompleteMs: run.summary.documentCompleteMs,
		documentOpen: run.summary.documentOpen,
		responseStartMs: run.summary.responseStartMs,
		resourceEntries: run.summary.resourceEntries,
		networkRequests: run.summary.networkRequests,
		failedRequests: run.summary.failedRequests,
		failures: [
			...new Set(run.samples.flatMap((sample) => sample.failedRequests.map((row) => `${row.status} ${row.path}`)))
		],
		transferBytes: run.summary.transferBytes,
		jsTransferBytes: run.summary.groups.js?.transferBytes,
		dataTransferBytes: run.summary.groups.data?.transferBytes,
		documentTransferBytes: run.summary.groups.document?.transferBytes,
		milestones: run.summary.milestones,
		downloadBytes: run.summary.downloadBytes,
		serverTiming: run.summary.serverTiming,
		statementsByRole: run.statements.byRole,
		statementsByCategory: run.statements.byCategory,
		maintenance: run.tables?.maintenance ?? null,
		topStatementsByCalls: run.statements.byCalls.slice(0, 3).map(({ role, calls, callsPerWindow, mean_ms, query }) => ({
			role,
			calls,
			callsPerSample: callsPerWindow.median,
			mean_ms,
			query: query.slice(0, 120)
		}))
	}));
	const table = [
		'| Workload | Actor | Journey | Mode | Profile | n | First useful render ms | Settled incl. reloads ms | Document complete ms | TTFB ms | Resource entries | Network requests | Failed | Transfer bytes | JS bytes | Data bytes | Document bytes | Vacuum or analyze during run |',
		'| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
		...rows
			.map((row) =>
				[
					row.workload,
					row.actor,
					row.journey,
					row.mode,
					row.profile,
					`${row.n}${row.notUseful ? ` (${row.notUseful} not useful)` : ''}${row.notIdle ? ` (${row.notIdle} not idle)` : ''}${row.documentOpen ? ` (${row.documentOpen} document open)` : ''}`,
					range(row.firstUsefulRenderMs),
					range(row.settledIncludingReloadsMs),
					range(row.documentCompleteMs),
					range(row.responseStartMs),
					range(row.resourceEntries),
					range(row.networkRequests),
					range(row.failedRequests),
					range(row.transferBytes),
					range(row.jsTransferBytes),
					range(row.dataTransferBytes),
					range(row.documentTransferBytes),
					row.maintenance === null
						? 'not recorded'
						: row.maintenance.map(({ table, ...counts }) => `${table} ${JSON.stringify(counts)}`).join('; ') || 'none'
				].join(' | ')
			)
			.map((line) => `| ${line} |`)
	].join('\n');
	const traceTable = [
		'| Workload | Actor | Journey | Profile | First useful render ms | Network idle | FCP ms | LCP ms | Main-thread busy ms | Scripting ms | Long tasks (total ms) |',
		'| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
		...traces.map(
			(item) =>
				`| ${item.workload} | ${item.actor} | ${item.journey} | ${item.profile.name} | ${item.firstUsefulRenderMs} | ${item.networkIdle} | ${item.trace.firstContentfulPaintMs} | ${item.trace.largestContentfulPaintMs} | ${item.trace.mainThreadBusyMs} | ${item.trace.scriptingMs} | ${item.trace.longTasks?.count} (${item.trace.longTasks?.totalMs}) |`
		)
	].join('\n');
	const categories = Object.keys(rows.find((row) => row.statementsByCategory)?.statementsByCategory ?? {});
	const categoryTable = [
		`| Workload | Actor | Journey | Mode | ${categories.map((name) => `${name} calls (ms)`).join(' | ')} |`,
		`| --- | --- | --- | --- | ${categories.map(() => '---').join(' | ')} |`,
		...rows
			.filter((row) => row.statementsByCategory)
			.map(
				(row) =>
					`| ${row.workload} | ${row.actor} | ${row.journey} | ${row.mode} | ${categories
						.map((name) => {
							const { calls, ms } = row.statementsByCategory[name];
							return calls.n ? `${calls.median} (${ms.median})` : 'not measured';
						})
						.join(' | ')} |`
			)
	].join('\n');
	await writeEvidence(ctx, path.join(root, 'summary.json'), { runs: rows, traces });
	await writeEvidence(ctx, path.join(root, 'summary.md'), `${table}\n\n${categoryTable}\n\n${traceTable}\n`);
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
		const reply = await ctx.database('perf-statements', positional[0]);
		const result =
			positional[0] === 'read' ? statementTotals([reply.statements], count(options.top, 20, '--top')) : reply;
		if (options.out) result.file = await writeEvidence(ctx, path.resolve(ctx.repository, options.out), result);
		return result;
	}
	if (action === 'prepare') return ctx.database('perf-prepare');
	if (action === 'tables') {
		const result = await ctx.database('perf-tables');
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
