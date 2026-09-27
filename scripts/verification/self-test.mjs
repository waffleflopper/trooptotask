/** Explicit toolkit acceptance pilot, not a browser spec runner or CI E2E suite. */
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { repository, root, sessionPath, execute, readJSON, writeJSON, candidate, Blocked } from './core.mjs';

export async function selfTest(worker) {
	const session = sessionPath(worker);
	const candidateUnderTest = await candidate();
	try {
		await fs.access(session);
		throw new Blocked(
			'WORKER_BUSY',
			'Self-test needs an unused worker; cleanup your owned session or choose worker 2.'
		);
	} catch (error) {
		if (error.code !== 'ENOENT') throw error;
	}
	const results = [];
	let ownsSession = false;
	async function run(args, expected = 'PASS') {
		let stdout;
		try {
			({ stdout } = await execute(
				process.execPath,
				[path.join(repository, 'scripts/verification/cli.mjs'), ...args, '--worker', worker],
				{ cwd: repository, timeout: 720000, maxBuffer: 2 * 1024 * 1024 }
			));
		} catch (error) {
			stdout = error.stdout;
		}
		let result;
		try {
			result = JSON.parse(stdout);
		} catch {
			throw new Blocked('SELF_TEST_COMMAND', `${args[0]} did not produce JSON. Inspect private logs.`);
		}
		const status = result.status ?? (result.content ? 'PASS' : undefined);
		results.push({ command: args[0], argument: args[0] === 'prove' ? args[1] : undefined, expected, result });
		if (result.candidate && result.candidate !== candidateUnderTest)
			throw new Blocked(
				'PILOT_CANDIDATE_CHANGED',
				'Code changed during the pilot. Clean up and rerun the complete pilot on one candidate.'
			);
		if (status !== expected)
			throw new Blocked(
				'SELF_TEST_MISMATCH',
				`${args.join(' ')} expected ${expected}, observed ${status}. Inspect the recorded pilot evidence.`
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
