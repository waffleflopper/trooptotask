import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const SUPABASE_CONFIG = readFileSync(resolve(ROOT, 'supabase/config.toml'), 'utf8');
const SECURITY_OVERVIEW = readFileSync(resolve(ROOT, 'docs/security/security-overview.md'), 'utf8');
const CONTROL_MAPPING = readFileSync(resolve(ROOT, 'docs/security/control-mapping.md'), 'utf8');

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

	it('maintains a control map for parent remediation tracking', () => {
		expect(CONTROL_MAPPING).toContain('## Implemented');
		expect(CONTROL_MAPPING).toContain('## Partial');
		expect(CONTROL_MAPPING).toContain('## Planned');
		expect(CONTROL_MAPPING).toContain('HttpOnly');
		expect(CONTROL_MAPPING).toContain('20260403_core_rls_permission_hardening.sql');
		expect(CONTROL_MAPPING).toContain('20260403_sensitive_file_storage_policies.sql');
	});
});
