import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
	join(process.cwd(), 'supabase/migrations/20260526000200_accept_invitations_with_replacement_access.sql'),
	'utf8'
).toLowerCase();

describe('accept invitations with replacement access migration', () => {
	it('replaces the accept invitation transition and keeps the access-request setup guard', () => {
		expect(migration).toContain('create or replace function "public"."accept_organization_invitation"');
		expect(migration).toContain('"access_request_organization_invitation_links"."organization_invitation_id"');
		expect(migration).toContain('join "public"."access_requests"');
		expect(migration).toContain('"access_requests"."setup_completed_at" is not null');
		expect(migration).toContain('return query select \'setup_required\'::"text", null::"uuid"');
	});

	it('creates accepted memberships from replacement access columns only', () => {
		const insertStart = migration.indexOf('insert into "public"."organization_memberships"');
		const insertEnd = migration.indexOf('on conflict ("organization_id", "user_id") do nothing');
		const insertBlock = migration.slice(insertStart, insertEnd);

		expect(insertStart).toBeGreaterThanOrEqual(0);
		expect(insertEnd).toBeGreaterThan(insertStart);
		expect(insertBlock).toContain('"member_preset"');
		expect(insertBlock).toContain('"capability_overrides"');
		expect(insertBlock).toContain('"access_scope_kind"');
		expect(insertBlock).toContain('"access_scope_group_ids"');
		expect(insertBlock).not.toContain('"can_view_');
		expect(insertBlock).not.toContain('"can_edit_');
		expect(insertBlock).not.toContain('"can_manage_members"');
		expect(insertBlock).not.toContain('"scoped_group_id"');
	});

	it('forces accepted admin invitations to role-owned access', () => {
		expect(migration).toContain('when "invitation"."role" = \'admin\'::"public"."organization_role" then \'editor\'');
		expect(migration).toContain(
			'when "invitation"."role" = \'admin\'::"public"."organization_role" then \'{}\'::jsonb'
		);
		expect(migration).toContain(
			'when "invitation"."role" = \'admin\'::"public"."organization_role" then \'organization\''
		);
		expect(migration).toContain(
			'when "invitation"."role" = \'admin\'::"public"."organization_role" then array[]::"uuid"[]'
		);
	});
});
