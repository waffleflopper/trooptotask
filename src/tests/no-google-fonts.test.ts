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

describe('font self-hosting', () => {
	const svelteFiles = findSvelteFiles(ROUTES_DIR);

	it('no route file should reference external Google Fonts hosts', () => {
		const violations: string[] = [];
		for (const file of svelteFiles) {
			const content = readFileSync(file, 'utf-8');
			if (content.includes('fonts.googleapis.com') || content.includes('fonts.gstatic.com')) {
				violations.push(file.replace(ROUTES_DIR, 'src/routes'));
			}
		}
		expect(svelteFiles.length).toBeGreaterThan(0);
		expect(violations, `Google Fonts references found in:\n${violations.join('\n')}`).toEqual([]);
	});
});
