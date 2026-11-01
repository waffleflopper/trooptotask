import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const fsAllow = [projectRoot];

if (projectRoot.includes(`${sep}.worktrees${sep}`)) {
	fsAllow.push(resolve(projectRoot, '..', '..'));
}

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			preprocess: vitePreprocess(),
			adapter: adapter(),
			alias: {
				$lib: 'src/lib',
				$features: 'src/features'
			}
		})
	],
	ssr: {
		// Kit is inlined into the server bundle, and a bare `cookie` import would load express's hoisted 0.7.
		noExternal: ['cookie']
	},
	server: {
		fs: {
			allow: fsAllow
		}
	}
});
