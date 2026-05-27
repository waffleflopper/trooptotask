import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('legacy authorization governance guardrail', () => {
	it('runs as part of the governance check and reports the legacy authorization allowlist', () => {
		const output = execFileSync('npm', ['run', 'governance:check'], {
			encoding: 'utf8',
			env: { ...process.env, FORCE_COLOR: '0' }
		});

		expect(output).toContain('Governance checks passed.');
		expect(output).toContain('documented legacy authorization entries:');
	});

	it('does not allowlist runtime legacy authorization classifications after platform removal', () => {
		const baseline = JSON.parse(readFileSync('docs/architecture/GOVERNANCE_BASELINE.json', 'utf8')) as {
			legacyAuthorizationAllowlist?: Array<{ classification?: string; path?: string }>;
		};

		const runtimeEntries = (baseline.legacyAuthorizationAllowlist ?? []).filter((entry) =>
			entry.classification?.startsWith('runtime-')
		);

		expect(runtimeEntries).toEqual([]);
	});

	it('keeps legacy member-access storage out of active production source', () => {
		const sourceFiles = walkFiles('src').filter((filePath) => {
			if (!/\.(ts|js|svelte)$/.test(filePath)) return false;
			if (/\.test\.(ts|js)$/.test(filePath)) return false;
			if (/\.svelte\.test\.ts$/.test(filePath)) return false;
			if (filePath.includes('/test-support/') || filePath.includes('/test-stubs/')) return false;
			return true;
		});
		const legacyStoragePattern = /\b(can_view_[a-z_]+|can_edit_[a-z_]+|can_manage_members|scoped_group_id)\b/;
		const offenders = sourceFiles.filter((filePath) => legacyStoragePattern.test(readFileSync(filePath, 'utf8')));

		expect(offenders.map((filePath) => relative(process.cwd(), filePath).split(sep).join('/'))).toEqual([]);
	});
});

function walkFiles(relativeDirectory: string): string[] {
	const directory = join(process.cwd(), relativeDirectory);
	return readdirSync(directory).flatMap((entry) => {
		const filePath = join(directory, entry);
		const stats = statSync(filePath);
		if (stats.isDirectory()) {
			return walkFiles(relative(process.cwd(), filePath));
		}
		return [filePath];
	});
}
