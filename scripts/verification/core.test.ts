import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { completed, runLogged, cleanEnvironment } from './core.mjs';

const directories: string[] = [];
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
