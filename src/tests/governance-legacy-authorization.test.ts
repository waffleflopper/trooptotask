import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

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
});
