import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse, type TomlTable } from 'smol-toml';

const config = parse(readFileSync(resolve(import.meta.dirname, '../../supabase/config.toml'), 'utf8'));
const auth = config.auth as TomlTable;

describe('local Supabase auth policy', () => {
	it('requires reviewed account creation while retaining email sign-in', () => {
		expect(auth.enable_signup).toBe(false);
		expect((auth.email as TomlTable).enable_signup).toBe(true);
	});

	it('requires twelve characters, mixed case and digits, and secure password changes', () => {
		expect(auth.minimum_password_length).toBe(12);
		expect(auth.password_requirements).toBe('lower_upper_letters_digits');
		expect((auth.email as TomlTable).secure_password_change).toBe(true);
	});

	it('enforces a 24-hour absolute session limit without an idle timeout', () => {
		const sessions = auth.sessions as TomlTable;
		expect(sessions.timebox).toBe('24h');
		expect(sessions).not.toHaveProperty('inactivity_timeout');
	});
});
