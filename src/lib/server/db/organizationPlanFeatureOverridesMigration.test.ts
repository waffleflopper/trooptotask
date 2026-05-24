import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
	join(process.cwd(), 'supabase/migrations/20260524000200_organization_plan_feature_overrides.sql'),
	'utf8'
);

function normalizedSql() {
	return migration.replace(/\s+/g, ' ').toLowerCase();
}

describe('organization plan feature overrides migration', () => {
	it('creates durable organization-scoped feature override storage', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('create table if not exists "public"."organization_plan_feature_overrides"');
		expect(normalized).toContain('"organization_id" "uuid" not null');
		expect(normalized).toContain('"feature_key" "text" not null');
		expect(normalized).toContain('"override_state" "text" not null');
		expect(normalized).toContain('"expires_at" timestamp with time zone');
		expect(normalized).toContain('"revoked_at" timestamp with time zone');
		expect(normalized).toContain('create unique index if not exists "uq_org_plan_feature_overrides_active"');
		expect(normalized).toContain('where ("revoked_at" is null)');
	});

	it('keeps override state constrained and history auditable', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('\'granted\'::"text"');
		expect(normalized).toContain('\'denied\'::"text"');
		expect(normalized).toContain('"created_by" "uuid"');
		expect(normalized).toContain('"revoked_by" "uuid"');
		expect(normalized).toContain('on delete set null');
	});

	it('allows reads for org members and platform admins while limiting writes to service role', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('enable row level security');
		expect(normalized).toContain(
			'using ("public"."is_org_member"("organization_id") or "public"."is_platform_admin"())'
		);
		expect(normalized).toContain('using (("auth"."role"() = \'service_role\'::"text"))');
		expect(normalized).toContain(
			'grant select on table "public"."organization_plan_feature_overrides" to "authenticated"'
		);
		expect(normalized).toContain('grant all on table "public"."organization_plan_feature_overrides" to "service_role"');
	});
});
