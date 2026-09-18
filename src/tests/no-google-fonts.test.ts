import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Regression test: fonts must be self-hosted via @fontsource packages.
 * No route should reference Google Fonts externally.
 */

const currentDir = dirname(fileURLToPath(import.meta.url));
const ROUTES_DIR = resolve(currentDir, '../routes');

/** Recursively find all .svelte files under a directory */
function findSvelteFiles(dir: string): string[] {
	const results: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			results.push(...findSvelteFiles(full));
		} else if (full.endsWith('.svelte')) {
			results.push(full);
		}
	}
	return results;
}

function externalFontReferences(files: Array<{ path: string; content: string }>): string[] {
	return files
		.filter(({ content }) => content.includes('fonts.googleapis.com') || content.includes('fonts.gstatic.com'))
		.map(({ path }) => path);
}

describe('font self-hosting', () => {
	const svelteFiles = findSvelteFiles(ROUTES_DIR);

	it('no route file should reference external Google Fonts hosts', () => {
		const violations = externalFontReferences(
			svelteFiles.map((file) => ({
				path: file.replace(ROUTES_DIR, 'src/routes'),
				content: readFileSync(file, 'utf-8')
			}))
		);
		expect(svelteFiles.length).toBeGreaterThan(0);
		expect(violations, `Google Fonts references found in:\n${violations.join('\n')}`).toEqual([]);
	});

	it.each([
		'<link href="https://fonts.googleapis.com/css2?family=Roboto" rel="stylesheet" />',
		'<link href="https://fonts.gstatic.com" rel="preconnect" />'
	])('rejects an external Google Fonts reference: %s', (content) => {
		expect(externalFontReferences([{ path: 'route.svelte', content }])).toEqual(['route.svelte']);
	});

	it('accepts self-hosted font imports and unrelated route content', () => {
		expect(
			externalFontReferences([
				{ path: 'layout.svelte', content: "<script>import '@fontsource/ibm-plex-mono/400.css';</script>" },
				{ path: 'page.svelte', content: '<p>Personnel</p>' }
			])
		).toEqual([]);
	});
});
