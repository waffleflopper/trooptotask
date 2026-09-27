/** Explicit toolkit acceptance pilot, not a browser spec runner or CI E2E suite. */
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
	repository,
	root,
	sessionPath,
	reservePilot,
	activePilots,
	releasePilot,
	execute,
	readJSON,
	writeJSON,
	candidate,
	processIdentity,
	stopOwnedProcess,
	cleanEnvironment,
	Blocked
} from './core.mjs';

export async function selfTest(worker) {
	const pilot = await reservePilot(worker);
	try {
		if ((await activePilots()).some((active) => active.file !== pilot.file))
			throw new Blocked('PILOT_BUSY', 'The other worker is running an exclusive self-test.');
		for (const current of ['1', '2']) {
			try {
				await fs.access(sessionPath(current));
				throw new Blocked('WORKER_BUSY', 'Self-test needs both workers unused; cleanup owned sessions first.');
			} catch (error) {
				if (error.code !== 'ENOENT') throw error;
			}
		}
		return await runExclusivePilot(worker);
	} finally {
		await releasePilot(pilot);
	}
}

async function runExclusivePilot(worker) {
	const session = sessionPath(worker);
	const candidateUnderTest = await candidate();
	const results = [];
	let ownsSession = false;
	async function run(args, expected = 'PASS', expectedCode) {
		let stdout;
		let exitCode = 0;
		try {
			({ stdout } = await execute(
				process.execPath,
				[path.join(repository, 'scripts/verification/cli.mjs'), ...args, '--worker', worker],
				{ cwd: repository, timeout: 720000, maxBuffer: 2 * 1024 * 1024 }
			));
		} catch (error) {
			stdout = error.stdout;
			exitCode = error.code;
		}
		let result;
		try {
			result = JSON.parse(stdout);
		} catch {
			throw new Blocked('SELF_TEST_COMMAND', `${args[0]} did not produce JSON. Inspect private logs.`);
		}
		const status = result.status ?? (result.content ? 'PASS' : undefined);
		results.push({ command: args[0], argument: args[1], expected, exitCode, result });
		if (result.candidate && result.candidate !== candidateUnderTest)
			throw new Blocked(
				'PILOT_CANDIDATE_CHANGED',
				'Code changed during the pilot. Clean up and rerun the complete pilot on one candidate.'
			);
		const expectedExit = expected === 'PASS' ? 0 : expected === 'FAIL' ? 1 : 2;
		if (status !== expected || exitCode !== expectedExit || (expectedCode && result.code !== expectedCode))
			throw new Blocked(
				'SELF_TEST_MISMATCH',
				`${args.join(' ')} expected ${expected}/${expectedCode ?? '*'} exit ${expectedExit}, observed ${status}/${result.code ?? '*'} exit ${exitCode}. Inspect the recorded pilot evidence.`
			);
		return result;
	}
	async function launch(mutation) {
		ownsSession = true;
		await run(['launch', ...(mutation ? ['--mutation', mutation] : [])]);
		await run(['doctor']);
	}
	async function cleanup() {
		if (ownsSession) {
			await run(['cleanup']);
			ownsSession = false;
		}
	}
	let status = 'PASS',
		message;
	try {
		await run(['launch', '--mutation'], 'BLOCKED');
		await run(['launch', '--mutation', 'unknown'], 'BLOCKED');
		await run(['cleanup']);
		await launch();
		const persistence = await run(['prove', 'group-persistence']);
		await run(['prove', 'group-authorization']);
		await run(['prove', 'personnel-scope']);
		await run(['check-receipt', persistence.receipt]);
		const edited = path.join(root, 'evidence', `edited-${randomUUID()}.json`);
		try {
			const value = await readJSON(persistence.receipt);
			await writeJSON(edited, { ...value, claim: 'fabricated-claim' });
			await run(['check-receipt', edited], 'BLOCKED');
		} finally {
			await fs.rm(edited, { force: true });
		}
		await run(['prove', 'unavailable-required-claim'], 'INCONCLUSIVE');
		const changed = path.join(repository, `verification-candidate-${randomUUID()}.mjs`);
		try {
			await fs.writeFile(changed, 'export const changedCandidate = true;\n', { flag: 'wx' });
			await run(['doctor'], 'INCONCLUSIVE');
			await run(['check-receipt', persistence.receipt], 'BLOCKED');
		} finally {
			await fs.rm(changed, { force: true });
		}
		const stateFile = path.join(session, 'session.json');
		const original = await readJSON(stateFile);
		const foreign = createServer((_req, res) => {
			res.setHeader('Content-Type', 'application/json');
			res.end('{"status":"PASS"}');
		});
		await new Promise((resolve) => foreign.listen(0, '127.0.0.1', resolve));
		try {
			await writeJSON(stateFile, { ...original, controlPort: foreign.address().port });
			await run(['doctor'], 'BLOCKED');
			await writeJSON(stateFile, { ...original, repository: '/not-this-repository' });
			await run(['doctor'], 'BLOCKED');
		} finally {
			await writeJSON(stateFile, original);
			await new Promise((resolve) => foreign.close(resolve));
		}
		const copiedFile = path.join(session, 'app/src/verification-stale-marker.ts');
		try {
			await fs.writeFile(copiedFile, 'export {};\n', { flag: 'wx' });
			await run(['doctor'], 'INCONCLUSIVE');
		} finally {
			await fs.rm(copiedFile, { force: true });
		}
		await run(['doctor']);
		await cleanup();
		await launch('persistence');
		const brokenPersistence = await run(['prove', 'group-persistence'], 'FAIL');
		await run(['check-receipt', brokenPersistence.receipt], 'BLOCKED');
		await cleanup();
		await launch();
		await run(['prove', 'group-persistence']);
		await run(['prove', 'group-authorization']);
		await cleanup();
		await launch('authorization');
		await run(['prove', 'group-authorization'], 'FAIL');
		await cleanup();
		await launch();
		await run(['prove', 'group-authorization']);
		await run(['prove', 'group-persistence']);
		await run(['prove', 'personnel-scope']);
		const owned = await readJSON(path.join(session, 'session.json'));
		const pages = await run(['tool', 'list_pages', '{}']);
		const pageId = Number(pages.content.find((item) => item.type === 'text').text.match(/(?:^|\n)(\d+):/)[1]);
		const external = { pageId, type: 'url', url: 'https://example.com' };
		await run(['tool', 'navigate_page', JSON.stringify(external)], 'BLOCKED', 'URL_NOT_OWNED');
		await run(['tool', 'new_page', JSON.stringify({ url: external.url })], 'BLOCKED', 'URL_NOT_OWNED');
		const credentials = new URL(owned.origin);
		credentials.username = 'synthetic';
		await run(['tool', 'navigate_page', JSON.stringify({ pageId, url: credentials.href })], 'BLOCKED', 'URL_NOT_OWNED');
		await run(['tool', 'navigate_page', JSON.stringify({ pageId, url: `${owned.origin}/auth/login` })]);
		const proxy = new Client({ name: 'verification-pilot', version: '1.0.0' });
		try {
			await proxy.connect(
				new StdioClientTransport({
					command: process.execPath,
					args: [path.join(repository, 'scripts/verification/cli.mjs'), 'mcp', '--worker', worker],
					env: cleanEnvironment(),
					stderr: 'ignore'
				})
			);
			const refusal = await proxy.callTool({ name: 'navigate_page', arguments: external });
			const detail = JSON.parse(refusal.content[0].text);
			results.push({ command: 'mcp navigate_page', expected: 'BLOCKED', result: refusal });
			if (!refusal.isError || detail.status !== 'BLOCKED' || detail.code !== 'URL_NOT_OWNED')
				throw new Blocked('SELF_TEST_MISMATCH', 'MCP navigation refusal must be an explicit BLOCKED tool error.');
		} finally {
			await proxy.close();
		}
		async function signalApp(signal) {
			const current = await processIdentity(owned.appProcess.pid);
			if (!current || current.start !== owned.appProcess.start || current.command !== owned.appProcess.command)
				throw new Blocked('PROCESS_REPLACED', 'Pilot cannot establish app ownership; refusing to signal it.');
			process.kill(current.pid, signal);
		}
		await signalApp('SIGSTOP');
		try {
			await run(['doctor'], 'INCONCLUSIVE', 'APP_ENDPOINT_UNAVAILABLE');
		} finally {
			await signalApp('SIGCONT');
		}
		await run(['doctor']);
		await stopOwnedProcess(owned.mcpProcess);
		await run(['doctor'], 'INCONCLUSIVE', 'DEVTOOLS_UNAVAILABLE');
		await run(['tool', 'list_pages', '{}'], 'INCONCLUSIVE');
	} catch (error) {
		status = 'INCONCLUSIVE';
		message = error.message;
	} finally {
		try {
			await cleanup();
		} catch (error) {
			status = 'INCONCLUSIVE';
			message = error.message;
		}
	}
	const file = path.join(root, 'evidence', `pilot-${Date.now()}.json`);
	if ((await candidate()) !== candidateUnderTest) {
		status = 'INCONCLUSIVE';
		message = 'Candidate changed during the pilot; rerun before acceptance.';
	}
	const value = { schema: 1, status, message, candidate: candidateUnderTest, results };
	await writeJSON(file, value);
	return { status, message, candidate: value.candidate, steps: results.length, evidence: file };
}
