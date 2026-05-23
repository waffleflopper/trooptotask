import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
	join(process.cwd(), 'supabase/migrations/20260522000800_organization_invitation_email_outbox.sql'),
	'utf8'
).toLowerCase();

describe('organization invitation email outbox migration', () => {
	it('can be rerun after a partial local migration creates constraints', () => {
		expect(migration).toContain('drop constraint if exists "organization_invitation_email_outbox_pkey"');
		expect(migration).toContain(
			'drop constraint if exists "organization_invitation_email_outbox_organization_id_fkey"'
		);
		expect(migration).toContain('drop constraint if exists "organization_invitation_email_outbox_invitation_id_fkey"');
	});
});
