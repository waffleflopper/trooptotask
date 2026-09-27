#!/usr/bin/env node
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
	repository,
	sessionPath,
	sessions,
	root,
	browser,
	candidate,
	readJSON,
	writeJSON,
	environment,
	cleanEnvironment,
	Blocked,
	sleep,
	processIdentity,
	activePilots,
	stopOwnedProcess,
	terminateOwnedGroup,
	profileProcess,
	checkReceipt
} from './core.mjs';
import { claimNames } from './claims.mjs';

const argv = process.argv.slice(2);
const option = argv.indexOf('--worker');
const worker = option === -1 ? '1' : argv.splice(option, 2)[1];
const [command = 'help', ...args] = argv;
let session;
try {
	if (!['1', '2'].includes(worker)) throw new Blocked('WORKER', 'Choose --worker 1 or --worker 2.');
	session = sessionPath(worker);
} catch (error) {
	console.log(JSON.stringify({ status: 'BLOCKED', code: error.code, message: error.message }));
	process.exit(2);
}

const help = `TroopToTask verification — owned synthetic production app + persistent Chrome DevTools MCP

npm run verify:app -- <command> [--worker 1|2]

setup                 Detect Chrome >=149, or install pinned Chrome for Testing; never personal profiles
info                  Read-only dependency/candidate/worker summary
launch                Copy this candidate, create isolated provider/fixtures, build, launch app and browser
doctor                Prove app/provider ownership and current candidate; refuses stale instances
restart               Cleanup this worker, then launch the current candidate
login manager|viewer|scoped|foreign   Normal UI login with private synthetic credentials
tools                 Native DevTools tool names, descriptions, and JSON argument schemas
tool NAME '{...}'     Call a native DevTools tool (pageId and snapshot UIDs from its output)
prove CLAIM           ${claimNames.join(' | ')}; PASS / FAIL / INCONCLUSIVE receipt
check-receipt FILE    Refuse old/negative/incomplete evidence; does not replace CI or release gates
self-test             Exclusive healthy/broken/restored pilot plus stale/foreign/unavailable controls
mcp                   Stdio MCP proxy for the running owned worker; register this project-local command
cleanup               Stop exact owned processes/provider; retain sanitized proof receipts

Examples:
  npm run verify:app -- tool list_pages '{}'
  npm run verify:app -- tool take_snapshot '{"pageId":1}'
  npm run verify:app -- tool list_console_messages '{"pageId":1}'
  npm run verify:app -- tool list_network_requests '{"pageId":1}'
  npm run verify:app -- tool take_screenshot '{"pageId":1}'

Native MCP supplies click/fill/press_key, wait_for, DOM/a11y snapshots, network request/response,
console, screenshots, and performance traces. Use tools for schemas, not one-off browser scripts.
The browser only allows the owned app/provider origins. No attach-to-URL/profile option exists.
JSON stdout (except help); exit 0 success, 1 behavioral FAIL, 2 BLOCKED/INCONCLUSIVE.
Private state: ${sessions}
Receipts: ${path.join(root, 'evidence')} (survive cleanup; publish reviewed sanitized receipts)
Negative-control launch: launch --mutation persistence|authorization (disposable copy only).
These receipts are labeled and cannot approve healthy code. No source or database is reset.
`;

