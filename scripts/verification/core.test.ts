import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { completed, runLogged, cleanEnvironment, processIdentity, stopOwnedProcess } from './core.mjs';

const directories: string[] = [];
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
