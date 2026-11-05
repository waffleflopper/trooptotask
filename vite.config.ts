import { readdirSync } from 'node:fs';
import { dirname, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import adapter from '@sveltejs/adapter-vercel';
import { sveltekit, type Config } from '@sveltejs/kit/vite';
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

/** SvelteKit nonces its own hydration script and any `%sveltekit.nonce%` tag, so scripts need no `'unsafe-inline'`. */
export const kitCsp = {
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
} satisfies NonNullable<Config['csp']>;

export default defineConfig({
	define: {
		__APP_ROUTE_IDS__: JSON.stringify(appRouteIds())
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			preprocess: vitePreprocess(),
			adapter: adapter(),
			csp: kitCsp,
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