async function request(input) {
	let state;
	try {
		state = await readJSON(path.join(session, 'session.json'));
	} catch {
		throw new Blocked('NOT_LAUNCHED', 'No owned session. Run launch first.');
	}
	if (
		state.repository !== repository ||
		state.worker !== worker ||
		state.phase !== 'running' ||
		!Number.isInteger(state.controlPort)
	)
		throw new Blocked(
			'OWNERSHIP',
			'Session ownership/phase does not match. Inspect info and cleanup before launching.'
		);
	try {
		const owner = state.supervisor && (await processIdentity(state.supervisor.pid));
		if (!owner || owner.start !== state.supervisor.start || owner.command !== state.supervisor.command)
			throw new Error('Supervisor absent or replaced');
		const response = await fetch(`http://127.0.0.1:${state.controlPort}`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify(input),
			signal: AbortSignal.timeout(180000)
		});
		if (!response.ok || response.headers.get('X-T2T-Session') !== state.id) throw new Error('Foreign target');
		return await response.json();
	} catch {
		throw new Blocked(
			'UNOWNED_OR_UNAVAILABLE',
			'Owned supervisor did not authenticate/respond. Refusing to drive this port. Inspect state and cleanup; never attach to another process.'
		);
	}
}
async function launch() {
	if (process.platform !== 'linux')
		throw new Blocked(
			'PLATFORM',
			'Owned supervisor currently requires Linux /proc and local Docker. Run on the Linux workstation; no browser or provider was started.'
		);
	const mutation = args[1] ?? null;
	await fs.mkdir(sessions, { recursive: true, mode: 0o700 });
	try {
		await fs.mkdir(session, { mode: 0o700 });
	} catch {
		throw new Blocked(
			'WORKER_BUSY',
			'Worker already owns state. Use doctor or cleanup; use worker 2 for independent verification.'
		);
	}
	let otherPilotActive;
	try {
		otherPilotActive = (await activePilots()).some((pilot) => pilot.worker !== worker);
	} catch (error) {
		await fs.rmdir(session);
		throw error;
	}
	if (otherPilotActive) {
		await fs.rmdir(session);
		throw new Blocked('PILOT_BUSY', 'The other worker is running an exclusive self-test. Retry after it finishes.');
	}
	await writeJSON(path.join(session, 'session.json'), {
		repository,
		worker,
		id: randomUUID(),
		token: randomUUID(),
		phase: 'starting',
		mutation
	});
	const log = await fs.open(path.join(session, 'supervisor.log'), 'a', 0o600);
	const child = spawn(process.execPath, [path.join(repository, 'scripts/verification/daemon.mjs'), session], {
		cwd: repository,
		env: cleanEnvironment(),
		detached: true,
		stdio: ['ignore', log.fd, log.fd]
	});
	child.unref();
	await log.close();
	const identity = await processIdentity(child.pid);
	await writeJSON(path.join(session, 'launcher.json'), { identity });
	for (let attempt = 0; attempt < 1200; attempt++) {
		const state = await readJSON(path.join(session, 'session.json'));
		if (state.phase === 'running') return await request({ command: 'doctor' });
		if (state.failure) throw new Blocked(state.failure.code, state.failure.message);
		const current = identity && (await processIdentity(identity.pid));
		if (!current || current.start !== identity.start || current.command !== identity.command)
			throw new Blocked(
				'LAUNCH_EXITED',
				'Supervisor exited before recording a result. Inspect private supervisor.log, then cleanup.'
			);
		await sleep(500);
	}
	throw new Blocked(
		'LAUNCH_TIMEOUT',
		'Launch still pending after ten minutes. Inspect private supervisor.log; do not launch over this worker.'
	);
}
async function cleanup() {
	let state;
	try {
		state = await readJSON(path.join(session, 'session.json'));
	} catch (error) {
		if (error.code === 'ENOENT') {
			// Remove only an empty allocation; never infer ownership of its contents.
			try {
				await fs.rmdir(session);
			} catch (missing) {
				if (missing.code !== 'ENOENT')
					throw new Blocked(
						'ORPHAN_STATE',
						'Unmarked non-empty worker directory; refusing to delete unknown resources. Inspect its owner.'
					);
			}
			return { status: 'PASS', phase: 'absent' };
		}
		throw error;
	}
	if (state.repository !== repository || state.worker !== worker)
		throw new Blocked('OWNERSHIP', 'Foreign session marker; no resources changed.');
	if (!state.supervisor) {
		try {
			state.supervisor = (await readJSON(path.join(session, 'launcher.json'))).identity;
		} catch {
			throw new Blocked('LAUNCH_PENDING', 'Launcher has not registered ownership yet. Retry cleanup shortly.');
		}
		if (!state.supervisor) state.phase = 'blocked';
	}
	const owner = state.supervisor && (await processIdentity(state.supervisor.pid));
	const alive = owner && owner.start === state.supervisor.start && owner.command === state.supervisor.command;
	if (state.phase === 'starting' && !state.supervisor)
		throw new Blocked(
			'LAUNCH_PENDING',
			'Supervisor has not registered ownership yet. Retry cleanup after startup or inspect supervisor.log.'
		);
	if (state.phase === 'starting' && alive) await terminateOwnedGroup(state.supervisor);
	if (state.phase === 'running' && alive) {
		const result = await request({ command: 'cleanup' });
		if (result.status !== 'PASS') return result;
	} else if (state.phase !== 'cleaned') {
		if (alive && state.phase !== 'starting')
			throw new Blocked('SUPERVISOR_ALIVE', 'Supervisor is still cleaning up; retry after it exits.');
		await stopOwnedProcess(state.mcpProcess);
		await stopOwnedProcess(state.browserProcess ?? (await profileProcess(path.join(session, 'chrome-profile'))));
		await stopOwnedProcess(state.appProcess);
		try {
			await fs.access(path.join(session, 'environment.json'));
			await environment('cleanup', session);
		} catch (error) {
			if (error.code !== 'ENOENT') throw error;
		}
	}
	if (state.phase === 'cleaned' && alive) await stopOwnedProcess(state.supervisor);
	await fs.rm(session, { recursive: true });
	return { status: 'PASS', phase: 'cleaned', evidence: path.join(root, 'evidence') };
}

