import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
	repository,
	root,
	candidate,
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
	receipt,
	Blocked,
	processIdentity,
	profileProcess,
	stopOwnedProcess,
	directoryDigest,
	sleep
} from './core.mjs';
import { seed } from './fixtures.mjs';
import { prove, driver } from './claims.mjs';

const session = process.argv[2];
const state = await readJSON(path.join(session, 'session.json'));
state.supervisor = await processIdentity(process.pid);
await writeJSON(path.join(session, 'session.json'), state);
let app, client, transport, server, port;
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
async function cleanup() {
	if (closing) throw new Blocked('CLEANUP_PENDING', 'Cleanup is already in progress; wait and inspect info.');
	closing = true;
	try {
		await port?.release();
		port = undefined;
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
	if ((await candidate()) !== state.candidate || (await candidate(path.join(session, 'app'))) !== state.artifact)
		throw new Blocked(
			'STALE_CANDIDATE',
			'Source or owned artifact changed. Restart and generate fresh proof; old evidence cannot approve this code.'
		);
	if (
		(await directoryDigest(path.join(session, 'app'), ignoredBuildPaths)) !== state.sourceDigest ||
		(await directoryDigest(path.join(session, 'app/.svelte-kit/output'))) !== state.buildDigest
	)
		throw new Blocked(
			'STALE_ARTIFACT',
			'Owned source or served production build changed. Relaunch before driving or proving it.'
		);
	await environment('status', session);
}
async function call(name, args = {}) {
	const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 45000 });
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
async function mutate(directory, mutation) {
	if (!mutation) return;
	if (mutation === 'persistence') {
		const file = path.join(directory, 'src/features/personnel/groupOperations.server.ts');
		let source = await fs.readFile(file, 'utf8');
		const before = 'GroupEntity.toDbInsert(data, ctx.auth.orgId),';
		if (source.split(before).length !== 2)
			throw new Blocked(
				'MUTATION_DRIFT',
				'Persistence negative control no longer matches its owned source. Update the control.'
			);
		source = source.replace(
			before,
			'{ ...GroupEntity.toDbInsert(data, ctx.auth.orgId), name: "Deliberately broken persistence" },'
		);
		await fs.writeFile(file, source);
	} else if (mutation === 'authorization') {
		const file = path.join(directory, 'src/routes/org/[orgId]/api/groups/+server.ts');
		let source = await fs.readFile(file, 'utf8');
		const before = 'export const POST = handle(_postConfig);';
		if (!source.includes(before))
			throw new Blocked('MUTATION_DRIFT', 'Authorization negative control no longer matches its owned source.');
		source =
			`import { createClient } from '@supabase/supabase-js';\nimport { env as privateEnv } from '$env/dynamic/private';\nimport { env as publicEnv } from '$env/dynamic/public';\n` +
			source.replace(
				before,
				`export const POST = async ({ request, params }: import('./$types').RequestEvent) => {
		const db = createClient(publicEnv.PUBLIC_SUPABASE_URL, privateEnv.SUPABASE_SERVICE_ROLE_KEY);
		const input = await request.json();
		const result = await db.from('groups').insert({organization_id:params.orgId,name:input.name}).select().single();
		return Response.json(result.data, {status:result.error ? 500 : 200});
	};`
			);
		await fs.writeFile(file, source);
	} else throw new Blocked('MUTATION', 'Only persistence or authorization negative controls are supported.');
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
	await mutate(copy, state.mutation);
	state.artifact = await candidate(copy);
	state.sourceDigest = await directoryDigest(copy, ignoredBuildPaths);
	port = await reservePort();
	state.origin = `http://127.0.0.1:${port.port}`;
	await writeJSON(path.join(session, 'session.json'), state);
	await environment('create', session, state.origin);
	continuing();
	const provider = await readJSON(path.join(session, 'provider.json'));
	const fixture = await seed(session);
	const env = {
		...cleanEnvironment(),
		PUBLIC_SUPABASE_URL: provider.API_URL,
		PUBLIC_SUPABASE_ANON_KEY: provider.ANON_KEY,
		SUPABASE_SERVICE_ROLE_KEY: provider.SERVICE_ROLE_KEY,
		ACCOUNT_SETUP_LINK_SECRET: randomBytes(32).toString('hex'),
		ACCOUNT_SETUP_SESSION_SECRET: randomBytes(32).toString('hex'),
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
	client = new Client({ name: 'trooptotask-verification', version: '1.0.0' });
	transport = new StdioClientTransport({
		command: process.execPath,
		args: [
			path.join(repository, 'node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'),
			'--headless',
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
									result = {
										status: 'PASS',
										candidate: state.candidate,
										origin: state.origin,
										browser: state.browser,
										mutation: state.mutation,
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
								case 'prove': {
									const proof = await prove(input.claim, session, state, fixture, call);
									await fresh();
									result = await receipt(state, proof);
									break;
								}
								default:
									throw new Blocked('COMMAND', 'Unknown command. Run --help.');
							}
						}
					} catch (error) {
						result = {
							status: 'INCONCLUSIVE',
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
