import { availableParallelism } from 'node:os';
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
	viteConfig,
	defineConfig({
		test: {
			include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
			environment: 'node',
			maxWorkers: Math.max(1, Math.floor(availableParallelism() / 2))
		},
		resolve: {
			conditions: ['browser']
		}
	})
);
