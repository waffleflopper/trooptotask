import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
	join(process.cwd(), 'supabase/migrations/20260522000900_access_request_organization_invitation_links.sql'),
	'utf8'
).toLowerCase();

describe('access request organization invitation link migration', () => {
	it('stores a platform Access Request link back to the originating Organization Invitation', () => {
		expect(migration).toContain('create table if not exists "public"."access_request_organization_invitation_links"');
		expect(migration).toContain(
			'foreign key ("access_request_id") references "public"."access_requests"("id") on delete cascade'
		);
		expect(migration).toContain(
			'foreign key ("organization_invitation_id") references "public"."organization_invitations"("id")'
		);
		expect(migration).toContain('"organization_id" "uuid" not null');
		expect(migration).toContain('"invited_by" "uuid" not null');
		expect(migration).toContain('"invited_at" timestamp with time zone not null');
		expect(migration).toContain('"intended_permissions" "jsonb"');
		expect(migration).toContain('"intended_member_preset" "text"');
		expect(migration).toContain('"intended_access_scope_group_ids" "uuid"[]');
		expect(migration).toContain("check (\"intended_membership_role\" = any (array['admin'::text, 'member'::text]))");
		expect(migration).not.toContain("'owner'::text");
	});

	it('keeps writes service-role only while allowing platform-admin review reads', () => {
		expect(migration).toContain('create policy "service role can manage access request organization invitation links"');
		expect(migration).toContain(
			'create policy "platform admins can view access request organization invitation links"'
		);
		expect(migration).toContain('using ("public"."is_platform_admin"())');
		expect(migration).toContain(
			'revoke all on table "public"."access_request_organization_invitation_links" from "anon"'
		);
		expect(migration).toContain(
			'grant select on table "public"."access_request_organization_invitation_links" to "authenticated"'
		);
		expect(migration).toContain(
			'grant all on table "public"."access_request_organization_invitation_links" to "service_role"'
		);
	});
});
