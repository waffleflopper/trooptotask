import { readdirSync } from 'node:fs';
import { dirname, posix, relative, resolve, sep } from 'node:path';
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

/** Every route id in the app, so a browser's error report can be held to a real route template rather than a path. */
function appRouteIds(): string[] {
	const root = resolve(projectRoot, 'src/routes');
	const ids = new Set<string>();
	for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.startsWith('+')) continue;
		ids.add(posix.join('/', relative(root, entry.parentPath).split(sep).join('/')));
	}
	return [...ids];
}

export default defineConfig({
	define: {
		__APP_ROUTE_IDS__: JSON.stringify(appRouteIds())
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			preprocess: vitePreprocess(),
			adapter: adapter(),
			// SvelteKit nonces its hydration script and every `%sveltekit.nonce%` tag, so scripts need no 'unsafe-inline'.
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self', 'https://va.vercel-scripts.com'],
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:', 'blob:'],
					'font-src': ['self'],
					'connect-src': ['self', 'https://vitals.vercel-insights.com'],
					'frame-src': ['none'],
					'frame-ancestors': ['none'],
					'base-uri': ['self'],
					'form-action': ['self'],
					'object-src': ['none']
				}
			},
			// Kit also checks when the tab becomes visible or regains focus, so this only covers a tab left in view.
			version: { pollInterval: 300_000 },
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
