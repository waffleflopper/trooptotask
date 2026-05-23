import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
	join(process.cwd(), 'supabase/migrations/20260522000800_organization_invitation_email_outbox.sql'),
	'utf8'
).toLowerCase();

describe('organization invitation email outbox migration', () => {
	it('stores delivery state against existing invitation rows without granting membership', () => {
		expect(migration).toContain('create table if not exists "public"."organization_invitation_email_outbox"');
		expect(migration).toContain('"invitation_id" uuid not null');
		expect(migration).toContain('foreign key ("invitation_id") references "public"."organization_invitations"');
		expect(migration).not.toContain('insert into "public"."organization_memberships"');
	});

	it('keeps delivery state retryable and visible to organization members', () => {
		expect(migration).toContain("check (\"status\" = any (array['pending'::text, 'sent'::text, 'failed'::text]))");
		expect(migration).toContain('"attempt_count" integer not null default 0');
		expect(migration).toContain('"last_error" text');
		expect(migration).toContain('create policy "members can view organization invitation email outbox"');
		expect(migration).toContain('"public"."can_manage_org_members"("organization_id")');
		expect(migration).toContain('revoke all on table "public"."organization_invitation_email_outbox" from "anon"');
		expect(migration).toContain(
			'grant select on table "public"."organization_invitation_email_outbox" to "authenticated"'
		);
	});

	it('can be rerun after a partial local migration creates constraints', () => {
		expect(migration).toContain('drop constraint if exists "organization_invitation_email_outbox_pkey"');
		expect(migration).toContain(
			'drop constraint if exists "organization_invitation_email_outbox_organization_id_fkey"'
		);
		expect(migration).toContain('drop constraint if exists "organization_invitation_email_outbox_invitation_id_fkey"');
	});
});
