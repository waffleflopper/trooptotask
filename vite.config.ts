import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const fsAllow = [projectRoot];

if (projectRoot.includes(`${sep}.worktrees${sep}`)) {
	fsAllow.push(resolve(projectRoot, '..', '..'));
}

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		fs: {
			allow: fsAllow
		}
	}
});