try {
	if (
		['launch', 'restart'].includes(command) &&
		args.length &&
		(args.length !== 2 || args[0] !== '--mutation' || !['persistence', 'authorization'].includes(args[1]))
	)
		throw new Blocked('ARGUMENTS', 'launch/restart accept only --mutation persistence|authorization, or no arguments.');
	let result;
	if (['help', '--help', '-h'].includes(command)) {
		console.log(help);
	} else {
		switch (command) {
			case 'setup':
				result = { status: 'PASS', browser: await browser(true) };
				break;
			case 'info':
				result = {
					status: 'PASS',
					repository,
					candidate: await candidate(),
					worker,
					browser: await browser(),
					session,
					claims: claimNames
				};
				break;
			case 'launch':
				result = await launch();
				break;
			case 'restart': {
				const stopped = await cleanup();
				if (stopped.status !== 'PASS') {
					result = stopped;
					break;
				}
				result = await launch();
				break;
			}
			case 'cleanup':
				result = await cleanup();
				break;
			case 'doctor':
			case 'tools':
				result = await request({ command });
				break;
			case 'login':
				result = await request({ command, role: args[0] });
				break;
			case 'prove':
				result = await request({ command, claim: args[0] });
				break;
			case 'tool':
				result = await request({ command, name: args[0], args: JSON.parse(args[1] ?? '{}') });
				break;
			case 'check-receipt':
				result = await checkReceipt(args[0]);
				break;
			case 'self-test': {
				const { selfTest } = await import('./self-test.mjs');
				result = await selfTest(worker);
				break;
			}
			case 'mcp': {
				const server = new Server(
					{ name: 'trooptotask-owned-devtools', version: '1.0.0' },
					{ capabilities: { tools: {} } }
				);
				server.setRequestHandler(ListToolsRequestSchema, async () => {
					const value = await request({ command: 'tools' });
					if (!value.tools) throw new Error(value.message);
					return value;
				});
				server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
					const value = await request({ command: 'tool', name: params.name, args: params.arguments });
					return value.content ? value : { isError: true, content: [{ type: 'text', text: JSON.stringify(value) }] };
				});
				await server.connect(new StdioServerTransport());
				break;
			}
			default:
				throw new Blocked('COMMAND', 'Unknown command. Run npm run verify:app -- --help.');
		}
		if (result) {
			console.log(JSON.stringify(result, null, 2));
			process.exitCode = result.status === 'FAIL' ? 1 : ['BLOCKED', 'INCONCLUSIVE'].includes(result.status) ? 2 : 0;
		}
	}
} catch (error) {
	console.log(
		JSON.stringify({
			status: 'BLOCKED',
			code: error.code ?? 'HARNESS',
			message:
				error instanceof Blocked
					? error.message
					: 'Invalid command or unavailable prerequisite. Run --help and inspect private session logs.'
		})
	);
	process.exitCode = 2;
}
