import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationFilename = '20260614000200_user_email_identities.sql';
const migration = readFileSync(join(process.cwd(), 'supabase/migrations', migrationFilename), 'utf8');

function normalizedSql(): string {
	return migration.replace(/\s+/g, ' ').toLowerCase();
}

describe('user email identity lookup migration', () => {
	it('creates the service-owned user email identity table with unique normalized email', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('create table "public"."user_email_identities"');
		expect(normalized).not.toContain('create table if not exists "public"."user_email_identities"');
		expect(normalized).toContain('"user_id" uuid not null');
		expect(normalized).toContain('"normalized_email" text not null');
		expect(normalized).toContain('constraint "user_email_identities_normalized_email_key" unique ("normalized_email")');
		expect(normalized).toContain('foreign key ("user_id") references "auth"."users"("id") on delete cascade');
		expect(normalized).toContain('"normalized_email" = lower(btrim("normalized_email"))');
		expect(normalized).toContain('"normalized_email" <> \'\'');
	});

	it('backfills from auth.users and refuses duplicate normalized auth emails', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('duplicate normalized auth.users emails');
		expect(normalized).toContain('from "auth"."users"');
		expect(normalized).toContain('group by lower(btrim("auth"."users"."email"))');
		expect(normalized).toContain('having count(*) > 1');
		expect(normalized).toContain(
			'insert into "public"."user_email_identities" ("user_id", "normalized_email") select "auth"."users"."id", lower(btrim("auth"."users"."email"))'
		);
		expect(normalized).toContain('on conflict ("user_id") do update');
	});

	it('enables RLS, revokes client access, and grants service-role access', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('alter table "public"."user_email_identities" enable row level security');
		expect(normalized).toContain('create or replace trigger "update_user_email_identities_updated_at"');
		expect(normalized).toContain('create policy "service role can manage user email identities"');
		expect(normalized).toContain('to "service_role"');
		expect(normalized).toContain('revoke all on table "public"."user_email_identities" from public');
		expect(normalized).toContain('revoke all on table "public"."user_email_identities" from "anon"');
		expect(normalized).toContain('revoke all on table "public"."user_email_identities" from "authenticated"');
		expect(normalized).toContain('grant all on table "public"."user_email_identities" to "service_role"');
	});

	it('keeps accepted invitation identities current without altering auth.users', () => {
		const normalized = normalizedSql();
		const membershipInsertIndex = normalized.indexOf('insert into "public"."organization_memberships"');
		const identityUpsertIndex = normalized.indexOf(
			'insert into "public"."user_email_identities"',
			membershipInsertIndex
		);
		const invitationAcceptedIndex = normalized.indexOf(
			'update "public"."organization_invitations"',
			identityUpsertIndex
		);

		expect(normalized).toContain('create or replace function "public"."accept_organization_invitation"');
		expect(identityUpsertIndex).toBeGreaterThan(membershipInsertIndex);
		expect(identityUpsertIndex).toBeLessThan(invitationAcceptedIndex);
		expect(normalized).toContain('values ("current_user_id", "current_email")');
		expect(normalized).toContain('on conflict ("user_id") do update');
		expect(normalized).not.toMatch(/\balter\s+table\s+"auth"\."users"/);
		expect(normalized).not.toMatch(/\bdelete\s+from\s+"auth"\."users"/);
		expect(normalized).not.toMatch(/\bdrop\s+table\s+(if\s+exists\s+)?"auth"\."users"/);
	});
});
