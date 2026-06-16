import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const SUPABASE_CONFIG = readFileSync(resolve(ROOT, 'supabase/config.toml'), 'utf8');
const SECURITY_OVERVIEW = readFileSync(resolve(ROOT, 'docs/security/security-overview.md'), 'utf8');
const CONTROL_MAPPING = readFileSync(resolve(ROOT, 'docs/security/control-mapping.md'), 'utf8');
const OPERATIONAL_CONTROL_EVIDENCE = readFileSync(
	resolve(ROOT, 'docs/security/operational-control-evidence.md'),
	'utf8'
);
const PUBLIC_SECURITY_PAGE = readFileSync(resolve(ROOT, 'src/routes/security/+page.svelte'), 'utf8');

describe('security posture docs and config', () => {
	it('keeps local Supabase auth policy aligned with the app password baseline', () => {
		expect(SUPABASE_CONFIG).toContain('minimum_password_length = 12');
		expect(SUPABASE_CONFIG).toContain('password_requirements = "lower_upper_letters_digits"');
		expect(SUPABASE_CONFIG).toContain('secure_password_change = true');
	});

	it('documents the active session policy without an obsolete idle-timeout claim', () => {
		expect(SUPABASE_CONFIG).toMatch(/^\[auth\.sessions\]\s*$/m);
		expect(SUPABASE_CONFIG).toMatch(/^\s*timebox = "24h"\s*$/m);
		expect(SUPABASE_CONFIG).not.toMatch(/^\s*inactivity_timeout\s*=/m);
		expect(SECURITY_OVERVIEW).toContain('24-hour absolute session limit');
		expect(SECURITY_OVERVIEW).not.toContain('8-hour idle timeout');
	});

	it('documents which auth controls are environment-managed during rollout', () => {
		expect(SECURITY_OVERVIEW).toContain('Environment-managed rollout notes');
		expect(SECURITY_OVERVIEW).toContain('Email confirmation is disabled in local development');
		expect(SECURITY_OVERVIEW).toContain('TOTP MFA support exists in the app');
	});

	it('keeps the launch operational evidence pack represented in repo docs', () => {
		expect(OPERATIONAL_CONTROL_EVIDENCE).toMatch(/incident response/i);
		expect(OPERATIONAL_CONTROL_EVIDENCE).toMatch(/access review/i);
		expect(OPERATIONAL_CONTROL_EVIDENCE).toMatch(/provisioning and deprovisioning/i);
		expect(OPERATIONAL_CONTROL_EVIDENCE).toMatch(/backup and restore/i);
		expect(OPERATIONAL_CONTROL_EVIDENCE).toMatch(/billing\/support security/i);
		expect(OPERATIONAL_CONTROL_EVIDENCE).toContain('external evidence held by Robert');
		expect(OPERATIONAL_CONTROL_EVIDENCE).toMatch(/\b(partial|planned|external)\b/);
		expect(CONTROL_MAPPING).toContain('docs/security/operational-control-evidence.md');
	});

	it('does not claim FedRAMP certification in public or repo security copy', () => {
		const combinedSecurityCopy = [
			SECURITY_OVERVIEW,
			CONTROL_MAPPING,
			OPERATIONAL_CONTROL_EVIDENCE,
			PUBLIC_SECURITY_PAGE
		]
			.join('\n')
			.toLowerCase();

		expect(combinedSecurityCopy).not.toMatch(/trooptotask\s+(is|has|holds|maintains)\s+fedramp/);
		expect(combinedSecurityCopy).not.toMatch(/fedramp\s+(certified|authorized)\s+(platform|product|service|system)/);
		expect(combinedSecurityCopy).not.toMatch(/certified\s+(by|under)\s+fedramp/);
		expect(combinedSecurityCopy).not.toMatch(/formal\s+federal\s+(certification|authorization|approval)/);
		expect(combinedSecurityCopy).toContain('alignment statement');
	});
});
