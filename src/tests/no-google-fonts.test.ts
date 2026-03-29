import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';

/**
 * Regression test: fonts must be self-hosted via @fontsource packages.
 * No route should reference Google Fonts externally.
 */

const ROUTES_DIR = resolve(__dirname, '../routes');

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

	it('should have route files to check', () => {
		expect(svelteFiles.length).toBeGreaterThan(0);
	});

	it('no route file should reference fonts.googleapis.com', () => {
		const violations: string[] = [];
		for (const file of svelteFiles) {
			const content = readFileSync(file, 'utf-8');
			if (content.includes('fonts.googleapis.com')) {
				violations.push(file.replace(ROUTES_DIR, 'src/routes'));
			}
		}
		expect(violations, `Google Fonts links found in:\n${violations.join('\n')}`).toEqual([]);
	});

	it('no route file should reference fonts.gstatic.com', () => {
		const violations: string[] = [];
		for (const file of svelteFiles) {
			const content = readFileSync(file, 'utf-8');
			if (content.includes('fonts.gstatic.com')) {
				violations.push(file.replace(ROUTES_DIR, 'src/routes'));
			}
		}
		expect(violations, `Google Fonts preconnect found in:\n${violations.join('\n')}`).toEqual([]);
	});
});
