import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC_ROOT = join(process.cwd(), 'src');

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		const stat = statSync(path);
		if (stat.isDirectory()) return sourceFiles(path);
		return /\.(svelte|ts)$/.test(entry) ? [path] : [];
	});
}

describe('native workbook export guardrails', () => {
	it('keeps Duty Roster off the old HTML-backed Excel pattern', () => {
		const dutyRosterExportFiles = sourceFiles(join(SRC_ROOT, 'features/duty-roster/export'));
		const offenders = dutyRosterExportFiles
			.map((file) => ({
				file: relative(SRC_ROOT, file),
				source: readFileSync(file, 'utf8')
			}))
			.filter(({ source }) => source.includes('application/vnd.ms-excel') || /\.xls(?!x)\b/.test(source))
			.map(({ file }) => file);

		expect(offenders).toEqual([]);
	});
});
