import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RUNTIME_ROOTS = ['src', 'e2e'];
const BANNED_PATTERNS = [
	/leaders-book/i,
	/leaders[_-]?book/i,
	/can_view_leaders_book/i,
	/can_edit_leaders_book/i,
	/development_goals/i,
	/DevelopmentGoal/,
	/counseling_types/i,
	/counseling_type/i,
	/CounselingType/
];

function collectFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		const stat = statSync(path);
		if (stat.isDirectory()) return collectFiles(path);
		if (!/\.(svelte|ts|js)$/.test(path)) return [];
		if (path.includes('.test.')) return [];
		if (path.endsWith('leaders-book-retirement.test.ts')) return [];
		return [path];
	});
}

describe('Leaders Book retirement', () => {
	it('keeps runtime code free of retired Leaders Book and development-goal references', () => {
		const offenders = RUNTIME_ROOTS.flatMap((root) => collectFiles(root))
			.map((path) => {
				const content = readFileSync(path, 'utf8');
				const matches = BANNED_PATTERNS.filter((pattern) => pattern.test(content)).map((pattern) => pattern.source);
				return matches.length ? `${relative(process.cwd(), path)}: ${matches.join(', ')}` : null;
			})
			.filter(Boolean);

		expect(offenders).toEqual([]);
	});
});
