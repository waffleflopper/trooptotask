import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260522000700_invitation_lifecycle_transitions.sql', 'utf8');

describe('organization invitation lifecycle transition migration', () => {
	it('adds authenticated lifecycle RPCs without delete semantics', () => {
		expect(migration).toContain('CREATE OR REPLACE FUNCTION "public"."decline_organization_invitation"');
		expect(migration).toContain('CREATE OR REPLACE FUNCTION "public"."revoke_organization_invitation"');
		expect(migration).toContain('SECURITY DEFINER');
		expect(migration).toContain(
			'GRANT EXECUTE ON FUNCTION "public"."decline_organization_invitation"(uuid) TO "authenticated"'
		);
		expect(migration).toContain(
			'GRANT EXECUTE ON FUNCTION "public"."revoke_organization_invitation"(uuid, uuid) TO "authenticated"'
		);
		expect(migration).not.toMatch(/DELETE\s+FROM\s+"public"\."organization_invitations"/i);
	});

	it('enforces invitee-owned decline by JWT email and locked pending rows', () => {
		expect(migration).toContain('FOR UPDATE');
		expect(migration).toContain('"normalized_email" <> "current_email"');
		expect(migration).toContain('"declined_by" = "current_user_id"');
		expect(migration).toContain('CREATE POLICY "Users can decline invitations addressed to them"');
		expect(migration).toContain('"normalized_email" = lower(btrim(("auth"."jwt"() ->> \'email\'::text)))');
		expect(migration).toContain('"declined_by" = "auth"."uid"()');
	});

	it('marks revoke and expiry as terminal history states instead of deleting rows', () => {
		expect(migration).toContain('"status" = \'revoked\'::"public"."invitation_status"');
		expect(migration).toContain("'already_declined'::text");
		expect(migration).toContain('"revoked_by" = "current_user_id"');
		expect(migration).toContain('"status" = \'expired\'::"public"."invitation_status"');
		expect(migration).toContain('"expired_at" = COALESCE("expired_at", now())');
		expect(migration).toContain('DROP POLICY IF EXISTS "Users can delete invitations addressed to them"');
		expect(migration).toContain('DROP POLICY IF EXISTS "Admins can delete invitations"');
	});
});
