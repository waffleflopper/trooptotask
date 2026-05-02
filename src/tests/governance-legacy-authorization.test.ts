import { execFileSync } from 'node:child_process';

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
});
