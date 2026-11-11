import { globSync, readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { sep } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

const include = ['src/**/*.test.ts', 'scripts/**/*.test.ts'];

// A module mock binds into whatever imports the mocked module, so a file that mocks keeps its own module graph;
// every other file shares one graph per worker.
const mocksModules = globSync(include)
	.filter((file) => /\bvi\.(?:mock|doMock)\s*[<(]/.test(readFileSync(file, 'utf8')))
	.map((file) => file.split(sep).join('/'));

export default mergeConfig(
	viteConfig,
	defineConfig({
		test: {
			environment: 'node',
			setupFiles: ['src/lib/test-support/restoreFileGlobals.ts'],
			maxWorkers: Math.max(1, Math.floor(availableParallelism() / 2)),
			// Shuffled file order surfaces a file that leaks state into the shared graph; a failure prints the seed to replay.
			sequence: { shuffle: { files: true, tests: false } },
			projects: [
				{ extends: true, test: { name: 'isolated', include: mocksModules } },
				{ extends: true, test: { name: 'shared', include, exclude: mocksModules, isolate: false } }
			]
		},
		resolve: {
			conditions: ['browser']
		}
	})
);
