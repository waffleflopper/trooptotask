import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { availableParallelism } from 'node:os';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
		environment: 'node',
		maxWorkers: Math.max(1, Math.floor(availableParallelism() / 2))
	},
	resolve: {
		conditions: ['browser']
	}
});
