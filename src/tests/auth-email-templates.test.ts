import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(path: string): string {
	return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Supabase auth email templates', () => {
	it('routes signup confirmation links through the app-owned confirm page with a token hash', () => {
		const config = readRepoFile('supabase/config.toml');
		const template = readRepoFile('supabase/templates/confirmation.html');

		expect(config).toContain('[auth.email.template.confirmation]');
		expect(config).toContain('content_path = "./supabase/templates/confirmation.html"');
		expect(template).toContain('href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}"');
		expect(template).toContain('{{ .RedirectTo }}&token_hash={{ .TokenHash }}');
		expect(template).not.toContain('{{ .ConfirmationURL }}');
	});
});
