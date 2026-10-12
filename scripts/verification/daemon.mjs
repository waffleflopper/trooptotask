import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
	repository,
	root,
	candidate,
	assertCurrentCandidate,
	snapshot,
	readJSON,
	writeJSON,
	cleanEnvironment,
	browser,
	reservePort,
	environment,
	runLogged,
	completed,
	execute,
	Blocked,
	processIdentity,
	profileProcess,
	stopOwnedProcess,
	directoryDigest,
	sleep
} from './core.mjs';
import { seed } from './fixtures.mjs';
import { driver, assertOwnedNavigation, textContent } from './browser.mjs';
import { redactLinkTokens } from './outbound-controls.mjs';
import { capturePrint } from './print-capture.mjs';

const session = process.argv[2];
const state = await readJSON(path.join(session, 'session.json'));
state.supervisor = await processIdentity(process.pid);
await writeJSON(path.join(session, 'session.json'), state);
let app, client, transport, server, port;
let sourceControl, sourceControlConfig;
let ownedOrigins = [];
let closing = false;
let interrupted = false;
for (const sig of ['SIGTERM', 'SIGINT'])
	process.on(sig, async () => {
		interrupted = true;
		if (state.phase === 'running') {
			try {
				await cleanup();
				process.exit(0);
			} catch {
				process.exit(2);
			}
		}
	});
function continuing() {
	if (interrupted) throw new Blocked('INTERRUPTED', 'Launch interrupted; owned cleanup attempted.');
}
const ignoredBuildPaths = ['node_modules', '.svelte-kit', '.vercel'];
async function serverSource(action, options = {}) {
	if (!sourceControl) throw new Blocked('SOURCE_CONTROL', 'Owned server source control is unavailable; restart.');
	const response = await fetch(`http://127.0.0.1:${sourceControl.port}`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${sourceControlConfig.token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ ...options, action }),
		signal: AbortSignal.timeout(5000)
	});
	if (!response.ok || response.headers.get('X-T2T-Session') !== state.id)
		throw new Blocked('SOURCE_CONTROL', 'Owned server source control did not authenticate.');
	return response.json();
}
async function openMailLink({ pageId, email, kind, ordinal }) {
	const captured = await serverSource('mail-link', { email, kind, ordinal });
	if (captured.status !== 'PASS') throw new Blocked('MAIL_LINK', captured.message);
	const link = new URL(captured.link);
	if (link.origin !== state.origin) throw new Blocked('MAIL_LINK', 'The captured link is not on the owned app origin.');
	await call('navigate_page', { pageId, type: 'url', url: link.href });
	const snapshot = redactLinkTokens(textContent(await call('take_snapshot', { pageId })));
	const secrets = [...link.searchParams]
		.filter(([name]) => /token|hash|secret|code|key/i.test(name))
		.map(([, value]) => value);
	if (secrets.some((secret) => secret && snapshot.includes(secret)))
		throw new Blocked('MAIL_LINK', 'Link token survived redaction; refusing to print.');
	return { status: 'PASS', pageId, email, kind, sequence: captured.sequence, path: link.pathname, snapshot };
}
async function cleanup() {
	if (closing) throw new Blocked('CLEANUP_PENDING', 'Cleanup is already in progress; wait and inspect info.');
	closing = true;
	try {
		await port?.release();
		port = undefined;
		if (sourceControl && app?.exitCode === null && !app.signalCode) {
			for (const action of ['restore', 'mail-restore', 'fault-restore']) {
				try {
					await serverSource(action);
				} catch {
					// The owned app is stopped below; its preload also releases waits on SIGTERM.
				}
			}
		}
		const results = await Promise.allSettled([
			(async () => {
				const mcpProcess = state.mcpProcess ?? (transport?.pid && (await processIdentity(transport.pid)));
				try {
					await client?.close();
				} finally {
					await stopOwnedProcess(mcpProcess);
				}
			})(),
			stopOwnedProcess(state.appProcess),
			stopOwnedProcess(state.browserProcess)
		]);
		try {
			await fs.access(path.join(session, 'environment.json'));
			await environment('cleanup', session);
		} catch (error) {
			if (error.code !== 'ENOENT') throw error;
		}
		if (results.some((result) => result.status === 'rejected'))
			throw new Blocked('CLEANUP_INCOMPLETE', 'A process cleanup failed; state retained for retry.');
		state.phase = 'cleaned';
		await writeJSON(path.join(session, 'session.json'), state);
	} finally {
		closing = false;
	}
}
async function fresh() {
	if (state.phase !== 'running' || !app || app.exitCode !== null || app.signalCode)
		throw new Blocked('APP_UNAVAILABLE', 'Owned production app is unavailable. Cleanup and launch again.');
	assertCurrentCandidate(state, await candidate(), await candidate(path.join(session, 'app')));
	if (
		(await directoryDigest(path.join(session, 'app'), ignoredBuildPaths)) !== state.sourceDigest ||
		(await directoryDigest(path.join(session, 'app/.svelte-kit/output'))) !== state.buildDigest
	)
		throw new Blocked('STALE_ARTIFACT', 'Owned source or served production build changed. Relaunch before driving it.');
	await environment('status', session);
}
async function call(name, args = {}, timeout = 45000) {
	assertOwnedNavigation(name, args, ownedOrigins);
	const result = await client.callTool({ name, arguments: args }, undefined, { timeout });
	if (result.isError)
		throw new Blocked(
			'DEVTOOLS_TOOL',
			`${name} failed: ${result.content
				?.filter((c) => c.type === 'text')
				.map((c) => c.text)
				.join(' ')
				.slice(0, 1200)}`
		);
	return result;
}

