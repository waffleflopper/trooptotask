import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = join(process.cwd(), 'src');
const forbiddenRosterReadPaths = ['rosterGrouping', 'scopePersonnel'];

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		const stat = statSync(path);
		if (stat.isDirectory()) return sourceFiles(path);
		return /\.(svelte|ts)$/.test(entry) ? [path] : [];
	});
}

describe('roster read model guardrail', () => {
	it('keeps feature roster grouping and scoping behind the shared read model', () => {
		const offenders = sourceFiles(sourceRoot).flatMap((path) => {
			if (path.endsWith('rosterReadModel.guard.test.ts')) return [];
			const text = readFileSync(path, 'utf8');
			return forbiddenRosterReadPaths.some((forbidden) => text.includes(forbidden))
				? [relative(process.cwd(), path)]
				: [];
		});

		expect(offenders).toEqual([]);
	});
});
