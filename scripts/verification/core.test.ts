import { afterEach, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
	assertCurrentCandidate,
	candidate,
	completed,
	runLogged,
	cleanEnvironment,
	processIdentity,
	stopOwnedProcess
} from './core.mjs';

const directories: string[] = [];
it('makes edited verification instructions stale while unrelated prose stays outside the candidate', async () => {
	const directory = await mkdtemp(path.join(tmpdir(), 't2t-map-freshness-'));
	directories.push(directory);
	const instructions = [
		'.agents/skills/verify-trooptotask/SKILL.md',
		'.agents/skills/verify-trooptotask/features/README.md',
		'.agents/skills/verify-trooptotask/features/organization-switching.md'
	];
	for (const file of [...instructions, 'AGENTS.md']) {
		await mkdir(path.dirname(path.join(directory, file)), { recursive: true });
		await writeFile(path.join(directory, file), 'Original instructions\n');
	}
	const original = await candidate(directory);
	const launched = { candidate: original, artifact: 'owned-build' };
	await writeFile(path.join(directory, 'AGENTS.md'), 'Unrelated prose update\n');
	expect(await candidate(directory)).toBe(original);
	for (const file of instructions) {
		await writeFile(path.join(directory, file), 'Changed verification instructions\n');
		const changed = await candidate(directory);
		expect(() => assertCurrentCandidate(launched, changed, 'owned-build')).toThrowError(
			expect.objectContaining({ code: 'STALE_CANDIDATE' })
		);
		await writeFile(path.join(directory, file), 'Original instructions\n');
	}
});

it('refuses changed source or copied artifacts before a browser command can use them', () => {
	const launched = { candidate: 'launched-source', artifact: 'launched-copy' };
	expect(() => assertCurrentCandidate(launched, 'launched-source', 'launched-copy')).not.toThrow();
	for (const [source, copy] of [
		['edited-source', 'launched-copy'],
		['launched-source', 'edited-copy']
	])
		expect(() => assertCurrentCandidate(launched, source, copy)).toThrowError(
			expect.objectContaining({ code: 'STALE_CANDIDATE' })
		);
});

it('refuses to signal a PID whose owner no longer matches', async () => {
	const child = spawn(process.execPath, ['-e', "setInterval(() => {}, 1000); process.stdout.write('ready');"]);
	try {
		await once(child.stdout, 'data');
		const identity = await processIdentity(child.pid);
		await expect(stopOwnedProcess({ ...identity, start: 'different-start-time' })).rejects.toMatchObject({
			code: 'PROCESS_REPLACED'
		});
		expect((await processIdentity(child.pid))?.start).toBe(identity.start);
	} finally {
		child.kill('SIGKILL');
		await once(child, 'exit');
	}
});

it('confirms exit even when an owned child ignores graceful termination', async () => {
	const child = spawn(process.execPath, [
		'-e',
		"process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); process.stdout.write('ready');"
	]);
	try {
		await once(child.stdout, 'data');
		const identity = await processIdentity(child.pid);
		expect(identity).not.toBeNull();
		const exited = once(child, 'exit');
		await stopOwnedProcess(identity);
		const remaining = await processIdentity(child.pid);
		expect(!remaining || remaining.state === 'Z').toBe(true);
		await exited;
		expect(child.signalCode).toBe('SIGKILL');
	} finally {
		if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
	}
}, 10000);
afterEach(async () => {
	await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

it('reports a real failed build even when the caller waits after the child has exited', async () => {
	const directory = await mkdtemp(path.join(tmpdir(), 't2t-process-proof-'));
	directories.push(directory);
	const child = await runLogged(
		process.execPath,
		['-e', 'process.exit(7)'],
		directory,
		cleanEnvironment(),
		path.join(directory, 'build.log')
	);
	await child.completion;
	await expect(completed(child, 'Production build')).rejects.toThrow('exited 7');
});

it('reports a missing build executable instead of leaving a pending completion', async () => {
	const directory = await mkdtemp(path.join(tmpdir(), 't2t-process-proof-'));
	directories.push(directory);
	const child = await runLogged(
		path.join(directory, 'missing-builder'),
		[],
		directory,
		cleanEnvironment(),
		path.join(directory, 'build.log')
	);
	await expect(completed(child, 'Production build')).rejects.toThrow();
});