try {
	state.browser = await browser(true);
	continuing();
	state.candidate = await candidate();
	state.revision = (await execute('git', ['rev-parse', 'HEAD'], { cwd: repository })).stdout.trim();
	const copy = path.join(session, 'app');
	await snapshot(copy);
	if ((await candidate(copy)) !== state.candidate || (await candidate()) !== state.candidate)
		throw new Blocked('COPY_RACE', 'Candidate changed while copying; cleanup and launch again.');
	state.artifact = await candidate(copy);
	state.sourceDigest = await directoryDigest(copy, ignoredBuildPaths);
	port = await reservePort();
	state.origin = `http://127.0.0.1:${port.port}`;
	await writeJSON(path.join(session, 'session.json'), state);
	await environment('create', session, state.origin);
	continuing();
	const provider = await readJSON(path.join(session, 'provider.json'));
	ownedOrigins = [new URL(state.origin).origin, new URL(provider.API_URL).origin];
	const fixture = await seed(session);
	sourceControlConfig = {
		sessionId: state.id,
		providerUrl: provider.API_URL,
		orgId: fixture.ids.orgA,
		token: randomBytes(32).toString('hex'),
		mailApiKey: randomBytes(24).toString('hex')
	};
	const sourceConfigPath = path.join(session, 'server-source-control.json');
	await writeJSON(sourceConfigPath, sourceControlConfig);
	const sourcePreload = pathToFileURL(path.join(copy, 'scripts/verification/server-source-control.mjs'));
	sourcePreload.searchParams.set('config', sourceConfigPath);
	const cleanupSecret = randomBytes(32).toString('hex');
	await writeJSON(path.join(session, 'archive-cleanup.json'), { secret: cleanupSecret });
	const env = {
		...cleanEnvironment(),
		PUBLIC_SUPABASE_URL: provider.API_URL,
		PUBLIC_SUPABASE_ANON_KEY: provider.ANON_KEY,
		SUPABASE_SERVICE_ROLE_KEY: provider.SERVICE_ROLE_KEY,
		RESEND_API_KEY: sourceControlConfig.mailApiKey,
		RESEND_FROM_EMAIL: 'verify@example.test',
		ACCOUNT_SETUP_LINK_SECRET: randomBytes(32).toString('hex'),
		ACCOUNT_SETUP_SESSION_SECRET: randomBytes(32).toString('hex'),
		CLEANUP_SECRET: cleanupSecret,
		APP_PUBLIC_ORIGIN: state.origin,
		PUBLIC_APP_ORIGIN: '',
		PUBLIC_SITE_URL: '',
		APP_PUBLIC_ORIGIN_ALLOWLIST: '',
		NODE_ENV: 'production'
	};
	await completed(
		await runLogged(
			process.execPath,
			[path.join(copy, 'node_modules/vite/bin/vite.js'), 'build'],
			copy,
			env,
			path.join(session, 'build.log')
		),
		'Production build'
	);
	continuing();
	state.buildDigest = await directoryDigest(path.join(copy, '.svelte-kit/output'));
	await port.release();
	const appPort = port.port;
	port = undefined;
	app = await runLogged(
		process.execPath,
		[
			'--import',
			sourcePreload.href,
			path.join(copy, 'node_modules/vite/bin/vite.js'),
			'preview',
			'--host',
			'127.0.0.1',
			'--port',
			String(appPort),
			'--strictPort'
		],
		copy,
		env,
		path.join(session, 'app.log')
	);
	state.appProcess = await processIdentity(app.pid);
	await writeJSON(path.join(session, 'session.json'), state);
	for (let attempt = 0; ; attempt++) {
		if (app.exitCode !== null || attempt > 100)
			throw new Blocked('APP_START', 'Production preview did not start on its reserved port. Inspect private app.log.');
		try {
			const response = await fetch(state.origin + '/auth/login');
			if (response.ok) break;
		} catch {
			/* Wait for owned app. */
		}
		await sleep(200);
	}
	sourceControl = await readJSON(path.join(session, 'server-source-control-ready.json'));
	if (sourceControl.sessionId !== state.id || !Number.isInteger(sourceControl.port))
		throw new Blocked('SOURCE_CONTROL', 'Server source control does not belong to this verification session.');
	await serverSource('state');
	client = new Client({ name: 'trooptotask-verification', version: '1.0.0' });
	transport = new StdioClientTransport({
		command: process.execPath,
		args: [
			path.join(repository, 'node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'),
			'--headless',
			'--experimentalStructuredContent',
			'--chrome-arg=--remote-debugging-port=0',
			`--executablePath=${state.browser.executable}`,
			`--userDataDir=${path.join(session, 'chrome-profile')}`,
			'--no-usage-statistics',
			'--no-performance-crux',
			'--redactNetworkHeaders',
			`--workspace=${root}`,
			`--allowedUrlPattern=${state.origin}/*`,
			`--allowedUrlPattern=${provider.API_URL}/*`
		],
		env: cleanEnvironment(),
		stderr: 'pipe'
	});
	await client.connect(transport);
	transport.stderr?.resume();
	await call('list_pages');
	continuing();
	state.mcpProcess = await processIdentity(transport.pid);
	state.browserProcess = await profileProcess(path.join(session, 'chrome-profile'));
	if (!state.browserProcess)
		throw new Blocked('BROWSER_OWNER', 'Cannot establish ownership of the verification browser.');
	state.phase = 'running';
	const drive = driver(call, state, fixture);
	let queue = Promise.resolve();
	server = createServer((req, res) => {
		if (req.method !== 'POST' || req.headers.authorization !== `Bearer ${state.token}` || req.headers.origin) {
			res.writeHead(403);
			res.end();
			return;
		}
		let body = '';
		req.on('data', (chunk) => {
			body += chunk;
			if (body.length > 1024 * 1024) req.destroy();
		});
		req.on('end', () => {
			queue = queue
				.catch(() => {})
				.then(async () => {
					let result;
					try {
						const input = JSON.parse(body);
						if (input.command === 'cleanup') {
							await cleanup();
							result = { status: 'PASS', phase: 'cleaned' };
						} else {
							await fresh();
							switch (input.command) {
								case 'doctor':
									try {
										const response = await fetch(`${state.origin}/auth/login`, {
											signal: AbortSignal.timeout(5000),
											redirect: 'error'
										});
										await response.body?.cancel();
										if (!response.ok) throw new Error('App endpoint did not succeed');
									} catch {
										throw new Blocked(
											'APP_ENDPOINT_UNAVAILABLE',
											'Owned login endpoint did not respond successfully. Inspect app.log, then restart.'
										);
									}
									try {
										await call('list_pages', {}, 5000);
									} catch {
										throw new Blocked(
											'DEVTOOLS_UNAVAILABLE',
											'Owned DevTools cannot list browser pages. Cleanup and launch again before driving.'
										);
									}
									result = {
										status: 'PASS',
										candidate: state.candidate,
										origin: state.origin,
										browser: state.browser,
										revision: state.revision,
										session: state.id
									};
									break;
								case 'tools':
									result = await client.listTools();
									break;
								case 'tool':
									result = await call(input.name, input.args);
									break;
								case 'login':
									result = await drive.login(input.role);
									break;
								case 'server-source':
									if (!['arm', 'state', 'release', 'restore'].includes(input.action))
										throw new Blocked('COMMAND', 'Use server-source arm, state, release or restore.');
									result = await serverSource(input.action, {
										table: input.table,
										mode: input.mode,
										ordinal: input.ordinal,
										holdMs: input.holdMs
									});
									break;
								case 'mail':
									if (!['state', 'fail', 'restore'].includes(input.action))
										throw new Blocked('COMMAND', 'Use mail state, fail or restore.');
									result = await serverSource(
										input.action === 'fail' ? 'mail-arm' : `mail-${input.action}`,
										input.action === 'fail' ? { mode: 'fail', kind: input.kind, count: input.count } : {}
									);
									break;
								case 'mail-link':
									result = await openMailLink(input);
									break;
								case 'fault':
									if (!['arm', 'state', 'restore'].includes(input.action))
										throw new Blocked('COMMAND', 'Use fault arm, state or restore.');
									result = await serverSource(`fault-${input.action}`, { name: input.name, ordinal: input.ordinal });
									break;
								case 'print-capture':
									result = await capturePrint({ state, session, input, call });
									break;
								default:
									throw new Blocked('COMMAND', 'Unknown command. Run --help.');
							}
						}
					} catch (error) {
						result = {
							status: error.code === 'URL_NOT_OWNED' ? 'BLOCKED' : 'INCONCLUSIVE',
							code: error.code ?? 'HARNESS',
							message:
								error instanceof Blocked
									? error.message
									: 'Harness operation unavailable. Inspect private logs; do not approve the candidate.'
						};
					}
					res.setHeader('Content-Type', 'application/json');
					res.setHeader('X-T2T-Session', state.id);
					res.end(JSON.stringify(result));
					if (state.phase === 'cleaned') server.close(() => process.exit(0));
				});
		});
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	state.controlPort = server.address().port;
	state.pid = process.pid;
	await writeJSON(path.join(session, 'session.json'), state);
} catch (error) {
	state.phase = 'blocked';
	state.failure = {
		code: error.code ?? 'LAUNCH',
		message: error instanceof Blocked ? error.message : 'Launch failed; inspect private logs and cleanup.'
	};
	await writeJSON(path.join(session, 'session.json'), state);
	try {
		await cleanup();
	} catch {
		/* Preserve marker for retry. */
	}
	process.exitCode = 2;
}
