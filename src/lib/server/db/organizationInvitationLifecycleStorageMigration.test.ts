import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationFilename = '20260522000400_organization_invitation_lifecycle_storage.sql';
const migrationPath = join(process.cwd(), 'supabase/migrations', migrationFilename);
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('organization invitation lifecycle storage migration', () => {
	it('adds durable lifecycle states, timestamps, actor references, and 14-day pending expiry', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('alter type "public"."invitation_status" add value if not exists \'declined\'');
		expect(normalized).toContain('alter type "public"."invitation_status" add value if not exists \'expired\'');
		expect(normalized).toContain('alter type "public"."invitation_status" add value if not exists \'blocked\'');
		expect(normalized).toContain('add column if not exists "normalized_email" text generated always as');
		expect(normalized).toContain('lower(btrim("email"))');
		expect(normalized).toContain('add column if not exists "expires_at" timestamp with time zone');
		expect(normalized).toContain("default (now() + '14 days'::interval)");
		expect(normalized).toContain('add column if not exists "accepted_at" timestamp with time zone');
		expect(normalized).toContain('add column if not exists "accepted_by" uuid');
		expect(normalized).toContain('add column if not exists "declined_at" timestamp with time zone');
		expect(normalized).toContain('add column if not exists "declined_by" uuid');
		expect(normalized).toContain('add column if not exists "revoked_at" timestamp with time zone');
		expect(normalized).toContain('add column if not exists "revoked_by" uuid');
		expect(normalized).toContain('add column if not exists "expired_at" timestamp with time zone');
		expect(normalized).toContain('add column if not exists "blocked_at" timestamp with time zone');
		expect(normalized).toContain('add column if not exists "blocked_by" uuid');
		expect(normalized).toContain('add constraint "organization_invitations_lifecycle_state_check"');
		expect(normalized).toContain('("status"::text = \'accepted\') and ("accepted_at" is not null)');
		expect(normalized).toContain('("status"::text = \'declined\') and ("accepted_at" is null)');
	});

	it('replaces whole-history invitation uniqueness with one pending invite per organization and normalized email', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('drop constraint if exists "clinic_invitations_clinic_id_email_key"');
		expect(normalized).toContain(
			'create unique index if not exists "organization_invitations_one_pending_per_org_email_idx"'
		);
		expect(normalized).toContain('("organization_id", "normalized_email")');
		expect(normalized).toContain('where ("status" = \'pending\'::"public"."invitation_status")');
		expect(normalized).toContain('create unique index if not exists "organization_memberships_one_per_org_user_idx"');
		expect(normalized).toContain('on "public"."organization_memberships"');
		expect(normalized).toContain('("organization_id", "user_id")');
	});

	it('keeps pending invitations readable through normalized-email RLS and limits org reads to governors', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('drop policy if exists "users can view invitations addressed to them"');
		expect(normalized).toContain('create policy "users can view invitations addressed to them"');
		expect(normalized).toContain(
			'"normalized_email" = lower(btrim((( select "auth"."jwt"() as "jwt") ->> \'email\'::text)))'
		);
		expect(normalized).toContain('drop policy if exists "members can view invitations for their organizations"');
		expect(normalized).toContain('drop policy if exists "governors can view invitations for their organizations"');
		expect(normalized).toContain('create policy "governors can view invitations for their organizations"');
		expect(normalized).toContain('"public"."can_manage_org_members"("organization_id")');
		expect(normalized).toContain('drop policy if exists "admins can delete invitations"');
		expect(normalized).not.toContain('create policy "users can delete invitations addressed to them"');
		expect(normalized).not.toContain('create policy "admins can delete invitations"');
	});
});
